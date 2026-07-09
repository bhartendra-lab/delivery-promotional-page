"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getShortlistedMedia, updateMediaIdentified, type ShortlistedMediaItem } from "@/lib/api";
import { streamZipToDisk } from "@/lib/media-actions";
import { resolveCleanName } from "@/lib/locate-originals/match";
import {
  ensureReadwrite,
  pickDirectory,
  supportsFsa,
  type FsDirHandle,
} from "@/lib/locate-originals/fsa";
import { clearDirHandle, loadDirHandle, saveDirHandle } from "@/lib/locate-originals/handleStore";
import {
  copyToDirectory,
  scanDirectory,
  scanFiles,
  toTargets,
  zipToDownload,
  type CopyProgress,
  type IncludedMatch,
  type RunResult,
  type ScanMatch,
} from "@/lib/locate-originals/engine";
import {
  IconArrowRight,
  IconCheck,
  IconDownload,
  IconFolder,
  IconImage,
  IconInfo,
  IconTarget,
  IconWarning,
  IconX,
} from "./icons";

const fmt = (n: number) => n.toLocaleString("en-IN");

/**
 * "Locate Original Images" (Smart Selects). Owns the persistent, DB-backed
 * identified report (rendered inline as a card); the interactive flow lives in
 * {@link LocateModal}, which mounts fresh each time `open` flips true (so its
 * state resets naturally, no reset effect).
 *
 * Everything operates only on `shortlisted: true` media; already-`identified`
 * rows are skipped from the match target up front.
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
  const [items, setItems] = useState<ShortlistedMediaItem[]>([]);
  const [foldersById, setFoldersById] = useState<Map<string, string>>(new Map());
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [zipping, setZipping] = useState(false);

  // First statement is the `await`, so no setState runs synchronously in the
  // effect body (keeps the react-hooks/set-state-in-effect rule happy).
  const fetchReport = useCallback(async () => {
    try {
      const res = await getShortlistedMedia(bookingId);
      setItems(res.media);
      setFoldersById(new Map(res.customFolders.map((f) => [f._id, f.name])));
      setLoadedOnce(true);
    } catch {
      /* keep the last-known report */
    }
  }, [bookingId]);

  // Refresh on mount and whenever the shortlist size changes (stars toggled).
  useEffect(() => {
    if (shortlistedCount > 0) void fetchReport();
  }, [fetchReport, shortlistedCount]);

  const unidentified = useMemo(() => items.filter((i) => !i.identified), [items]);
  const unidentifiedNames = useMemo(
    () => unidentified.map((i) => resolveCleanName(i, bookingId)),
    [unidentified, bookingId],
  );
  const total = items.length;
  const identifiedCount = total - unidentified.length;

  // Download the web-res versions of every still-unidentified photo as one ZIP,
  // built in the browser (client-zip) via the same streamZipToDisk path as every
  // other gallery download.
  const downloadUnidentifiedImages = useCallback(async () => {
    const entries = unidentified
      .filter((i) => i.url)
      .map((i) => ({ url: i.url, name: resolveCleanName(i, bookingId) }));
    if (entries.length === 0 || zipping) return;
    setZipping(true);
    toast("Preparing your download…");
    try {
      const { zipped, failed, cancelled } = await streamZipToDisk(
        entries,
        `${sanitizeArchive(eventName)}_unidentified.zip`,
        (done, count) => toast(`Zipping ${fmt(done)}/${fmt(count)}…`),
      );
      if (cancelled) return;
      toast(failed > 0 ? `Saved ${fmt(zipped)} — ${fmt(failed)} couldn't be fetched` : "Saved to your downloads");
    } catch (err) {
      console.warn("[downloadUnidentifiedImages] failed", err);
      toast("Download failed — please try again", "error");
    } finally {
      setZipping(false);
    }
  }, [unidentified, bookingId, eventName, zipping, toast]);

  if (shortlistedCount === 0) return null;

  return (
    <>
      <ReportCard
        loading={!loadedOnce}
        total={total}
        identified={identifiedCount}
        unidentifiedNames={unidentifiedNames}
        zipping={zipping}
        onLocate={() => onOpenChange(true)}
        onDownloadImages={downloadUnidentifiedImages}
      />
      {open && (
        <LocateModal
          bookingId={bookingId}
          eventName={eventName}
          unidentified={unidentified}
          foldersById={foldersById}
          toast={toast}
          onClose={() => onOpenChange(false)}
          onCompleted={fetchReport}
        />
      )}
    </>
  );
}

/* ── report card (inline, always visible on the tab) ──────────────── */

function ReportCard({
  loading,
  total,
  identified,
  unidentifiedNames,
  zipping,
  onLocate,
  onDownloadImages,
}: {
  loading: boolean;
  total: number;
  identified: number;
  unidentifiedNames: string[];
  zipping: boolean;
  onLocate: () => void;
  onDownloadImages: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const pct = total === 0 ? 0 : Math.round((identified / total) * 100);
  const remaining = unidentifiedNames.length;
  const preview = expanded ? unidentifiedNames : unidentifiedNames.slice(0, 8);

  return (
    <div className="mb-5 rounded-xl border border-[var(--color-brand-border)] bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-brand-navy-soft)] text-[var(--color-brand-navy)]">
            <IconTarget size={16} />
          </span>
          <div>
            <p className="text-[13.5px] font-semibold text-[var(--color-brand-ink)]">
              {loading && total === 0
                ? "Checking located originals…"
                : `${fmt(identified)} of ${fmt(total)} originals identified`}
            </p>
            <p className="text-[12px] text-[var(--color-brand-muted)]">
              {remaining === 0
                ? "Every shortlisted photo has its original file located."
                : `${fmt(remaining)} still to locate.`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {remaining > 0 && (
            <>
              <button
                type="button"
                onClick={onDownloadImages}
                disabled={zipping}
                className="brand-focus inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-brand-border)] bg-white px-3 py-1.5 text-[12px] font-semibold text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {zipping ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-[2px] border-[var(--color-brand-border)] border-t-[var(--color-brand-navy)]" />
                ) : (
                  <IconDownload size={13} />
                )}
                {zipping ? "Preparing…" : "Download images"}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onLocate}
            className="brand-focus inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-brand-navy)] px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-[var(--color-brand-navy-deep)]"
          >
            <IconTarget size={13} /> {identified > 0 ? "Locate more" : "Locate originals"}
          </button>
        </div>
      </div>

      <div className="mt-3.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-brand-surface)]">
        <div
          className="h-full rounded-full bg-[var(--color-brand-success)] transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {remaining > 0 && (
        <div className="mt-3.5">
          <div className="flex flex-wrap gap-1.5">
            {preview.map((name, i) => (
              <span
                key={`${name}-${i}`}
                className="inline-flex max-w-[220px] items-center gap-1 truncate rounded-md bg-[var(--color-brand-surface)] px-2 py-1 text-[11.5px] text-[var(--color-brand-ink)]"
                title={name}
              >
                <IconImage size={11} className="shrink-0 text-[var(--color-brand-muted)]" />
                <span className="truncate">{name}</span>
              </span>
            ))}
          </div>
          {remaining > 8 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="brand-focus mt-2 rounded text-[12px] font-semibold text-[var(--color-brand-navy)] hover:underline"
            >
              {expanded ? "Show less" : `Show all ${fmt(remaining)}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── the locate flow (mounted only while open) ────────────────────── */

type Phase = "picker" | "scanning" | "review" | "copying" | "done" | "error";

function LocateModal({
  bookingId,
  eventName,
  unidentified,
  foldersById,
  toast,
  onClose,
  onCompleted,
}: {
  bookingId: string;
  eventName: string;
  unidentified: ShortlistedMediaItem[];
  foldersById: Map<string, string>;
  toast: (msg: string, type?: "success" | "error") => void;
  onClose: () => void;
  onCompleted: () => Promise<void> | void;
}) {
  // Capability is known at first render; the modal itself only renders after a
  // user gesture so there's no SSR/hydration surface to mismatch.
  const [supported] = useState<boolean | null>(() =>
    typeof window !== "undefined" ? supportsFsa() : null,
  );
  const [phase, setPhase] = useState<Phase>("picker");
  const [savedHandle, setSavedHandle] = useState<FsDirHandle | null>(null);
  const [scanned, setScanned] = useState(0);
  const [matches, setMatches] = useState<ScanMatch[]>([]);
  const [targetCount, setTargetCount] = useState(0);
  const [include, setInclude] = useState<Record<string, boolean>>({});
  const [chosenFile, setChosenFile] = useState<Record<string, number>>({});
  const [copyProg, setCopyProg] = useState<CopyProgress>({ copied: 0, total: 0 });
  const [result, setResult] = useState<RunResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // True once a run is using the download-only (zip) path — tracked as state so
  // render never reads a ref. Mirrors whether `rootRef` holds an FSA handle.
  const [fallback, setFallback] = useState(false);

  const rootRef = useRef<FsDirHandle | null>(null); // active scan + output dir (FSA)
  const targetsRef = useRef<ReturnType<typeof toTargets>>([]);
  const busy = phase === "scanning" || phase === "copying";

  // Re-offer the folder picked on a previous visit (post-await setState = fine).
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
    async (source: { kind: "dir"; root: FsDirHandle } | { kind: "files"; files: File[] }) => {
      const targets = toTargets(unidentified, bookingId);
      if (targets.length === 0) {
        toast("Every shortlisted original is already located.");
        onClose();
        return;
      }
      targetsRef.current = targets;
      setTargetCount(targets.length);
      setPhase("scanning");
      setScanned(0);
      try {
        const res =
          source.kind === "dir"
            ? await scanDirectory(source.root, targets, bookingId, setScanned)
            : await scanFiles(source.files, targets, bookingId, setScanned);
        const inc: Record<string, boolean> = {};
        const ch: Record<string, number> = {};
        for (const m of res.matches) {
          inc[m.target._id] = true;
          ch[m.target._id] = 0;
        }
        setInclude(inc);
        setChosenFile(ch);
        setMatches(res.matches);
        setScanned(res.scannedCount);
        setPhase("review");
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Could not scan that folder.");
        setPhase("error");
      }
    },
    [unidentified, bookingId, toast, onClose],
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
        setFallback(false);
        await runScan({ kind: "dir", root });
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Could not open that folder.");
        setPhase("error");
      }
    },
    [savedHandle, bookingId, toast, runScan],
  );

  const onFallbackFiles = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      rootRef.current = null;
      setFallback(true);
      void runScan({ kind: "files", files });
    },
    [runScan],
  );

  /* copy / zip */
  const includedMatches = useMemo<IncludedMatch[]>(
    () =>
      matches
        .filter((m) => m.kind === "exact" || include[m.target._id])
        .map((m) => ({ target: m.target, file: m.sources[chosenFile[m.target._id] ?? 0]?.file }))
        .filter((m): m is IncludedMatch => !!m.file),
    [matches, include, chosenFile],
  );

  const doCopy = useCallback(async () => {
    if (includedMatches.length === 0) return;
    setPhase("copying");
    setCopyProg({ copied: 0, total: includedMatches.length });
    try {
      const totalTargets = targetsRef.current.length;
      const res = rootRef.current
        ? await copyToDirectory(
            rootRef.current,
            bookingId,
            includedMatches,
            foldersById,
            totalTargets,
            setCopyProg,
          )
        : await zipToDownload(
            includedMatches,
            foldersById,
            totalTargets,
            `${sanitizeArchive(eventName)}_Selected.zip`,
            setCopyProg,
          );
      if (res.identifiedIds.length > 0) {
        try {
          await updateMediaIdentified(res.identifiedIds);
        } catch {
          toast("Files are ready, but the report couldn't be updated — try refreshing.", "error");
        }
      }
      setResult(res);
      setPhase("done");
      await onCompleted();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong while copying.");
      setPhase("error");
    }
  }, [includedMatches, bookingId, foldersById, eventName, toast, onCompleted]);

  const tryAgain = useCallback(() => {
    setMatches([]);
    setResult(null);
    setErrorMsg(null);
    setScanned(0);
    setFallback(false);
    rootRef.current = null;
    setPhase("picker");
    if (supportsFsa()) void loadDirHandle(bookingId).then(setSavedHandle);
  }, [bookingId]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Locate original images"
      className="fixed inset-0 z-[220] flex items-center justify-center px-4"
      style={{ background: "rgba(42,34,24,0.48)", backdropFilter: "blur(3px)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="dash-rise flex max-h-[88vh] w-full max-w-[560px] flex-col overflow-hidden rounded-[16px] border border-[var(--color-brand-border)] bg-white shadow-[0_24px_64px_rgba(42,34,24,0.24)]">
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
            className="brand-focus flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-brand-muted)] hover:bg-[var(--color-brand-surface)] hover:text-[var(--color-brand-ink)] disabled:opacity-40"
          >
            <IconX size={16} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {phase === "picker" && (
            <PickerPanel
              supported={supported}
              savedHandle={savedHandle}
              targetCount={unidentified.length}
              onUseSaved={() => void pickAndScan(true)}
              onPick={() => void pickAndScan(false)}
              onFallbackFiles={onFallbackFiles}
            />
          )}
          {phase === "scanning" && <ScanningPanel scanned={scanned} />}
          {phase === "review" && (
            <ReviewPanel
              matches={matches}
              targetCount={targetCount}
              include={include}
              chosenFile={chosenFile}
              foldersById={foldersById}
              onToggleInclude={(id) => setInclude((p) => ({ ...p, [id]: !p[id] }))}
              onChooseFile={(id, i) => setChosenFile((p) => ({ ...p, [id]: i }))}
            />
          )}
          {phase === "copying" && <CopyingPanel prog={copyProg} fallback={fallback} />}
          {phase === "done" && result && <DonePanel result={result} fallback={fallback} />}
          {phase === "error" && <ErrorPanel message={errorMsg} />}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] px-6 py-3.5">
          <div className="text-[12px] text-[var(--color-brand-muted)]">
            {phase === "review" && `${fmt(includedMatches.length)} of ${fmt(targetCount)} ready`}
            {phase === "picker" && supported === false && "Download-only browser"}
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
                onClick={() => void doCopy()}
                disabled={includedMatches.length === 0}
                className="brand-focus inline-flex h-9 items-center gap-2 rounded-lg bg-[var(--color-brand-navy)] px-4 text-[13px] font-semibold text-white hover:bg-[var(--color-brand-navy-deep)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {fallback ? <IconDownload size={15} /> : <IconArrowRight size={15} />}
                {fallback
                  ? `Download ${fmt(includedMatches.length)}`
                  : `Copy ${fmt(includedMatches.length)}`}
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
      </div>
    </div>
  );
}

/* ── modal panels ─────────────────────────────────────────────────── */

function PickerPanel({
  supported,
  savedHandle,
  targetCount,
  onUseSaved,
  onPick,
  onFallbackFiles,
}: {
  supported: boolean | null;
  savedHandle: FsDirHandle | null;
  targetCount: number;
  onUseSaved: () => void;
  onPick: () => void;
  onFallbackFiles: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  if (supported === null) {
    return <p className="text-[13px] text-[var(--color-brand-muted)]">Preparing…</p>;
  }

  return (
    <div>
      <p className="mb-4 text-[13px] leading-relaxed text-[var(--color-brand-muted)]">
        We&apos;ll scan the folder you choose (including subfolders), match each file to your{" "}
        <span className="font-semibold text-[var(--color-brand-ink)]">{fmt(targetCount)}</span>{" "}
        shortlisted photo{targetCount === 1 ? "" : "s"} still to locate, and gather the
        full-resolution originals for you.
      </p>

      {supported ? (
        <div className="flex flex-col gap-2.5">
          {savedHandle && (
            <button
              type="button"
              onClick={onUseSaved}
              className="brand-focus flex items-center gap-3 rounded-xl border border-[var(--color-brand-navy)] bg-[var(--color-brand-navy-soft)] px-4 py-3 text-left hover:bg-white"
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
            className="brand-focus flex items-center gap-3 rounded-xl border border-[var(--color-brand-border)] bg-white px-4 py-3 text-left hover:border-[var(--color-brand-outline)]"
          >
            <IconFolder size={18} className="shrink-0 text-[var(--color-brand-muted)]" />
            <span className="min-w-0">
              <span className="block text-[13.5px] font-semibold text-[var(--color-brand-ink)]">
                {savedHandle ? "Choose a different folder…" : "Choose folder…"}
              </span>
              <span className="block text-[12px] text-[var(--color-brand-muted)]">
                Matched originals are copied in-place into a “Smartly Selected by Vyavasth AI”
                subfolder.
              </span>
            </span>
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-2.5 rounded-lg border border-[var(--color-brand-border)] bg-[var(--color-brand-warning-soft)] px-3.5 py-3">
            <IconInfo size={15} className="mt-0.5 shrink-0 text-[var(--color-brand-warning)]" />
            <p className="text-[12.5px] leading-relaxed text-[var(--color-brand-ink)]">
              This browser can only <span className="font-semibold">download</span> matched files as
              a zip. For in-place copying into per-folder subfolders, open this page in{" "}
              <span className="font-semibold">Chrome or Edge</span>.
            </p>
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="brand-focus flex items-center gap-3 rounded-xl border border-[var(--color-brand-border)] bg-white px-4 py-3 text-left hover:border-[var(--color-brand-outline)]"
          >
            <IconFolder size={18} className="shrink-0 text-[var(--color-brand-muted)]" />
            <span>
              <span className="block text-[13.5px] font-semibold text-[var(--color-brand-ink)]">
                Choose folder to scan…
              </span>
              <span className="block text-[12px] text-[var(--color-brand-muted)]">
                Matched originals download as one zip, folders preserved inside.
              </span>
            </span>
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            onChange={(e) => onFallbackFiles(Array.from(e.target.files ?? []))}
            className="hidden"
            {...({ webkitdirectory: "true", directory: "true" } as Record<string, string>)}
          />
        </div>
      )}
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
  foldersById,
  onToggleInclude,
  onChooseFile,
}: {
  matches: ScanMatch[];
  targetCount: number;
  include: Record<string, boolean>;
  chosenFile: Record<string, number>;
  foldersById: Map<string, string>;
  onToggleInclude: (id: string) => void;
  onChooseFile: (id: string, i: number) => void;
}) {
  const exactAuto = matches.filter((m) => m.kind === "exact" && m.sources.length === 1);
  const probable = matches.filter((m) => m.kind === "fuzzy");
  const conflicts = matches.filter((m) => m.sources.length > 1);
  const found = matches.length;

  if (found === 0) {
    return (
      <div className="flex flex-col items-center gap-2.5 py-8 text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-brand-surface)] text-[var(--color-brand-muted)]">
          <IconWarning size={22} />
        </span>
        <p className="text-[14px] font-semibold text-[var(--color-brand-ink)]">
          No originals found in that folder
        </p>
        <p className="max-w-[360px] text-[12.5px] leading-relaxed text-[var(--color-brand-muted)]">
          None of the {fmt(targetCount)} shortlisted photos matched a file here. Try another folder —
          matches accumulate, so nothing you&apos;ve already located is lost.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-[var(--color-brand-success-soft)] bg-[var(--color-brand-success-soft)] px-3.5 py-2.5">
        <p className="text-[13px] font-semibold text-[var(--color-brand-ink)]">
          Found {fmt(found)} of {fmt(targetCount)} shortlisted originals
        </p>
        <p className="text-[12px] text-[var(--color-brand-muted)]">
          {fmt(exactAuto.length)} exact match{exactAuto.length === 1 ? "" : "es"}
          {probable.length > 0 && ` · ${fmt(probable.length)} to confirm`}
          {conflicts.length > 0 && ` · ${fmt(conflicts.length)} with duplicates`}
        </p>
      </div>

      {probable.length > 0 && (
        <section>
          <h3 className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-bold text-[var(--color-brand-ink)]">
            <IconInfo size={13} className="text-[var(--color-brand-warning)]" />
            Probable matches — please confirm
          </h3>
          <p className="mb-2 text-[11.5px] text-[var(--color-brand-muted)]">
            Same name &amp; size but a different modified date (common with cloud sync or
            &ldquo;save as&rdquo;). Untick any that aren&apos;t the right photo.
          </p>
          <div className="flex flex-col divide-y divide-[var(--color-brand-border)] rounded-lg border border-[var(--color-brand-border)]">
            {probable.map((m) => (
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
          <h3 className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-bold text-[var(--color-brand-ink)]">
            <IconWarning size={13} className="text-[var(--color-brand-warning)]" />
            Duplicates — choose which file to use
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
        Files route into per-folder subfolders inside “Smartly Selected by Vyavasth AI”. Photos with
        no folder go to “Uncategorised”.{" "}
        {foldersById.size > 0 ? `${fmt(foldersById.size)} folders available.` : ""}
      </p>
    </div>
  );
}

function CopyingPanel({ prog, fallback }: { prog: CopyProgress; fallback: boolean }) {
  const pct = prog.total === 0 ? 0 : Math.round((prog.copied / prog.total) * 100);
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <span className="h-9 w-9 animate-spin rounded-full border-[3px] border-[var(--color-brand-border)] border-t-[var(--color-brand-navy)]" />
      <p className="text-[14px] font-semibold text-[var(--color-brand-ink)]">
        {fallback ? "Preparing your download…" : "Copying originals…"}
      </p>
      <p className="text-[12.5px] text-[var(--color-brand-muted)]">
        {fmt(prog.copied)} of {fmt(prog.total)}
        {prog.currentName ? ` · ${prog.currentName}` : ""}
      </p>
      <div className="h-1.5 w-full max-w-[280px] overflow-hidden rounded-full bg-[var(--color-brand-surface)]">
        <div
          className="h-full rounded-full bg-[var(--color-brand-navy)] transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function DonePanel({ result, fallback }: { result: RunResult; fallback: boolean }) {
  return (
    <div className="flex flex-col gap-4 py-2">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-brand-success-soft)] text-[var(--color-brand-success)]">
          <IconCheck size={24} />
        </span>
        <p className="text-[15px] font-bold text-[var(--color-brand-ink)]">
          {fallback ? "Your zip is downloading" : "Originals copied"}
        </p>
        <p className="max-w-[380px] text-[12.5px] leading-relaxed text-[var(--color-brand-muted)]">
          {fallback
            ? "Matched originals are packed into one zip with your folder structure preserved."
            : "Matched originals are in the “Smartly Selected by Vyavasth AI” folder, sorted into per-folder subfolders."}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Stat label={fallback ? "Downloaded" : "Newly copied"} value={result.newlyCopied} tone="success" />
        <Stat label="Already delivered" value={result.alreadyDelivered} tone="muted" />
        <Stat label="Not found" value={result.notFound} tone="warning" />
      </div>
      {result.notFound > 0 && (
        <p className="text-center text-[12px] text-[var(--color-brand-muted)]">
          Still missing {fmt(result.notFound)}? Use <span className="font-semibold">Try Again</span>{" "}
          on another folder — already-located files are skipped automatically.
        </p>
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

