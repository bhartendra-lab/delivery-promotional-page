"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  archiveBooking,
  clearBookingData,
  deleteMedia,
  getBookingById,
  getMedia,
  getMediaIdsForView,
  recalculateStudioStorage,
  regenerateFamilyPasscode,
  restoreBooking,
  updateBooking,
  updateGalleryActivationStatus,
  updateMediaShortlist,
  type MediaViewOptions,
  type UpdateBookingInput,
} from "@/lib/api";
import type {
  BookingDetail,
  CustomFolder,
  EmbeddingStatus,
  GalleryPublishStatus,
  MediaItem,
  ServiceType,
} from "@/lib/types";
import {
  DELIVERY_PREFERENCE_DEFAULTS,
  normalizeDeliveryPreferences,
  type ArchiveTier,
  type DeliveryPreferences,
} from "@/lib/delivery-preferences";
import { setBookingName } from "@/lib/r2-upload/registry";
import { usePageBreadcrumb, usePageTopbarExtra, useChrome } from "@/components/dashboard/ChromeContext";
import { useUploadEngine } from "./useUploadEngine";
import {
  EventProvider,
  ALL_MEDIA_ID,
  LIKED_MEDIA_ID,
  EMPTY_LIKED_FILTERS,
  type EventMeta,
  type LikedFilters,
} from "./EventContext";
import { EventTabStrip, type TabId } from "./EventTabStrip";
import { LivePill, type LivePillState } from "./LivePill";
import { TypeConfirmModal } from "./TypeConfirmModal";
import { IconArchive, IconLock } from "./icons";
import { PostUploadBanner } from "./PostUploadBanner";
import { MediaTab } from "./MediaTab";
import { SmartSelectsTab } from "./SmartSelectsTab";
import { GalleryDesignTab } from "./GalleryDesignTab";
import { AccessSharingTab } from "./AccessSharingTab";

/**
 * Live/sync snapshot, sourced authoritatively from get-booking-by-id.
 * Events are live from creation — the only user control is activate/
 * deactivate; everything else here is pipeline status.
 */
type PublishInfo = {
  status: GalleryPublishStatus;
  embedding: EmbeddingStatus;
  isActive: boolean;
  outOfSync: boolean;
  unsyncedCount: number;
  /** The booking's own plan — gates the in-workspace Archive control. */
  serviceType: ServiceType | null;
  /**
   * True once the first photos have SYNCED (`gallery_published_at` set by the
   * backend on the first completed finalize). Locks the event name — renaming
   * would regenerate the unique_identifier and break the shared link, which by
   * this point has plausibly been sent to guests.
   */
  hasBeenPublished: boolean;
};

const DEFAULT_PUB: PublishInfo = {
  status: "published",
  embedding: "not_started",
  isActive: true,
  outOfSync: false,
  unsyncedCount: 0,
  serviceType: null,
  hasBeenPublished: false,
};

const POLL_MS = 20000;

// Media grid loads one page on first paint and one more each scroll-to-end.
const PAGE_SIZE = 100;

function normalizeMeta(
  b: BookingDetail,
  prev: EventMeta | null,
  opts: { qrAuthoritative?: boolean } = {},
): EventMeta {
  const date = typeof b.event_date === "number" && Number.isFinite(b.event_date) ? b.event_date : null;
  // background_image: a non-empty string sets the cover; "" means explicitly
  // cleared; undefined/null falls back to the cached value (offline resilience).
  const bg =
    typeof b.background_image === "string" ? b.background_image || undefined : prev?.backgroundImage;
  return {
    name: b.name ?? b.event_name ?? b.lead?.name ?? prev?.name ?? "Untitled event",
    type: b.event_type ?? b.events?.[0]?.event_type ?? prev?.type ?? "Event",
    eventDate: date ?? prev?.eventDate ?? null,
    backgroundImage: bg,
    backgroundPosition: b.background_position ?? prev?.backgroundPosition,
    customMessage: b.custom_message ?? prev?.customMessage,
    styleVariant: b.style_variant ?? prev?.styleVariant,
    includeBranding: b.include_company_branding ?? prev?.includeBranding,
    uniqueIdentifier: b.unique_identifier ?? prev?.uniqueIdentifier,
    familyPasscode: b.family_passcode ?? prev?.familyPasscode,
    guestTypes: b.guest_types ?? prev?.guestTypes,
    // Normalised on the way in so every consumer reads a complete object.
    // The `prev` fallback matters twice over: partial-update responses that
    // don't echo the field must not wipe it, and a localStorage hydration
    // carries the last known value until the authoritative read lands.
    deliveryPreferences: normalizeDeliveryPreferences(
      b.delivery_preferences ?? prev?.deliveryPreferences,
    ),
    // getBookingById (reloadBooking) is the sole source of truth for QR
    // linking — the QR can be relinked/deleted from the Reusable QR tab
    // without this workspace ever mounting, so an absent field in that
    // authoritative response means "unlinked now" and must clear the panel
    // rather than fall back to `prev` (which can be a stale localStorage
    // hydration from before the change). Partial-update responses like
    // updateBooking never report QR fields at all, so they keep falling back
    // to `prev` there to avoid wiping a real link on an unrelated edit.
    qrUniqueId: opts.qrAuthoritative ? b.qr_unique_id : (b.qr_unique_id ?? prev?.qrUniqueId),
    qrImageUrl: opts.qrAuthoritative ? b.qr_image_url : (b.qr_image_url ?? prev?.qrImageUrl),
  };
}

function normalizePublish(b: BookingDetail): PublishInfo {
  return {
    status: b.gallery_publish_status ?? "published",
    embedding: b.embedding_status ?? "not_started",
    isActive: b.is_active !== false,
    outOfSync: b.media_out_of_sync === true,
    unsyncedCount: typeof b.unsynced_media_count === "number" ? b.unsynced_media_count : 0,
    serviceType: (b.service_type as ServiceType | null | undefined) ?? null,
    // Name lock keys on "first photos synced", not on a publish action (which
    // no longer exists) — see the PublishInfo docs.
    hasBeenPublished: typeof b.gallery_published_at === "number",
  };
}

function computePillState(pub: PublishInfo): LivePillState {
  if (!pub.isActive) return "deactivated";
  // The studio only ever sees "Live". Background processing (embeddings →
  // face search) runs after every upload but is deliberately NOT surfaced to
  // the studio — the gallery is live the moment photos finish uploading.
  return "live";
}

export function EventWorkspace({ bookingId }: { bookingId: string }) {
  const [meta, setMeta] = useState<EventMeta | null>(null);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [folders, setFolders] = useState<CustomFolder[]>([]);
  const [folderCounts, setFolderCounts] = useState<Record<string, number>>({});
  const [likedCount, setLikedCount] = useState(0); // liked media in the booking
  /**
   * The booking's archive quality tier, or null when every photo is QHD.
   * Booking-wide and server-derived (not inferred from the loaded page, which
   * only covers the active view), so the Preferences panel can name the archive
   * download row after the tier this event actually has — and hide it when
   * there is nothing unwatermarked to govern.
   */
  const [archiveTier, setArchiveTier] = useState<ArchiveTier | null>(null);
  const [shortlistedCount, setShortlistedCount] = useState(0); // shortlisted media
  const [likedFilters, setLikedFilters] = useState<LikedFilters>(EMPTY_LIKED_FILTERS);
  const [totalCount, setTotalCount] = useState(0); // all media in the booking
  const [totalForView, setTotalForView] = useState(0); // media in the active view
  const [activeFolderId, setActiveFolderId] = useState<string>(ALL_MEDIA_ID);
  // Manual display-order override for the plain Media view (see `mediaSort` doc
  // in EventContext). Shared across folders, not per-folder.
  const [mediaSort, setMediaSort] = useState<"recent" | "oldest">("recent");
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>("media");
  const [pub, setPub] = useState<PublishInfo>(DEFAULT_PUB);
  const [banner, setBanner] = useState<{ count: number } | null>(null);
  const [coverBusy, setCoverBusy] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // The backend now keeps the storage meter current incrementally — create-media
  // $incs the bytes it just recorded and delete-media gives them back — so an
  // upload transition only needs to RE-READ the figure, not re-walk R2 to
  // rebuild it. `refreshDlpUsage` is one small indexed read; the full
  // ListObjectsV2 re-walk (settleStorage) is now reserved for cancel, the one
  // transition that can leave bytes on R2 the backend never recorded — see
  // ActiveUploadsIndicator.
  const { refreshDlpUsage } = useChrome();

  const engine = useUploadEngine(bookingId);

  // Pause needs its own trigger point — unlike cancel/completion it never
  // flips `isUploading` false, so it doesn't pass through the run-completion
  // effect below. The pause itself is instant; the storage number catches up
  // quietly behind it.
  const pauseUpload = useCallback(() => {
    engine.pause();
    // Pause drains pending metadata, so every uploaded byte is already recorded
    // and counted — just re-read the number.
    void refreshDlpUsage();
  }, [engine, refreshDlpUsage]);

  // The view the media grid is loading. The Smart Selects tab shows the liked
  // feed; every other tab shows the Media tab's active folder. This decouples the
  // liked view from the Media sidebar (it's now its own top-level section).
  const viewId = activeTab === "smart" ? LIKED_MEDIA_ID : activeFolderId;

  // Refs so async handlers/effects read the latest values without re-binding.
  const metaRef = useRef<EventMeta | null>(meta);
  const pubRef = useRef(pub);
  const mediaRef = useRef(media);
  const activeFolderIdRef = useRef(activeFolderId);
  const activeTabRef = useRef(activeTab);
  const viewIdRef = useRef(viewId);
  const totalForViewRef = useRef(totalForView);
  const totalCountRef = useRef(totalCount);
  const likedFiltersRef = useRef(likedFilters);
  const mediaSortRef = useRef(mediaSort);
  const loadingMoreRef = useRef(false);
  useEffect(() => {
    metaRef.current = meta;
    pubRef.current = pub;
    mediaRef.current = media;
    activeFolderIdRef.current = activeFolderId;
    activeTabRef.current = activeTab;
    viewIdRef.current = viewId;
    totalForViewRef.current = totalForView;
    mediaSortRef.current = mediaSort;
    totalCountRef.current = totalCount;
    likedFiltersRef.current = likedFilters;
  });

  const toast = useCallback(
    (msg: string, type: "success" | "error" = "success") => setToastMsg({ message: msg, type }),
    [],
  );
  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 3200);
    return () => clearTimeout(t);
  }, [toastMsg]);

  /* ── data load ──────────────────────────────────────────────── */

  // The filters that define a view. ALL_MEDIA_ID → no folder filter;
  // LIKED_MEDIA_ID → the liked feed (most-liked first) with the active
  // who-filters (read via ref so paging/reloads/select-all always use the
  // latest selection). Shared by the paged read and "Select all" so the two
  // can't disagree about what the view contains.
  const viewOptions = useCallback((folderId: string): MediaViewOptions => {
    if (folderId === LIKED_MEDIA_ID) {
      const f = likedFiltersRef.current;
      return {
        onlyLiked: true,
        sort: f.sort,
        likedGuestType: f.audience === "all" ? undefined : f.audience,
        likedGuestSubTypes: f.subTypes,
        likedGuestIds: f.guestIds,
        shortlistedOnly: f.shortlistedOnly,
      };
    }
    return {
      customFolderId: folderId === ALL_MEDIA_ID ? undefined : folderId,
      sort: mediaSortRef.current === "oldest" ? "oldest" : undefined,
    };
  }, []);

  // Fetch one page of media for a view.
  const fetchPage = useCallback(
    (folderId: string, skip: number, limit: number) =>
      getMedia(bookingId, { ...viewOptions(folderId), skip, limit }),
    [bookingId, viewOptions],
  );

  // Every Media id in the active view — what "Select all" needs, since the grid
  // only holds the pages scrolled so far. Server-side, so a folder with 5,000
  // photos selects all 5,000 and not just the loaded page.
  const selectAllIds = useCallback(
    () => getMediaIdsForView(bookingId, viewOptions(viewIdRef.current)),
    [bookingId, viewOptions],
  );

  // Load the first page of a view and apply its extras (folders + counts). The
  // setState calls all run after the `await`, and the body is kept inline (no
  // shared setState-only helper) so the lint pass can see that ordering. No
  // synchronous loading flag, so a folder switch swaps in the new page when it
  // arrives instead of blanking the grid to a skeleton.
  const loadFirstPage = useCallback(
    async (folderId: string, limit: number): Promise<MediaItem[]> => {
      try {
        const res = await fetchPage(folderId, 0, limit);
        const list = res.media ?? [];
        setMedia(list);
        mediaRef.current = list;
        if (res.customFolders) setFolders(res.customFolders);
        if (res.folderCounts) setFolderCounts(res.folderCounts);
        if (typeof res.likedCount === "number") setLikedCount(res.likedCount);
        // Only ever asserted by the first page; `undefined` on an older server
        // leaves the previous answer alone rather than blanking it.
        if (res.archive_tier !== undefined) setArchiveTier(res.archive_tier ?? null);
        if (typeof res.shortlistedCount === "number") setShortlistedCount(res.shortlistedCount);
        if (typeof res.totalCount === "number") {
          setTotalCount(res.totalCount);
          totalCountRef.current = res.totalCount;
        }
        const tv = typeof res.total === "number" ? res.total : list.length;
        setTotalForView(tv);
        totalForViewRef.current = tv;
        return list;
      } catch {
        return mediaRef.current;
      } finally {
        setLoading(false);
      }
    },
    [fetchPage],
  );

  // Fresh first-page load for a view (initial paint + folder switch).
  const loadView = useCallback(
    (folderId: string) => loadFirstPage(folderId, PAGE_SIZE),
    [loadFirstPage],
  );

  // Refresh the active view in place — re-fetches from the start up to however
  // many items are currently loaded, so counts stay correct after an
  // upload/delete without collapsing the scroll back to a single page.
  const reload = useCallback(
    () => loadFirstPage(viewIdRef.current, Math.max(PAGE_SIZE, mediaRef.current.length)),
    [loadFirstPage],
  );

  // Append the next page for the active view (infinite scroll). Guarded so
  // overlapping scroll events don't double-fetch the same slice.
  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current) return;
    if (mediaRef.current.length >= totalForViewRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const res = await fetchPage(
        viewIdRef.current,
        mediaRef.current.length,
        PAGE_SIZE,
      );
      const more = res.media ?? [];
      if (more.length > 0) {
        setMedia((prev) => {
          const seen = new Set(prev.map((m) => m._id));
          return [...prev, ...more.filter((m) => !seen.has(m._id))];
        });
      }
    } catch {
      /* leave the list as-is; scrolling again retries */
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [fetchPage]);

  const setActiveFolder = useCallback((folderId: string) => {
    setActiveFolderId((prev) => (prev === folderId ? prev : folderId));
  }, []);

  // Tab switches that cross the Media ↔ Smart Selects boundary swap the media
  // list's context — clear the grid to a skeleton so the incoming tab never
  // flashes the other context's photos before its own first page arrives.
  const onTabChange = useCallback((id: TabId) => {
    const prev = activeTabRef.current;
    if (prev === id) return;
    if ((prev === "smart") !== (id === "smart")) {
      setMedia([]);
      mediaRef.current = [];
      setLoading(true);
    }
    setActiveTab(id);
  }, []);

  // Load the first page whenever the view changes (initial paint, folder switch,
  // switching to/from the Smart Selects tab, or a `mediaSort` change — the latter
  // is a no-op for the Liked view, which has its own independent sort).
  // Clearing the grid on a tab switch is handled in `onTabChange` (an event) so
  // this effect stays a pure load.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-then-setState is the documented React pattern for effects
    void loadView(viewId);
  }, [viewId, mediaSort, loadView]);

  // Re-fetch the Smart Selects view when its filters change (only while active).
  useEffect(() => {
    if (viewIdRef.current === LIKED_MEDIA_ID) void loadView(LIKED_MEDIA_ID);
  }, [likedFilters, loadView]);

  // Authoritative booking refresh: drives meta + publish/activation state.
  // Returns the fresh publish snapshot so callers can read it without waiting
  // for the state/ref to commit.
  const reloadBooking = useCallback(async (): Promise<PublishInfo | null> => {
    try {
      const res = await getBookingById(bookingId);
      const next = normalizeMeta(res.booking, metaRef.current, { qrAuthoritative: true });
      const nextPub = normalizePublish(res.booking);
      setMeta(next);
      setPub(nextPub);
      setBookingName(bookingId, next.name);
      try {
        localStorage.setItem(`event_meta_${bookingId}`, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return nextPub;
    } catch {
      return null;
    }
  }, [bookingId]);

  // Hydrate meta from the localStorage cache, then the authoritative API copy.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`event_meta_${bookingId}`);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time localStorage hydration before the authoritative fetch below
      if (raw) setMeta(JSON.parse(raw) as EventMeta);
    } catch {
      /* ignore */
    }
    void reloadBooking();
  }, [bookingId, reloadBooking]);

  // Poll while the pipeline has work in flight for this booking (outOfSync =
  // new media is being embedded + re-clustered + re-zipped automatically), so
  // the amber "Syncing" pill resolves itself without a manual refresh.
  // embedding "in_progress" only occurs via the legacy manual-sync endpoint
  // but is included for completeness.
  // Only a published booking has a pipeline worth polling — an archived/expired
  // booking is static, so skip the 20s poll entirely for it.
  const pipelineBusy =
    pub.status === "published" && (pub.outOfSync || pub.embedding === "in_progress");
  useEffect(() => {
    if (!pipelineBusy) return;
    const id = setInterval(() => void reloadBooking(), POLL_MS);
    return () => clearInterval(id);
  }, [pipelineBusy, reloadBooking]);

  // Notify in-app when a sync lands (outOfSync true → false) or a processing
  // run fails. Failures never take the gallery offline — the pipeline retries
  // on its own, so the error toast is informational.
  const prevEmbeddingRef = useRef<EmbeddingStatus | null>(null);
  const prevOutOfSyncRef = useRef<boolean | null>(null);
  useEffect(() => {
    const prevEmbedding = prevEmbeddingRef.current;
    const prevOutOfSync = prevOutOfSyncRef.current;
    if (prevOutOfSync === true && !pub.outOfSync && pub.embedding !== "failed") {
      toast("New photos are synced — they're now in guest face search.");
    } else if (prevEmbedding !== null && prevEmbedding !== "failed" && pub.embedding === "failed") {
      toast("Photo processing hit a snag — it will retry automatically.", "error");
    }
    prevEmbeddingRef.current = pub.embedding;
    prevOutOfSyncRef.current = pub.outOfSync;
  }, [pub.embedding, pub.outOfSync, toast]);

  /* ── engine ↔ state wiring ──────────────────────────────────── */

  // Every gallery is live from creation, so every upload is tagged
  // out-of-sync — that drives the booking's unsynced counter and the amber
  // "Syncing" pill until the pipeline finishes processing the new media.
  useEffect(() => {
    engine.setOutOfSync(true);
  }, [engine]);

  // Live optimistic grid prepend as images land (batched for large uploads).
  useEffect(() => {
    const pending: Array<{ url: string; customFolderId: string }> = [];
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      if (pending.length === 0) return;
      const batch = pending.splice(0, pending.length);
      const stamp = Date.now();
      setMedia((prev) => [
        ...batch.map((item, i) => ({
          _id: `optimistic-${stamp}-${i}`,
          url: item.url,
          type: "image" as const,
          booking_id: bookingId,
          custom_folder_ids: [item.customFolderId],
          createdAt: new Date().toISOString(),
        })),
        ...prev,
      ]);
    };
    const scheduleFlush = () => {
      if (flushTimer) return;
      flushTimer = setTimeout(() => {
        flushTimer = null;
        flush();
      }, 300);
    };
    engine.onMediaUploaded((url, customFolderId) => {
      pending.push({ url, customFolderId });
      if (pending.length >= 50) {
        if (flushTimer) {
          clearTimeout(flushTimer);
          flushTimer = null;
        }
        flush();
      } else {
        scheduleFlush();
      }
    });
    return () => {
      if (flushTimer) clearTimeout(flushTimer);
      flush();
      engine.onMediaUploaded(null);
    };
  }, [engine, bookingId]);

  // Debounced canonical refresh as metadata chunks land in the DB.
  useEffect(() => {
    let reloadTimer: ReturnType<typeof setTimeout> | null = null;
    engine.onMetadataSaved(() => {
      if (!reloadTimer) {
        reloadTimer = setTimeout(() => {
          reloadTimer = null;
          void reload();
        }, 1500);
      }
    });
    return () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      engine.onMetadataSaved(null);
    };
  }, [engine, reload]);

  // On run completion: reconcile media + booking, then surface the post-upload
  // banner. Purely informational — the pipeline is already embedding + syncing
  // the new photos (the pill shows "Syncing" until the backend reports done).
  const wasActiveRef = useRef(false);
  useEffect(() => {
    const isActive = engine.progress.isUploading || engine.progress.isSavingMetadata;
    if (wasActiveRef.current && !isActive) {
      void (async () => {
        // All three run together: the media/booking refresh drives the visible
        // hand-off, while the usage re-read settles alongside it. This used to
        // be a full R2 re-walk (settleStorage) on every single completed
        // upload — redundant now that create-media meters incrementally.
        const [list, fresh] = await Promise.all([reload(), reloadBooking(), refreshDlpUsage()]);
        // Prefer the backend's unsynced counter (photos still processing);
        // fall back to the booking-wide total from the refresh.
        const added = (fresh?.unsyncedCount || 0) || totalCountRef.current || list.length;
        if (added > 0) setBanner({ count: added });
      })();
    }
    wasActiveRef.current = isActive;
  }, [engine.progress.isUploading, engine.progress.isSavingMetadata, reload, reloadBooking, refreshDlpUsage]);

  /* ── derived ────────────────────────────────────────────────── */

  const engineActive = engine.progress.isUploading || engine.progress.isSavingMetadata;
  /**
   * True while a run is genuinely transferring (paused runs unlock everything).
   * This no longer freezes the workspace — the engine is module-scoped per
   * booking and survives route changes, so the Member can navigate and keep
   * working. It now gates only the two things that would actually race the
   * run: folder mutations (rename/delete/reorder, which `ensureFolders` is
   * concurrently creating into) and Locate Originals' full-disk scan.
   */
  const activeLocked = engineActive && !engine.progress.paused;
  const mediaReady = totalCount > 0;
  const hasMore = media.length < totalForView;
  const pillState = computePillState(pub);

  usePageBreadcrumb([
    { label: "Events", href: "/dashboard/events" },
    { label: meta?.name ?? "Event" },
  ]);

  /* ── booking persistence (preserves event row from clobber) ─── */

  const persistBooking = useCallback(
    async (partial: UpdateBookingInput) => {
      // update-booking is conditional per field, so a partial body only touches
      // what's passed (the event date/type are preserved untouched).
      const res = await updateBooking(bookingId, partial);
      const next = normalizeMeta(res.booking, metaRef.current);
      setMeta(next);
      try {
        localStorage.setItem(`event_meta_${bookingId}`, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    },
    [bookingId],
  );

  const saveMeta = useCallback(
    async (next: { name: string; type: string; eventDate: number | null }) => {
      // Once published, the event name is immutable — sending `event_name` would
      // regenerate the unique_identifier and break the shared /event/<uid> URL.
      const nameLocked = pubRef.current.hasBeenPublished;
      // Only send `event_name` when it actually changed — the update is
      // conditional per field, so omitting an unchanged name leaves it untouched.
      const nameChanged = next.name !== metaRef.current?.name;
      await persistBooking({
        ...(!nameLocked && nameChanged ? { event_name: next.name } : {}),
        event_type: next.type,
        ...(next.eventDate != null ? { event_date: next.eventDate } : {}),
      });
      toast("Event details saved");
    },
    [persistBooking, toast],
  );

  /**
   * Event-scoped: one preference set per event, so this immediately covers
   * every photo already in the gallery. Routed through `persistBooking` (not a
   * second write path) so the response re-normalises into `meta` and refreshes
   * the localStorage cache exactly like every other booking edit. Rejects on
   * failure — the calling dialog owns the error surface.
   */
  const saveDeliveryPreferences = useCallback(
    async (next: DeliveryPreferences) => {
      await persistBooking({ delivery_preferences: next });
    },
    [persistBooking],
  );

  const doRegeneratePasscode = useCallback(async (): Promise<string> => {
    const res = await regenerateFamilyPasscode(bookingId);
    const code = res.family_passcode;
    setMeta((prev) => (prev ? { ...prev, familyPasscode: code } : prev));
    return code;
  }, [bookingId]);

  const setCoverFromUrl = useCallback(
    async (url: string, position: string = "50% 50%") => {
      setCoverBusy(true);
      try {
        await persistBooking({ background_image: url, background_position: position });
        // API response may not echo background_image, so patch meta directly.
        setMeta((prev) => (prev ? { ...prev, backgroundImage: url, backgroundPosition: position } : prev));
        toast("Cover photo updated");
      } finally {
        setCoverBusy(false);
      }
    },
    [persistBooking, toast],
  );

  const setCoverFromFile = useCallback(
    async (file: File, position: string = "50% 50%") => {
      setCoverBusy(true);
      try {
        const keyFolderId = folders[0]?._id ?? mediaRef.current[0]?.custom_folder_ids?.[0] ?? "cover";
        const url = await engine.uploadCover(file, keyFolderId);
        await persistBooking({ background_image: url, background_position: position });
        // API response may not echo background_image, so patch meta directly.
        setMeta((prev) => (prev ? { ...prev, backgroundImage: url, backgroundPosition: position } : prev));
        toast("Cover photo updated");
      } catch (err) {
        toast(err instanceof Error ? err.message : "Could not set cover", "error");
      } finally {
        setCoverBusy(false);
      }
    },
    [engine, folders, persistBooking, toast],
  );

  const setCoverPosition = useCallback(
    async (position: string) => {
      setCoverBusy(true);
      try {
        await persistBooking({ background_position: position });
        setMeta((prev) => (prev ? { ...prev, backgroundPosition: position } : prev));
        toast("Cover position saved");
      } catch (err) {
        toast(err instanceof Error ? err.message : "Could not save cover position", "error");
      } finally {
        setCoverBusy(false);
      }
    },
    [persistBooking, toast],
  );

  const deleteMediaIds = useCallback(
    async (ids: string[]) => {
      const real = ids.filter((id) => id && !id.startsWith("optimistic-"));
      if (real.length === 0) return;
      const prev = mediaRef.current;
      const deletedUrls = new Set(prev.filter((m) => real.includes(m._id)).map((m) => m.url));
      setMedia((cur) => cur.filter((m) => !real.includes(m._id))); // optimistic
      try {
        await deleteMedia(real);
        await reload();
        if (metaRef.current?.backgroundImage && deletedUrls.has(metaRef.current.backgroundImage)) {
          await persistBooking({ background_image: "" });
        }
        // delete-media releases the deleted bytes back to the plan, so the
        // sidebar meter is stale the moment this returns. A plain refetch, not
        // settleStorage: the backend already adjusted the figure incrementally,
        // so there's nothing to recalculate — this just reads it.
        void refreshDlpUsage();
        toast(`${real.length.toLocaleString("en-IN")} photo${real.length === 1 ? "" : "s"} deleted`);
      } catch (err) {
        setMedia(prev); // restore on failure
        toast(err instanceof Error ? err.message : "Could not delete — try again", "error");
      }
    },
    [persistBooking, reload, refreshDlpUsage, toast],
  );

  // Flag/unflag media as shortlisted (Smart Selects). Optimistic: flip the flag
  // in place, and when un-shortlisting under the "Shortlisted only" filter, drop
  // the items from the view so they vanish immediately. Reverts on failure.
  const setShortlisted = useCallback(
    async (ids: string[], shortlisted: boolean) => {
      const real = ids.filter((id) => id && !id.startsWith("optimistic-"));
      if (real.length === 0) return;
      const prev = mediaRef.current;
      const changed = prev.filter(
        (m) => real.includes(m._id) && !!m.shortlisted !== shortlisted,
      ).length;
      const f = likedFiltersRef.current;
      const dropFromView = !shortlisted && f.shortlistedOnly;
      setMedia((cur) =>
        dropFromView
          ? cur.filter((m) => !real.includes(m._id))
          : cur.map((m) => (real.includes(m._id) ? { ...m, shortlisted } : m)),
      );
      try {
        await updateMediaShortlist(real, shortlisted);
        setShortlistedCount((c) => Math.max(0, c + (shortlisted ? changed : -changed)));
        if (dropFromView) setTotalForView((t) => Math.max(0, t - real.length));
        toast(
          shortlisted
            ? `${real.length.toLocaleString("en-IN")} photo${real.length === 1 ? "" : "s"} shortlisted`
            : `Removed ${real.length.toLocaleString("en-IN")} from shortlist`,
        );
      } catch (err) {
        setMedia(prev); // restore on failure
        toast(err instanceof Error ? err.message : "Could not update shortlist — try again", "error");
      }
    },
    [toast],
  );

  /* ── activation actions (the only gallery controls left) ────── */

  const doDeactivate = useCallback(async () => {
    try {
      await updateGalleryActivationStatus(bookingId, false);
      await reloadBooking();
      toast("Gallery deactivated — guests can't open the link until you reactivate.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not deactivate", "error");
    }
  }, [bookingId, reloadBooking, toast]);

  const doActivate = useCallback(async () => {
    try {
      await updateGalleryActivationStatus(bookingId, true);
      await reloadBooking();
      toast("Gallery reactivated — it's live for guests again.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not reactivate", "error");
    }
  }, [bookingId, reloadBooking, toast]);

  /* ── archive / restore / clear-data lifecycle ───────────────── */

  // Archiving deactivates + flips status to "archived" in one write; reloading
  // surfaces the terminal overlay in place (no navigation). Rethrows so the
  // LivePill confirm keeps its modal open on failure.
  const doArchive = useCallback(async () => {
    try {
      await archiveBooking(bookingId);
      await reloadBooking();
      toast("Event archived — it's hidden from guests.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not archive the event", "error");
      throw err;
    }
  }, [bookingId, reloadBooking, toast]);

  const [overlayBusy, setOverlayBusy] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);

  const doRestore = useCallback(async () => {
    setOverlayBusy(true);
    try {
      await restoreBooking(bookingId);
      // Once status flips back to "published" the overlay unmounts and the
      // workspace becomes editable in place.
      await reloadBooking();
      toast("Event restored — you can edit it right here.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not restore the event", "error");
    } finally {
      setOverlayBusy(false);
    }
  }, [bookingId, reloadBooking, toast]);

  const doClearData = useCallback(async () => {
    setOverlayBusy(true);
    try {
      await clearBookingData(bookingId);
      try {
        await recalculateStudioStorage();
      } catch (err) {
        console.warn("[clear-data] recalculate-studio-storage failed", err);
      }
      // Media was deleted server-side — re-sync the shared storage meter.
      await refreshDlpUsage();
      // Backend flips status to "expired"; reloading turns the archived screen
      // into the terminal expired screen in place.
      await reloadBooking();
      setClearConfirm(false);
      toast("Event data cleared. Only the cover photo remains.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not clear the event data", "error");
    } finally {
      setOverlayBusy(false);
    }
  }, [bookingId, reloadBooking, refreshDlpUsage, toast]);

  /* ── topbar LivePill ────────────────────────────────────────── */

  const isTerminal = pub.status === "archived" || pub.status === "expired";

  // The pill is inert for the whole run (incl. paused) — toggling activation
  // mid-upload would be confusing; it re-enables once the run ends. In the
  // terminal (archived/expired) states the pill is hidden — the full-screen
  // overlay owns the Restore/Clear-data actions instead.
  const pillNode = useMemo(
    () =>
      isTerminal ? null : (
        <LivePill
          state={pillState}
          disabled={engineActive}
          serviceType={pub.serviceType}
          onActivate={doActivate}
          onDeactivate={doDeactivate}
          onArchive={doArchive}
        />
      ),
    [isTerminal, pillState, engineActive, pub.serviceType, doActivate, doDeactivate, doArchive],
  );
  usePageTopbarExtra(pillNode);

  /* ── tab gating ─────────────────────────────────────────────── */

  /**
   * No tab is gated on an upload any more — each was checked against what a
   * live run actually touches:
   *  - Gallery Design writes style/message/branding fields via update-booking.
   *    Galleries are live from creation and there is no publish action, so
   *    nothing here can submit an incomplete photo set for processing.
   *  - Access & Sharing (guest link, passcode, guest list, QR) has no data
   *    dependency on upload state at all.
   *  - Smart Selects flips per-media shortlist flags on existing rows. Only
   *    its Locate Originals scan is held back (see `activeLocked`), since that
   *    walks the whole disk while the compressor pool is already saturated.
   */
  const effectiveTab: TabId = activeTab;

  const tabs = useMemo(
    () => [
      { id: "media" as TabId, label: "Media", count: mediaReady ? totalCount : null },
      { id: "gallery" as TabId, label: "Gallery Design" },
      { id: "access" as TabId, label: "Access & Sharing" },
      { id: "smart" as TabId, label: "Smart Selects" },
    ],
    [mediaReady, totalCount],
  );

  const ctx = useMemo(
    () => ({
      bookingId,
      meta: meta ?? { name: "Untitled event", type: "Event", eventDate: null },
      media,
      folders,
      setFolders,
      reload,
      activeFolderId,
      setActiveFolder,
      mediaSort,
      setMediaSort,
      folderCounts,
      likedCount,
      archiveTier,
      shortlistedCount,
      likedFilters,
      setLikedFilters,
      setShortlisted,
      totalCount,
      totalForView,
      hasMore,
      loadingMore,
      loadMore,
      engine,
      activeLocked,
      pauseUpload,
      publishedEver: pub.hasBeenPublished,
      saveMeta,
      saveDeliveryPreferences,
      regenerateFamilyPasscode: doRegeneratePasscode,
      setCoverFromUrl,
      setCoverFromFile,
      setCoverPosition,
      coverBusy,
      deleteMediaIds,
      selectAllIds,
      toast,
    }),
    [bookingId, meta, media, folders, reload, activeFolderId, setActiveFolder, mediaSort, folderCounts, likedCount, archiveTier, shortlistedCount, likedFilters, setLikedFilters, setShortlisted, totalCount, totalForView, hasMore, loadingMore, loadMore, engine, activeLocked, pauseUpload, pub.hasBeenPublished, saveMeta, saveDeliveryPreferences, doRegeneratePasscode, setCoverFromUrl, setCoverFromFile, setCoverPosition, coverBusy, deleteMediaIds, selectAllIds, toast],
  );

  const eventDateLabel = meta?.eventDate != null ? formatDate(meta.eventDate) : null;
  // `meta` is null until the first load lands, and `normalizeMeta` fills the
  // object on every path after that — so the fallback only covers first paint.
  const allowDownload =
    meta?.deliveryPreferences?.allow_download ?? DELIVERY_PREFERENCE_DEFAULTS.allow_download;

  return (
    <EventProvider value={ctx}>
      <div className="relative flex h-full min-w-0 flex-col">
        {/* In archived/expired states the whole editing surface is blurred + inert;
            the terminal overlay below owns the only reachable actions. The Topbar
            breadcrumb (outside this component) stays interactive so the user can
            still leave. */}
        <div
          className={
            isTerminal
              ? "pointer-events-none flex h-full min-h-0 select-none flex-col overflow-hidden [filter:blur(3px)]"
              : "flex h-full min-h-0 flex-col overflow-hidden"
          }
          aria-hidden={isTerminal || undefined}
        >
          {/* Tab strip + (mobile) publish row + upload banner form the workspace's
              locked chrome — they never scroll. Only the active tab's body below
              them owns its own scroll region(s). */}
          {/* Seam band: a deliberate visual gap between the topbar/banner chrome
              above and the tab strip, so the two read as separate fixed layers
              rather than one merged bar. */}
          <div className="h-2.5 shrink-0 bg-[var(--color-brand-bg)]" aria-hidden />
          <EventTabStrip tabs={tabs} active={effectiveTab} onChange={onTabChange} />

          {/* Mobile-only publish action row. The same pill is injected into the
              Topbar for desktop (usePageTopbarExtra); here it stays reachable on
              mobile where the Topbar hides it. One visible instance per breakpoint. */}
          {!isTerminal && (
            <div className="flex shrink-0 justify-end border-b border-[var(--color-brand-border)] bg-white px-4 py-2.5 md:hidden">
              {pillNode}
            </div>
          )}

          {banner && (
            <PostUploadBanner photoCount={banner.count} onDismiss={() => setBanner(null)} />
          )}

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {effectiveTab === "media" && <MediaTab loading={loading} />}
            {effectiveTab === "smart" && <SmartSelectsTab loading={loading} />}
            {effectiveTab === "gallery" && (
              <GalleryDesignTab
                eventName={ctx.meta.name}
                eventType={ctx.meta.type}
                eventDateLabel={eventDateLabel}
                coverUrl={ctx.meta.backgroundImage}
                coverPosition={ctx.meta.backgroundPosition}
                initialStyleVariant={ctx.meta.styleVariant}
                initialCustomMessage={ctx.meta.customMessage}
                initialIncludeBranding={ctx.meta.includeBranding}
                initialGuestTypes={ctx.meta.guestTypes}
                allowDownload={allowDownload}
                onSave={async (vals) => {
                  // Pass through current event_type/date (never event_name) so the
                  // landing-page save can't churn the shared URL or clobber the event.
                  await persistBooking({
                    ...vals,
                    event_type: ctx.meta.type,
                    ...(ctx.meta.eventDate != null ? { event_date: ctx.meta.eventDate } : {}),
                  });
                  toast("Gallery design saved");
                }}
              />
            )}
            {effectiveTab === "access" && (
              <AccessSharingTab
                bookingId={bookingId}
                eventName={ctx.meta.name}
                uniqueIdentifier={ctx.meta.uniqueIdentifier}
                familyPasscode={ctx.meta.familyPasscode}
                qrUniqueId={ctx.meta.qrUniqueId}
                qrImageUrl={ctx.meta.qrImageUrl}
                onRegenerate={doRegeneratePasscode}
              />
            )}
          </div>
        </div>

        {isTerminal && (
          <TerminalOverlay
            status={pub.status}
            coverUrl={meta?.backgroundImage}
            busy={overlayBusy}
            onRestore={doRestore}
            onClearData={() => setClearConfirm(true)}
          />
        )}
      </div>

      {clearConfirm && (
        <TypeConfirmModal
          action="delete"
          busy={overlayBusy}
          title="Clear this event's data?"
          description="This permanently removes every photo and all face-search data for this event."
          warningText="Only the cover photo is kept. Guests lose the gallery for good — this cannot be undone."
          onConfirm={doClearData}
          onCancel={() => setClearConfirm(false)}
        />
      )}

      {toastMsg && (
        <div className="pointer-events-none fixed inset-x-0 top-6 z-[230] flex justify-center px-4">
          <div
            className={`toast-rise pointer-events-auto inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-semibold text-white shadow-[0_8px_24px_rgba(42,34,24,0.18)] ${
              toastMsg.type === "error" ? "bg-[var(--color-brand-danger)]" : "bg-[var(--color-brand-success)]"
            }`}
          >
            {toastMsg.message}
          </div>
        </div>
      )}
    </EventProvider>
  );
}

function formatDate(epoch: number): string {
  const d = new Date(epoch);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Full-screen panel shown over the blurred workspace when a booking is archived
 * or expired. Archived offers Restore + Clear data; expired is terminal (no
 * actions — the backend 404s on restoring an expired booking and there's nothing
 * left to clear). Sits inside the workspace's `relative` box so the Topbar
 * breadcrumb above stays reachable; the dim/blur matches the modal chrome.
 */
function TerminalOverlay({
  status,
  coverUrl,
  busy,
  onRestore,
  onClearData,
}: {
  status: GalleryPublishStatus;
  coverUrl?: string;
  busy: boolean;
  onRestore: () => void;
  onClearData: () => void;
}) {
  const archived = status === "archived";
  return (
    <div
      className="absolute inset-0 z-30 flex items-start justify-center overflow-y-auto px-4 py-8 sm:items-center"
      style={{ background: "rgba(42,34,24,0.48)", backdropFilter: "blur(3px)" }}
    >
      <div className="dash-rise w-full max-w-[460px] rounded-[16px] border border-[var(--color-brand-border)] bg-white p-7 text-center shadow-[0_24px_64px_rgba(42,34,24,0.24)]">
        {coverUrl && (
          <div
            className="mx-auto mb-5 h-24 w-full max-w-[280px] overflow-hidden rounded-xl"
            style={{ backgroundImage: `url(${coverUrl})`, backgroundSize: "cover", backgroundPosition: "center" }}
            aria-hidden
          />
        )}
        <span
          className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full"
          style={
            archived
              ? { background: "var(--color-brand-warning-soft)", color: "var(--color-brand-warning)" }
              : { background: "var(--color-brand-bg)", color: "var(--color-brand-muted)" }
          }
          aria-hidden
        >
          {archived ? <IconArchive size={22} /> : <IconLock size={22} />}
        </span>
        <h2 className="text-[19px] font-bold tracking-tight text-[var(--color-brand-ink)]">
          {archived ? "This event is archived" : "This event has expired"}
        </h2>
        <p className="mx-auto mt-2 max-w-[380px] text-[13.5px] leading-relaxed text-[var(--color-brand-muted)]">
          {archived
            ? "The gallery is deactivated and hidden from guests. Restore it to edit and go live again, or clear its data to free up storage. It’s cleared automatically 7 days after archiving."
            : "This event’s access window has closed and its media has been removed. The cover photo is kept for your records, but the gallery can’t be restored."}
        </p>

        {archived && (
          <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={onRestore}
              disabled={busy}
              className="brand-focus inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[var(--color-brand-navy)] px-5 text-[13.5px] font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? (
                <span className="h-4 w-4 animate-spin rounded-full border-[2px] border-white/60 border-t-white" />
              ) : null}
              Restore
            </button>
            <button
              type="button"
              onClick={onClearData}
              disabled={busy}
              className="brand-focus inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-[var(--color-brand-danger)]/30 bg-[var(--color-brand-danger-soft)] px-5 text-[13.5px] font-semibold text-[var(--color-brand-danger)] transition-colors hover:border-[var(--color-brand-danger)]/60 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Clear data
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
