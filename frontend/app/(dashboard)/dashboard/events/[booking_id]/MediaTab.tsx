"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, createCustomFolder, deleteCustomFolder, reorderCustomFolders, updateCustomFolder } from "@/lib/api";
import { EVENT_TYPES, type CustomFolder, type MediaItem } from "@/lib/types";
import { FoldersSidebar, InlineFolderInput, type FolderRow } from "@/components/dashboard/FoldersSidebar";
import { UploadModal, type UploadFolderOption, type UploadModalStep } from "./UploadModal";
import { UploadProgress } from "./UploadProgress";
import { MediaGrid } from "./MediaGrid";
import { CoverBanner } from "./CoverBanner";
import { CoverPositionModal } from "./CoverPositionModal";
import { useEvent, ALL_MEDIA_ID } from "./EventContext";
import { SortDropdown } from "./SortDropdown";
import { WatermarkReminderDialog } from "./WatermarkReminderDialog";
import { useReminders } from "@/components/dashboard/RemindersProvider";
import { IconCheck, IconX, IconUpload, IconEdit, IconWarning } from "./icons";

/** An upload dialog opening awaiting confirmation, stashed while the watermark reminder is up. */
type UploadIntent = { step: UploadModalStep; target: UploadFolderOption | null; folderOnly: boolean };

/** A cover pick awaiting position adjustment in `CoverPositionModal` before it's persisted. */
type PendingCover = { kind: "file"; file: File; previewUrl: string } | { kind: "existing"; url: string };

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
    mediaSort,
    setMediaSort,
    folderCounts,
    totalCount,
    totalForView,
    hasMore,
    loadingMore,
    loadMore,
    engine,
    activeLocked,
    pauseUpload,
    publishedEver,
    saveMeta,
    coverBusy,
    setCoverFromUrl,
    setCoverFromFile,
    setCoverPosition,
    deleteMediaIds,
    toast,
  } = useEvent();

  // One upload dialog for the whole flow. `uploadIntent` is only the state it
  // opens on — the dialog owns every step after that (destination picker →
  // file selection) internally, so switching steps never unmounts it.
  const [uploadIntent, setUploadIntent] = useState<UploadIntent | null>(null);
  // An intent stashed behind the watermark reminder — set instead of
  // `uploadIntent` when the reminder should show first; committed to
  // `uploadIntent` on Skip so the studio still lands where it asked to go.
  // Cleared on every Skip; the next upload attempt re-checks `reminderStatus`
  // fresh, so it stashes (and nags) again unless "Don't show this again" was
  // checked, which persists the dismiss server-side.
  const [pendingUploadIntent, setPendingUploadIntent] = useState<UploadIntent | null>(null);
  const { status: reminderStatus } = useReminders();
  // Directory (folder) uploads need <input webkitdirectory>, which mobile
  // browsers don't support — steer those to the plain multi-file picker.
  const [dirSupported] = useState(
    () => typeof document === "undefined" || "webkitdirectory" in document.createElement("input"),
  );
  const [editOpen, setEditOpen] = useState(false);
  /** Set once a cancelled run has fully settled — drives the summary card. */
  const [cancelSummary, setCancelSummary] = useState<{ saved: number } | null>(null);
  // A cover pick (upload or "Set as cover photo") parked here until the studio
  // confirms its position in `CoverPositionModal` — nothing is persisted until then.
  const [pendingCover, setPendingCover] = useState<PendingCover | null>(null);

  const paused = engine.progress.paused;
  const engineActive = engine.progress.isUploading || engine.progress.isSavingMetadata;
  // "populated" vs "empty" is event-level (does the booking have any media),
  // not view-level — an empty folder still shows the populated chrome with an
  // empty grid, mirroring the prior behaviour. This follows the engine alone:
  // the storage recalculation that used to hold it here has nothing to do with
  // whether the upload is over, and waiting on it made pause/cancel feel slow.
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
      visibility: f.visibility,
    }));
    return [allRow, ...userRows];
  }, [folders, totalCount, folderCounts]);

  /** Destination options for the upload dialog's picker step. */
  const uploadFolderOptions: UploadFolderOption[] = useMemo(
    () => folders.map((f) => ({ id: f._id, name: f.name })),
    [folders],
  );

  const activeFolderLabel =
    activeFolderId === ALL_MEDIA_ID
      ? "All Media"
      : folders.find((f) => f._id === activeFolderId)?.name ?? "Folder";
  const activeIsSystem = activeFolderId === ALL_MEDIA_ID;

  const handleRename = useCallback(
    async (folderId: string, name: string) => {
      try {
        await updateCustomFolder(folderId, { name });
        setFolders((prev) => prev.map((f) => (f._id === folderId ? { ...f, name } : f)));
      } catch (err) {
        toast(err instanceof Error ? err.message : "Could not rename folder", "error");
      }
    },
    [setFolders, toast],
  );

  // Folder create needs the bookingId — read it from context.
  const bookingId = ctxBookingId;

  /**
   * Create a folder and merge it into the sidebar list. Returns the folder so
   * callers that need to act on it next (the upload dialog's "+ New folder"
   * chip, which drops straight into uploading to it) don't have to re-find it;
   * null means the create failed and the error has already been toasted.
   */
  const createFolder = useCallback(
    async (name: string): Promise<UploadFolderOption | null> => {
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
        return { id: res.custom_folder_id, name };
      } catch (err) {
        toast(err instanceof Error ? err.message : "Could not create folder", "error");
        return null;
      }
    },
    [bookingId, setFolders, toast],
  );

  const addFolder = useCallback(
    async (name: string) => {
      await createFolder(name);
    },
    [createFolder],
  );

  const handleDeleteFolder = useCallback(
    async (folderId: string) => {
      try {
        await deleteCustomFolder(folderId);
        setFolders((prev) => prev.filter((f) => f._id !== folderId));
        if (activeFolderId === folderId) setActiveFolder(ALL_MEDIA_ID);
      } catch (err) {
        if (err instanceof ApiError && err.status === 400) {
          const count = (err.body as { mediaCount?: number } | null)?.mediaCount;
          toast(
            typeof count === "number"
              ? `This folder has ${count.toLocaleString("en-IN")} photo${count === 1 ? "" : "s"} — remove them first.`
              : "This folder isn't empty — remove its photos first.",
            "error",
          );
        } else {
          toast(err instanceof Error ? err.message : "Could not delete folder", "error");
        }
      }
    },
    [activeFolderId, setActiveFolder, setFolders, toast],
  );

  // Drag-and-drop reorder: apply the new order immediately (dnd-kit already
  // reflects it visually mid-drag) and revert only if the persist call fails.
  const handleReorderFolders = useCallback(
    async (orderedIds: string[]) => {
      const prevFolders = folders;
      const byId = new Map(prevFolders.map((f) => [f._id, f]));
      const reordered = orderedIds
        .map((id) => byId.get(id))
        .filter((f): f is CustomFolder => Boolean(f));
      setFolders(reordered);
      try {
        await reorderCustomFolders(bookingId, orderedIds);
      } catch (err) {
        setFolders(prevFolders);
        toast(err instanceof Error ? err.message : "Could not save folder order", "error");
      }
    },
    [bookingId, folders, setFolders, toast],
  );

  // "Highlights": toggle a folder's public/private visibility (kebab menu).
  // Optimistic, matching the delete/reorder pattern above.
  const handleToggleVisibility = useCallback(
    async (folderId: string) => {
      const current = folders.find((f) => f._id === folderId);
      if (!current) return;
      const next: "private" | "public" = current.visibility === "public" ? "private" : "public";
      setFolders((prev) => prev.map((f) => (f._id === folderId ? { ...f, visibility: next } : f)));
      try {
        await updateCustomFolder(folderId, { visibility: next });
      } catch (err) {
        setFolders((prev) =>
          prev.map((f) => (f._id === folderId ? { ...f, visibility: current.visibility } : f)),
        );
        toast(
          err instanceof Error
            ? err.message
            : next === "public"
            ? "Could not make folder public"
            : "Could not remove folder from Highlights",
          "error",
        );
      }
    },
    [folders, setFolders, toast],
  );

  // A new file was picked as the cover — park it for position adjustment
  // instead of uploading/persisting right away.
  const pickCoverFile = useCallback((file: File) => {
    setPendingCover({ kind: "file", file, previewUrl: URL.createObjectURL(file) });
  }, []);

  // "Set as cover photo" from the grid — same parking, no upload needed since
  // the image is already on R2.
  const pickCoverFromMedia = useCallback((item: MediaItem) => {
    setPendingCover({ kind: "existing", url: item.url });
  }, []);

  const closePendingCover = useCallback(() => {
    setPendingCover((prev) => {
      if (prev?.kind === "file") URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
  }, []);

  const confirmPendingCover = useCallback(
    async (position: string) => {
      if (!pendingCover) return;
      if (pendingCover.kind === "file") {
        await setCoverFromFile(pendingCover.file, position);
        URL.revokeObjectURL(pendingCover.previewUrl);
      } else {
        await setCoverFromUrl(pendingCover.url, position);
      }
      setPendingCover(null);
    },
    [pendingCover, setCoverFromFile, setCoverFromUrl],
  );

  // Both entry points route through this: while `reminderStatus.watermark.
  // should_show` is true, the intent is stashed instead of opened directly
  // and the reminder dialog takes over — Skip commits it straight into the
  // upload modal. `should_show` is `!complete && dismissed_at == null`
  // server-side, so this repeats on every upload attempt until either a
  // preset exists or the studio checks "Don't show this again".
  const openUpload = useCallback(
    (intent: UploadIntent) => {
      if (reminderStatus?.watermark.should_show) {
        setPendingUploadIntent(intent);
      } else {
        setUploadIntent(intent);
      }
    },
    [reminderStatus],
  );

  const handleUploadMore = useCallback(() => {
    // System views (All Media / Liked Media) aren't real upload targets — open
    // on the destination step. A real folder tab uploads straight into it.
    openUpload(
      activeIsSystem
        ? { step: "picker", target: null, folderOnly: false }
        : { step: "select", target: { id: activeFolderId, name: activeFolderLabel }, folderOnly: false },
    );
  }, [activeIsSystem, activeFolderId, activeFolderLabel, openUpload]);

  // First upload for the event (empty state): no folders exist yet, so go
  // straight to picking — folders are created by name at upload time.
  const handleBulkUpload = useCallback(() => {
    openUpload({ step: "select", target: null, folderOnly: false });
  }, [openUpload]);

  const handleWatermarkReminderSkip = useCallback(() => {
    if (pendingUploadIntent) setUploadIntent(pendingUploadIntent);
    setPendingUploadIntent(null);
  }, [pendingUploadIntent]);

  const closeUploadModal = useCallback(() => setUploadIntent(null), []);

  // Cancel, then tell the studio exactly where it landed. `savedCount` comes
  // from the engine and counts only photos whose metadata save confirmed — a
  // create-media batch that failed on the way out is not "delivered".
  const handleCancelUpload = useCallback(async () => {
    const { savedCount } = await engine.cancelUpload();
    setCancelSummary({ saved: savedCount });
  }, [engine]);

  // Folders and media scroll independently. When the cursor is over the
  // folders column and it has no (more) room to scroll in the wheel's
  // direction, forward the delta to the media column instead of letting the
  // event die (or bubble past both, to the page).
  const foldersElRef = useRef<HTMLElement | null>(null);
  const mediaScrollRef = useRef<HTMLDivElement | null>(null);
  const handleFoldersWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const folders = foldersElRef.current;
    const mediaEl = mediaScrollRef.current;
    if (!folders || !mediaEl) return;
    const scrollingDown = e.deltaY > 0;
    const atTop = folders.scrollTop <= 0;
    const atBottom = folders.scrollTop + folders.clientHeight >= folders.scrollHeight - 1;
    const foldersCanAbsorb =
      folders.scrollHeight > folders.clientHeight && ((scrollingDown && !atBottom) || (!scrollingDown && !atTop));
    if (!foldersCanAbsorb) {
      e.preventDefault();
      mediaEl.scrollTop += e.deltaY;
    }
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-1 items-stretch overflow-hidden">
      <div className="flex h-full shrink-0" onWheel={handleFoldersWheel}>
        <FoldersSidebar
          folders={folderRows}
          activeFolderId={activeFolderId}
          onSelect={setActiveFolder}
          onRename={handleRename}
          onAddFolder={folderRows.length > 0 ? addFolder : undefined}
          onDelete={handleDeleteFolder}
          onReorder={handleReorderFolders}
          onToggleVisibility={handleToggleVisibility}
          disabled={activeLocked}
          scrollRef={foldersElRef}
        />
      </div>

      <div ref={mediaScrollRef} className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        {activeLocked && (
          <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-brand-warning)]/30 bg-[var(--color-brand-warning-soft)] px-6 py-2 text-[12.5px] font-medium text-[var(--color-brand-warning)] sm:px-10">
            <IconWarning size={14} />
            Uploading — carry on working anywhere in the studio, just keep this tab open. Folder edits
            wait until it&apos;s done.
          </div>
        )}

        {state === "populated" && (
          <CoverBanner
            coverUrl={meta.backgroundImage}
            coverPosition={meta.backgroundPosition}
            busy={coverBusy}
            disabled={activeLocked}
            onSetFromFile={pickCoverFile}
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
            onSelect={setActiveFolder}
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
            onCancel={handleCancelUpload}
            onTogglePause={() => (paused ? engine.resume() : pauseUpload())}
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
            coverUrl={meta.backgroundImage}
            onSetCover={pickCoverFromMedia}
            notify={toast}
            onRename={() => {
              if (!activeIsSystem) {
                const next = window.prompt("Rename folder", activeFolderLabel);
                if (next && next.trim() && next.trim() !== activeFolderLabel) {
                  void handleRename(activeFolderId, next.trim());
                }
              }
            }}
            mediaSort={mediaSort}
            onSortChange={setMediaSort}
          />
        )}
      </div>

      <UploadModal
        open={!!uploadIntent}
        onClose={closeUploadModal}
        initialStep={uploadIntent?.step ?? "select"}
        initialTarget={uploadIntent?.target ?? null}
        initialFolderOnly={uploadIntent?.folderOnly ?? false}
        folders={uploadFolderOptions}
        onCreateFolder={createFolder}
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

      <WatermarkReminderDialog open={!!pendingUploadIntent} onSkip={handleWatermarkReminderSkip} />

      {cancelSummary && (
        <CancelSummaryCard saved={cancelSummary.saved} onClose={() => setCancelSummary(null)} />
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

      {pendingCover && (
        <CoverPositionModal
          imageUrl={pendingCover.kind === "file" ? pendingCover.previewUrl : pendingCover.url}
          busy={coverBusy}
          onSave={confirmPendingCover}
          onCancel={closePendingCover}
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
    <section className="flex shrink-0 flex-col items-start justify-between gap-4 border-b border-[var(--color-brand-border)] bg-white px-6 py-6 sm:flex-row sm:px-10">
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
              className="brand-focus inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--color-brand-muted)] hover:bg-[var(--color-brand-hover)] hover:text-[var(--color-brand-ink)]"
            >
              <IconEdit size={16} />
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
              className="brand-focus hidden items-center gap-2 rounded-md border border-[var(--color-brand-border)] bg-white px-3.5 py-2 text-[12.5px] font-semibold text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)] md:inline-flex"
            >
              <IconUpload size={14} />
              Upload more
            </button>
            {activeIsSystem && (
              <span className="hidden text-[11px] text-[var(--color-brand-muted)] md:inline">Tap to choose a folder to upload into</span>
            )}
            <span className="text-[14px] leading-relaxed text-[var(--color-brand-muted)] md:hidden">Upload works best on desktop. Open this page on your laptop to add photos.</span>
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
        <IconUpload size={30} />
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
        className="brand-focus mt-1.5 hidden h-11 items-center gap-2 rounded-lg bg-[var(--color-brand-navy)] px-5 text-[14px] font-semibold text-white hover:bg-[var(--color-brand-navy-deep)] md:inline-flex"
      >
        <IconUpload size={16} />
        {dirSupported ? "Upload media" : "Add photos"}
      </button>
      <span className="mt-1.5 text-[14px] leading-relaxed text-[var(--color-brand-muted)] md:hidden">Upload works best on desktop. Open this page on your laptop to add photos.</span>
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
    <div className="shrink-0 border-b border-[var(--color-brand-border)] bg-white px-4 py-2.5 md:hidden">
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
                // Tapping the already-active user folder switches it into
                // rename — but renaming is a mutation, so it waits for the
                // upload. Switching folders never does.
                if (selected && !f.system && !disabled) setRenaming(true);
                else onSelect(f.id);
              }}
              aria-pressed={selected}
              className={`brand-focus flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs font-semibold transition-colors ${
                selected
                  ? "border-[var(--color-brand-navy)] bg-[var(--color-brand-navy-soft)] text-[var(--color-brand-navy)]"
                  : "border-[var(--color-brand-border)] bg-[var(--color-brand-surface-raised)] text-[var(--color-brand-muted)] hover:border-[var(--color-brand-outline)]"
              }`}
            >
              <span>{f.label}</span>
              <span className="tabular-nums opacity-70">{f.count.toLocaleString("en-IN")}</span>
              {selected && !f.system && !disabled && <IconEdit size={12} />}
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
  coverUrl,
  onSetCover,
  notify,
  mediaSort,
  onSortChange,
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
  /** Current event cover URL — flags the matching tile in the grid. */
  coverUrl?: string;
  /** Set a grid photo as the event cover. */
  onSetCover: (item: MediaItem) => void | Promise<void>;
  /** Transient status messages (e.g. download progress). */
  notify?: (msg: string) => void;
  /** Display order for this view, driven by `createdAt` (see EventContext). */
  mediaSort: "recent" | "oldest";
  onSortChange: (next: "recent" | "oldest") => void;
}) {
  return (
    <section className="px-6 pb-12 pt-6 sm:px-10">
      <div className="mb-4 flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-baseline">
        <div className="flex flex-wrap items-baseline gap-2.5">
          <h2 className="text-[17px] font-bold tracking-tight text-[var(--color-brand-ink)]">{activeFolderLabel}</h2>
          {!activeIsSystem && (
            <button
              type="button"
              onClick={onRename}
              aria-label="Rename folder"
              title="Rename folder"
              className="brand-focus inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--color-brand-muted)] hover:bg-[var(--color-brand-hover)] hover:text-[var(--color-brand-ink)]"
            >
              <IconEdit size={14} />
            </button>
          )}
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
        <SortDropdown value={mediaSort} onChange={onSortChange} options={MEDIA_SORT_OPTIONS} />
      </div>
      <MediaGrid
        items={items}
        disabled={disabled}
        onDeleteMany={onDeleteMany}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onLoadMore={onLoadMore}
        archiveName={activeFolderLabel}
        coverUrl={coverUrl}
        onSetCover={onSetCover}
        notify={notify}
      />
    </section>
  );
}

/* ── media sort options ─────────────────────────────────────────── */

/**
 * "Newest first" / "Oldest first", both driven by `createdAt`. Manual
 * workaround for the upload engine's concurrent, non-sequential uploads,
 * which mean completion order (and thus `createdAt`) doesn't reliably match
 * the original local file order — studio members can flip it here per event.
 */
const MEDIA_SORT_OPTIONS = [
  { value: "recent" as const, label: "Newest first" },
  { value: "oldest" as const, label: "Oldest first" },
];

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
            className="brand-focus flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--color-brand-muted)] hover:bg-[var(--color-brand-hover)] hover:text-[var(--color-brand-ink)]"
          >
            <IconX size={16} />
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
                {active && <IconCheck size={13} />}
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

/* ── cancel summary (§D3) ───────────────────────────────────────── */

/**
 * Shown once a cancelled run has fully settled. Cancelling mid-upload is
 * unnerving — "what happened to the photos that were already going up?" — so
 * this answers it with a number, and closes the loop on the obvious next
 * worry: re-uploading the same folder is safe.
 *
 * `saved` counts only records the backend confirmed (status "saved"), not
 * everything that reached R2, so it can never overstate what's in the gallery.
 */
function CancelSummaryCard({ saved, onClose }: { saved: number; onClose: () => void }) {
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
      aria-labelledby="cancel-summary-title"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="drawer-fade absolute inset-0 bg-[var(--color-brand-ink)]/40 backdrop-blur-[1px]"
      />
      <div className="dash-rise relative max-h-[90vh] w-full overflow-y-auto rounded-t-2xl border border-[var(--color-brand-border)] bg-white p-5 shadow-[0_-8px_40px_rgba(42,34,24,0.18)] sm:w-full sm:max-w-[420px] sm:rounded-2xl sm:p-6 sm:shadow-[0_18px_50px_rgba(42,34,24,0.18)]">
        <span
          className="mb-3.5 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-brand-success-soft)] text-[var(--color-brand-success)]"
          aria-hidden
        >
          <IconCheck size={20} />
        </span>
        <h3 id="cancel-summary-title" className="text-[17px] font-bold tracking-tight text-[var(--color-brand-ink)]">
          Upload stopped
        </h3>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--color-brand-muted)]">
          {saved > 0 ? (
            <>
              <strong className="tabular-nums text-[var(--color-brand-ink)]">
                {saved.toLocaleString("en-IN")} photo{saved === 1 ? "" : "s"}
              </strong>{" "}
              made it into the gallery and {saved === 1 ? "is" : "are"} live for guests. The rest
              weren&apos;t uploaded.
            </>
          ) : (
            <>Nothing was added to the gallery — the upload stopped before any photos landed.</>
          )}
        </p>
        <p className="mt-3 rounded-md bg-[var(--color-brand-navy-soft)] px-3 py-2.5 text-[12.5px] leading-relaxed text-[var(--color-brand-navy-deep)]">
          Pick the same folder again whenever you&apos;re ready — we recognise what&apos;s already
          here and upload only what&apos;s missing. No duplicates.
        </p>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="brand-focus inline-flex h-10 items-center rounded-lg bg-[var(--color-brand-navy)] px-4 text-[13.5px] font-semibold text-white hover:bg-[var(--color-brand-navy-deep)]"
          >
            Done
          </button>
        </div>
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

