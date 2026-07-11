"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  deleteMedia,
  getBookingById,
  getMedia,
  regenerateFamilyPasscode,
  updateBooking,
  updateGalleryActivationStatus,
  updateMediaShortlist,
  type UpdateBookingInput,
} from "@/lib/api";
import type {
  BookingDetail,
  CustomFolder,
  EmbeddingStatus,
  GalleryPublishStatus,
  MediaItem,
} from "@/lib/types";
import { setBookingName } from "@/lib/r2-upload/registry";
import { usePageBreadcrumb, usePageLock, usePageTopbarExtra } from "@/components/dashboard/ChromeContext";
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
  hasBeenPublished: false,
};

const POLL_MS = 20000;

// Media grid loads one page on first paint and one more each scroll-to-end.
const PAGE_SIZE = 100;

function normalizeMeta(b: BookingDetail, prev: EventMeta | null): EventMeta {
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
  };
}

function normalizePublish(b: BookingDetail): PublishInfo {
  return {
    status: b.gallery_publish_status ?? "published",
    embedding: b.embedding_status ?? "not_started",
    isActive: b.is_active !== false,
    outOfSync: b.media_out_of_sync === true,
    unsyncedCount: typeof b.unsynced_media_count === "number" ? b.unsynced_media_count : 0,
    // Name lock keys on "first photos synced", not on a publish action (which
    // no longer exists) — see the PublishInfo docs.
    hasBeenPublished: typeof b.gallery_published_at === "number",
  };
}

function computePillState(pub: PublishInfo): LivePillState {
  if (!pub.isActive) return "deactivated";
  // Out-of-sync is a STATUS, not a call to action: the pipeline embeds new
  // uploads and re-finalizes on its own; the workspace polls until the
  // backend reports in-sync again.
  if (pub.outOfSync) return "syncing";
  return "live";
}

export function EventWorkspace({ bookingId }: { bookingId: string }) {
  const [meta, setMeta] = useState<EventMeta | null>(null);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [folders, setFolders] = useState<CustomFolder[]>([]);
  const [folderCounts, setFolderCounts] = useState<Record<string, number>>({});
  const [likedCount, setLikedCount] = useState(0); // liked media in the booking
  const [shortlistedCount, setShortlistedCount] = useState(0); // shortlisted media
  const [locatedCount, setLocatedCount] = useState(0); // shortlisted + located media
  const [likedFilters, setLikedFilters] = useState<LikedFilters>(EMPTY_LIKED_FILTERS);
  const [totalCount, setTotalCount] = useState(0); // all media in the booking
  const [totalForView, setTotalForView] = useState(0); // media in the active view
  const [activeFolderId, setActiveFolderId] = useState<string>(ALL_MEDIA_ID);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>("media");
  const [pub, setPub] = useState<PublishInfo>(DEFAULT_PUB);
  const [banner, setBanner] = useState<{ count: number } | null>(null);
  const [coverBusy, setCoverBusy] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const engine = useUploadEngine(bookingId);

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
  const loadingMoreRef = useRef(false);
  useEffect(() => {
    metaRef.current = meta;
    pubRef.current = pub;
    mediaRef.current = media;
    activeFolderIdRef.current = activeFolderId;
    activeTabRef.current = activeTab;
    viewIdRef.current = viewId;
    totalForViewRef.current = totalForView;
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

  // Fetch one page of media for a view. ALL_MEDIA_ID → no folder filter;
  // LIKED_MEDIA_ID → the liked feed (most-liked first) with the active who-filters
  // (read via ref so paging/reloads always use the latest selection).
  const fetchPage = useCallback(
    (folderId: string, skip: number, limit: number) => {
      if (folderId === LIKED_MEDIA_ID) {
        const f = likedFiltersRef.current;
        return getMedia(bookingId, {
          skip,
          limit,
          onlyLiked: true,
          sort: f.sort,
          likedGuestType: f.audience === "all" ? undefined : f.audience,
          likedGuestSubTypes: f.subTypes,
          likedGuestIds: f.guestIds,
          shortlistedOnly: f.shortlistedOnly || f.awaitingOnly,
          awaitingOnly: f.awaitingOnly,
        });
      }
      return getMedia(bookingId, {
        customFolderId: folderId === ALL_MEDIA_ID ? undefined : folderId,
        skip,
        limit,
      });
    },
    [bookingId],
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
        if (typeof res.shortlistedCount === "number") setShortlistedCount(res.shortlistedCount);
        if (typeof res.locatedCount === "number") setLocatedCount(res.locatedCount);
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
  // or switching to/from the Smart Selects tab). Clearing the grid on a tab switch
  // is handled in `onTabChange` (an event) so this effect stays a pure load.
  useEffect(() => {
    void loadView(viewId);
  }, [viewId, loadView]);

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
      const next = normalizeMeta(res.booking, metaRef.current);
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
  const pipelineBusy = pub.outOfSync || pub.embedding === "in_progress";
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
      if (reloadTimer) return;
      reloadTimer = setTimeout(() => {
        reloadTimer = null;
        void reload();
      }, 1500);
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
        const list = await reload();
        const fresh = await reloadBooking();
        // Prefer the backend's unsynced counter (photos still processing);
        // fall back to the booking-wide total from the refresh.
        const added = (fresh?.unsyncedCount || 0) || totalCountRef.current || list.length;
        if (added > 0) setBanner({ count: added });
      })();
    }
    wasActiveRef.current = isActive;
  }, [engine.progress.isUploading, engine.progress.isSavingMetadata, reload, reloadBooking]);

  /* ── derived ────────────────────────────────────────────────── */

  const engineActive = engine.progress.isUploading || engine.progress.isSavingMetadata;
  const activeLocked = engineActive && !engine.progress.paused;
  const mediaReady = totalCount > 0;
  const hasMore = media.length < totalForView;
  const pillState = computePillState(pub);

  // Lock the global chrome only while actively uploading (paused unlocks it).
  usePageLock(activeLocked);
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
      await persistBooking({
        ...(nameLocked ? {} : { event_name: next.name }),
        event_type: next.type,
        ...(next.eventDate != null ? { event_date: next.eventDate } : {}),
      });
      toast("Event details saved");
    },
    [persistBooking, toast],
  );

  const doRegeneratePasscode = useCallback(async (): Promise<string> => {
    const res = await regenerateFamilyPasscode(bookingId);
    const code = res.family_passcode;
    setMeta((prev) => (prev ? { ...prev, familyPasscode: code } : prev));
    return code;
  }, [bookingId]);

  const setCoverFromUrl = useCallback(
    async (url: string) => {
      setCoverBusy(true);
      try {
        await persistBooking({ background_image: url, background_position: "50% 50%" });
        // API response may not echo background_image, so patch meta directly.
        setMeta((prev) => (prev ? { ...prev, backgroundImage: url, backgroundPosition: "50% 50%" } : prev));
        toast("Cover photo updated");
      } finally {
        setCoverBusy(false);
      }
    },
    [persistBooking, toast],
  );

  const setCoverFromFile = useCallback(
    async (file: File) => {
      setCoverBusy(true);
      try {
        const keyFolderId = folders[0]?._id ?? mediaRef.current[0]?.custom_folder_ids?.[0] ?? "cover";
        const url = await engine.uploadCover(file, keyFolderId);
        // A new cover resets the focal point to center.
        await persistBooking({ background_image: url, background_position: "50% 50%" });
        // API response may not echo background_image, so patch meta directly.
        setMeta((prev) => (prev ? { ...prev, backgroundImage: url, backgroundPosition: "50% 50%" } : prev));
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
        toast(`${real.length.toLocaleString("en-IN")} photo${real.length === 1 ? "" : "s"} deleted`);
      } catch (err) {
        setMedia(prev); // restore on failure
        toast(err instanceof Error ? err.message : "Could not delete — try again", "error");
      }
    },
    [persistBooking, reload, toast],
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
      // Un-shortlisting also clears `identified` server-side (see B1), so any of
      // these that were located drop out of the located count too.
      const wasLocated = shortlisted
        ? 0
        : prev.filter((m) => real.includes(m._id) && m.identified).length;
      const f = likedFiltersRef.current;
      const dropFromView = !shortlisted && (f.shortlistedOnly || f.awaitingOnly);
      setMedia((cur) =>
        dropFromView
          ? cur.filter((m) => !real.includes(m._id))
          : cur.map((m) =>
              real.includes(m._id)
                ? { ...m, shortlisted, ...(shortlisted ? {} : { identified: false }) }
                : m,
            ),
      );
      try {
        await updateMediaShortlist(real, shortlisted);
        setShortlistedCount((c) => Math.max(0, c + (shortlisted ? changed : -changed)));
        if (wasLocated > 0) setLocatedCount((c) => Math.max(0, c - wasLocated));
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

  /* ── topbar LivePill ────────────────────────────────────────── */

  // The pill is inert for the whole run (incl. paused) — toggling activation
  // mid-upload would be confusing; it re-enables once the run ends.
  const pillNode = useMemo(
    () => (
      <LivePill
        state={pillState}
        disabled={engineActive}
        unsyncedCount={pub.unsyncedCount}
        onActivate={doActivate}
        onDeactivate={doDeactivate}
      />
    ),
    [pillState, engineActive, pub.unsyncedCount, doActivate, doDeactivate],
  );
  usePageTopbarExtra(pillNode);

  /* ── tab gating ─────────────────────────────────────────────── */

  const galleryLocked = !mediaReady || activeLocked;
  // Galleries are live from creation, so Access & Sharing is always available
  // (the shared link + passcode exist as soon as the event does) — it only
  // locks while an upload is actively running.
  const accessLocked = activeLocked;
  // Smart Selects curates guest-liked photos — it needs media (likes come from
  // the live gallery, but an empty state covers the "no likes yet" case).
  const smartLocked = !mediaReady || activeLocked;
  // If the active tab becomes locked (media deleted, upload starts), the strip
  // and body fall back to Media without mutating `activeTab` state.
  const effectiveTab: TabId =
    (activeTab === "gallery" && galleryLocked) ||
    (activeTab === "access" && accessLocked) ||
    (activeTab === "smart" && smartLocked)
      ? "media"
      : activeTab;

  const tabs = useMemo(
    () => [
      { id: "media" as TabId, label: "Media", count: mediaReady ? totalCount : null },
      {
        id: "gallery" as TabId,
        label: "Gallery Design",
        locked: galleryLocked,
        tooltip: !mediaReady
          ? "Upload media to this event first to design the gallery."
          : "Available once the current upload finishes.",
      },
      {
        id: "access" as TabId,
        label: "Access & Sharing",
        locked: accessLocked,
        tooltip: "Available once the current upload finishes.",
      },
      {
        id: "smart" as TabId,
        label: "Smart Selects",
        locked: smartLocked,
        tooltip: !mediaReady
          ? "Upload media to this event first."
          : "Available once the current upload finishes.",
      },
    ],
    [mediaReady, totalCount, galleryLocked, accessLocked, smartLocked],
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
      folderCounts,
      likedCount,
      shortlistedCount,
      locatedCount,
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
      publishedEver: pub.hasBeenPublished,
      saveMeta,
      regenerateFamilyPasscode: doRegeneratePasscode,
      setCoverFromUrl,
      setCoverFromFile,
      setCoverPosition,
      coverBusy,
      deleteMediaIds,
      toast,
    }),
    [bookingId, meta, media, folders, reload, activeFolderId, setActiveFolder, folderCounts, likedCount, shortlistedCount, locatedCount, likedFilters, setLikedFilters, setShortlisted, totalCount, totalForView, hasMore, loadingMore, loadMore, engine, activeLocked, pub.hasBeenPublished, saveMeta, doRegeneratePasscode, setCoverFromUrl, setCoverFromFile, setCoverPosition, coverBusy, deleteMediaIds, toast],
  );

  const eventDateLabel = meta?.eventDate != null ? formatDate(meta.eventDate) : null;

  return (
    <EventProvider value={ctx}>
      <div className="flex min-w-0 flex-1 flex-col">
        <EventTabStrip tabs={tabs} active={effectiveTab} onChange={onTabChange} />

        {/* Mobile-only publish action row. The same pill is injected into the
            Topbar for desktop (usePageTopbarExtra); here it stays reachable on
            mobile where the Topbar hides it. One visible instance per breakpoint. */}
        <div className="sticky top-0 z-20 flex justify-end border-b border-[var(--color-brand-border)] bg-white px-4 py-2.5 md:hidden">
          {pillNode}
        </div>

        {banner && (
          <PostUploadBanner photoCount={banner.count} onDismiss={() => setBanner(null)} />
        )}

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
            eventName={ctx.meta.name}
            uniqueIdentifier={ctx.meta.uniqueIdentifier}
            familyPasscode={ctx.meta.familyPasscode}
            onRegenerate={doRegeneratePasscode}
          />
        )}
      </div>

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
