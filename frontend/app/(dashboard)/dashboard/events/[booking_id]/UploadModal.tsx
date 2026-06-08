"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/** What the modal hands back once the user commits a selection. */
export type UploadPlan =
  | { mode: "grouped"; groups: Array<{ name: string; files: File[] }> }
  | { mode: "single"; files: File[]; targetFolderId: string; targetFolderName: string };

type Props = {
  open: boolean;
  onClose: () => void;
  onStart: (plan: UploadPlan) => void;
  /** Single-folder mode: every image goes here, no subfolder parsing / popups. */
  targetFolderId?: string;
  targetFolderName?: string;
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
  targetFolderId,
  targetFolderName,
}: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [directName, setDirectName] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const [mixedOpen, setMixedOpen] = useState(false);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const single = !!targetFolderId;

  // Reset + lock scroll whenever the modal opens.
  useEffect(() => {
    if (!open) return;
    setFiles([]);
    setDragOver(false);
    setDirectName(null);
    setNaming(false);
    setMixedOpen(false);
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Escape closes the top-most layer (mixed popup → naming popup → modal).
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

  const analysis = useMemo<Analysis>(() => analyze(files), [files]);

  if (!open) return null;

  function addFiles(picked: File[]) {
    const filtered = filterImages(picked);
    if (filtered.length === 0) return;
    const merged = [...files, ...filtered];
    setFiles(merged);
    // Folder mode: a direct (loose-files) selection needs a folder name before
    // we can build a group — pop the "name this folder" sheet (§5d).
    if (!single && directName === null && analyze(merged).kind === "direct") {
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
    ? targetFolderName ?? "Folder"
    : analysis.kind === "direct"
      ? directName ?? "New folder"
      : analysis.folderName || "Selected photos";

  // Groups to preview in the right panel (loose photos shown as a pending row).
  const previewGroups: Array<{ name: string; files: File[]; pending?: boolean }> = single
    ? [{ name: targetFolderName ?? "Folder", files }]
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

  function start() {
    if (files.length === 0) return;
    if (single) {
      onStart({
        mode: "single",
        files,
        targetFolderId: targetFolderId as string,
        targetFolderName: targetFolderName ?? "Folder",
      });
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
    if (analysis.kind === "mixed") {
      // Hold the upload until the user decides where loose photos go (§5c).
      setMixedOpen(true);
      return;
    }
    // grouped → every photo already belongs to a named folder.
    onStart({ mode: "grouped", groups: analysis.subGroups });
    onClose();
  }

  function resolveMixed(decision: { target: string } | "skip") {
    setMixedOpen(false);
    const groups = analysis.subGroups.map((g) => ({ name: g.name, files: [...g.files] }));
    if (decision !== "skip") {
      const existing = groups.find((g) => g.name === decision.target);
      if (existing) existing.files.push(...analysis.looseFiles);
      else groups.push({ name: decision.target, files: [...analysis.looseFiles] });
    }
    onStart({ mode: "grouped", groups });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-16 sm:pt-24"
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
      <div className="dash-rise relative flex max-h-[90vh] w-full max-w-[760px] flex-col overflow-hidden rounded-xl border border-[var(--color-brand-border)] bg-white shadow-[0_12px_40px_rgba(42,34,24,0.12)]">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-brand-border)] px-6 py-4">
          <div>
            <h2 className="text-[18px] font-bold leading-tight tracking-tight text-[var(--color-brand-ink)]">
              Upload media
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-brand-muted)]">
              {single
                ? "Pick photos to add to this folder."
                : "Pick the folder from your computer. We'll preserve the subfolder structure."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="brand-focus flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--color-brand-muted)] hover:bg-[var(--color-brand-surface)] hover:text-[var(--color-brand-ink)]"
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Single-folder banner (§6) */}
        {single && (
          <div className="flex items-center gap-2 border-b border-[var(--color-brand-navy)]/20 bg-[var(--color-brand-navy-soft)] px-6 py-2 text-[12.5px] font-semibold text-[var(--color-brand-navy)]">
            <FolderIcon size={14} />
            Uploading to: {targetFolderName ?? "Folder"}
          </div>
        )}

        {/* Body */}
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden sm:grid-cols-[280px_1fr]">
          {/* Left: how-it-works illustration (hidden on mobile per the brief) */}
          <div className="hidden flex-col border-r border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] px-6 py-6 sm:flex">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-brand-muted)]">
              How it works
            </div>
            <UploadIllustration />
            <p className="mt-4 text-[12.5px] leading-relaxed text-[var(--color-brand-ink)]">
              <strong>One-shot upload.</strong> Drop a folder that already has your subfolders inside it (e.g.{" "}
              <i>Ceremony</i>, <i>Reception</i>, <i>Portraits</i>) and we&apos;ll create matching folders on the event
              page.
            </p>
            <div className="mt-2.5 rounded-md bg-[var(--color-brand-navy-soft)] px-3 py-2.5 text-[11.5px] leading-relaxed text-[var(--color-brand-navy-deep)]">
              You can rename folders after upload — they show up in the folders sidebar.
            </div>
          </div>

          {/* Right: drop zone OR content panel */}
          <div className="flex min-h-0 flex-col overflow-y-auto px-7 py-6">
            {!hasSelection ? (
              <DropZone
                dragOver={dragOver}
                setDragOver={setDragOver}
                onDrop={handleDrop}
                onBrowseFolder={() => folderInputRef.current?.click()}
                onBrowseFiles={() => fileInputRef.current?.click()}
                single={single}
              />
            ) : (
              <ContentPanel
                headingName={headingName}
                totalImages={files.length}
                groups={previewGroups}
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

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 border-t border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] px-6 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="brand-focus inline-flex h-10 items-center rounded-lg border border-[var(--color-brand-border)] bg-white px-4 text-[13.5px] font-medium text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={files.length === 0}
            onClick={start}
            className="brand-focus inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--color-brand-navy)] px-4 text-[13.5px] font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Start upload
          </button>
        </div>

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

/* ── drop zone ─────────────────────────────────────────────────── */

function DropZone({
  dragOver,
  setDragOver,
  onDrop,
  onBrowseFolder,
  onBrowseFiles,
  single,
}: {
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  onDrop: (e: React.DragEvent) => void;
  onBrowseFolder: () => void;
  onBrowseFiles: () => void;
  single: boolean;
}) {
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
          <UploadIcon size={26} />
        </div>
        <div className="text-center text-[15px] font-semibold text-[var(--color-brand-ink)]">
          {single ? "Drag photos here" : "Drag a folder here"}
        </div>
        <div className="max-w-[280px] text-center text-[13px] leading-relaxed text-[var(--color-brand-muted)]">
          JPG · PNG · HEIC · WebP · no size limit
        </div>
        <div className="mt-1.5 flex flex-wrap items-center justify-center gap-2">
          {!single && (
            <button
              type="button"
              onClick={onBrowseFolder}
              className="brand-focus inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--color-brand-navy)] px-5 text-[13.5px] font-semibold text-white hover:bg-[var(--color-brand-navy-deep)]"
            >
              Browse folders
            </button>
          )}
          <button
            type="button"
            onClick={onBrowseFiles}
            className={`brand-focus inline-flex h-10 items-center gap-2 rounded-lg px-5 text-[13.5px] font-semibold ${
              single
                ? "bg-[var(--color-brand-navy)] text-white hover:bg-[var(--color-brand-navy-deep)]"
                : "border border-[var(--color-brand-border)] bg-white text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)]"
            }`}
          >
            {single ? "Browse photos" : "Or select photos"}
          </button>
        </div>
      </div>
    </>
  );
}

/* ── post-selection content panel (§5a) ────────────────────────── */

function ContentPanel({
  headingName,
  totalImages,
  groups,
  onAddMore,
}: {
  headingName: string;
  totalImages: number;
  groups: Array<{ name: string; files: File[]; pending?: boolean }>;
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
        <UploadIcon size={16} />
      </button>

      <div className="pr-12">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--color-brand-navy-soft)] text-[var(--color-brand-navy)]">
          <FolderIcon size={20} />
        </div>
        <h3 className="mt-3 truncate text-[16px] font-bold tracking-tight text-[var(--color-brand-ink)]">
          {headingName}
        </h3>
        <p className="mt-0.5 text-[12.5px] text-[var(--color-brand-muted)]">
          {totalImages.toLocaleString("en-IN")} image{totalImages === 1 ? "" : "s"} found ·{" "}
          {groups.length} {groups.length === 1 ? "folder" : "folders"}
        </p>
      </div>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto rounded-lg border border-[var(--color-brand-border)] bg-[var(--color-brand-bg)]">
        <ul className="divide-y divide-[var(--color-brand-border)]">
          {groups.map((g, i) => (
            <li key={`${g.name}-${i}`} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <FolderIcon size={15} className="shrink-0 text-[var(--color-brand-muted)]" />
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
                <FolderIcon size={13} className="text-[var(--color-brand-muted)]" />
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

function filterImages(files: File[]): File[] {
  return files.filter((f) => {
    if (RAW_EXTENSIONS.test(f.name)) return false; // block RAW
    return f.type.startsWith("image/") || /\.(heic|heif|jpe?g|png|gif|webp)$/i.test(f.name);
  });
}

function defaultFolderName(): string {
  const d = new Date();
  const mon = d.toLocaleDateString("en-GB", { month: "short" });
  return `Photos – ${d.getDate()} ${mon} ${d.getFullYear()}`;
}

function analyze(files: File[]): Analysis {
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
    const hasSub = pfiles.some((f) => relParts(f).length >= 3);
    if (!hasSub) {
      // Flat folder → the folder itself is one group (§5b).
      mergeFiles(groups, parent, pfiles);
    } else {
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

function UploadIllustration() {
  return (
    <svg viewBox="0 0 280 220" width="100%" className="block">
      <g transform="translate(110, 18)">
        <rect x="0" y="8" width="60" height="44" rx="4" fill="#FFFFFF" stroke="#C25A3A" strokeWidth="1.5" />
        <path d="M0 12 L0 8 a4 4 0 0 1 4 -4 h14 l4 4 h38 a4 4 0 0 1 4 4 v4 z" fill="#F7E8E3" stroke="#C25A3A" strokeWidth="1.5" />
        <line x1="10" y1="28" x2="50" y2="28" stroke="#C25A3A" strokeWidth="1" opacity="0.45" />
        <line x1="10" y1="36" x2="40" y2="36" stroke="#C25A3A" strokeWidth="1" opacity="0.45" />
      </g>
      <line x1="140" y1="70" x2="140" y2="115" stroke="#C25A3A" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.6" />
      <line x1="40" y1="115" x2="240" y2="115" stroke="#C25A3A" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.6" />
      <line x1="40" y1="115" x2="40" y2="138" stroke="#C25A3A" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.6" />
      <line x1="140" y1="115" x2="140" y2="138" stroke="#C25A3A" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.6" />
      <line x1="240" y1="115" x2="240" y2="138" stroke="#C25A3A" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.6" />
      {[10, 110, 210].map((x, i) => (
        <g key={i} transform={`translate(${x}, 138)`}>
          <rect x="0" y="8" width="60" height="44" rx="4" fill="#FFFFFF" stroke="#7A6F63" strokeWidth="1.2" />
          <path d="M0 12 L0 8 a4 4 0 0 1 4 -4 h14 l4 4 h38 a4 4 0 0 1 4 4 v4 z" fill="#FAFAF8" stroke="#7A6F63" strokeWidth="1.2" />
          <line x1="10" y1="28" x2="50" y2="28" stroke="#7A6F63" strokeWidth="1" opacity="0.35" />
          <line x1="10" y1="36" x2="44" y2="36" stroke="#7A6F63" strokeWidth="1" opacity="0.35" />
        </g>
      ))}
      <text x="140" y="90" textAnchor="middle" fontFamily="Plus Jakarta Sans, sans-serif" fontSize="10" fontWeight="600" letterSpacing="0.06em" fill="#C25A3A">
        PARENT FOLDER
      </text>
      {["Ceremony", "Reception", "Portraits"].map((label, i) => (
        <text key={label} x={[40, 140, 240][i]} y="202" textAnchor="middle" fontFamily="Plus Jakarta Sans, sans-serif" fontSize="11" fontWeight="500" fill="#7A6F63">
          {label}
        </text>
      ))}
    </svg>
  );
}

function UploadIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="7 9 12 4 17 9" />
      <line x1="12" y1="4" x2="12" y2="16" />
      <path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" />
    </svg>
  );
}

function FolderIcon({ size, className }: { size: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="6" y1="18" x2="18" y2="6" />
    </svg>
  );
}
