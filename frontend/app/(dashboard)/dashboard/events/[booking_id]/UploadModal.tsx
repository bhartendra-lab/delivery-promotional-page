"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useChrome } from "@/components/dashboard/ChromeContext";
import { InlineFolderInput } from "@/components/dashboard/FoldersSidebar";
import { isStorageBasedPlan } from "@/lib/types";
import { estimateCompressedGB, formatSizeFromGB } from "@/lib/r2-upload/estimate";
import {
  changedPreferenceKeys,
  DELIVERY_PREFERENCE_FIELDS,
  type DeliveryPreferences,
} from "@/lib/delivery-preferences";
import { DeliveryPreferencesPanel } from "./DeliveryPreferencesPanel";
import {
  IconUpload,
  IconFolder,
  IconX,
  IconChevronLeft,
  IconMonitor,
  IconWarningCircle,
  IconFolderTree,
} from "./icons";

/** What the modal hands back once the user commits a selection. */
export type UploadPlan =
  | { mode: "grouped"; groups: Array<{ name: string; files: File[] }> }
  | { mode: "single"; files: File[]; targetFolderId: string; targetFolderName: string };

/** A destination folder the picker can send photos to. */
export type UploadFolderOption = { id: string; name: string };

/**
 * Which view the dialog is on.
 *  - "picker" — choose a destination first (Upload more from All Media). An
 *    UNNUMBERED pre-step: it happens before the studio has committed to
 *    uploading anything, so it isn't one of the two counted steps.
 *  - "select" — step 1 of 2, picking files (a folder tab, or the empty-state CTA).
 *  - "preferences" — step 2 of 2, the event's guest delivery preferences. Also
 *    where the storage-plan size estimate is sampled and where an over-quota
 *    selection is blocked — step 1 never gates on storage.
 *
 * `initialStep` only ever receives "picker" or "select"; the dialog never opens
 * directly on "preferences".
 */
export type UploadModalStep = "picker" | "select" | "preferences";

type Props = {
  open: boolean;
  onClose: () => void;
  onStart: (plan: UploadPlan) => void;
  /** Step the dialog opens on. Defaults to going straight to file selection. */
  initialStep?: UploadModalStep;
  /** Pre-selected destination for single-folder mode (opening on "select"). */
  initialTarget?: UploadFolderOption | null;
  /**
   * Open directly into the import-with-subfolders flow (hides "Or select
   * photos"). Ignored once a single-folder destination is chosen.
   */
  initialFolderOnly?: boolean;
  /** Existing folders offered as destinations in the picker step. */
  folders: UploadFolderOption[];
  /**
   * Create a folder from the picker's inline "+ New folder" chip. Resolves with
   * the created (or reused) folder so we can drop straight into uploading to
   * it; resolves null if the create failed — the caller owns the error toast.
   */
  onCreateFolder: (name: string) => Promise<UploadFolderOption | null>;
  /** Current saved, event-scoped preferences — seeds the Preferences step. */
  preferences: DeliveryPreferences;
  /**
   * Persist changed preferences. Awaited before the upload starts, so a batch
   * never goes live under preferences the studio thought they had changed.
   * Rejects on failure; the dialog keeps the studio on step 2.
   */
  onSavePreferences: (next: DeliveryPreferences) => Promise<void>;
};

type Analysis = {
  kind: "direct" | "grouped" | "mixed";
  /** Parent folder name when exactly one folder is selected; "" otherwise. */
  folderName: string;
  /** Resolved, named groups (flat folders by their own name + subfolders by name). */
  subGroups: Array<{ name: string; files: File[] }>;
  /** Images that genuinely have no home: loose-at-root of a subfoldered folder, or
   *  stray individual files mixed in with folder selections (§5c). */
  looseFiles: File[];
};

export function UploadModal({
  open,
  onClose,
  onStart,
  initialStep = "select",
  initialTarget = null,
  initialFolderOnly = false,
  folders,
  onCreateFolder,
  preferences,
  onSavePreferences,
}: Props) {
  // One dialog, several views. The destination picker used to be a separate
  // modal that unmounted to make way for this one — that double backdrop
  // animation is why it felt like two different decisions. It's now a step.
  const [step, setStep] = useState<UploadModalStep>(initialStep);
  const [target, setTarget] = useState<UploadFolderOption | null>(initialTarget);
  const [folderOnly, setFolderOnly] = useState(initialFolderOnly);
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [directName, setDirectName] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const [mixedOpen, setMixedOpen] = useState(false);
  /**
   * Files dropped from the selection because we can't publish them — RAW
   * originals and macOS sidecar/dotfiles. Silently discarding them made photos
   * "go missing"; the count is surfaced in the content panel instead.
   */
  const [skipped, setSkipped] = useState(0);
  // Root folder name (parts[0]) of the FIRST folder picked this session. The
  // first folder is parsed with first-level subfolder grouping; any folders
  // added afterwards are flattened under their own name (see analyze()).
  const [firstRoot, setFirstRoot] = useState<string | null>(null);
  /**
   * The `mixed` decision, made on step 1 and held across the step change. The
   * "where do uncategorised photos go?" question has to be answered before
   * advancing — asking it when the studio presses Upload on the Preferences
   * step would raise an unrelated folder question at the commit moment.
   * Cleared whenever the selection changes, since a resolution against a
   * changed selection is stale.
   */
  const [resolvedGroups, setResolvedGroups] = useState<Array<{ name: string; files: File[] }> | null>(null);
  /** Step 2's working copy of the event's preferences (persisted at Upload). */
  const [draftPrefs, setDraftPrefs] = useState<DeliveryPreferences>(preferences);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefError, setPrefError] = useState<string | null>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // <input webkitdirectory> (the one-shot folder flow) isn't supported on mobile
  // browsers — detect it so we can fall back to the plain multi-file picker.
  const [dirSupported] = useState(
    () => typeof document === "undefined" || "webkitdirectory" in document.createElement("input"),
  );

  const single = !!target;

  // Storage-plan gating: on Monthly/Yearly plans, estimate the compressed upload
  // size and block if it would exceed the remaining GB. Inert (and absent) for
  // count-based plans and while usage is still loading.
  const { dlpUsage, dlpLoading } = useChrome();
  const storageGated = isStorageBasedPlan(dlpUsage?.service_type);
  const remainingGB = dlpUsage?.remaining ?? null;
  // null = not yet estimated; number = estimated GB. Re-derived on selection change.
  const [estimateGB, setEstimateGB] = useState<number | null>(null);
  const [estimating, setEstimating] = useState(false);

  // Reset + lock scroll whenever the modal opens.
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets all modal state on open transition, not a render loop
    setStep(initialStep);
    setTarget(initialTarget);
    setFolderOnly(initialFolderOnly);
    setFiles([]);
    setSkipped(0);
    setDragOver(false);
    setDirectName(null);
    setNaming(false);
    setMixedOpen(false);
    setFirstRoot(null);
    setResolvedGroups(null);
    // Seeded on OPEN, not on entering step 2: the studio can toggle, press
    // Back, and come forward again — their in-progress choice must survive that.
    setDraftPrefs(preferences);
    setSavingPrefs(false);
    setPrefError(null);
    setEstimateGB(null);
    setEstimating(false);
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
    // Re-running on every `initialTarget` identity change would wipe a live
    // selection; the open transition is the only moment these should apply.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Fingerprint the selection by name+size so the estimate re-runs when photos
  // are added/removed but NOT on unrelated re-renders (analysis identity churns).
  const filesFingerprint = useMemo(
    () => `${files.length}:${files.map((f) => `${f.name}-${f.size}`).join("|")}`,
    [files],
  );

  // Debounced, off-render sampling estimate — only for storage plans with a
  // selection, and only once the studio has reached step 2. Ignores stale
  // results if the selection changes mid-sample.
  //
  // Deliberately NOT run on step 1: sampling really compresses a dozen photos
  // through the full pipeline, and step 1 is exactly where the selection keeps
  // changing — every add/remove would throw away an in-flight sample and start
  // another. By step 2 the selection is settled, so the work runs once.
  //
  // Leaving step 2 clears the estimate rather than caching it: coming forward
  // again re-samples (a second or two) and that is the only way a number on
  // screen is guaranteed to describe the selection actually in hand. Keeping a
  // cached value would show a stale figure for a selection edited on step 1.
  useEffect(() => {
    if (!open || !storageGated || files.length === 0 || step !== "preferences") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clears stale estimate synchronously when the selection becomes empty/ungated or the studio steps back
      setEstimateGB(null);
      setEstimating(false);
      return;
    }
    let cancelled = false;
    setEstimating(true);
    const t = setTimeout(() => {
      estimateCompressedGB(files)
        .then((gb) => {
          if (!cancelled) setEstimateGB(gb);
        })
        .catch(() => {
          if (!cancelled) setEstimateGB(null);
        })
        .finally(() => {
          if (!cancelled) setEstimating(false);
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // filesFingerprint captures the selection; files is read inside.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, storageGated, step, filesFingerprint]);

  // Only block once we have real numbers (never a false-positive before they land).
  const overStorage =
    storageGated &&
    !dlpLoading &&
    estimateGB !== null &&
    remainingGB !== null &&
    estimateGB > remainingGB;

  // True while a storage-gated selection's fit is still unknown — usage or the
  // size estimate hasn't landed yet. Start upload stays disabled until this
  // clears. Scoped to step 2, where the estimate actually runs: on step 1 it
  // would be permanently true (estimateGB is null there by design) and would
  // wedge the Next button forever.
  const estimatePending =
    storageGated &&
    step === "preferences" &&
    files.length > 0 &&
    (dlpLoading || estimating || estimateGB === null);

  // Escape unwinds one layer at a time: mixed popup → naming popup → close.
  // Stepping back — to the destination picker OR from Preferences to Select —
  // is an explicit footer action, so Escape stays predictable and always means
  // "close this dialog". From the Preferences step it closes the whole dialog
  // and persists nothing, exactly like Cancel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (mixedOpen) {
        setMixedOpen(false);
        return;
      }
      if (naming) {
        setNaming(false);
        setFiles([]);
        setDirectName(null);
        return;
      }
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, mixedOpen, naming, onClose]);

  const analysis = useMemo<Analysis>(() => analyze(files, firstRoot), [files, firstRoot]);

  if (!open) return null;

  /** Back to the destination step — clears the in-progress selection, since it
   *  was gathered for a destination the user is now changing. */
  function goToPicker() {
    setStep("picker");
    setTarget(null);
    setFolderOnly(false);
    setFiles([]);
    setSkipped(0);
    setDirectName(null);
    setNaming(false);
    setFirstRoot(null);
    setResolvedGroups(null);
  }

  /** Chose an existing (or just-created) folder → straight into single-folder mode. */
  function pickTarget(folder: UploadFolderOption) {
    setTarget(folder);
    setFolderOnly(false);
    setFiles([]);
    setSkipped(0);
    setFirstRoot(null);
    setStep("select");
  }

  /** "Import folder with subfolders" → the multi-destination flow. */
  function pickImportWithSubfolders() {
    setTarget(null);
    setFolderOnly(true);
    setFiles([]);
    setSkipped(0);
    setFirstRoot(null);
    setStep("select");
  }

  function addFiles(picked: File[]) {
    const { kept: filtered, skipped: dropped } = filterImages(picked);
    if (dropped > 0) setSkipped((n) => n + dropped);
    if (filtered.length === 0) return;
    const merged = [...files, ...filtered];
    setFiles(merged);
    // A `mixed` resolution answered "where do THESE loose photos go?" — once the
    // selection changes it no longer describes what is about to be uploaded.
    setResolvedGroups(null);
    // Remember the first folder selection's root so analyze() applies first-level
    // subfolder grouping to it and flattens any folders added later.
    if (!single && firstRoot === null) {
      const root = filtered.map(relParts).find((p) => p.length >= 2)?.[0];
      if (root) setFirstRoot(root);
    }
    // Folder mode: a direct (loose-files) selection needs a folder name before
    // we can build a group — pop the "name this folder" sheet (§5d).
    if (!single && directName === null && merged.every((f) => relParts(f).length <= 1)) {
      setNaming(true);
    }
  }

  function handleFolderPick(e: React.ChangeEvent<HTMLInputElement>) {
    addFiles(Array.from(e.target.files ?? []));
    e.target.value = "";
  }

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    addFiles(Array.from(e.target.files ?? []));
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const items = e.dataTransfer.items;
    if (
      items &&
      items.length > 0 &&
      (items[0] as DataTransferItem & { webkitGetAsEntry?: () => unknown }).webkitGetAsEntry
    ) {
      walkDirectoryItems(items)
        .then((all) => addFiles(all))
        .catch((err) => console.warn("[upload-modal] drop walk failed", err));
      return;
    }
    addFiles(Array.from(e.dataTransfer.files));
  }

  const hasSelection = files.length > 0;

  const headingName = single
    ? target?.name ?? "Folder"
    : analysis.kind === "direct"
      ? directName ?? "New folder"
      : analysis.folderName || "Selected photos";

  // Groups to preview in the right panel (loose photos shown as a pending row).
  const previewGroups: Array<{ name: string; files: File[]; pending?: boolean }> = single
    ? [{ name: target?.name ?? "Folder", files }]
    : analysis.kind === "direct"
      ? [{ name: directName ?? "New folder", files: analysis.looseFiles }]
      : analysis.kind === "mixed"
        ? [
            ...analysis.subGroups,
            ...(analysis.looseFiles.length
              ? [{ name: "Uncategorised photos", files: analysis.looseFiles, pending: true }]
              : []),
          ]
        : analysis.subGroups;

  /**
   * Step 1's "Next". Every question about WHERE the photos go is settled here,
   * before advancing — the Upload button on step 2 must be a plain commit, not
   * a place where an unrelated folder question can still surface.
   *
   * No storage check here any more: the size estimate is sampled on step 2, so
   * on step 1 there is nothing to check against. An over-quota selection is
   * caught on step 2 instead, where the Upload button is disabled and the
   * overrun notice explains why.
   */
  function goNext() {
    if (files.length === 0) return;
    if (!single && analysis.kind === "mixed") {
      // Hold until the user decides where loose photos go (§5c); resolveMixed
      // stores the answer and advances.
      setMixedOpen(true);
      return;
    }
    setStep("preferences");
  }

  /**
   * Step 2's "Upload". Persists any changed preferences FIRST and only then
   * hands the plan over — a batch must never go live under preferences the
   * studio believed they had already changed.
   */
  async function startUpload() {
    // Re-check defensively: usage could have landed between the two steps.
    if (files.length === 0 || estimatePending || overStorage || savingPrefs) return;

    if (changedPreferenceKeys(draftPrefs, preferences).length > 0) {
      setSavingPrefs(true);
      setPrefError(null);
      try {
        await onSavePreferences(draftPrefs);
      } catch (err) {
        setPrefError(err instanceof Error ? err.message : "Couldn’t save preferences");
        setSavingPrefs(false);
        return; // stay on step 2 — nothing uploads
      }
      setSavingPrefs(false);
    }

    if (single && target) {
      onStart({
        mode: "single",
        files,
        targetFolderId: target.id,
        targetFolderName: target.name,
      });
      onClose();
      return;
    }
    if (resolvedGroups) {
      // The `mixed` case, already answered on step 1.
      onStart({ mode: "grouped", groups: resolvedGroups });
      onClose();
      return;
    }
    if (analysis.kind === "direct") {
      onStart({
        mode: "grouped",
        groups: [{ name: directName ?? defaultFolderName(), files: analysis.looseFiles }],
      });
      onClose();
      return;
    }
    // grouped → every photo already belongs to a named folder.
    onStart({ mode: "grouped", groups: analysis.subGroups });
    onClose();
  }

  /** Records the §5c decision and advances — it no longer starts the upload,
   *  since the studio still has the Preferences step to pass through. */
  function resolveMixed(decision: { target: string } | "skip") {
    setMixedOpen(false);
    const groups = analysis.subGroups.map((g) => ({ name: g.name, files: [...g.files] }));
    if (decision !== "skip") {
      const existing = groups.find((g) => g.name === decision.target);
      if (existing) existing.files.push(...analysis.looseFiles);
      else groups.push({ name: decision.target, files: [...analysis.looseFiles] });
    }
    setResolvedGroups(groups);
    setStep("preferences");
  }

  return (
    <div
      /* The vertical offset lives in THIS element's padding and the panel below
         is capped at `max-h-full`, so the panel can never be taller than the
         viewport minus that offset. The old pairing — `pt-24` here plus
         `max-h-[90vh]` on the panel — overflowed on every screen shorter than
         960px (96px + 90% of h > h whenever h < 960), and what fell off the
         bottom was the footer holding Cancel/Next/Upload. The drop-down offset
         is now gated on available HEIGHT rather than width, so it still sits
         below the topbar on a roomy screen and hugs the top on a short one,
         where every pixel belongs to the content instead. Correctness no longer
         depends on picking the right thresholds — `max-h-full` derives from
         this box, so whatever the offset, the panel fits. */
      className="fixed inset-0 z-50 flex items-start justify-center overflow-hidden px-4 py-6 [@media(min-height:760px)]:pt-16 [@media(min-height:900px)]:pt-24"
      role="dialog"
      aria-modal="true"
      aria-label="Upload media"
    >
      <button
        type="button"
        aria-label="Close modal"
        onClick={onClose}
        className="drawer-fade absolute inset-0 bg-[var(--color-brand-ink)]/40 backdrop-blur-[1px]"
      />
      <div
        className={`dash-rise relative flex max-h-full w-full flex-col overflow-hidden rounded-xl border border-[var(--color-brand-border)] bg-white shadow-[0_12px_40px_rgba(42,34,24,0.12)] ${
          step === "picker"
            ? "max-w-[480px]"
            : step === "preferences"
              ? // A short list of rows — 760px leaves it stranded in space, but
                // much under this and the explanatory rail is as wide as the
                // controls it explains.
                "max-w-[620px]"
              : "max-w-[760px]"
        }`}
        style={{ transition: "max-width 220ms ease" }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-brand-border)] px-6 py-4">
          <div>
            {/* The destination picker is an unnumbered pre-step, so the counter
                appears only once the studio is actually inside the two steps. */}
            {step !== "picker" && dirSupported && (
              <StepIndicator current={step === "preferences" ? 2 : 1} />
            )}
            <h2 className="text-[18px] font-bold leading-tight tracking-tight text-[var(--color-brand-ink)]">
              {step === "picker"
                ? "Where should these photos go?"
                : step === "preferences"
                  ? "Upload preferences"
                  : "Upload media"}
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-brand-muted)]">
              {step === "picker"
                ? "Pick a folder, start a new one, or bring across a folder that already has subfolders."
                : !dirSupported
                  ? "Uploading needs a desktop browser."
                  : step === "preferences"
                    ? "Choose what guests can do with this gallery, then upload."
                    : single
                      ? "Pick photos to add to this folder."
                      : "Drop the folder from your computer — we'll rebuild its subfolders here."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="brand-focus flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--color-brand-muted)] hover:bg-[var(--color-brand-hover)] hover:text-[var(--color-brand-ink)]"
            aria-label="Close"
          >
            <IconX />
          </button>
        </div>

        {step === "picker" ? (
          <DestinationPicker
            folders={folders}
            onPick={pickTarget}
            onCreateFolder={onCreateFolder}
            onImportWithSubfolders={pickImportWithSubfolders}
            dirSupported={dirSupported}
          />
        ) : !dirSupported ? (
          <DesktopOnlyNotice onClose={onClose} />
        ) : (
          <>
          {step === "preferences" ? (
            /* Step 2 keeps step 1's two-column shape so the dialog doesn't
               visually restart: a plain-language summary of what guests will
               see on the left, the controls themselves on the right. */
            <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[200px_1fr]">
              {/* Rail hidden below 768px (not 640px): on a narrow window a
                  280px explainer left the controls narrower than itself. */}
              <div className="hidden flex-col overflow-y-auto border-r border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] px-5 py-6 md:flex">
                <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-brand-muted)]">
                  What guests will see
                </div>
                <GuestPreferenceSummary prefs={draftPrefs} />
              </div>
              <div className="flex min-h-0 flex-col overflow-y-auto px-5 py-6 sm:px-7">
                <DeliveryPreferencesPanel
                  value={draftPrefs}
                  onChange={setDraftPrefs}
                  disabled={savingPrefs}
                />
              </div>
            </div>
          ) : (
          /* Body — same two-column shape in both modes: context on the left,
              the drop zone on the right. (Single-folder mode used to announce its
              destination in a tinted banner above a full-width drop zone, which
              read as a different screen for no reason.) */
          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[240px_1fr] lg:grid-cols-[280px_1fr]">
            {/* Left: the destination, or the subfolder guide when importing.
                (Hidden on mobile — the guard replaces the whole body there.)
                Hidden below 768px too: at 640–767px a fixed 280px rail took
                ~43% of the panel and squeezed the drop zone it was explaining.
                Scrolls independently so a short viewport clips nothing. */}
            <div className="hidden flex-col overflow-y-auto border-r border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] px-6 py-6 md:flex">
              {single ? (
                <>
                  <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-brand-muted)]">
                    Uploading to
                  </div>
                  <div className="flex items-start gap-2.5 rounded-lg border border-[var(--color-brand-border)] bg-white px-3 py-3">
                    <span className="mt-px inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-brand-navy-soft)] text-[var(--color-brand-navy)]">
                      <IconFolder size={16} />
                    </span>
                    <span className="min-w-0 break-words text-[13.5px] font-semibold leading-snug text-[var(--color-brand-ink)]">
                      {target?.name ?? "Folder"}
                    </span>
                  </div>
                  <p className="mt-4 text-[12.5px] leading-relaxed text-[var(--color-brand-ink)]">
                    <strong>Straight in, no sorting.</strong> Every photo you pick lands in this folder,
                    exactly as it is.
                  </p>
                  <div className="mt-2.5 rounded-md bg-[var(--color-brand-navy-soft)] px-3 py-2.5 text-[11.5px] leading-relaxed text-[var(--color-brand-navy-deep)]">
                    Wrong folder? Change the destination from the bottom-left.
                  </div>
                </>
              ) : (
                <>
                  <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-brand-muted)]">
                    How it works
                  </div>
                  <UploadIllustration />
                  <p className="mt-4 text-[12.5px] leading-relaxed text-[var(--color-brand-ink)]">
                    <strong>Your folders, exactly as you filed them.</strong> Drop a folder with
                    subfolders inside and each one arrives here as its own folder.
                  </p>
                  <div className="mt-2.5 rounded-md bg-[var(--color-brand-navy-soft)] px-3 py-2.5 text-[11.5px] leading-relaxed text-[var(--color-brand-navy-deep)]">
                    Names aren&apos;t final — rename any folder later from the sidebar.
                  </div>
                </>
              )}
            </div>

            {/* Right: drop zone OR content panel */}
            <div className="flex min-h-0 flex-col overflow-y-auto px-5 py-6 sm:px-7">
              {!hasSelection ? (
                <DropZone
                  dragOver={dragOver}
                  setDragOver={setDragOver}
                  onDrop={handleDrop}
                  onBrowseFolder={() => folderInputRef.current?.click()}
                  onBrowseFiles={() => fileInputRef.current?.click()}
                  single={single}
                  folderOnly={folderOnly}
                  skipped={skipped}
                />
              ) : (
                <ContentPanel
                  headingName={headingName}
                  totalImages={files.length}
                  groups={previewGroups}
                  skipped={skipped}
                  onAddMore={() => (single ? fileInputRef.current?.click() : folderInputRef.current?.click())}
                />
              )}

              <input
                ref={folderInputRef}
                type="file"
                multiple
                accept="image/*"
                onChange={handleFolderPick}
                className="hidden"
                {...({ webkitdirectory: "true", directory: "true" } as Record<string, string>)}
              />
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                onChange={handleFilePick}
                className="hidden"
              />
            </div>
          </div>
          )}

          {/* A failed preferences save keeps the studio on step 2 with the
              draft intact — nothing uploads under settings that didn't stick. */}
          {step === "preferences" && prefError && (
            <div className="border-t border-[var(--color-brand-warning)]/30 bg-[var(--color-brand-warning-soft)] px-6 py-3">
              <div className="flex items-start gap-2.5 text-[12.5px] leading-relaxed text-[var(--color-brand-warning)]">
                <IconWarningCircle size={16} className="mt-0.5 shrink-0" />
                <p>{prefError}</p>
              </div>
            </div>
          )}

          {/* Storage estimate / overrun warning (Monthly / Yearly plans only).
              Step 2 only — that's where the estimate is sampled, and it's the
              step whose Upload button the number actually gates. */}
          {storageGated && step === "preferences" && hasSelection && !dlpLoading && (
            <StorageEstimateNotice
              estimating={estimating}
              estimateGB={estimateGB}
              remainingGB={remainingGB}
              over={overStorage}
            />
          )}

          {/* Footer */}
          <div className="flex items-center justify-end gap-2.5 border-t border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] px-6 py-3.5">
            {step === "preferences" ? (
              /* Back takes the leading slot on step 2. "Change destination" is
                 deliberately NOT offered here — it clears the selection, and a
                 selection-wiping control next to a confirm button is a trap. */
              <button
                type="button"
                onClick={() => setStep("select")}
                disabled={savingPrefs}
                className="brand-focus mr-auto inline-flex h-10 items-center gap-1.5 rounded-lg px-2 text-[13.5px] font-medium text-[var(--color-brand-muted)] hover:text-[var(--color-brand-ink)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <IconChevronLeft size={15} />
                Back
              </button>
            ) : (
              /* Always available on this step — the destination picker is reachable
                  from any entry point (a folder tab, the banner's old "Change", or
                  after switching into the subfolder import). */
              <button
                type="button"
                onClick={goToPicker}
                className="brand-focus mr-auto inline-flex h-10 items-center gap-1.5 rounded-lg px-2 text-[13.5px] font-medium text-[var(--color-brand-muted)] hover:text-[var(--color-brand-ink)]"
              >
                <IconChevronLeft size={15} />
                Change destination
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              disabled={savingPrefs}
              className="brand-focus inline-flex h-10 items-center rounded-lg border border-[var(--color-brand-border)] bg-white px-4 text-[13.5px] font-medium text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
            {step === "preferences" ? (
              <button
                type="button"
                disabled={files.length === 0 || overStorage || estimatePending || savingPrefs}
                onClick={() => void startUpload()}
                className="brand-focus inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--color-brand-navy)] px-4 text-[13.5px] font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingPrefs
                  ? "Saving preferences…"
                  : `Upload · ${files.length.toLocaleString("en-IN")} photo${files.length === 1 ? "" : "s"}`}
              </button>
            ) : (
              <button
                type="button"
                /* Storage fit is decided on step 2, where the estimate runs —
                   see goNext. */
                disabled={files.length === 0}
                onClick={goNext}
                className="brand-focus inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--color-brand-navy)] px-4 text-[13.5px] font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            )}
          </div>
          </>
        )}

        {/* §5d — name this folder (direct image selection) */}
        {naming && (
          <NameFolderPopup
            defaultValue={defaultFolderName()}
            onConfirm={(name) => {
              setDirectName(name.trim() || defaultFolderName());
              setNaming(false);
            }}
            onCancel={() => {
              setNaming(false);
              setFiles([]);
              setDirectName(null);
            }}
          />
        )}

        {/* §5c — where should uncategorised photos go? */}
        {mixedOpen && (
          <MixedFolderPopup
            subfolderNames={analysis.subGroups.map((g) => g.name)}
            looseCount={analysis.looseFiles.length}
            onPickExisting={(name) => resolveMixed({ target: name })}
            onCreate={(name) => resolveMixed({ target: name })}
            onSkip={() => resolveMixed("skip")}
            onClose={() => setMixedOpen(false)}
          />
        )}
      </div>
    </div>
  );
}

/* ── step indicator ────────────────────────────────────────────── */

/**
 * "Step 1 of 2 · Select Media". Quiet by design — it orients, it doesn't
 * navigate. The destination picker isn't counted here: it happens before the
 * studio has committed to uploading anything.
 */
function StepIndicator({ current }: { current: 1 | 2 }) {
  const label = current === 1 ? "Select Media" : "Preferences";
  return (
    <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-brand-muted)]">
      <span className="flex items-center gap-1" aria-hidden>
        {[1, 2].map((n) => (
          <span
            key={n}
            className="h-1 w-4 rounded-full transition-colors"
            style={{
              background:
                n <= current ? "var(--color-brand-navy)" : "var(--color-brand-outline)",
            }}
          />
        ))}
      </span>
      <span>
        Step {current} of 2 · {label}
      </span>
    </div>
  );
}

/* ── step 2 rail — plain-language read-out of the draft ────────── */

/**
 * Restates the draft preferences as the sentences a guest would experience, so
 * the consequence is legible without decoding a row of switches. Driven off
 * `DELIVERY_PREFERENCE_FIELDS` (each descriptor carries its own `summary`), so
 * a new preference appears here without this component being touched — and off
 * the same draft object the panel edits, so it can't drift from what is about
 * to be saved.
 */
function GuestPreferenceSummary({ prefs }: { prefs: DeliveryPreferences }) {
  return (
    <>
      <ul className="flex flex-col gap-2.5">
        {DELIVERY_PREFERENCE_FIELDS.map((field) => {
          const summary = field.summary;
          if (!summary) return null;
          const on = prefs[field.key];
          return (
            <li
              key={field.key}
              className="flex items-start gap-2 text-[12.5px] leading-relaxed text-[var(--color-brand-ink)]"
            >
              <span
                aria-hidden
                className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: on ? "var(--color-brand-navy)" : "var(--color-brand-outline)" }}
              />
              <span>{on ? summary.on : summary.off}</span>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 rounded-md bg-[var(--color-brand-navy-soft)] px-3 py-2.5 text-[11.5px] leading-relaxed text-[var(--color-brand-navy-deep)]">
        Not final — change these any time from the gear beside Upload more.
      </div>
    </>
  );
}

/* ── drop zone ─────────────────────────────────────────────────── */

function DropZone({
  dragOver,
  setDragOver,
  onDrop,
  onBrowseFolder,
  onBrowseFiles,
  single,
  folderOnly,
  skipped,
}: {
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  onDrop: (e: React.DragEvent) => void;
  onBrowseFolder: () => void;
  onBrowseFiles: () => void;
  single: boolean;
  folderOnly: boolean;
  /** Files dropped from the last pick because we can't publish them. */
  skipped: number;
}) {
  // Single-folder mode picks loose photos; the import flow picks a directory.
  const canBrowseFolder = !single;
  // In the import flow, individual photos are the secondary route — unless the
  // caller asked for folders only.
  const showFileButton = single || !folderOnly;
  const fileButtonPrimary = !canBrowseFolder;
  const fileButtonLabel = single ? "Browse photos" : "Or pick photos";

  return (
    <>
      <div
        onDragEnter={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragOver(false);
        }}
        onDrop={onDrop}
        className={`flex min-h-[220px] flex-1 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-9 transition-colors ${
          dragOver
            ? "border-[var(--color-brand-navy)] bg-[var(--color-brand-navy-soft)]"
            : "border-[var(--color-brand-outline)] bg-white"
        }`}
      >
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-brand-navy-soft)] text-[var(--color-brand-navy)]">
          <IconUpload size={26} />
        </div>
        <div className="text-center text-[15px] font-semibold text-[var(--color-brand-ink)]">
          {single ? "Drop your photos here" : "Drop your folder here"}
        </div>
        <div className="max-w-[280px] text-center text-[13px] leading-relaxed text-[var(--color-brand-muted)]">
          JPG · PNG · HEIC · WebP · no size limit
        </div>
        <div className="mt-1.5 flex flex-wrap items-center justify-center gap-2">
          {canBrowseFolder && (
            <button
              type="button"
              onClick={onBrowseFolder}
              className="brand-focus inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--color-brand-navy)] px-5 text-[13.5px] font-semibold text-white hover:bg-[var(--color-brand-navy-deep)]"
            >
              Browse folders
            </button>
          )}
          {showFileButton && (
            <button
              type="button"
              onClick={onBrowseFiles}
              className={`brand-focus inline-flex h-10 items-center gap-2 rounded-lg px-5 text-[13.5px] font-semibold ${
                fileButtonPrimary
                  ? "bg-[var(--color-brand-navy)] text-white hover:bg-[var(--color-brand-navy-deep)]"
                  : "border border-[var(--color-brand-border)] bg-white text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)]"
              }`}
            >
              {fileButtonLabel}
            </button>
          )}
        </div>
        {/* A pick can end up empty — say why rather than looking broken. */}
        {skipped > 0 && (
          <p className="max-w-[300px] text-center text-[12px] leading-relaxed text-[var(--color-brand-muted)]">
            {skipped.toLocaleString("en-IN")} file{skipped === 1 ? " was" : "s were"} skipped — RAW
            originals and system files can&apos;t be shown in a gallery.
          </p>
        )}
      </div>
    </>
  );
}

/* ── desktop-only guard (§C) ───────────────────────────────────── */

/**
 * Uploading needs `<input webkitdirectory>` and a real filesystem drag-and-drop
 * — neither of which mobile browsers give us. The entry points are already
 * desktop-only, so this is the belt to that pair of braces: if the dialog is
 * ever opened on an unsupported device, it says so instead of offering a drop
 * zone and file input that would half-work.
 */
function DesktopOnlyNotice({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-7 py-12 text-center">
      <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-brand-navy-soft)] text-[var(--color-brand-navy)]">
        <IconMonitor size={26} />
      </div>
      <h3 className="text-[16px] font-bold tracking-tight text-[var(--color-brand-ink)]">
        Uploading works on your laptop
      </h3>
      <p className="max-w-[340px] text-[13px] leading-relaxed text-[var(--color-brand-muted)]">
        Phone browsers can&apos;t hand over a folder with its subfolders intact, and event uploads are
        far too big for a mobile connection. Open this event on your computer and the whole shoot goes
        up in one drop.
      </p>
      <button
        type="button"
        onClick={onClose}
        className="brand-focus mt-2 inline-flex h-10 items-center rounded-lg border border-[var(--color-brand-border)] bg-white px-4 text-[13.5px] font-medium text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)]"
      >
        Got it
      </button>
    </div>
  );
}

/* ── destination picker (step 1) ───────────────────────────────── */

/**
 * Choose where photos land. Two genuinely different things live here, so
 * they're kept apart by a divider:
 *   - a destination folder (existing chip, or "+ New folder" — one folder,
 *     created empty and uploaded into immediately), and
 *   - importing a folder that already has subfolders, which fans out into
 *     several destination folders at once.
 */
function DestinationPicker({
  folders,
  onPick,
  onCreateFolder,
  onImportWithSubfolders,
  dirSupported,
}: {
  folders: UploadFolderOption[];
  onPick: (folder: UploadFolderOption) => void;
  onCreateFolder: (name: string) => Promise<UploadFolderOption | null>;
  onImportWithSubfolders: () => void;
  dirSupported: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const hasFolders = folders.length > 0;

  // Same inline-input pattern as the folders sidebar: type, press Enter, and
  // you're already uploading into the new folder — no second dialog.
  async function commitNewFolder(name: string) {
    const trimmed = name.trim();
    setCreating(false);
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const created = await onCreateFolder(trimmed);
      if (created) onPick(created);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-5">
      <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-brand-muted)]">
        Upload to an existing folder
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {folders.map((f) => (
          <button
            key={f.id}
            type="button"
            disabled={busy}
            onClick={() => onPick(f)}
            className="brand-focus inline-flex items-center gap-1.5 rounded-full border border-[var(--color-brand-border)] bg-white px-3 py-1.5 text-[12.5px] font-medium text-[var(--color-brand-ink)] hover:border-[var(--color-brand-navy)] hover:bg-[var(--color-brand-navy-soft)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <IconFolder size={13} className="text-[var(--color-brand-muted)]" />
            {f.name}
          </button>
        ))}

        {creating ? (
          <span className="inline-flex h-[34px] w-[170px] items-center rounded-full border border-[var(--color-brand-navy)] bg-white px-2">
            <InlineFolderInput
              placeholder="New folder name"
              onCommit={commitNewFolder}
              onCancel={() => setCreating(false)}
            />
          </span>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => setCreating(true)}
            className="brand-focus inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--color-brand-border)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--color-brand-muted)] hover:border-[var(--color-brand-outline)] hover:text-[var(--color-brand-ink)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="text-[14px] leading-none">+</span>
            New folder
          </button>
        )}
      </div>

      <p className="mt-2.5 text-[12px] leading-relaxed text-[var(--color-brand-muted)]">
        {hasFolders
          ? "Every photo lands in the one folder you pick — nothing gets re-sorted."
          : "No folders yet. Name one above and you'll go straight to picking photos."}
      </p>

      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-[var(--color-brand-border)]" />
        <span className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-[var(--color-brand-muted)]">
          Or
        </span>
        <span className="h-px flex-1 bg-[var(--color-brand-border)]" />
      </div>

      <button
        type="button"
        disabled={busy || !dirSupported}
        onClick={onImportWithSubfolders}
        className="brand-focus flex w-full items-start gap-3 rounded-lg border border-[var(--color-brand-border)] bg-white p-3.5 text-left hover:border-[var(--color-brand-navy)] hover:bg-[var(--color-brand-navy-soft)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-brand-navy-soft)] text-[var(--color-brand-navy)]">
          <IconFolderTree size={17} />
        </span>
        <span className="min-w-0">
          <span className="block text-[13.5px] font-semibold text-[var(--color-brand-ink)]">
            Import a folder with subfolders
          </span>
          <span className="mt-0.5 block text-[12px] leading-relaxed text-[var(--color-brand-muted)]">
            {dirSupported
              ? "Drop one folder — each subfolder inside it (Ceremony, Reception, Portraits…) becomes its own folder here."
              : "Available on desktop."}
          </span>
        </span>
      </button>
    </div>
  );
}

/* ── post-selection content panel (§5a) ────────────────────────── */

function ContentPanel({
  headingName,
  totalImages,
  groups,
  skipped,
  onAddMore,
}: {
  headingName: string;
  totalImages: number;
  groups: Array<{ name: string; files: File[]; pending?: boolean }>;
  /** Files we filtered out of the pick (RAW originals, macOS sidecars/dotfiles). */
  skipped: number;
  onAddMore: () => void;
}) {
  return (
    <div className="relative flex min-h-[220px] flex-1 flex-col rounded-xl border border-[var(--color-brand-border)] bg-white p-5">
      {/* Add-another-folder button, top-right of the panel */}
      <button
        type="button"
        onClick={onAddMore}
        title="Add more photos"
        aria-label="Add more photos"
        className="brand-focus absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-brand-border)] bg-white text-[var(--color-brand-navy)] hover:border-[var(--color-brand-outline)]"
      >
        <IconUpload size={16} />
      </button>

      <div className="pr-12">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--color-brand-navy-soft)] text-[var(--color-brand-navy)]">
          <IconFolder size={20} />
        </div>
        <h3 className="mt-3 truncate text-[16px] font-bold tracking-tight text-[var(--color-brand-ink)]">
          {headingName}
        </h3>
        <p className="mt-0.5 text-[12.5px] text-[var(--color-brand-muted)]">
          {totalImages.toLocaleString("en-IN")} photo{totalImages === 1 ? "" : "s"} ready ·{" "}
          {groups.length} {groups.length === 1 ? "folder" : "folders"}
        </p>
        {skipped > 0 && (
          <p
            className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-[var(--color-brand-bg)] px-2 py-1 text-[11.5px] leading-relaxed text-[var(--color-brand-muted)]"
            title="RAW camera files and macOS sidecar/system files can't be displayed in a gallery."
          >
            <IconWarningCircle size={13} className="shrink-0" />
            {skipped.toLocaleString("en-IN")} file{skipped === 1 ? "" : "s"} skipped — RAW originals
            and system files aren&apos;t supported.
          </p>
        )}
      </div>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto rounded-lg border border-[var(--color-brand-border)] bg-[var(--color-brand-bg)]">
        <ul className="divide-y divide-[var(--color-brand-border)]">
          {groups.map((g, i) => (
            <li key={`${g.name}-${i}`} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <IconFolder size={15} className="shrink-0 text-[var(--color-brand-muted)]" />
                <span className="truncate text-[13px] font-medium text-[var(--color-brand-ink)]">
                  {g.name}
                </span>
                {g.pending && (
                  <span className="shrink-0 rounded-full bg-[var(--color-brand-warning-soft)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--color-brand-warning)]">
                    Needs a home
                  </span>
                )}
              </div>
              <span className="shrink-0 text-[11.5px] tabular-nums text-[var(--color-brand-muted)]">
                {g.files.length.toLocaleString("en-IN")}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ── storage estimate / overrun notice (Monthly / Yearly plans) ── */

function StorageEstimateNotice({
  estimating,
  estimateGB,
  remainingGB,
  over,
}: {
  estimating: boolean;
  estimateGB: number | null;
  remainingGB: number | null;
  over: boolean;
}) {
  const sizeLabel = estimateGB !== null ? `~${formatSizeFromGB(estimateGB)}` : "—";

  if (over && estimateGB !== null) {
    return (
      <div className="border-t border-[var(--color-brand-danger)]/30 bg-[var(--color-brand-danger-soft)] px-6 py-3">
        <div className="flex items-start gap-2.5 text-[12.5px] leading-relaxed text-[var(--color-brand-danger)]">
          <IconWarningCircle size={16} className="mt-0.5 shrink-0" />
          <p>
            This upload needs about{" "}
            <strong className="tabular-nums">{formatSizeFromGB(estimateGB)}</strong>, but you only have{" "}
            <strong className="tabular-nums">{formatSizeFromGB(remainingGB ?? 0)}</strong> left.{" "}
            <a
              href="/dashboard/events"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold underline decoration-[var(--color-brand-danger)]/50 underline-offset-2 hover:decoration-[var(--color-brand-danger)]"
            >
              Delete photos from older events
            </a>{" "}
            to free up space, or reduce your selection.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 border-t border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] px-6 py-2.5 text-[12.5px] text-[var(--color-brand-muted)]">
      {estimating ? (
        <>
          <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-[2px] border-[var(--color-brand-border)] border-t-[var(--color-brand-navy)]" />
          <span>Estimating upload size…</span>
        </>
      ) : (
        <>
          <span>Estimated upload size:</span>
          <strong className="tabular-nums text-[var(--color-brand-ink)]">{sizeLabel}</strong>
          {remainingGB !== null && (
            <span className="tabular-nums">· {formatSizeFromGB(remainingGB)} left on your plan</span>
          )}
        </>
      )}
    </div>
  );
}

/* ── §5d popup — name this folder ──────────────────────────────── */

function NameFolderPopup({
  defaultValue,
  onConfirm,
  onCancel,
}: {
  defaultValue: string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(defaultValue);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <PopupShell onClose={onCancel} labelledBy="name-folder-title">
      <h3 id="name-folder-title" className="text-[16px] font-bold tracking-tight text-[var(--color-brand-ink)]">
        Name this folder
      </h3>
      <p className="mt-1 text-[12.5px] text-[var(--color-brand-muted)]">
        These photos will be grouped under one folder.
      </p>
      <input
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onConfirm(value);
          }
        }}
        aria-label="Folder name"
        className="brand-focus mt-4 block w-full rounded-lg border border-[var(--color-brand-border)] bg-white px-3.5 py-2.5 text-[14px] text-[var(--color-brand-ink)] outline-none"
      />
      <div className="mt-5 flex justify-end gap-2.5">
        <button
          type="button"
          onClick={onCancel}
          className="brand-focus inline-flex h-10 items-center rounded-lg border border-[var(--color-brand-border)] bg-white px-4 text-[13.5px] font-medium text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onConfirm(value)}
          className="brand-focus inline-flex h-10 items-center rounded-lg bg-[var(--color-brand-navy)] px-4 text-[13.5px] font-semibold text-white hover:bg-[var(--color-brand-navy-deep)]"
        >
          Confirm
        </button>
      </div>
    </PopupShell>
  );
}

/* ── §5c popup — where should uncategorised photos go? ─────────── */

function MixedFolderPopup({
  subfolderNames,
  looseCount,
  onPickExisting,
  onCreate,
  onSkip,
  onClose,
}: {
  subfolderNames: string[];
  looseCount: number;
  onPickExisting: (name: string) => void;
  onCreate: (name: string) => void;
  onSkip: () => void;
  onClose: () => void;
}) {
  const [newName, setNewName] = useState("");
  return (
    <PopupShell onClose={onClose} labelledBy="mixed-folder-title">
      <h3 id="mixed-folder-title" className="text-[16px] font-bold tracking-tight text-[var(--color-brand-ink)]">
        Where should uncategorised photos go?
      </h3>
      <p className="mt-1 text-[12.5px] text-[var(--color-brand-muted)]">
        {looseCount.toLocaleString("en-IN")} photo{looseCount === 1 ? "" : "s"} sit loose at the top level of your
        folder. Choose a home for them.
      </p>

      {subfolderNames.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-brand-muted)]">
            Use an existing folder
          </div>
          <div className="flex flex-wrap gap-2">
            {subfolderNames.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => onPickExisting(name)}
                className="brand-focus inline-flex items-center gap-1.5 rounded-full border border-[var(--color-brand-border)] bg-white px-3 py-1.5 text-[12.5px] font-medium text-[var(--color-brand-ink)] hover:border-[var(--color-brand-navy)] hover:bg-[var(--color-brand-navy-soft)]"
              >
                <IconFolder size={13} className="text-[var(--color-brand-muted)]" />
                {name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-brand-muted)]">
          Or create a new folder
        </div>
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newName.trim()) {
                e.preventDefault();
                onCreate(newName.trim());
              }
            }}
            placeholder="e.g. Candids"
            aria-label="New folder name"
            className="brand-focus h-10 min-w-0 flex-1 rounded-lg border border-[var(--color-brand-border)] bg-white px-3 text-[13.5px] text-[var(--color-brand-ink)] outline-none placeholder:text-[var(--color-brand-muted)]/70"
          />
          <button
            type="button"
            disabled={!newName.trim()}
            onClick={() => onCreate(newName.trim())}
            className="brand-focus inline-flex h-10 shrink-0 items-center rounded-lg bg-[var(--color-brand-navy)] px-4 text-[13.5px] font-semibold text-white hover:bg-[var(--color-brand-navy-deep)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Create
          </button>
        </div>
      </div>

      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={onSkip}
          className="brand-focus inline-flex h-9 items-center rounded-lg px-3 text-[12.5px] font-medium text-[var(--color-brand-muted)] hover:text-[var(--color-brand-ink)]"
        >
          Skip these photos
        </button>
      </div>
    </PopupShell>
  );
}

/** Shared centered popup card with scale+fade-in (§5c/§5d). */
function PopupShell({
  children,
  onClose,
  labelledBy,
}: {
  children: React.ReactNode;
  onClose: () => void;
  labelledBy: string;
}) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center px-4" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onClose}
        className="drawer-fade absolute inset-0 bg-[var(--color-brand-ink)]/30 backdrop-blur-[1px]"
      />
      <div className="popup-pop relative max-h-[90vh] w-full max-w-[420px] overflow-y-auto rounded-xl border border-[var(--color-brand-border)] bg-white p-5 shadow-[0_18px_50px_rgba(42,34,24,0.18)]">
        {children}
      </div>
    </div>
  );
}

/* ── helpers ───────────────────────────────────────────────────── */

// Camera RAW formats can't be displayed in the browser and are huge — block them.
const RAW_EXTENSIONS =
  /\.(raw|cr2|cr3|nef|nrw|arw|srf|sr2|orf|rw2|dng|raf|3fr|kdc|mef|mrw|pef|ptx|r3d|rwl|srw|x3f|erf|fff|iiq)$/i;

/** macOS AppleDouble sidecar files (`._foo.jpg`) and other dotfiles aren't real
 *  images — they carry an image extension but no decodable pixel data. */
function isJunkFile(name: string): boolean {
  const base = name.split("/").pop() ?? name;
  return base.startsWith("._") || base === ".DS_Store" || base.startsWith(".");
}

/**
 * Keep only what we can actually publish, and report how much was dropped —
 * silently discarding files is what made photos appear to "go missing" between
 * the picker and the gallery.
 */
function filterImages(files: File[]): { kept: File[]; skipped: number } {
  const kept = files.filter((f) => {
    if (isJunkFile(f.name)) return false; // macOS AppleDouble / dotfiles
    if (RAW_EXTENSIONS.test(f.name)) return false; // block RAW
    return f.type.startsWith("image/") || /\.(heic|heif|jpe?g|png|gif|webp)$/i.test(f.name);
  });
  return { kept, skipped: files.length - kept.length };
}

function defaultFolderName(): string {
  const d = new Date();
  const mon = d.toLocaleDateString("en-GB", { month: "short" });
  return `Photos – ${d.getDate()} ${mon} ${d.getFullYear()}`;
}

function analyze(files: File[], firstRoot: string | null): Analysis {
  if (files.length === 0) {
    return { kind: "grouped", folderName: "", subGroups: [], looseFiles: [] };
  }

  // No folder structure at all → individual image selection (§5d).
  if (files.every((f) => relParts(f).length <= 1)) {
    return { kind: "direct", folderName: "", subGroups: [], looseFiles: files };
  }

  // Bucket files by their top-level parent folder (parts[0]) and classify each
  // parent independently. This is what keeps a previously-picked flat folder
  // (e.g. "abc") intact when a later selection introduces subfolders — its
  // photos stay under "abc" instead of being reclassified as uncategorised.
  const byParent = new Map<string, File[]>();
  const loose: File[] = [];
  for (const f of files) {
    const parts = relParts(f);
    if (parts.length <= 1) {
      loose.push(f); // stray individual file mixed in with folder picks
      continue;
    }
    mergeFiles(byParent, parts[0], [f]);
  }

  const groups = new Map<string, File[]>();
  for (const [parent, pfiles] of byParent) {
    // Only the FIRST folder picked this session gets first-level subfolder
    // grouping. Folders added afterwards are flattened under their own name.
    if (parent !== firstRoot) {
      mergeFiles(groups, parent, pfiles);
      continue;
    }
    const hasSub = pfiles.some((f) => relParts(f).length >= 3);
    if (!hasSub) {
      // Flat folder → the folder itself is one group (§5b).
      mergeFiles(groups, parent, pfiles);
    } else {
      // Roll every nested descendant up into its first-level subfolder (parts[1]).
      for (const f of pfiles) {
        const parts = relParts(f);
        if (parts.length >= 3) mergeFiles(groups, parts[1], [f]);
        else loose.push(f); // loose-at-root within a subfoldered folder → §5c
      }
    }
  }

  const subGroups = Array.from(groups.entries()).map(([name, files]) => ({ name, files }));
  const parents = Array.from(byParent.keys());
  const folderName = parents.length === 1 ? parents[0] : "";

  if (loose.length > 0) {
    return { kind: "mixed", folderName, subGroups, looseFiles: loose };
  }
  return { kind: "grouped", folderName, subGroups, looseFiles: [] };
}

function relParts(f: File): string[] {
  return ((f as File & { webkitRelativePath?: string }).webkitRelativePath ?? "")
    .split("/")
    .filter(Boolean);
}

function mergeFiles(map: Map<string, File[]>, key: string, files: File[]): void {
  const arr = map.get(key) ?? [];
  arr.push(...files);
  map.set(key, arr);
}

async function walkDirectoryItems(items: DataTransferItemList): Promise<File[]> {
  const out: File[] = [];
  const entries: Array<unknown> = [];
  for (let i = 0; i < items.length; i++) {
    const entry = (items[i] as DataTransferItem & { webkitGetAsEntry?: () => unknown }).webkitGetAsEntry?.();
    if (entry) entries.push(entry);
  }
  for (const e of entries) {
    await walkEntry(e as FsEntry, out, "");
  }
  return out;
}

type FsEntry = {
  isDirectory: boolean;
  isFile: boolean;
  name: string;
  file?: (cb: (f: File) => void, errCb?: (e: unknown) => void) => void;
  createReader?: () => { readEntries: (cb: (entries: FsEntry[]) => void) => void };
};

async function walkEntry(entry: FsEntry, out: File[], prefix: string): Promise<void> {
  if (entry.isFile && entry.file) {
    return new Promise((resolve) => {
      entry.file!((f) => {
        Object.defineProperty(f, "webkitRelativePath", {
          value: prefix ? `${prefix}/${entry.name}` : entry.name,
          writable: false,
        });
        out.push(f);
        resolve();
      });
    });
  }
  if (entry.isDirectory && entry.createReader) {
    const reader = entry.createReader();
    const children: FsEntry[] = await new Promise((resolve) => reader.readEntries((ents) => resolve(ents)));
    for (const c of children) {
      await walkEntry(c, out, prefix ? `${prefix}/${entry.name}` : entry.name);
    }
  }
}

/* ── illustration + icons ──────────────────────────────────────── */

/**
 * Parent folder → child folders, built from the same `FolderIcon` and brand
 * tokens as the rest of the modal (it used to be a hand-drawn SVG in a
 * terracotta palette that appears nowhere else in this dialog).
 */
function UploadIllustration() {
  return (
    <div className="rounded-lg border border-[var(--color-brand-border)] bg-white px-3 py-4">
      <div className="flex flex-col items-center">
        <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-brand-navy-soft)] px-2.5 py-1.5 text-[11.5px] font-semibold text-[var(--color-brand-navy)]">
          <IconFolder size={14} />
          Your event folder
        </span>
        <span className="h-3 w-px bg-[var(--color-brand-border)]" aria-hidden />
      </div>
      <div className="flex items-start justify-center">
        {["Ceremony", "Reception", "Portraits"].map((label, i) => (
          <div key={label} className="flex min-w-0 flex-1 flex-col items-center">
            {/* Connector: a horizontal rail across the three children, with the
                outer halves trimmed so it reads as a bracket, not a full line. */}
            <span className="flex h-px w-full items-center" aria-hidden>
              <span className={`h-px flex-1 ${i === 0 ? "bg-transparent" : "bg-[var(--color-brand-border)]"}`} />
              <span className={`h-px flex-1 ${i === 2 ? "bg-transparent" : "bg-[var(--color-brand-border)]"}`} />
            </span>
            <span className="h-3 w-px bg-[var(--color-brand-border)]" aria-hidden />
            <IconFolder size={16} className="text-[var(--color-brand-muted)]" />
            <span className="mt-1 max-w-full truncate text-[10.5px] font-medium text-[var(--color-brand-muted)]">
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

