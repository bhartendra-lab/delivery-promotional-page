"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createCustomFolder, updateCustomFolder } from "@/lib/api";
import { EVENT_TYPES, type CustomFolder, type MediaItem } from "@/lib/types";
import { FoldersSidebar, InlineFolderInput, type FolderRow } from "@/components/dashboard/FoldersSidebar";
import { UploadModal } from "./UploadModal";
import { UploadProgress } from "./UploadProgress";
import { MediaGrid } from "./MediaGrid";
import { CoverBanner } from "./CoverBanner";
import { useEvent, ALL_MEDIA_ID } from "./EventContext";

/**
 * Media tab — the original event-page body (folders sidebar + cover + header +
 * grid + upload flow). Shared data comes from `EventContext`; tab-local UI state
 * (modals, active folder) stays here.
 */
export function MediaTab({ loading }: { loading: boolean }) {
  const {
    bookingId: ctxBookingId,
    meta,
    media,
    folders,
    setFolders,
    activeFolderId,
    setActiveFolder,
    folderCounts,
    totalCount,
    totalForView,
    hasMore,
    loadingMore,
    loadMore,
    engine,
    activeLocked,
    publishedEver,
    saveMeta,
    coverBusy,
    setCoverFromUrl,
    setCoverFromFile,
    setCoverPosition,
    deleteMediaIds,
    toast,
  } = useEvent();

  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadTarget, setUploadTarget] = useState<{ id: string; name: string } | null>(null);
  // Directory (folder) uploads need <input webkitdirectory>, which mobile
  // browsers don't support — steer those to the plain multi-file picker.
  const [dirSupported] = useState(
    () => typeof document === "undefined" || "webkitdirectory" in document.createElement("input"),
  );
  const [prePickerOpen, setPrePickerOpen] = useState(false);
  // Folder-only upload (the "Create new folder" path): opens the first-time
  // folder flow with the subfolder guide, minus the "Or select photos" option.
  const [folderOnly, setFolderOnly] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const paused = engine.progress.paused;
  const engineActive = engine.progress.isUploading || engine.progress.isSavingMetadata;
  // "populated" vs "empty" is event-level (does the booking have any media),
  // not view-level — an empty folder still shows the populated chrome with an
  // empty grid, mirroring the prior behaviour.
  const state: "loading" | "uploading" | "populated" | "empty" = loading
    ? "loading"
    : engineActive
    ? "uploading"
    : totalCount > 0
    ? "populated"
    : "empty";

  const folderRows: FolderRow[] = useMemo(() => {
    if (folders.length === 0) return [];
    const allRow: FolderRow = { id: ALL_MEDIA_ID, label: "All Media", count: totalCount, system: true, icon: "images" };
    const userRows: FolderRow[] = folders.map((f) => ({
      id: f._id,
      label: f.name,
      count: folderCounts[f._id] ?? 0,
    }));
    return [allRow, ...userRows];
  }, [folders, totalCount, folderCounts]);

  const activeFolderLabel =
    activeFolderId === ALL_MEDIA_ID
      ? "All Media"
      : folders.find((f) => f._id === activeFolderId)?.name ?? "Folder";
  const activeIsSystem = activeFolderId === ALL_MEDIA_ID;

  const handleRename = useCallback(
    async (folderId: string, name: string) => {
      try {
        await updateCustomFolder(folderId, name);
        setFolders((prev) => prev.map((f) => (f._id === folderId ? { ...f, name } : f)));
      } catch (err) {
        toast(err instanceof Error ? err.message : "Could not rename folder", "error");
      }
    },
    [setFolders, toast],
  );

  // Folder create needs the bookingId — read it from context.
  const bookingId = ctxBookingId;

  const addFolder = useCallback(
    async (name: string) => {
      try {
        const res = await createCustomFolder(bookingId, name);
        setFolders((prev) => {
          // The backend reuses an existing folder for a duplicate name (same
          // case-insensitive/trimmed match) and returns its id — don't add a
          // second row sharing that id.
          if (prev.some((f) => f._id === res.custom_folder_id)) return prev;
          return [
            ...prev,
            { _id: res.custom_folder_id, name, booking_id: bookingId, createdAt: new Date().toISOString() },
          ];
        });
      } catch (err) {
        toast(err instanceof Error ? err.message : "Could not create folder", "error");
      }
    },
    [bookingId, setFolders, toast],
  );

  const handleUploadMore = useCallback(() => {
    // System views (All Media / Liked Media) aren't real upload targets — pick a
    // folder first. A real folder tab uploads straight into it (single mode).
    if (activeIsSystem) setPrePickerOpen(true);
    else {
      setUploadTarget({ id: activeFolderId, name: activeFolderLabel });
      setFolderOnly(false);
      setUploadModalOpen(true);
    }
  }, [activeIsSystem, activeFolderId, activeFolderLabel]);

  const handleBulkUpload = useCallback(() => {
    setUploadTarget(null);
    setFolderOnly(false);
    setUploadModalOpen(true);
  }, []);

  // Pick an existing folder from the pre-picker → upload into it (single mode).
  const pickExistingTarget = useCallback((folder: { id: string; name: string }) => {
    setPrePickerOpen(false);
    setUploadTarget({ id: folder.id, name: folder.name });
    setFolderOnly(false);
    setUploadModalOpen(true);
  }, []);

  // "Create new folder" from the pre-picker → open the first-time folder flow
  // (folder-only). Folders are created/reused by subfolder name at upload time
  // via `ensureFolders`, so no folder is created here.
  const openCreateNewFolderUpload = useCallback(() => {
    setPrePickerOpen(false);
    setUploadTarget(null);
    setFolderOnly(true);
    setUploadModalOpen(true);
  }, []);

  // "Change" from the upload modal's "Uploading to" banner → reopen the picker.
  const changeFolder = useCallback(() => {
    setUploadModalOpen(false);
    setUploadTarget(null);
    setFolderOnly(false);
    setPrePickerOpen(true);
  }, []);

  return (
    <div className="flex min-h-0 flex-1 items-stretch">
      <FoldersSidebar
        folders={folderRows}
        activeFolderId={activeFolderId}
        onSelect={activeLocked ? () => {} : setActiveFolder}
        onRename={handleRename}
        onAddFolder={folderRows.length > 0 ? addFolder : undefined}
        disabled={activeLocked}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {activeLocked && (
          <div className="flex items-center gap-2 border-b border-[var(--color-brand-warning)]/30 bg-[var(--color-brand-warning-soft)] px-6 py-2 text-[12.5px] font-medium text-[var(--color-brand-warning)] sm:px-10">
            <WarnIcon size={14} />
            Upload in progress — please keep this tab open.
          </div>
        )}

        {state === "populated" && (
          <CoverBanner
            coverUrl={meta.backgroundImage}
            coverPosition={meta.backgroundPosition}
            media={media}
            busy={coverBusy}
            disabled={activeLocked}
            lockReason={publishedEver ? "Locked once photos are delivered, to keep the shared link stable." : null}
            onSetFromUrl={setCoverFromUrl}
            onSetFromFile={setCoverFromFile}
            onSavePosition={setCoverPosition}
          />
        )}

        <EventHeader
          meta={meta}
          totalPhotos={totalCount}
          folderCount={folders.length}
          uploadingTotal={engine.progress.photosTotal}
          uploadingFoldersCount={engine.progress.folders.length}
          state={state}
          paused={paused}
          activeIsSystem={activeIsSystem}
          onUploadMore={handleUploadMore}
          onEdit={() => setEditOpen(true)}
        />

        {/* Mobile folder switcher (desktop uses the FoldersSidebar). */}
        {state === "populated" && folderRows.length > 0 && (
          <MobileFolderStrip
            folders={folderRows}
            activeFolderId={activeFolderId}
            onSelect={activeLocked ? () => {} : setActiveFolder}
            onAddFolder={addFolder}
            onRename={handleRename}
            disabled={activeLocked}
          />
        )}

        {state === "loading" && <LoadingBody />}
        {state === "empty" && <EmptyUploadCTA onUpload={handleBulkUpload} dirSupported={dirSupported} />}
        {state === "uploading" && (
          <UploadProgress
            progress={engine.progress}
            onCancel={() => void engine.cancelUpload()}
            onTogglePause={() => (paused ? engine.resume() : engine.pause())}
          />
        )}
        {state === "populated" && (
          <PopulatedBody
            activeFolderLabel={activeFolderLabel}
            activeIsSystem={activeIsSystem}
            count={totalForView}
            folderCount={folders.length}
            items={media}
            hasMore={hasMore}
            loadingMore={loadingMore}
            onLoadMore={loadMore}
            disabled={activeLocked}
            onDeleteMany={deleteMediaIds}
            notify={toast}
            onRename={() => {
              if (!activeIsSystem) {
                const next = window.prompt("Rename folder", activeFolderLabel);
                if (next && next.trim() && next.trim() !== activeFolderLabel) {
                  void handleRename(activeFolderId, next.trim());
                }
              }
            }}
          />
        )}
      </div>

      <UploadModal
        open={uploadModalOpen}
        onClose={() => {
          setUploadModalOpen(false);
          setUploadTarget(null);
          setFolderOnly(false);
        }}
        targetFolderId={uploadTarget?.id}
        targetFolderName={uploadTarget?.name}
        folderOnly={folderOnly}
        onChangeFolder={changeFolder}
        onStart={(plan) => {
          if (plan.mode === "single") {
            void engine.startUpload({
              files: plan.files,
              targetFolderId: plan.targetFolderId,
              targetFolderName: plan.targetFolderName,
            });
          } else {
            void engine.startUpload({
              groups: plan.groups,
              existingFolders: folders.map((f) => ({ name: f.name, id: f._id })),
              onFoldersEnsured: (ensured) => {
                setFolders((prev) => {
                  const known = new Set(prev.map((f) => f._id));
                  const additions = ensured
                    .filter((f) => !known.has(f.id))
                    .map((f) => ({
                      _id: f.id,
                      name: f.name,
                      booking_id: bookingId,
                      createdAt: new Date().toISOString(),
                    }));
                  return additions.length > 0 ? [...prev, ...additions] : prev;
                });
              },
            });
          }
        }}
      />

      {prePickerOpen && (
        <UploadFolderPicker
          folders={folders}
          onPickExisting={pickExistingTarget}
          onCreateNew={openCreateNewFolderUpload}
          onClose={() => setPrePickerOpen(false)}
        />
      )}

      {editOpen && (
        <EditMetaSheet
          initialName={meta.name}
          initialType={meta.type}
          initialDate={meta.eventDate}
          nameLocked={publishedEver}
          onSave={async (next) => {
            await saveMeta(next);
            setEditOpen(false);
          }}
          onClose={() => setEditOpen(false)}
        />
      )}
    </div>
  );
}

/* ── header ─────────────────────────────────────────────────────── */

function EventHeader({
  meta,
  totalPhotos,
  folderCount,
  uploadingTotal,
  uploadingFoldersCount,
  state,
  paused,
  activeIsSystem,
  onUploadMore,
  onEdit,
}: {
  meta: { name: string; type: string; eventDate: number | null };
  totalPhotos: number;
  folderCount: number;
  uploadingTotal: number;
  uploadingFoldersCount: number;
  state: "loading" | "uploading" | "populated" | "empty";
  paused: boolean;
  activeIsSystem: boolean;
  onUploadMore: () => void;
  onEdit: () => void;
}) {
  const dateLabel = meta.eventDate != null ? formatDate(meta.eventDate) : null;

  let subtitle = "No photos uploaded yet";
  if (state === "loading") subtitle = "Loading…";
  else if (state === "uploading")
    subtitle = paused
      ? `Paused — ${uploadingFoldersCount} folder${uploadingFoldersCount === 1 ? "" : "s"} detected`
      : `Importing ${uploadingTotal.toLocaleString("en-IN")} photos · ${uploadingFoldersCount} folders detected`;
  else if (state === "populated")
    subtitle = `${totalPhotos.toLocaleString("en-IN")} photo${totalPhotos === 1 ? "" : "s"} across ${folderCount} folder${folderCount === 1 ? "" : "s"}`;

  return (
    <section className="flex flex-col items-start justify-between gap-4 border-b border-[var(--color-brand-border)] bg-white px-6 py-6 sm:flex-row sm:px-10">
      <div>
        <div className="mb-1.5 flex flex-wrap items-center gap-2.5">
          <span className="rounded-sm bg-[var(--color-brand-navy-soft)] px-2 py-[3px] text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--color-brand-navy)]">
            {meta.type}
          </span>
          {dateLabel && <span className="text-[12.5px] text-[var(--color-brand-muted)]">{dateLabel}</span>}
          {state === "uploading" && (
            <span
              className="inline-flex items-center gap-1.5 rounded-sm px-2 py-[3px] text-[11px] font-semibold uppercase tracking-[0.05em]"
              style={{
                background: paused ? "#F2F0EB" : "var(--color-brand-navy-soft)",
                color: paused ? "var(--color-brand-muted)" : "var(--color-brand-navy)",
              }}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${paused ? "" : "brand-blink"}`}
                style={{ background: paused ? "var(--color-brand-muted)" : "var(--color-brand-navy)" }}
              />
              {paused ? "Paused" : "Uploading"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <h1 className="text-[30px] font-bold leading-tight tracking-tight text-[var(--color-brand-ink)]">{meta.name}</h1>
          {state !== "loading" && (
            <button
              type="button"
              onClick={onEdit}
              aria-label="Edit event details"
              title="Edit event details"
              className="brand-focus inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--color-brand-muted)] hover:bg-[var(--color-brand-surface)] hover:text-[var(--color-brand-ink)]"
            >
              <EditIcon size={16} />
            </button>
          )}
        </div>
        <p className="mt-1.5 text-[13px] text-[var(--color-brand-muted)]">{subtitle}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        {state === "populated" && (
          <>
            <button
              type="button"
              onClick={onUploadMore}
              className="brand-focus inline-flex items-center gap-2 rounded-md border border-[var(--color-brand-border)] bg-white px-3.5 py-2 text-[12.5px] font-semibold text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)]"
            >
              <UploadIcon size={14} />
              Upload more
            </button>
            {activeIsSystem && (
              <span className="text-[11px] text-[var(--color-brand-muted)]">Tap to choose a folder to upload into</span>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function EmptyUploadCTA({ onUpload, dirSupported }: { onUpload: () => void; dirSupported: boolean }) {
  return (
    <div className="mx-6 my-8 flex flex-col items-center gap-3.5 rounded-xl border-2 border-dashed border-[var(--color-brand-outline)] bg-white px-8 py-12 text-center sm:mx-10">
      <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--color-brand-navy-soft)] text-[var(--color-brand-navy)]">
        <UploadIcon size={30} />
      </div>
      <h3 className="text-[20px] font-bold tracking-tight text-[var(--color-brand-ink)]">Upload media to get started</h3>
      <p className="max-w-[480px] text-[14px] leading-relaxed text-[var(--color-brand-muted)]">
        {dirSupported ? (
          <>
            Drop in a folder of photos. We&apos;ll preserve any subfolders so your gallery stays organised by Ceremony,
            Reception, Portraits and so on.
          </>
        ) : (
          <>
            Add photos to this event to get started. Folder uploads that keep your subfolders organised are available
            on desktop.
          </>
        )}
      </p>
      <button
        type="button"
        onClick={onUpload}
        className="brand-focus mt-1.5 inline-flex h-11 items-center gap-2 rounded-lg bg-[var(--color-brand-navy)] px-5 text-[14px] font-semibold text-white hover:bg-[var(--color-brand-navy-deep)]"
      >
        <UploadIcon size={16} />
        {dirSupported ? "Upload media" : "Add photos"}
      </button>
      <div className="mt-1 text-[12px] text-[var(--color-brand-muted)]">JPG · PNG · HEIC · WebP · no size limit</div>
    </div>
  );
}

/* ── mobile folder strip (desktop uses FoldersSidebar) ──────────── */

/**
 * Horizontal, scrollable folder chips shown only below md. Mirrors the
 * FoldersSidebar's switch/add/rename behaviour: tapping the active user folder
 * enters rename (reusing InlineFolderInput); a dashed chip adds a folder. Styled
 * like the Events-page status filter chips.
 */
function MobileFolderStrip({
  folders,
  activeFolderId,
  onSelect,
  onAddFolder,
  onRename,
  disabled,
}: {
  folders: FolderRow[];
  activeFolderId: string;
  onSelect: (id: string) => void;
  onAddFolder: (name: string) => void | Promise<void>;
  onRename: (id: string, name: string) => void | Promise<void>;
  disabled: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState(false);

  return (
    <div className="border-b border-[var(--color-brand-border)] bg-white px-4 py-2.5 md:hidden">
      <div className="flex items-center gap-1.5 overflow-x-auto">
        {folders.map((f) => {
          const selected = f.id === activeFolderId;
          if (selected && renaming && !f.system) {
            return (
              <div
                key={f.id}
                className="flex h-8 shrink-0 items-center rounded-full border border-[var(--color-brand-navy)] bg-white px-2"
              >
                <InlineFolderInput
                  initial={f.label}
                  onCommit={async (name) => {
                    setRenaming(false);
                    const trimmed = name.trim();
                    if (trimmed && trimmed !== f.label) await onRename(f.id, trimmed);
                  }}
                  onCancel={() => setRenaming(false)}
                />
              </div>
            );
          }
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                if (disabled) return;
                // Tapping the already-active user folder switches it into rename.
                if (selected && !f.system) setRenaming(true);
                else onSelect(f.id);
              }}
              aria-pressed={selected}
              className={`brand-focus flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs font-semibold transition-colors ${
                selected
                  ? "border-[var(--color-brand-navy)] bg-[var(--color-brand-navy-soft)] text-[var(--color-brand-navy)]"
                  : "border-[var(--color-brand-border)] bg-[var(--color-brand-surface-raised)] text-[var(--color-brand-muted)] hover:border-[var(--color-brand-outline)]"
              } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
            >
              <span>{f.label}</span>
              <span className="tabular-nums opacity-70">{f.count.toLocaleString("en-IN")}</span>
              {selected && !f.system && <EditIcon size={12} />}
            </button>
          );
        })}

        {adding ? (
          <div className="flex h-8 shrink-0 items-center rounded-full border border-[var(--color-brand-navy)] bg-white px-2">
            <InlineFolderInput
              placeholder="New folder name"
              onCommit={async (name) => {
                setAdding(false);
                if (name.trim()) await onAddFolder(name.trim());
              }}
              onCancel={() => setAdding(false)}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            disabled={disabled}
            className="brand-focus flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-dashed border-[var(--color-brand-border)] px-3 text-xs font-semibold text-[var(--color-brand-muted)] hover:border-[var(--color-brand-outline)] hover:text-[var(--color-brand-ink)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="text-[14px] leading-none">+</span>
            Add folder
          </button>
        )}
      </div>
    </div>
  );
}

function PopulatedBody({
  activeFolderLabel,
  activeIsSystem,
  count,
  folderCount,
  items,
  hasMore,
  loadingMore,
  onLoadMore,
  disabled,
  onDeleteMany,
  onRename,
  notify,
}: {
  activeFolderLabel: string;
  activeIsSystem: boolean;
  count: number;
  folderCount: number;
  items: MediaItem[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  disabled: boolean;
  onDeleteMany: (ids: string[]) => Promise<void>;
  onRename: () => void;
  /** Transient status messages (e.g. download progress). */
  notify?: (msg: string) => void;
}) {
  return (
    <section className="px-6 pb-12 pt-6 sm:px-10">
      <div className="mb-4 flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-baseline">
        <div className="flex flex-wrap items-baseline gap-2.5">
          <h2 className="text-[17px] font-bold tracking-tight text-[var(--color-brand-ink)]">{activeFolderLabel}</h2>
          <span className="text-[12.5px] text-[var(--color-brand-muted)]">
            {count.toLocaleString("en-IN")} photo{count === 1 ? "" : "s"}
            {activeIsSystem && folderCount > 0 && (
              <>
                {" "}
                · across {folderCount} folder{folderCount === 1 ? "" : "s"}
              </>
            )}
          </span>
        </div>
        {!activeIsSystem && (
          <button
            type="button"
            onClick={onRename}
            className="brand-focus inline-flex items-center gap-1.5 rounded-md border border-[var(--color-brand-border)] bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)]"
          >
            <EditIcon size={13} />
            Rename
          </button>
        )}
      </div>
      <MediaGrid
        items={items}
        disabled={disabled}
        onDeleteMany={onDeleteMany}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onLoadMore={onLoadMore}
        archiveName={activeFolderLabel}
        notify={notify}
      />
    </section>
  );
}

function LoadingBody() {
  return (
    <div className="px-6 py-10 sm:px-10">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="skeleton aspect-square rounded" style={{ animationDelay: `${i * 0.05}s` }} />
        ))}
      </div>
    </div>
  );
}

/* ── edit sheet (name + type + date) ────────────────────────────── */

function EditMetaSheet({
  initialName,
  initialType,
  initialDate,
  nameLocked = false,
  onSave,
  onClose,
}: {
  initialName: string;
  initialType: string;
  initialDate: number | null;
  /** True once published — name is immutable to keep the shared link stable. */
  nameLocked?: boolean;
  onSave: (next: { name: string; type: string; eventDate: number | null }) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [type, setType] = useState(initialType);
  const [date, setDate] = useState(initialDate != null ? toDateInput(initialDate) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cardRef = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
    nameRef.current?.select();
    const card = cardRef.current;
    if (!card) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const f = card.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (f.length === 0) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const canSave = name.trim().length > 0 && !saving;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const epoch = date ? new Date(`${date}T00:00:00`).getTime() : NaN;
      await onSave({ name: name.trim(), type, eventDate: Number.isFinite(epoch) ? epoch : null });
    } catch (err) {
      setSaving(false);
      setError(err instanceof Error ? err.message : "Could not save changes");
    }
  }

  return (
    <div
      className="fixed inset-0 z-[55] flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-meta-title"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="drawer-fade absolute inset-0 bg-[var(--color-brand-ink)]/40 backdrop-blur-[1px]"
      />
      <form
        ref={cardRef}
        onSubmit={submit}
        className="dash-rise relative max-h-[90vh] w-full overflow-y-auto rounded-t-2xl border border-[var(--color-brand-border)] bg-white p-5 shadow-[0_-8px_40px_rgba(42,34,24,0.18)] sm:w-full sm:max-w-[460px] sm:rounded-2xl sm:p-6 sm:shadow-[0_18px_50px_rgba(42,34,24,0.18)]"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h3 id="edit-meta-title" className="text-[17px] font-bold tracking-tight text-[var(--color-brand-ink)]">
            Edit event details
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="brand-focus flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--color-brand-muted)] hover:bg-[var(--color-brand-surface)] hover:text-[var(--color-brand-ink)]"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        <label className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--color-brand-ink)]" htmlFor="edit-event-name">
          Event name
          {nameLocked && (
            <span className="inline-flex items-center gap-1 rounded-sm bg-[#F2F0EB] px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[var(--color-brand-muted)]">
              Locked
            </span>
          )}
        </label>
        <input
          id="edit-event-name"
          ref={nameRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={saving || nameLocked}
          title={nameLocked ? "Locked after publishing to keep the shared link stable." : undefined}
          className="brand-focus block w-full rounded-lg border border-[var(--color-brand-border)] bg-white px-3.5 py-2.5 text-[14px] text-[var(--color-brand-ink)] outline-none disabled:cursor-not-allowed disabled:bg-[var(--color-brand-bg)] disabled:text-[var(--color-brand-muted)]"
        />
        {nameLocked && (
          <p className="mt-1.5 text-[11.5px] text-[var(--color-brand-muted)]">
            Locked after publishing so the shared gallery link stays stable.
          </p>
        )}
        <div className="mb-4" />

        <span className="mb-2 block text-[12.5px] font-semibold text-[var(--color-brand-ink)]">Event type</span>
        <div className="mb-4 grid grid-cols-3 gap-2" role="group" aria-label="Event type">
          {EVENT_TYPES.map((t) => {
            const active = t === type;
            return (
              <button
                key={t}
                type="button"
                aria-pressed={active}
                onClick={() => setType(t)}
                disabled={saving}
                className={`brand-focus inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-[13px] transition-colors ${
                  active
                    ? "border border-[var(--color-brand-navy)] bg-[var(--color-brand-navy-soft)] font-semibold text-[var(--color-brand-navy)]"
                    : "border border-[var(--color-brand-border)] bg-white font-medium text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)]"
                }`}
              >
                {active && <CheckIcon size={13} />}
                {t}
              </button>
            );
          })}
        </div>

        <label className="mb-1.5 block text-[12.5px] font-semibold text-[var(--color-brand-ink)]" htmlFor="edit-event-date">
          Event date <span className="font-medium text-[var(--color-brand-muted)]">(optional)</span>
        </label>
        <input
          id="edit-event-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          disabled={saving}
          className="brand-focus block w-full rounded-lg border border-[var(--color-brand-border)] bg-white px-3.5 py-2.5 text-[14px] text-[var(--color-brand-ink)] outline-none"
        />

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-[var(--color-brand-danger)]/30 bg-[var(--color-brand-danger-soft)] px-3 py-2 text-[12.5px] text-[var(--color-brand-danger)]"
          >
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="brand-focus inline-flex h-10 items-center rounded-lg border border-[var(--color-brand-border)] bg-white px-4 text-[13.5px] font-medium text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSave}
            className="brand-focus inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--color-brand-navy)] px-4 text-[13.5px] font-semibold text-white hover:bg-[var(--color-brand-navy-deep)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-[2px] border-white/60 border-t-white" />
                Saving…
              </>
            ) : (
              "Save"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ── pre-upload folder picker ───────────────────────────────────── */

function UploadFolderPicker({
  folders,
  onPickExisting,
  onCreateNew,
  onClose,
}: {
  folders: CustomFolder[];
  onPickExisting: (folder: { id: string; name: string }) => void;
  onCreateNew: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const hasFolders = folders.length > 0;

  return (
    <div
      className="fixed inset-0 z-[55] flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pick-folder-title"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="drawer-fade absolute inset-0 bg-[var(--color-brand-ink)]/40 backdrop-blur-[1px]"
      />
      <div className="dash-rise relative max-h-[90vh] w-full overflow-y-auto rounded-t-2xl border border-[var(--color-brand-border)] bg-white p-5 shadow-[0_-8px_40px_rgba(42,34,24,0.18)] sm:w-full sm:max-w-[460px] sm:rounded-2xl sm:p-6 sm:shadow-[0_18px_50px_rgba(42,34,24,0.18)]">
        <div className="mb-1 flex items-start justify-between gap-4">
          <h3 id="pick-folder-title" className="text-[17px] font-bold tracking-tight text-[var(--color-brand-ink)]">
            Select Existing Folder
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="brand-focus flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--color-brand-muted)] hover:bg-[var(--color-brand-surface)] hover:text-[var(--color-brand-ink)]"
          >
            <CloseIcon size={16} />
          </button>
        </div>
        <p className="mb-4 text-[12.5px] text-[var(--color-brand-muted)]">
          Photos will go straight into the folder you pick — no subfolder sorting.
        </p>

        {hasFolders ? (
          <div className="flex flex-wrap gap-2">
            {folders.map((f) => (
              <button
                key={f._id}
                type="button"
                onClick={() => onPickExisting({ id: f._id, name: f.name })}
                className="brand-focus inline-flex items-center gap-1.5 rounded-full border border-[var(--color-brand-border)] bg-white px-3 py-1.5 text-[12.5px] font-medium text-[var(--color-brand-ink)] hover:border-[var(--color-brand-navy)] hover:bg-[var(--color-brand-navy-soft)]"
              >
                <FolderMiniIcon size={13} />
                {f.name}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-[12.5px] text-[var(--color-brand-muted)]">
            No folders yet — upload a new one below.
          </p>
        )}

        {/* Or ── divider */}
        <div className="my-4 flex items-center gap-3">
          <span className="h-px flex-1 bg-[var(--color-brand-border)]" />
          <span className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-[var(--color-brand-muted)]">
            Or
          </span>
          <span className="h-px flex-1 bg-[var(--color-brand-border)]" />
        </div>

        <button
          type="button"
          onClick={onCreateNew}
          className="brand-focus inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-brand-navy)] px-4 text-[13.5px] font-semibold text-white hover:bg-[var(--color-brand-navy-deep)]"
        >
          <UploadIcon size={16} />
          Upload new folder
        </button>
      </div>
    </div>
  );
}

/* ── tiny icons + helpers ───────────────────────────────────────── */

function formatDate(epoch: number): string {
  const d = new Date(epoch);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function toDateInput(epoch: number): string {
  const d = new Date(epoch);
  if (isNaN(d.getTime())) return "";
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function CheckIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="5 12 10 17 19 7" />
    </svg>
  );
}

function CloseIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="6" y1="18" x2="18" y2="6" />
    </svg>
  );
}

function FolderMiniIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-brand-muted)]">
      <path d="M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
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

function EditIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4l4 4-11 11H5v-4z" />
      <line x1="13" y1="7" x2="17" y2="11" />
    </svg>
  );
}

function WarnIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l10 18H2L12 3z" />
      <line x1="12" y1="10" x2="12" y2="14" />
      <circle cx="12" cy="17" r=".6" fill="currentColor" />
    </svg>
  );
}
