"use client";

/**
 * The one orchestration of a bulk download, shared by the guest gallery and the
 * studio dashboard.
 *
 * Sequence, and the ordering constraint that shapes all of it:
 *
 *   click "Download"        → resolve the selection (may paginate a whole
 *                             gallery) and compute a plan
 *   modal shows the plan    → exact size, method, alerts, tier selector
 *   click "Download N …"    → open the picker INSIDE that gesture, then run
 *
 * The picker must be called inside a click gesture, before any `await` that
 * could expire the user activation. That is why the selection is resolved and
 * the plan settled BEFORE the modal's confirm button exists — including the
 * `selectAll` case, which is a mode rather than a list and has to be paginated
 * into concrete items first. The old code opened the save dialog first and
 * paginated after, because it had no modal to resolve in; the modal moves that
 * work earlier, which is strictly safer for the activation and lets the plan
 * show an exact size.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  batchPartName,
  countSkippable,
  holdWakeLock,
  openDirectoryTarget,
  openZipTarget,
  runDirectoryDownload,
  runZipDownload,
  scanExisting,
  type ArchiveUrlResolver,
  type DownloadProgress,
  type EngineResult,
} from "./engines.ts";
import { recallDownloadFolder, rememberDownloadFolder, reuseDownloadFolder } from "./handles.ts";
import {
  concurrencyForTier,
  planDownload,
  sanitiseFilename,
  type DownloadAlert,
  type DownloadPlan,
  type DownloadTier,
  type PlanSource,
} from "./plan.ts";
import { downloadEnvironment, type DownloadEnvironment } from "./capability.ts";

export type DownloadRequest = {
  /** Booking this download belongs to — keys the remembered target folder. */
  bookingId: string;
  /** Base name for ZIP files, e.g. "Priya & Arjun (412 photos)". */
  baseName: string;
  /**
   * Resolve the selection into concrete items. May paginate; receives an abort
   * signal so cancelling during a whole-gallery walk stops it. Called once,
   * before the plan is shown — never inside the confirm gesture.
   */
  resolveSources: (signal: AbortSignal) => Promise<PlanSource[]>;
  /** Whether this viewer may choose an archive tier at all (server-derived). */
  archiveAccess: boolean;
  /** Mints archive URLs. Required whenever `archiveAccess` is true. */
  resolveArchiveUrls?: ArchiveUrlResolver;
};

export type PartState = "pending" | "active" | "done" | "failed";

export type DownloadFlowState = {
  open: boolean;
  phase: "resolving" | "plan" | "running" | "finished";
  /** The tier the guest picked. */
  tier: DownloadTier;
  /** Archive tier offered for THIS selection, or null when none exists. */
  offeredArchiveTier: "4096" | "original" | null;
  plan: DownloadPlan | null;
  env: DownloadEnvironment;
  /** Alerts to render: the plan's, plus any the engine added after the picker. */
  alerts: DownloadAlert[];
  progress: DownloadProgress | null;
  partStates: PartState[];
  /** Set once the run ends. */
  result: (EngineResult & { partial?: boolean }) | null;
  error: string | null;
  /** Name of the folder this booking was last downloaded into, when the
   *  `directory` method is in play and the guest hasn't asked to change it.
   *  Offered rather than silently reused — saving into a folder the guest
   *  picked weeks ago without saying so is not a nice surprise. */
  rememberedFolder: string | null;
};

const IDLE_ENV: DownloadEnvironment = { capability: "memoryZip", memoryCap: 0, ios: false };

/**
 * Which archive tier, if any, this selection can offer. A booking never mixes
 * the two, so the first one seen decides; a selection where nothing has an
 * archive object offers no tier selector at all and behaves exactly as before
 * archives existed.
 */
function offeredTierFor(sources: PlanSource[]): "4096" | "original" | null {
  for (const source of sources) {
    if (source.archiveVariant === "4096" || source.archiveVariant === "original") {
      return source.archiveVariant;
    }
  }
  return null;
}

export function useDownloadFlow() {
  const [request, setRequest] = useState<DownloadRequest | null>(null);
  const [sources, setSources] = useState<PlanSource[] | null>(null);
  const [tier, setTier] = useState<DownloadTier>("2560");
  const [phase, setPhase] = useState<DownloadFlowState["phase"]>("resolving");
  const [extraAlerts, setExtraAlerts] = useState<DownloadAlert[]>([]);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [partStates, setPartStates] = useState<PartState[]>([]);
  const [result, setResult] = useState<DownloadFlowState["result"]>(null);
  const [error, setError] = useState<string | null>(null);
  const [rememberedFolder, setRememberedFolder] = useState<string | null>(null);
  // Probed once per flow rather than per render: the answer cannot change while
  // a modal is open, and `downloadEnvironment` touches `navigator`.
  const [env, setEnv] = useState<DownloadEnvironment>(IDLE_ENV);

  const abort = useRef<AbortController | null>(null);
  const releaseWakeLock = useRef<(() => void) | null>(null);
  // Running totals across batched parts, which are separate engine runs.
  const totals = useRef({ saved: 0, skipped: 0, failed: 0 });

  const offeredArchiveTier = useMemo(
    () => (request?.archiveAccess && sources ? offeredTierFor(sources) : null),
    [request?.archiveAccess, sources],
  );

  const plan = useMemo(() => {
    if (!sources) return null;
    return planDownload({
      items: sources,
      tier,
      capability: env.capability,
      memoryCap: env.memoryCap,
    });
  }, [sources, tier, env]);

  const stopWakeLock = useCallback(() => {
    releaseWakeLock.current?.();
    releaseWakeLock.current = null;
  }, []);

  const close = useCallback(() => {
    abort.current?.abort();
    abort.current = null;
    stopWakeLock();
    setRequest(null);
    setSources(null);
    setRememberedFolder(null);
    setExtraAlerts([]);
    setProgress(null);
    setPartStates([]);
    setResult(null);
    setError(null);
    setTier("2560");
    setPhase("resolving");
  }, [stopWakeLock]);

  /** Open the pre-flight for a selection. Mandatory in front of every bulk
   *  download — the single-photo lightbox path does not come through here. */
  const start = useCallback(
    async (next: DownloadRequest) => {
      abort.current?.abort();
      const ctrl = new AbortController();
      abort.current = ctrl;
      totals.current = { saved: 0, skipped: 0, failed: 0 };
      setRequest(next);
      setSources(null);
      setTier("2560");
      setPhase("resolving");
      setExtraAlerts([]);
      setProgress(null);
      setPartStates([]);
      setResult(null);
      setError(null);
      setRememberedFolder(null);
      setEnv(downloadEnvironment());
      try {
        // Read-only: this does NOT request permission. Asking for it outside a
        // user gesture either fails silently or prompts at a moment the guest
        // cannot explain — the confirm click re-requests it.
        void recallDownloadFolder(next.bookingId).then((handle) => {
          if (!ctrl.signal.aborted) setRememberedFolder(handle?.name ?? null);
        });
        const resolved = await next.resolveSources(ctrl.signal);
        if (ctrl.signal.aborted) return;
        setSources(resolved);
        setPhase("plan");
      } catch (err) {
        if (ctrl.signal.aborted) return;
        console.warn("[download] could not resolve the selection", err);
        setError("Couldn't prepare this download. Please try again.");
        setSources([]);
        setPhase("plan");
      }
    },
    [],
  );

  /** Run one engine invocation and fold its counters into the running totals. */
  const runEngine = useCallback(
    async (run: () => Promise<EngineResult>): Promise<EngineResult> => {
      const outcome = await run();
      totals.current = {
        saved: totals.current.saved + outcome.saved,
        skipped: totals.current.skipped + outcome.skipped,
        failed: totals.current.failed + outcome.failed,
      };
      return outcome;
    },
    [],
  );

  const finish = useCallback(
    (outcome: EngineResult, partial = false) => {
      stopWakeLock();
      setResult({ ...outcome, ...totals.current, partial });
      setPhase("finished");
    },
    [stopWakeLock],
  );

  /**
   * The confirm click. Everything that needs the user activation happens before
   * the first `await` that could outlive it — see the module comment.
   */
  const confirm = useCallback(async () => {
    if (!plan || !request || !plan.canProceed) return;
    const ctrl = new AbortController();
    abort.current = ctrl;
    const concurrency = concurrencyForTier(plan.tier);
    const resolveArchiveUrls =
      plan.tier === "2560" ? undefined : request.resolveArchiveUrls;
    const base = sanitiseFilename(request.baseName, "gallery");

    if (plan.method === "directory") {
      // A remembered folder still needs a permission prompt, and both that and
      // the picker must ride this gesture. `rememberedFolder` being null means
      // either there is none or the guest asked to choose a different one.
      let dir = rememberedFolder ? await reuseDownloadFolder(request.bookingId) : null;
      if (!dir) {
        const picked = await openDirectoryTarget();
        if (picked.cancelled) return; // dismissed the dialog: not a failure
        dir = picked.dir;
        // The probe said "directory" but the API is unusable here (cross-origin
        // iframe, insecure context). Re-plan onto a ZIP method rather than
        // dead-ending the guest.
        if (!dir) {
          setEnv((prev) => ({ ...prev, capability: "memoryZip" }));
          return;
        }
        void rememberDownloadFolder(request.bookingId, dir);
      }
      setPhase("running");
      releaseWakeLock.current = holdWakeLock();
      try {
        // The one alert the pure planner cannot compute: it needs the chosen
        // directory. Appended after the picker resolves and before the first
        // byte is fetched — hence the modal's second render pass.
        const existing = await scanExisting(dir, plan.items);
        const skippable = countSkippable(plan.items, existing);
        if (skippable > 0) {
          setExtraAlerts([{ id: "SKIPPING_EXISTING", severity: "info", count: skippable }]);
        }
        const outcome = await runEngine(() =>
          runDirectoryDownload({
            dir,
            items: plan.items,
            existing,
            resolveArchiveUrls,
            onProgress: setProgress,
            signal: ctrl.signal,
          }),
        );
        finish(outcome, Boolean(outcome.aborted));
      } catch (err) {
        stopWakeLock();
        console.warn("[download] directory run failed", err);
        setError("Download failed — please try again.");
        setPhase("plan");
      }
      return;
    }

    if (plan.method === "streamZip") {
      const { target, cancelled } = await openZipTarget(`${base}.zip`);
      if (cancelled) return;
      setPhase("running");
      releaseWakeLock.current = holdWakeLock();
      try {
        const outcome = await runEngine(() =>
          runZipDownload({
            target,
            zipName: `${base}.zip`,
            items: plan.items,
            concurrency,
            resolveArchiveUrls,
            onProgress: setProgress,
            signal: ctrl.signal,
          }),
        );
        finish(outcome, Boolean(outcome.aborted));
      } catch (err) {
        stopWakeLock();
        console.warn("[download] zip run failed", err);
        setError("Download failed — please try again.");
        setPhase("plan");
      }
      return;
    }

    if (plan.method === "memoryZip") {
      setPhase("running");
      releaseWakeLock.current = holdWakeLock();
      try {
        const outcome = await runEngine(() =>
          runZipDownload({
            target: null,
            zipName: `${base}.zip`,
            items: plan.items,
            concurrency,
            resolveArchiveUrls,
            onProgress: setProgress,
            signal: ctrl.signal,
          }),
        );
        finish(outcome, Boolean(outcome.aborted));
      } catch (err) {
        stopWakeLock();
        console.warn("[download] zip run failed", err);
        setError("Download failed — please try again.");
        setPhase("plan");
      }
      return;
    }

    if (plan.method === "batchedZip") {
      // Parts are never chained automatically: browsers block repeated
      // automatic downloads, and a guest who did not click loses track of what
      // actually saved. The modal becomes the part list; each part is a click.
      setPartStates(plan.batches.map(() => "pending"));
      setPhase("running");
      releaseWakeLock.current = holdWakeLock();
    }
  }, [plan, request, rememberedFolder, runEngine, finish, stopWakeLock]);

  /** "Choose a different folder" — drops the remembered target for this run
   *  only. The handle stays in IndexedDB until a new one replaces it. */
  const forgetRememberedFolder = useCallback(() => setRememberedFolder(null), []);

  /** Download one part of a `batchedZip` run. */
  const downloadPart = useCallback(
    async (index: number) => {
      if (!plan || !request || plan.method !== "batchedZip") return;
      if (partStates[index] === "active" || partStates[index] === "done") return;
      const ctrl = abort.current ?? new AbortController();
      abort.current = ctrl;
      const base = sanitiseFilename(request.baseName, "gallery");
      setPartStates((prev) => prev.map((s, i) => (i === index ? "active" : s)));
      try {
        const outcome = await runEngine(() =>
          runZipDownload({
            target: null,
            zipName: batchPartName(base, index, plan.batches.length),
            items: plan.batches[index],
            concurrency: concurrencyForTier(plan.tier),
            resolveArchiveUrls: plan.tier === "2560" ? undefined : request.resolveArchiveUrls,
            onProgress: setProgress,
            signal: ctrl.signal,
          }),
        );
        const state: PartState = outcome.aborted ? "pending" : "done";
        const nextStates = partStates.map((s, i) => (i === index ? state : s));
        setPartStates(nextStates);
        if (nextStates.every((s) => s === "done")) finish(outcome);
      } catch (err) {
        console.warn("[download] part failed", err);
        setPartStates((prev) => prev.map((s, i) => (i === index ? "failed" : s)));
        setError("That part failed — try it again.");
      }
    },
    [plan, request, partStates, runEngine, finish],
  );

  const cancel = useCallback(() => {
    abort.current?.abort();
    stopWakeLock();
    if (phase === "running") {
      setResult({ ...totals.current, aborted: true, partial: true });
      setPhase("finished");
    }
  }, [phase, stopWakeLock]);

  // A refresh or a closed tab discards everything fetched so far — the archive
  // only exists in this page. The browser owns the wording; all we control is
  // that it fires.
  useEffect(() => {
    if (phase !== "running") return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
      return "";
    };
    const onPageHide = () => abort.current?.abort();
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [phase]);

  // Never leave a wake lock held by an unmounted flow.
  useEffect(() => () => releaseWakeLock.current?.(), []);

  const state: DownloadFlowState = {
    open: request !== null,
    phase,
    tier,
    offeredArchiveTier,
    plan,
    env,
    alerts: [...(plan?.alerts ?? []), ...extraAlerts],
    progress,
    partStates,
    result,
    error,
    rememberedFolder: plan?.method === "directory" ? rememberedFolder : null,
  };

  return {
    state,
    start,
    close,
    confirm,
    cancel,
    setTier,
    downloadPart,
    forgetRememberedFolder,
  };
}

export type DownloadFlow = ReturnType<typeof useDownloadFlow>;
