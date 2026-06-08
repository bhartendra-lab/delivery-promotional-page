"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createCustomFolder,
  getBookingById,
  getMedia,
  updateBooking,
  updateCustomFolder,
} from "@/lib/api";
import { BOOKING_EVENT_TYPES, type BookingDetail, type CustomFolder, type MediaItem } from "@/lib/types";
import { FoldersSidebar, type FolderRow } from "@/components/dashboard/FoldersSidebar";
import {
  usePageBreadcrumb,
  usePageLock,
} from "@/components/dashboard/ChromeContext";
import { UploadModal } from "./UploadModal";
import { UploadProgress } from "./UploadProgress";
import { MediaGrid } from "./MediaGrid";
import { useUploadEngine } from "./useUploadEngine";

const ALL_MEDIA_ID = "__all__";

type EventMeta = {
  name: string;
  type: string;
  createdAt: string;
};

function normalizeMeta(b: BookingDetail): EventMeta {
  return {
    name: b.event_name ?? b.lead?.name ?? "Untitled event",
    type: b.event_type ?? b.events?.[0]?.event_type ?? "Event",
    createdAt: b.createdAt ?? new Date().toISOString(),
  };
}

export function EventPageClient({ bookingId }: { bookingId: string }) {
  const [meta, setMeta] = useState<EventMeta | null>(null);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [folders, setFolders] = useState<CustomFolder[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string>(ALL_MEDIA_ID);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadTarget, setUploadTarget] = useState<{ id: string; name: string } | null>(null);
  const [prePickerOpen, setPrePickerOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const engine = useUploadEngine(bookingId);

  // Canonical event metadata: hydrate from the localStorage cache first (offline
  // resilience), then fetch the authoritative copy from the API. The cache is
  // a fallback only — never the primary source.
  useEffect(() => {
    let alive = true;
    try {
      const raw = localStorage.getItem(`event_meta_${bookingId}`);
      if (raw) setMeta(JSON.parse(raw) as EventMeta);
    } catch {
      /* ignore */
    }
    getBookingById(bookingId)
      .then((res) => {
        if (!alive) return;
        const next = normalizeMeta(res.booking);
        setMeta(next);
        try {
          localStorage.setItem(`event_meta_${bookingId}`, JSON.stringify(next));
        } catch {
          /* ignore */
        }
      })
      .catch(() => {
        /* keep whatever the cache gave us */
      });
    return () => {
      alive = false;
    };
  }, [bookingId]);

  // Auto-dismiss the success toast.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  // Fetch media + folders on mount + after uploads finish
  const reload = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await getMedia(bookingId);
      setMedia(res.media ?? []);
      setFolders(res.customFolders ?? []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load event");
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // After the engine finishes a run (upload + metadata save), pull canonical
  // state. We watch the FALLING edge of "engineActive" so we don't double-fetch
  // on initial mount (where the active flag starts false). Keying off the
  // current `photosDone` would be unreliable — the engine briefly returns to
  // zero state at the end of a successful save.
  const wasEngineActiveRef = useRef(false);
  useEffect(() => {
    const isActive = engine.progress.isUploading || engine.progress.isSavingMetadata;
    if (wasEngineActiveRef.current && !isActive) {
      void reload();
    }
    wasEngineActiveRef.current = isActive;
  }, [engine.progress.isUploading, engine.progress.isSavingMetadata, reload]);

  // Live update: while uploading, prepend the latest media optimistically
  // (the engine emits one URL+folder per success).
  useEffect(() => {
    engine.onMediaUploaded((url, customFolderId) => {
      setMedia((prev) => [
        {
          _id: `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          url,
          type: "image",
          booking_id: bookingId,
          custom_folder_ids: [customFolderId],
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
    });
    return () => engine.onMediaUploaded(null);
  }, [engine, bookingId]);

  // Lock + breadcrumb sync with chrome
  usePageLock(engine.progress.isUploading || engine.progress.isSavingMetadata);
  usePageBreadcrumb([
    { label: "Events", href: "/dashboard/events" },
    { label: meta?.name ?? "Event" },
  ]);

  // Derived: folder rows for the sidebar
  const folderRows: FolderRow[] = useMemo(() => {
    if (folders.length === 0) return [];
    const allRow: FolderRow = {
      id: ALL_MEDIA_ID,
      label: "All Media",
      count: media.length,
      system: true,
    };
    const userRows: FolderRow[] = folders.map((f) => ({
      id: f._id,
      label: f.name,
      count: media.filter((m) => m.custom_folder_ids?.includes(f._id)).length,
    }));
    return [allRow, ...userRows];
  }, [folders, media]);

  const filteredMedia = useMemo(() => {
    if (activeFolderId === ALL_MEDIA_ID) return media;
    return media.filter((m) => m.custom_folder_ids?.includes(activeFolderId));
  }, [media, activeFolderId]);

  const activeFolderLabel =
    activeFolderId === ALL_MEDIA_ID
      ? "All Media"
      : folders.find((f) => f._id === activeFolderId)?.name ?? "Folder";
  const activeIsSystem = activeFolderId === ALL_MEDIA_ID;

  // State machine
  const engineActive = engine.progress.isUploading || engine.progress.isSavingMetadata;
  const state: "loading" | "uploading" | "populated" | "empty" = loading
    ? "loading"
    : engineActive
    ? "uploading"
    : media.length > 0
    ? "populated"
    : "empty";

  // Folder rename
  const handleRename = useCallback(
    async (folderId: string, name: string) => {
      try {
        await updateCustomFolder(folderId, name);
        setFolders((prev) => prev.map((f) => (f._id === folderId ? { ...f, name } : f)));
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Could not rename folder");
      }
    },
    [],
  );

  const handleAddFolder = useCallback(
    async (name: string) => {
      try {
        const res = await createCustomFolder(bookingId, name);
        const newFolder: CustomFolder = {
          _id: res.custom_folder_id,
          name,
          booking_id: bookingId,
          createdAt: new Date().toISOString(),
        };
        setFolders((prev) => [...prev, newFolder]);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Could not create folder");
      }
    },
    [bookingId],
  );

  // "Upload more" — when All Media is active, ask which folder first; when a
  // specific folder is active, go straight into single-folder upload (§6).
  const handleUploadMore = useCallback(() => {
    if (activeFolderId === ALL_MEDIA_ID) {
      setPrePickerOpen(true);
    } else {
      setUploadTarget({ id: activeFolderId, name: activeFolderLabel });
      setUploadModalOpen(true);
    }
  }, [activeFolderId, activeFolderLabel]);

  // Empty-state / bulk upload — full folder-structure parsing, no fixed target.
  const handleBulkUpload = useCallback(() => {
    setUploadTarget(null);
    setUploadModalOpen(true);
  }, []);

  const pickExistingTarget = useCallback((folder: { id: string; name: string }) => {
    setPrePickerOpen(false);
    setUploadTarget({ id: folder.id, name: folder.name });
    setUploadModalOpen(true);
  }, []);

  const pickNewTarget = useCallback(
    async (name: string) => {
      try {
        const res = await createCustomFolder(bookingId, name);
        const newFolder: CustomFolder = {
          _id: res.custom_folder_id,
          name,
          booking_id: bookingId,
          createdAt: new Date().toISOString(),
        };
        setFolders((prev) => [...prev, newFolder]);
        setPrePickerOpen(false);
        setUploadTarget({ id: res.custom_folder_id, name });
        setUploadModalOpen(true);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Could not create folder");
      }
    },
    [bookingId],
  );

  const handleSaveMeta = useCallback(
    async (next: { name: string; type: string }) => {
      const optimistic: EventMeta = {
        name: next.name,
        type: next.type,
        createdAt: meta?.createdAt ?? new Date().toISOString(),
      };
      await updateBooking(bookingId, { event_name: next.name, event_type: next.type });
      setMeta(optimistic);
      try {
        localStorage.setItem(`event_meta_${bookingId}`, JSON.stringify(optimistic));
      } catch {
        /* ignore */
      }
      setEditOpen(false);
      setToast("Event details saved");
    },
    [bookingId, meta?.createdAt],
  );

  return (
    <div className="flex items-stretch">
      <FoldersSidebar
        folders={folderRows}
        activeFolderId={activeFolderId}
        onSelect={engineActive ? () => {} : setActiveFolderId}
        onRename={handleRename}
        onAddFolder={folderRows.length > 0 ? handleAddFolder : undefined}
        disabled={engineActive}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {engineActive && (
          <div className="flex items-center gap-2 border-b border-[var(--color-brand-warning)]/30 bg-[var(--color-brand-warning-soft)] px-6 py-2 text-[12.5px] font-medium text-[var(--color-brand-warning)] sm:px-10">
            <WarnIcon size={14} />
            Upload in progress — please keep this tab open.
          </div>
        )}

        {/* Persistent metadata-save retry banner — survives reload */}
        {!engineActive && engine.progress.metadataSaveError && (
          <div className="flex items-center justify-between gap-3 border-b border-[var(--color-brand-danger)]/30 bg-[var(--color-brand-danger-soft)] px-6 py-2 text-[12.5px] text-[var(--color-brand-danger)] sm:px-10">
            <span>
              All photos uploaded, but saving metadata failed: {engine.progress.metadataSaveError}
            </span>
            <button
              type="button"
              onClick={() => void engine.retryMetadataSave()}
              className="brand-focus rounded-md border border-[var(--color-brand-danger)]/30 bg-white px-2.5 py-1 text-[12px] font-semibold text-[var(--color-brand-danger)]"
            >
              Retry save
            </button>
          </div>
        )}

        <CoverBanner filled={state === "populated" || state === "uploading"} />

        <EventHeader
          meta={meta}
          totalPhotos={media.length}
          folderCount={folders.length}
          uploadingTotal={engine.progress.photosTotal}
          uploadingFoldersCount={engine.progress.folders.length}
          state={state}
          activeIsAllMedia={activeFolderId === ALL_MEDIA_ID}
          onUploadMore={handleUploadMore}
          onEdit={() => setEditOpen(true)}
        />

        {loadError && (
          <div role="alert" className="mx-6 my-4 rounded-lg border border-[var(--color-brand-danger)]/30 bg-[var(--color-brand-danger-soft)] px-4 py-3 text-[13px] text-[var(--color-brand-danger)] sm:mx-10">
            {loadError}
          </div>
        )}

        {state === "loading" && <LoadingBody />}
        {state === "empty" && <EmptyUploadCTA onUpload={handleBulkUpload} />}
        {state === "uploading" && (
          <UploadProgress
            progress={engine.progress}
            failed={engine.failed}
            onCancel={engine.cancelUpload}
            onRetryFailed={handleBulkUpload}
            onRetryMetadata={() => void engine.retryMetadataSave()}
          />
        )}
        {state === "populated" && (
          <PopulatedBody
            activeFolderLabel={activeFolderLabel}
            activeIsSystem={activeIsSystem}
            count={filteredMedia.length}
            folderCount={folders.length}
            items={filteredMedia}
            onRename={() => {
              if (!activeIsSystem) {
                // Trigger rename in sidebar via simulating click — simplest:
                // surface a small inline prompt here. Keep UI minimal.
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
        }}
        targetFolderId={uploadTarget?.id}
        targetFolderName={uploadTarget?.name}
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
            });
          }
        }}
      />

      {prePickerOpen && (
        <UploadFolderPicker
          folders={folders}
          onPickExisting={pickExistingTarget}
          onCreate={pickNewTarget}
          onClose={() => setPrePickerOpen(false)}
        />
      )}

      {editOpen && (
        <EditMetaSheet
          initialName={meta?.name ?? ""}
          initialType={meta?.type ?? "Wedding"}
          onSave={handleSaveMeta}
          onClose={() => setEditOpen(false)}
        />
      )}

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4">
          <div className="toast-rise pointer-events-auto inline-flex items-center gap-2 rounded-lg bg-[var(--color-brand-ink)] px-4 py-2.5 text-[13px] font-semibold text-white shadow-[0_8px_24px_rgba(42,34,24,0.25)]">
            <CheckIcon size={15} />
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────────── */

function CoverBanner({ filled }: { filled: boolean }) {
  const height = filled ? 240 : 140;
  return (
    <div
      className="relative w-full overflow-hidden"
      style={{
        height,
        backgroundImage: filled
          ? "repeating-linear-gradient(45deg, #C9AFA0 0 18px, #9E8475 18px 36px)"
          : "repeating-linear-gradient(45deg, #ECE4D6 0 14px, #DDD4C4 14px 28px)",
      }}
    >
      {filled && (
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(to bottom, rgba(42,34,24,0) 50%, rgba(42,34,24,0.35) 100%)" }}
        />
      )}
      <div className="absolute right-6 top-4">
        <button
          type="button"
          className="brand-focus inline-flex items-center gap-1.5 rounded-md border border-[var(--color-brand-border)] bg-white/90 px-3 py-1.5 text-[12.5px] font-semibold text-[var(--color-brand-ink)] backdrop-blur-sm hover:bg-white"
          title="Cover photo upload coming soon"
        >
          <ImageIcon size={14} className="text-[var(--color-brand-muted)]" />
          {filled ? "Change cover" : "Add cover photo"}
        </button>
      </div>
    </div>
  );
}

function EventHeader({
  meta,
  totalPhotos,
  folderCount,
  uploadingTotal,
  uploadingFoldersCount,
  state,
  activeIsAllMedia,
  onUploadMore,
  onEdit,
}: {
  meta: EventMeta | null;
  totalPhotos: number;
  folderCount: number;
  uploadingTotal: number;
  uploadingFoldersCount: number;
  state: "loading" | "uploading" | "populated" | "empty";
  activeIsAllMedia: boolean;
  onUploadMore: () => void;
  onEdit: () => void;
}) {
  const eventType = meta?.type ?? "Event";
  const eventName = meta?.name ?? "Untitled event";

  let subtitle = "No photos uploaded yet";
  if (state === "loading") subtitle = "Loading…";
  else if (state === "uploading") {
    subtitle = `Importing ${uploadingTotal.toLocaleString("en-IN")} photos · ${uploadingFoldersCount} folders detected`;
  } else if (state === "populated") {
    subtitle = `${totalPhotos.toLocaleString("en-IN")} photo${totalPhotos === 1 ? "" : "s"} across ${folderCount} folder${folderCount === 1 ? "" : "s"}`;
  }

  return (
    <section className="flex flex-col items-start justify-between gap-4 border-b border-[var(--color-brand-border)] px-6 py-6 sm:flex-row sm:px-10">
      <div>
        <div className="mb-1.5 flex flex-wrap items-center gap-2.5">
          <span className="rounded-sm bg-[var(--color-brand-navy-soft)] px-2 py-[3px] text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--color-brand-navy)]">
            {eventType}
          </span>
          {meta?.createdAt && (
            <span className="text-[12.5px] text-[var(--color-brand-muted)]">
              Created {formatDate(meta.createdAt)}
            </span>
          )}
          {state === "uploading" && (
            <span className="brand-blink inline-flex items-center gap-1.5 rounded-sm bg-[var(--color-brand-navy-soft)] px-2 py-[3px] text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--color-brand-navy)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-brand-navy)]" />
              Uploading
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <h1 className="text-[30px] font-bold leading-tight tracking-tight text-[var(--color-brand-ink)]">
            {eventName}
          </h1>
          {state !== "loading" && (
            <button
              type="button"
              onClick={onEdit}
              aria-label="Edit event name and type"
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
            {activeIsAllMedia && (
              <span className="text-[11px] text-[var(--color-brand-muted)]">
                All Media — tap to choose folder first
              </span>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function EmptyUploadCTA({ onUpload }: { onUpload: () => void }) {
  return (
    <div className="mx-6 my-8 flex flex-col items-center gap-3.5 rounded-xl border-2 border-dashed border-[var(--color-brand-outline)] bg-white px-8 py-12 text-center sm:mx-10">
      <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--color-brand-navy-soft)] text-[var(--color-brand-navy)]">
        <UploadIcon size={30} />
      </div>
      <h3 className="text-[20px] font-bold tracking-tight text-[var(--color-brand-ink)]">
        Upload media to get started
      </h3>
      <p className="max-w-[480px] text-[14px] leading-relaxed text-[var(--color-brand-muted)]">
        Drop in a folder of photos. We&apos;ll preserve any subfolders so your gallery stays organised by Ceremony,
        Reception, Portraits and so on.
      </p>
      <button
        type="button"
        onClick={onUpload}
        className="brand-focus mt-1.5 inline-flex h-11 items-center gap-2 rounded-lg bg-[var(--color-brand-navy)] px-5 text-[14px] font-semibold text-white hover:bg-[var(--color-brand-navy-deep)]"
      >
        <UploadIcon size={16} />
        Upload media
      </button>
      <div className="mt-1 text-[12px] text-[var(--color-brand-muted)]">
        JPG · PNG · HEIC · WebP · no size limit
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
  onRename,
}: {
  activeFolderLabel: string;
  activeIsSystem: boolean;
  count: number;
  folderCount: number;
  items: MediaItem[];
  onRename: () => void;
}) {
  return (
    <section className="px-6 pb-12 pt-6 sm:px-10">
      <div className="mb-4 flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-baseline">
        <div className="flex flex-wrap items-baseline gap-2.5">
          <h2 className="text-[17px] font-bold tracking-tight text-[var(--color-brand-ink)]">
            {activeFolderLabel}
          </h2>
          <span className="text-[12.5px] text-[var(--color-brand-muted)]">
            {count.toLocaleString("en-IN")} photo{count === 1 ? "" : "s"}
            {activeIsSystem && folderCount > 0 && (
              <> · across {folderCount} folder{folderCount === 1 ? "" : "s"}</>
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
      <MediaGrid items={items} />
    </section>
  );
}

function LoadingBody() {
  return (
    <div className="px-6 py-10 sm:px-10">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="skeleton aspect-square rounded"
            style={{ animationDelay: `${i * 0.05}s` }}
          />
        ))}
      </div>
    </div>
  );
}

/* ── §3 inline edit sheet (name + type) ────────────────────────── */

function EditMetaSheet({
  initialName,
  initialType,
  onSave,
  onClose,
}: {
  initialName: string;
  initialType: string;
  onSave: (next: { name: string; type: string }) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [type, setType] = useState(initialType);
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
      await onSave({ name: name.trim(), type });
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

        <label className="mb-1.5 block text-[12.5px] font-semibold text-[var(--color-brand-ink)]" htmlFor="edit-event-name">
          Event name
        </label>
        <input
          id="edit-event-name"
          ref={nameRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={saving}
          className="brand-focus mb-4 block w-full rounded-lg border border-[var(--color-brand-border)] bg-white px-3.5 py-2.5 text-[14px] text-[var(--color-brand-ink)] outline-none"
        />

        <span className="mb-2 block text-[12.5px] font-semibold text-[var(--color-brand-ink)]">Event type</span>
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="Event type">
          {BOOKING_EVENT_TYPES.map((t) => {
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

        {error && (
          <p role="alert" className="mt-4 rounded-lg border border-[var(--color-brand-danger)]/30 bg-[var(--color-brand-danger-soft)] px-3 py-2 text-[12.5px] text-[var(--color-brand-danger)]">
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

/* ── §6 pre-upload folder picker (All Media) ───────────────────── */

function UploadFolderPicker({
  folders,
  onPickExisting,
  onCreate,
  onClose,
}: {
  folders: CustomFolder[];
  onPickExisting: (folder: { id: string; name: string }) => void;
  onCreate: (name: string) => void;
  onClose: () => void;
}) {
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

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
            Upload to which folder?
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

        {folders.length > 0 && (
          <div className="mb-4">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-brand-muted)]">
              Existing folder
            </div>
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
          </div>
        )}

        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-brand-muted)]">
            New folder
          </div>
          <div className="flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newName.trim() && !creating) {
                  e.preventDefault();
                  setCreating(true);
                  onCreate(newName.trim());
                }
              }}
              placeholder="e.g. Reception"
              aria-label="New folder name"
              disabled={creating}
              className="brand-focus h-10 min-w-0 flex-1 rounded-lg border border-[var(--color-brand-border)] bg-white px-3 text-[13.5px] text-[var(--color-brand-ink)] outline-none placeholder:text-[var(--color-brand-muted)]/70"
            />
            <button
              type="button"
              disabled={!newName.trim() || creating}
              onClick={() => {
                setCreating(true);
                onCreate(newName.trim());
              }}
              className="brand-focus inline-flex h-10 shrink-0 items-center rounded-lg bg-[var(--color-brand-navy)] px-4 text-[13.5px] font-semibold text-white hover:bg-[var(--color-brand-navy-deep)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Create &amp; upload
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── tiny inline icons ─────────────────────────────────────────── */

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

function ImageIcon({ size, className }: { size: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="4" width="18" height="16" rx="1.5" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="M3 17l5-5 4 4 3-3 6 6" />
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

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
