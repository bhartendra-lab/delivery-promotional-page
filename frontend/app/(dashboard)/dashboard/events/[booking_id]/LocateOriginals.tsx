"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getShortlistedMedia, type ShortlistedMediaItem } from "@/lib/api";
import { streamZipToDisk } from "@/lib/media-actions";
import { OUTPUT_DIR, resolveCleanName } from "@/lib/locate-originals/match";
import {
  ensureReadwrite,
  findFreeDirName,
  getExistingDirectory,
  pickDirectory,
  supportsFsa,
  type FsDirHandle,
  type SourceFile,
} from "@/lib/locate-originals/fsa";
import { clearDirHandle, loadDirHandle, saveDirHandle } from "@/lib/locate-originals/handleStore";
import {
  copyToDirectory,
  scanDirectory,
  toTargets,
  type CopyMode,
  type CopyProgress,
  type IncludedMatch,
  type RunResult,
  type ScanMatch,
} from "@/lib/locate-originals/engine";
import {
  IconArrowRight,
  IconCheck,
  IconCopy,
  IconDownload,
  IconFolder,
  IconImage,
  IconInfo,
  IconMonitor,
  IconScanFace,
  IconTarget,
  IconWarning,
  IconX,
} from "./icons";

const fmt = (n: number) => n.toLocaleString("en-IN");

/**
 * "Locate Original Images" (Smart Selects). A single-purpose, stateless tool:
 * the studio picks a folder, we match it to the current shortlist, they review
 * and copy. Nothing about a run is remembered server-side — the only surface on
 * the tab is the header button; everything else lives in this modal, which
 * mounts fresh each time `open` flips true.
 */
export function LocateOriginals({
  bookingId,
  eventName,
  shortlistedCount,
  open,
  onOpenChange,
  toast,
}: {
  bookingId: string;
  eventName: string;
  shortlistedCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  toast: (msg: string, type?: "success" | "error") => void;
}) {
  if (!open) return null;
  return (
    <LocateModal
      bookingId={bookingId}
      eventName={eventName}
      shortlistedCount={shortlistedCount}
      toast={toast}
      onClose={() => onOpenChange(false)}
    />
  );
}

/* ── the locate flow ──────────────────────────────────────────────── */

type Phase = "picker" | "scanning" | "review" | "choose" | "copying" | "done" | "error";

function LocateModal({
  bookingId,
  eventName,
  shortlistedCount,
  toast,
  onClose,
}: {
  bookingId: string;
  eventName: string;
  shortlistedCount: number;
  toast: (msg: string, type?: "success" | "error") => void;
  onClose: () => void;
}) {
  // Capability is known at first render; the modal itself only renders after a
  // user gesture so there's no SSR/hydration surface to mismatch.
  const [supported] = useState<boolean | null>(() =>
    typeof window !== "undefined" ? supportsFsa() : null,
  );

  // Every shortlisted item is a target, every run — fetched fresh on open.
  const [items, setItems] = useState<ShortlistedMediaItem[]>([]);
  const [foldersById, setFoldersById] = useState<Map<string, string>>(new Map());
  const [itemsLoading, setItemsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await getShortlistedMedia(bookingId);
        if (!alive) return;
        setItems(res.media);
        setFoldersById(new Map(res.customFolders.map((f) => [f._id, f.name])));
      } catch {
        if (alive) setLoadError("Could not load your shortlist — close this and try again.");
      } finally {
        if (alive) setItemsLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [bookingId]);

  const [phase, setPhase] = useState<Phase>("picker");
  const [savedHandle, setSavedHandle] = useState<FsDirHandle | null>(null);
  const [scanned, setScanned] = useState(0);
  const [matches, setMatches] = useState<ScanMatch[]>([]);
  const [targetCount, setTargetCount] = useState(0);
  const [include, setInclude] = useState<Record<string, boolean>>({});
  const [chosenFile, setChosenFile] = useState<Record<string, number>>({});
  const [copyProg, setCopyProg] = useState<CopyProgress>({ copied: 0, total: 0 });
  const [result, setResult] = useState<RunResult | null>(null);
  const [lastMode, setLastMode] = useState<CopyMode>("create");
  const [finalFolderName, setFinalFolderName] = useState(OUTPUT_DIR);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [zipping, setZipping] = useState(false);

  const rootRef = useRef<FsDirHandle | null>(null);
  const targetsRef = useRef<ReturnType<typeof toTargets>>([]);
  const rawIndexRef = useRef<Map<string, SourceFile>>(new Map());
  const busy = phase === "scanning" || phase === "copying";

  // Re-offer the folder picked on a previous visit.
  useEffect(() => {
    if (!supportsFsa()) return;
    let alive = true;
    void loadDirHandle(bookingId).then((h) => {
      if (alive) setSavedHandle(h);
    });
    return () => {
      alive = false;
    };
  }, [bookingId]);

  const close = useCallback(() => {
    if (busy) return; // don't abandon an in-flight scan/copy
    onClose();
  }, [busy, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);

  /* scan */
  const runScan = useCallback(
    async (root: FsDirHandle) => {
      const targets = toTargets(items, bookingId);
      if (targets.length === 0) {
        toast("Your shortlist is empty.");
        onClose();
        return;
      }
      targetsRef.current = targets;
      setTargetCount(targets.length);
      setPhase("scanning");
      setScanned(0);
      try {
        const res = await scanDirectory(root, targets, bookingId, setScanned);
        const inc: Record<string, boolean> = {};
        const ch: Record<string, number> = {};
        for (const m of res.matches) {
          inc[m.target._id] = true;
          ch[m.target._id] = 0;
        }
        setInclude(inc);
        setChosenFile(ch);
        setMatches(res.matches);
        rawIndexRef.current = res.rawIndex;
        setScanned(res.scannedCount);
        setPhase("review");
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Could not scan that folder.");
        setPhase("error");
      }
    },
    [items, bookingId, toast, onClose],
  );

  const pickAndScan = useCallback(
    async (useSaved: boolean) => {
      try {
        let root: FsDirHandle | null = null;
        if (useSaved && savedHandle) {
          const ok = await ensureReadwrite(savedHandle);
          if (ok) root = savedHandle;
          else {
            toast("That folder is no longer accessible — pick it again.", "error");
            void clearDirHandle(bookingId);
            setSavedHandle(null);
          }
        }
        if (!root) {
          root = await pickDirectory();
          if (!root) return; // cancelled
          void saveDirHandle(bookingId, root);
          setSavedHandle(root);
        }
        rootRef.current = root;
        await runScan(root);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Could not open that folder.");
        setPhase("error");
      }
    },
    [savedHandle, bookingId, toast, runScan],
  );

  /* review → copy */
  const includedMatches = useMemo<IncludedMatch[]>(
    () =>
      matches
        .filter((m) => m.kind === "exact" || include[m.target._id])
        .map((m) => ({ target: m.target, source: m.sources[chosenFile[m.target._id] ?? 0] }))
        .filter((m): m is IncludedMatch => !!m.source),
    [matches, include, chosenFile],
  );

  const runCopy = useCallback(
    async (mode: CopyMode, outDir: FsDirHandle, folderName: string) => {
      setPhase("copying");
      setCopyProg({ copied: 0, total: includedMatches.length });
      try {
        const res = await copyToDirectory(
          outDir,
          includedMatches,
          rawIndexRef.current,
          foldersById,
          targetsRef.current.length,
          mode,
          setCopyProg,
        );
        setResult(res);
        setLastMode(mode);
        setFinalFolderName(folderName);
        setPhase("done");
        toast(
          mode === "replace"
            ? `“${folderName}” now matches this run's selection.`
            : "Originals copied.",
        );
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Something went wrong while copying.");
        setPhase("error");
      }
    },
    [includedMatches, foldersById, toast],
  );

  const startCopy = useCallback(async () => {
    if (includedMatches.length === 0 || !rootRef.current) return;
    const root = rootRef.current;
    try {
      const existing = await getExistingDirectory(root, OUTPUT_DIR);
      if (existing) {
        setPhase("choose");
      } else {
        const outDir = await root.getDirectoryHandle(OUTPUT_DIR, { create: true });
        await runCopy("create", outDir, OUTPUT_DIR);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong while copying.");
      setPhase("error");
    }
  }, [includedMatches, runCopy]);

  const chooseReplace = useCallback(async () => {
    if (!rootRef.current) return;
    const outDir = await rootRef.current.getDirectoryHandle(OUTPUT_DIR, { create: true });
    await runCopy("replace", outDir, OUTPUT_DIR);
  }, [runCopy]);

  const chooseCreateNew = useCallback(async () => {
    if (!rootRef.current) return;
    const freeName = await findFreeDirName(rootRef.current, OUTPUT_DIR);
    const outDir = await rootRef.current.getDirectoryHandle(freeName, { create: true });
    await runCopy("create", outDir, freeName);
  }, [runCopy]);

  const tryAgain = useCallback(() => {
    setMatches([]);
    setResult(null);
    setErrorMsg(null);
    setScanned(0);
    rootRef.current = null;
    rawIndexRef.current = new Map();
    setPhase("picker");
    if (supportsFsa()) void loadDirHandle(bookingId).then(setSavedHandle);
  }, [bookingId]);

  /* not-found → manual download (Done screen) */
  const notFoundItems = useMemo(() => {
    const includedIds = new Set(includedMatches.map((m) => m.target._id));
    return items.filter((i) => !includedIds.has(i._id));
  }, [items, includedMatches]);

  const downloadNotFound = useCallback(async () => {
    const entries = notFoundItems
      .filter((i) => i.url)
      .map((i) => ({ url: i.url, name: resolveCleanName(i, bookingId) }));
    if (entries.length === 0 || zipping) return;
    setZipping(true);
    toast("Preparing your download…");
    try {
      const { zipped, failed, cancelled } = await streamZipToDisk(
        entries,
        `${sanitizeArchive(eventName)}_not_found.zip`,
        (done, count) => toast(`Zipping ${fmt(done)}/${fmt(count)}…`),
      );
      if (cancelled) return;
      toast(failed > 0 ? `Saved ${fmt(zipped)} — ${fmt(failed)} couldn't be fetched` : "Saved to your downloads");
    } catch (err) {
      console.warn("[downloadNotFound] failed", err);
      toast("Download failed — please try again", "error");
    } finally {
      setZipping(false);
    }
  }, [notFoundItems, bookingId, eventName, zipping, toast]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Locate original images"
      className="fixed inset-0 z-[220] flex items-stretch justify-center sm:items-center sm:px-4"
      style={{ background: "rgba(42,34,24,0.48)", backdropFilter: "blur(3px)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="dash-rise flex h-full w-full flex-col overflow-hidden bg-white shadow-[0_24px_64px_rgba(42,34,24,0.24)] sm:h-auto sm:max-h-[88vh] sm:w-full sm:max-w-[560px] sm:rounded-[16px] sm:border sm:border-[var(--color-brand-border)]">
        <header className="flex items-center justify-between gap-4 border-b border-[var(--color-brand-border)] px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-brand-navy-soft)] text-[var(--color-brand-navy)]">
              <IconTarget size={18} />
            </span>
            <div>
              <h2 className="text-[16px] font-bold tracking-tight text-[var(--color-brand-ink)]">
                Locate Original Images
              </h2>
              <p className="text-[12px] text-[var(--color-brand-muted)]">
                Match shortlisted photos to your full-resolution files.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            disabled={busy}
            aria-label="Close"
            className="brand-focus flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-brand-muted)] hover:bg-[var(--color-brand-hover)] hover:text-[var(--color-brand-ink)] disabled:opacity-40"
          >
            <IconX size={16} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {supported === false ? (
            <ChromeRequiredPanel />
          ) : (
            <>
              {phase === "picker" && (
                <PickerPanel
                  supported={supported}
                  savedHandle={savedHandle}
                  targetCount={items.length || shortlistedCount}
                  loading={itemsLoading}
                  loadError={loadError}
                  onUseSaved={() => void pickAndScan(true)}
                  onPick={() => void pickAndScan(false)}
                />
              )}
              {phase === "scanning" && <ScanningPanel scanned={scanned} />}
              {phase === "review" && (
                <ReviewPanel
                  matches={matches}
                  targetCount={targetCount}
                  include={include}
                  chosenFile={chosenFile}
                  onToggleInclude={(id) => setInclude((p) => ({ ...p, [id]: !p[id] }))}
                  onChooseFile={(id, i) => setChosenFile((p) => ({ ...p, [id]: i }))}
                />
              )}
              {phase === "choose" && (
                <ChooseDestinationPanel
                  onReplace={() => void chooseReplace()}
                  onCreateNew={() => void chooseCreateNew()}
                />
              )}
              {phase === "copying" && <CopyingPanel prog={copyProg} />}
              {phase === "done" && result && (
                <DonePanel
                  result={result}
                  mode={lastMode}
                  folderName={finalFolderName}
                  zipping={zipping}
                  onDownloadNotFound={() => void downloadNotFound()}
                />
              )}
              {phase === "error" && <ErrorPanel message={errorMsg} />}
            </>
          )}
        </div>

        {supported !== false && (
          <footer className="flex items-center justify-between gap-3 border-t border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] px-6 py-3.5">
            <div className="text-[12px] text-[var(--color-brand-muted)]">
              {phase === "review" && `${fmt(includedMatches.length)} of ${fmt(targetCount)} ready`}
            </div>
            <div className="flex items-center gap-2.5">
              {(phase === "review" || phase === "done" || phase === "error") && (
                <button
                  type="button"
                  onClick={phase === "review" ? close : tryAgain}
                  className="brand-focus inline-flex h-9 items-center rounded-lg border border-[var(--color-brand-border)] bg-white px-3.5 text-[13px] font-medium text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)]"
                >
                  {phase === "review" ? "Cancel" : "Try Again"}
                </button>
              )}
              {phase === "review" && (
                <button
                  type="button"
                  onClick={() => void startCopy()}
                  disabled={includedMatches.length === 0}
                  className="brand-focus inline-flex h-9 items-center gap-2 rounded-lg bg-[var(--color-brand-navy)] px-4 text-[13px] font-semibold text-white hover:bg-[var(--color-brand-navy-deep)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <IconArrowRight size={15} />
                  {`Copy ${fmt(includedMatches.length)}`}
                </button>
              )}
              {phase === "done" && (
                <button
                  type="button"
                  onClick={close}
                  className="brand-focus inline-flex h-9 items-center rounded-lg bg-[var(--color-brand-navy)] px-4 text-[13px] font-semibold text-white hover:bg-[var(--color-brand-navy-deep)]"
                >
                  Done
                </button>
              )}
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}

/* ── modal panels ─────────────────────────────────────────────────── */

/** Dedicated full-panel screen for non-Chromium browsers — no partial/fallback
 *  experience, just a plain explanation of where this works. */
function ChromeRequiredPanel() {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-brand-navy-soft)] text-[var(--color-brand-navy)]">
        <IconMonitor size={26} />
      </span>
      <h3 className="text-[16px] font-bold text-[var(--color-brand-ink)]">
        Open this page in Google Chrome
      </h3>
      <p className="max-w-[360px] text-[13px] leading-relaxed text-[var(--color-brand-muted)]">
        Locate Originals works best in Google Chrome — open this page there to match your
        shortlist to your photo folder.
      </p>
    </div>
  );
}

const STEPS: { icon: React.ReactNode; label: string }[] = [
  { icon: <IconFolder size={18} />, label: "Pick a folder" },
  { icon: <IconScanFace size={18} />, label: "We check it against your shortlist" },
  { icon: <IconCheck size={18} />, label: "You review what we found" },
  { icon: <IconCopy size={18} />, label: "We copy them in" },
];

/** Compact step-by-step graphic — horizontal on wider screens, stacked on narrow. */
function StepsGraphic() {
  const nodes: React.ReactNode[] = [];
  STEPS.forEach((step, i) => {
    nodes.push(
      <div
        key={`step-${i}`}
        className="flex items-center gap-3 sm:min-w-0 sm:flex-1 sm:flex-col sm:gap-2 sm:text-center"
      >
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[var(--color-brand-navy)] shadow-[0_1px_3px_rgba(42,34,24,0.12)]">
          {step.icon}
        </span>
        <span className="text-[12px] font-medium leading-snug text-[var(--color-brand-ink)]">
          {step.label}
        </span>
      </div>,
    );
    if (i < STEPS.length - 1) {
      nodes.push(
        <span
          key={`arrow-${i}`}
          aria-hidden
          className="flex shrink-0 rotate-90 items-center justify-center text-[var(--color-brand-outline)] sm:rotate-0"
        >
          <IconArrowRight size={14} />
        </span>,
      );
    }
  });
  return (
    <div className="mb-5 flex flex-col gap-2 rounded-xl border border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] p-4 sm:flex-row sm:items-center sm:gap-1">
      {nodes}
    </div>
  );
}

function PickerPanel({
  supported,
  savedHandle,
  targetCount,
  loading,
  loadError,
  onUseSaved,
  onPick,
}: {
  supported: boolean | null;
  savedHandle: FsDirHandle | null;
  targetCount: number;
  loading: boolean;
  loadError: string | null;
  onUseSaved: () => void;
  onPick: () => void;
}) {
  if (supported === null) {
    return <p className="text-[13px] text-[var(--color-brand-muted)]">Preparing…</p>;
  }

  return (
    <div>
      <StepsGraphic />

      {loadError ? (
        <p className="mb-4 rounded-lg border border-[var(--color-brand-border)] bg-[var(--color-brand-warning-soft)] px-3.5 py-3 text-[12.5px] leading-relaxed text-[var(--color-brand-ink)]">
          {loadError}
        </p>
      ) : loading ? (
        <p className="mb-4 flex items-center gap-2 text-[13px] text-[var(--color-brand-muted)]">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-[2px] border-[var(--color-brand-border)] border-t-[var(--color-brand-navy)]" />
          Loading your shortlist…
        </p>
      ) : (
        <p className="mb-4 text-[13px] leading-relaxed text-[var(--color-brand-muted)]">
          Pick a folder (we&apos;ll check subfolders too) and we&apos;ll match it against your{" "}
          <span className="font-semibold text-[var(--color-brand-ink)]">{fmt(targetCount)}</span>{" "}
          shortlisted photo{targetCount === 1 ? "" : "s"}.
        </p>
      )}

      <div className="flex flex-col gap-2.5">
        {savedHandle && (
          <button
            type="button"
            onClick={onUseSaved}
            disabled={loading || !!loadError}
            className="brand-focus flex items-center gap-3 rounded-xl border border-[var(--color-brand-navy)] bg-[var(--color-brand-navy-soft)] px-4 py-3 text-left hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            <IconFolder size={18} className="shrink-0 text-[var(--color-brand-navy)]" />
            <span className="min-w-0">
              <span className="block truncate text-[13.5px] font-semibold text-[var(--color-brand-ink)]">
                Use “{savedHandle.name}”
              </span>
              <span className="block text-[12px] text-[var(--color-brand-muted)]">
                Continue with the folder you picked last time.
              </span>
            </span>
          </button>
        )}
        <button
          type="button"
          onClick={onPick}
          disabled={loading || !!loadError}
          className="brand-focus flex items-center gap-3 rounded-xl border border-[var(--color-brand-border)] bg-white px-4 py-3 text-left hover:border-[var(--color-brand-outline)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <IconFolder size={18} className="shrink-0 text-[var(--color-brand-muted)]" />
          <span className="min-w-0">
            <span className="block text-[13.5px] font-semibold text-[var(--color-brand-ink)]">
              {savedHandle ? "Choose a different folder…" : "Choose folder…"}
            </span>
            <span className="block text-[12px] text-[var(--color-brand-muted)]">
              Matches are copied into a “{OUTPUT_DIR}” subfolder inside it.
            </span>
          </span>
        </button>
      </div>
    </div>
  );
}

function ScanningPanel({ scanned }: { scanned: number }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <span className="h-9 w-9 animate-spin rounded-full border-[3px] border-[var(--color-brand-border)] border-t-[var(--color-brand-navy)]" />
      <p className="text-[14px] font-semibold text-[var(--color-brand-ink)]">Scanning your folder…</p>
      <p className="text-[12.5px] text-[var(--color-brand-muted)]">
        {fmt(scanned)} file{scanned === 1 ? "" : "s"} checked
      </p>
    </div>
  );
}

function ReviewPanel({
  matches,
  targetCount,
  include,
  chosenFile,
  onToggleInclude,
  onChooseFile,
}: {
  matches: ScanMatch[];
  targetCount: number;
  include: Record<string, boolean>;
  chosenFile: Record<string, number>;
  onToggleInclude: (id: string) => void;
  onChooseFile: (id: string, i: number) => void;
}) {
  const exact = matches.filter((m) => m.kind === "exact");
  const modified = matches.filter((m) => m.kind === "fuzzy");
  const conflicts = matches.filter((m) => m.sources.length > 1);
  const found = matches.length;

  if (found === 0) {
    return (
      <div className="flex flex-col items-center gap-2.5 py-8 text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-brand-bg)] text-[var(--color-brand-muted)]">
          <IconWarning size={22} />
        </span>
        <p className="text-[14px] font-semibold text-[var(--color-brand-ink)]">
          No originals found in that folder
        </p>
        <p className="max-w-[360px] text-[12.5px] leading-relaxed text-[var(--color-brand-muted)]">
          None of the {fmt(targetCount)} shortlisted photos matched a file here. Try another
          folder.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-[var(--color-brand-success-soft)] bg-[var(--color-brand-success-soft)] px-3.5 py-2.5">
        <p className="text-[13px] font-semibold text-[var(--color-brand-ink)]">
          Found {fmt(found)} of {fmt(targetCount)} shortlisted photos
        </p>
        <p className="text-[12px] text-[var(--color-brand-muted)]">
          {fmt(exact.length)} found
          {modified.length > 0 && ` · ${fmt(modified.length)} found, but modified`}
        </p>
      </div>

      {modified.length > 0 && (
        <section>
          <h3 className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-bold text-[var(--color-brand-ink)]">
            <IconInfo size={13} className="text-[var(--color-brand-warning)]" />
            Found, but modified — please confirm
            <InfoTip label="Why these need confirming">
              Same name and size but a different modified date — common with cloud sync or
              &ldquo;save as&rdquo;. Usually the same photo, but worth a quick glance.
            </InfoTip>
          </h3>
          <p className="mb-2 text-[11.5px] text-[var(--color-brand-muted)]">
            Untick any that aren&apos;t the right photo.
          </p>
          <div className="flex flex-col divide-y divide-[var(--color-brand-border)] rounded-lg border border-[var(--color-brand-border)]">
            {modified.map((m) => (
              <label
                key={m.target._id}
                className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-[12.5px]"
              >
                <input
                  type="checkbox"
                  checked={include[m.target._id] ?? true}
                  onChange={() => onToggleInclude(m.target._id)}
                  className="h-4 w-4 accent-[var(--color-brand-navy)]"
                />
                <IconImage size={13} className="shrink-0 text-[var(--color-brand-muted)]" />
                <span className="truncate text-[var(--color-brand-ink)]" title={m.target.filename}>
                  {m.target.filename}
                </span>
              </label>
            ))}
          </div>
        </section>
      )}

      {conflicts.length > 0 && (
        <section>
          <h3 className="mb-1.5 text-[12.5px] font-bold text-[var(--color-brand-ink)]">
            More than one match — choose which file to use
          </h3>
          <div className="flex flex-col gap-2.5">
            {conflicts.map((m) => (
              <div
                key={m.target._id}
                className="rounded-lg border border-[var(--color-brand-border)] px-3 py-2.5"
              >
                <p
                  className="mb-1.5 truncate text-[12.5px] font-semibold text-[var(--color-brand-ink)]"
                  title={m.target.filename}
                >
                  {m.target.filename}
                </p>
                <div className="flex flex-col gap-1">
                  {m.sources.map((s, i) => (
                    <label key={i} className="flex cursor-pointer items-center gap-2 text-[12px]">
                      <input
                        type="radio"
                        name={`conflict-${m.target._id}`}
                        checked={(chosenFile[m.target._id] ?? 0) === i}
                        onChange={() => onChooseFile(m.target._id, i)}
                        className="h-3.5 w-3.5 accent-[var(--color-brand-navy)]"
                      />
                      <span className="truncate text-[var(--color-brand-muted)]" title={s.path}>
                        {s.path} · {formatBytes(s.file.size)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="text-[11.5px] text-[var(--color-brand-muted)]">
        Sorted into per-folder subfolders inside “{OUTPUT_DIR}”.
      </p>
    </div>
  );
}

/**
 * A small accessible info-tip: an IconInfo trigger that reveals explanatory copy
 * on hover *and* keyboard focus (and toggles on click/tap).
 */
function InfoTip({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="brand-focus inline-flex h-4 w-4 items-center justify-center rounded-full text-[var(--color-brand-muted)] hover:text-[var(--color-brand-ink)]"
      >
        <IconInfo size={13} />
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-0 top-full z-40 mt-1.5 w-[240px] rounded-lg border border-[var(--color-brand-border)] bg-white px-3 py-2 text-[11.5px] font-normal normal-case leading-relaxed text-[var(--color-brand-muted)] shadow-[0_10px_30px_rgba(42,34,24,0.16)]"
        >
          {children}
        </span>
      )}
    </span>
  );
}

function ChooseDestinationPanel({
  onReplace,
  onCreateNew,
}: {
  onReplace: () => void;
  onCreateNew: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2.5 rounded-lg border border-[var(--color-brand-border)] bg-[var(--color-brand-warning-soft)] px-3.5 py-3">
        <IconInfo size={15} className="mt-0.5 shrink-0 text-[var(--color-brand-warning)]" />
        <p className="text-[12.5px] leading-relaxed text-[var(--color-brand-ink)]">
          A “{OUTPUT_DIR}” folder from a previous run is already here. What should we do?
        </p>
      </div>
      <button
        type="button"
        onClick={onReplace}
        className="brand-focus flex flex-col items-start gap-1 rounded-xl border border-[var(--color-brand-border)] bg-white px-4 py-3 text-left hover:border-[var(--color-brand-outline)]"
      >
        <span className="text-[13.5px] font-semibold text-[var(--color-brand-ink)]">Replace it</span>
        <span className="text-[12px] text-[var(--color-brand-muted)]">
          Make it match exactly this run&apos;s selection — anything else in there is removed.
        </span>
      </button>
      <button
        type="button"
        onClick={onCreateNew}
        className="brand-focus flex flex-col items-start gap-1 rounded-xl border border-[var(--color-brand-border)] bg-white px-4 py-3 text-left hover:border-[var(--color-brand-outline)]"
      >
        <span className="text-[13.5px] font-semibold text-[var(--color-brand-ink)]">
          Keep it, create a new copy
        </span>
        <span className="text-[12px] text-[var(--color-brand-muted)]">
          Leave that folder untouched and copy this run&apos;s selection into a new one alongside
          it.
        </span>
      </button>
    </div>
  );
}

function CopyingPanel({ prog }: { prog: CopyProgress }) {
  const pct = prog.total === 0 ? 0 : Math.round((prog.copied / prog.total) * 100);
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <span className="h-9 w-9 animate-spin rounded-full border-[3px] border-[var(--color-brand-border)] border-t-[var(--color-brand-navy)]" />
      <p className="text-[14px] font-semibold text-[var(--color-brand-ink)]">Copying originals…</p>
      <p className="text-[12.5px] text-[var(--color-brand-muted)]">
        {fmt(prog.copied)} of {fmt(prog.total)}
        {prog.currentName ? ` · ${prog.currentName}` : ""}
      </p>
      <div className="h-1.5 w-full max-w-[280px] overflow-hidden rounded-full bg-[var(--color-brand-track)]">
        <div
          className="h-full rounded-full bg-[var(--color-brand-navy)] transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function DonePanel({
  result,
  mode,
  folderName,
  zipping,
  onDownloadNotFound,
}: {
  result: RunResult;
  mode: CopyMode;
  folderName: string;
  zipping: boolean;
  onDownloadNotFound: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 py-2">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-brand-success-soft)] text-[var(--color-brand-success)]">
          <IconCheck size={24} />
        </span>
        <p className="text-[15px] font-bold text-[var(--color-brand-ink)]">
          {mode === "replace" ? "Folder replaced" : "Originals copied"}
        </p>
        <p className="max-w-[380px] text-[12.5px] leading-relaxed text-[var(--color-brand-muted)]">
          {mode === "replace"
            ? `The “${folderName}” folder now matches this run's selection exactly.`
            : `Originals are in the “${folderName}” folder, sorted into per-folder subfolders.`}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Copied" value={result.copied} tone="success" />
        <Stat label="Already there" value={result.alreadyThere} tone="muted" />
        <Stat label="Not found" value={result.notFound} tone="warning" />
      </div>
      {result.notFound > 0 && (
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="text-[12px] text-[var(--color-brand-muted)]">
            {fmt(result.notFound)} shortlisted photo{result.notFound === 1 ? "" : "s"} weren&apos;t
            found in that folder.
          </p>
          <button
            type="button"
            onClick={onDownloadNotFound}
            disabled={zipping}
            className="brand-focus inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-brand-border)] bg-white px-3.5 py-1.5 text-[12px] font-semibold text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {zipping ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-[2px] border-[var(--color-brand-border)] border-t-[var(--color-brand-navy)]" />
            ) : (
              <IconDownload size={13} />
            )}
            {zipping ? "Preparing…" : "Download these"}
          </button>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "muted" | "warning";
}) {
  const color =
    tone === "success"
      ? "var(--color-brand-success)"
      : tone === "warning"
        ? "var(--color-brand-warning)"
        : "var(--color-brand-muted)";
  return (
    <div className="rounded-lg border border-[var(--color-brand-border)] bg-white px-2 py-3 text-center">
      <div className="text-[20px] font-bold" style={{ color }}>
        {fmt(value)}
      </div>
      <div className="mt-0.5 text-[11px] leading-tight text-[var(--color-brand-muted)]">{label}</div>
    </div>
  );
}

function ErrorPanel({ message }: { message: string | null }) {
  return (
    <div className="flex flex-col items-center gap-2.5 py-8 text-center">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-brand-danger-soft)] text-[var(--color-brand-danger)]">
        <IconWarning size={22} />
      </span>
      <p className="text-[14px] font-semibold text-[var(--color-brand-ink)]">Couldn&apos;t finish</p>
      <p className="max-w-[380px] text-[12.5px] leading-relaxed text-[var(--color-brand-muted)]">
        {message ?? "Something went wrong. Please try again."}
      </p>
    </div>
  );
}

/* ── small helpers ────────────────────────────────────────────────── */

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function sanitizeArchive(name: string): string {
  return (
    (name || "Smartly Selected").replace(/[\\/:*?"<>|\r\n]+/g, " ").replace(/\s+/g, " ").trim() ||
    "Smartly Selected"
  );
}
