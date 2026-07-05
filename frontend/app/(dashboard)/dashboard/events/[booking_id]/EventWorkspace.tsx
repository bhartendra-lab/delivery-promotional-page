"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  deleteMedia,
  getBookingById,
  getMedia,
  publishGallery,
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
import { PostUploadBanner, PostUploadInfoDialog } from "./PostUploadBanner";
import { MediaTab } from "./MediaTab";
import { SmartSelectsTab } from "./SmartSelectsTab";
import { GalleryDesignTab } from "./GalleryDesignTab";
import { AccessSharingTab } from "./AccessSharingTab";

/** Publish/activation snapshot, sourced authoritatively from get-booking-by-id. */
type PublishInfo = {
  status: GalleryPublishStatus;
  embedding: EmbeddingStatus;
  isActive: boolean;
  outOfSync: boolean;
  unsyncedCount: number;
  /**
   * True once the gallery has been published at least once (`gallery_published_at`
   * set, or currently published). Survives later unpublish/deactivate/expire so
   * the name + cover stay locked for the event's life.
   */
  hasBeenPublished: boolean;
};

const DEFAULT_PUB: PublishInfo = {
  status: "unpublished",
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
    status: b.gallery_publish_status === "published" ? "published" : "unpublished",
    embedding: b.embedding_status ?? "not_started",
    isActive: b.is_active !== false,
    outOfSync: b.media_out_of_sync === true,
    unsyncedCount: typeof b.unsynced_media_count === "number" ? b.unsynced_media_count : 0,
    hasBeenPublished:
      b.gallery_publish_status === "published" || typeof b.gallery_published_at === "number",
  };
}

function computePillState(pub: PublishInfo, mediaReady: boolean): LivePillState {
  if (!mediaReady) return "empty";
  if (pub.embedding === "in_progress") return "publishing";
  if (!pub.isActive) return "deactivated";
  if (pub.status === "published" && pub.outOfSync) return "republish";
  if (pub.status === "published") return "published";
  return "publish";
}

export function EventWorkspace({ bookingId }: { bookingId: string }) {
  const [meta, setMeta] = useState<EventMeta | null>(null);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [folders, setFolders] = useState<CustomFolder[]>([]);
  const [folderCounts, setFolderCounts] = useState<Record<string, number>>({});
  const [likedCount, setLikedCount] = useState(0); // liked media in the booking
  const [shortlistedCount, setShortlistedCount] = useState(0); // shortlisted media
  const [likedFilters, setLikedFilters] = useState<LikedFilters>(EMPTY_LIKED_FILTERS);
  const [totalCount, setTotalCount] = useState(0); // all media in the booking
  const [totalForView, setTotalForView] = useState(0); // media in the active view
  const [activeFolderId, setActiveFolderId] = useState<string>(ALL_MEDIA_ID);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>("media");
  const [pub, setPub] = useState<PublishInfo>(DEFAULT_PUB);
  const [banner, setBanner] = useState<{ type: "publish" | "republish"; count: number } | null>(null);
  const [infoDialog, setInfoDialog] = useState<number | null>(null);
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
          sort: "likes",
          likedGuestType: f.audience === "all" ? undefined : f.audience,
          likedGuestSubTypes: f.subTypes,
          likedGuestIds: f.guestIds,
          shortlistedOnly: f.shortlistedOnly,
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

  // While embeddings are processing, poll so the pill flips to Published on
  // completion without a manual refresh ("we'll notify you" + auto-update).
  useEffect(() => {
    if (pub.embedding !== "in_progress") return;
    const id = setInterval(() => void reloadBooking(), POLL_MS);
    return () => clearInterval(id);
  }, [pub.embedding, reloadBooking]);

  // Notify in-app when an embedding run finishes (publish / republish done).
  const prevEmbeddingRef = useRef<EmbeddingStatus | null>(null);
  useEffect(() => {
    const prev = prevEmbeddingRef.current;
    if (prev === "in_progress" && pub.embedding === "completed" && pub.status === "published") {
      toast("Your AI gallery is now live for guests.");
    } else if (prev === "in_progress" && pub.embedding === "failed") {
      toast("Publishing failed — please try again from the top-right button.", "error");
    }
    prevEmbeddingRef.current = pub.embedding;
  }, [pub.embedding, pub.status, toast]);

  /* ── engine ↔ state wiring ──────────────────────────────────── */

  // New media uploaded to an already-published gallery must be tagged so the
  // backend flags media_out_of_sync (drives Republish on return).
  useEffect(() => {
    engine.setOutOfSync(pub.status === "published");
  }, [engine, pub.status]);

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
  // banner (and the info dialog when new media landed on a published gallery).
  const wasActiveRef = useRef(false);
  useEffect(() => {
    const isActive = engine.progress.isUploading || engine.progress.isSavingMetadata;
    if (wasActiveRef.current && !isActive) {
      void (async () => {
        const list = await reload();
        // `wasPublished` is read before the refresh so it reflects the state
        // *before* this upload; the fresh count comes from the refresh.
        const wasPublished = pubRef.current.status === "published";
        const fresh = await reloadBooking();
        // `reload` just refreshed the booking-wide total; prefer it over the
        // loaded-page length so the banner counts every uploaded photo.
        const totalAll = totalCountRef.current;
        if (wasPublished) {
          const added = (fresh?.unsyncedCount || 0) || totalAll || list.length;
          setBanner({ type: "republish", count: added });
          setInfoDialog(added);
        } else if (totalAll > 0) {
          setBanner({ type: "publish", count: totalAll });
        }
      })();
    }
    wasActiveRef.current = isActive;
  }, [engine.progress.isUploading, engine.progress.isSavingMetadata, reload, reloadBooking]);

  /* ── derived ────────────────────────────────────────────────── */

  const engineActive = engine.progress.isUploading || engine.progress.isSavingMetadata;
  const activeLocked = engineActive && !engine.progress.paused;
  const mediaReady = totalCount > 0;
  const hasMore = media.length < totalForView;
  const pillState = computePillState(pub, mediaReady);

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
      const dropFromView = !shortlisted && likedFiltersRef.current.shortlistedOnly;
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

  /* ── publish / activation actions ───────────────────────────── */

  const doPublish = useCallback(async () => {
    try {
      await publishGallery(bookingId);
      await reloadBooking();
      setBanner(null);
      toast("Publishing started — the AI gallery is getting ready. We'll notify you once it's live.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not start publishing", "error");
    }
  }, [bookingId, reloadBooking, toast]);

  const doRepublish = useCallback(async () => {
    try {
      await publishGallery(bookingId);
      await reloadBooking();
      setBanner(null);
      setInfoDialog(null);
      toast("Republishing started — we'll notify you once the new photos are live.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not start republishing", "error");
    }
  }, [bookingId, reloadBooking, toast]);

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

  // The pill is inert for the whole run (incl. paused) — publishing a partial
  // gallery mid-upload would be wrong; it re-enables only once the run ends.
  // A cover photo is required before the first publish (it's the hero guests
  // see). Block the Publish CTA until one is set and explain why.
  const coverMissing = !meta?.backgroundImage;
  const pillNode = useMemo(
    () => (
      <LivePill
        state={pillState}
        disabled={engineActive}
        unsyncedCount={pub.unsyncedCount}
        publishBlocked={coverMissing}
        onPublishBlocked={() => toast("Add a cover photo before publishing.", "error")}
        onPublish={doPublish}
        onRepublish={doRepublish}
        onActivate={doActivate}
        onDeactivate={doDeactivate}
      />
    ),
    [pillState, engineActive, pub.unsyncedCount, coverMissing, toast, doPublish, doRepublish, doActivate, doDeactivate],
  );
  usePageTopbarExtra(pillNode);

  /* ── tab gating ─────────────────────────────────────────────── */

  const galleryLocked = !mediaReady || activeLocked;
  const accessLocked = pub.status !== "published" || activeLocked;
  // Smart Selects curates guest-liked photos — it needs media (likes come from
  // the published gallery, but an empty state covers the "no likes yet" case).
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
        tooltip:
          pub.status !== "published"
            ? "Publish the gallery to manage sharing & guest access."
            : "Available once the current upload finishes.",
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
    [mediaReady, totalCount, galleryLocked, accessLocked, smartLocked, pub.status],
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
    [bookingId, meta, media, folders, reload, activeFolderId, setActiveFolder, folderCounts, likedCount, shortlistedCount, likedFilters, setLikedFilters, setShortlisted, totalCount, totalForView, hasMore, loadingMore, loadMore, engine, activeLocked, pub.hasBeenPublished, saveMeta, doRegeneratePasscode, setCoverFromUrl, setCoverFromFile, setCoverPosition, coverBusy, deleteMediaIds, toast],
  );

  const eventDateLabel = meta?.eventDate != null ? formatDate(meta.eventDate) : null;

  return (
    <EventProvider value={ctx}>
      <div className="flex min-w-0 flex-1 flex-col">
        <EventTabStrip tabs={tabs} active={effectiveTab} onChange={onTabChange} />

        {banner && (
          <PostUploadBanner type={banner.type} photoCount={banner.count} onDismiss={() => setBanner(null)} />
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

      {infoDialog != null && (
        <PostUploadInfoDialog photoCount={infoDialog} onClose={() => setInfoDialog(null)} />
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
