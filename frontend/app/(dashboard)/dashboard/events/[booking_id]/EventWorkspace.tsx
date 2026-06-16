"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  deleteMedia,
  getBookingById,
  getMedia,
  publishGallery,
  updateBooking,
  updateGalleryActivationStatus,
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
import { EventProvider, type EventMeta } from "./EventContext";
import { EventTabStrip, type TabId } from "./EventTabStrip";
import { LivePill, type LivePillState } from "./LivePill";
import { PostUploadBanner, PostUploadInfoDialog } from "./PostUploadBanner";
import { MediaTab } from "./MediaTab";
import { GalleryDesignTab } from "./GalleryDesignTab";
import { AccessSharingTab } from "./AccessSharingTab";

/** Publish/activation snapshot, sourced authoritatively from get-booking-by-id. */
type PublishInfo = {
  status: GalleryPublishStatus;
  embedding: EmbeddingStatus;
  isActive: boolean;
  outOfSync: boolean;
  unsyncedCount: number;
};

const DEFAULT_PUB: PublishInfo = {
  status: "unpublished",
  embedding: "not_started",
  isActive: true,
  outOfSync: false,
  unsyncedCount: 0,
};

const POLL_MS = 20000;

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
    customMessage: b.custom_message ?? prev?.customMessage,
    styleVariant: b.style_variant ?? prev?.styleVariant,
    includeBranding: b.include_company_branding ?? prev?.includeBranding,
  };
}

function normalizePublish(b: BookingDetail): PublishInfo {
  return {
    status: b.gallery_publish_status === "published" ? "published" : "unpublished",
    embedding: b.embedding_status ?? "not_started",
    isActive: b.is_active !== false,
    outOfSync: b.media_out_of_sync === true,
    unsyncedCount: typeof b.unsynced_media_count === "number" ? b.unsynced_media_count : 0,
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
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>("media");
  const [pub, setPub] = useState<PublishInfo>(DEFAULT_PUB);
  const [banner, setBanner] = useState<{ type: "publish" | "republish"; count: number } | null>(null);
  const [infoDialog, setInfoDialog] = useState<number | null>(null);
  const [coverBusy, setCoverBusy] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const engine = useUploadEngine(bookingId);

  // Refs so async handlers/effects read the latest values without re-binding.
  const metaRef = useRef<EventMeta | null>(meta);
  const pubRef = useRef(pub);
  const mediaRef = useRef(media);
  useEffect(() => {
    metaRef.current = meta;
    pubRef.current = pub;
    mediaRef.current = media;
  });

  const toast = useCallback((msg: string) => setToastMsg(msg), []);
  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 3200);
    return () => clearTimeout(t);
  }, [toastMsg]);

  /* ── data load ──────────────────────────────────────────────── */

  const reload = useCallback(async (): Promise<MediaItem[]> => {
    try {
      const res = await getMedia(bookingId);
      const list = res.media ?? [];
      setMedia(list);
      setFolders(res.customFolders ?? []);
      return list;
    } catch {
      return mediaRef.current;
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    void reload();
  }, [reload]);

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
      toast("Publishing failed — please try again from the top-right button.");
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
        if (wasPublished) {
          const added = (fresh?.unsyncedCount || 0) || list.length;
          setBanner({ type: "republish", count: added });
          setInfoDialog(added);
        } else if (list.length > 0) {
          setBanner({ type: "publish", count: list.length });
        }
      })();
    }
    wasActiveRef.current = isActive;
  }, [engine.progress.isUploading, engine.progress.isSavingMetadata, reload, reloadBooking]);

  /* ── derived ────────────────────────────────────────────────── */

  const engineActive = engine.progress.isUploading || engine.progress.isSavingMetadata;
  const activeLocked = engineActive && !engine.progress.paused;
  const mediaReady = media.length > 0;
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
      await persistBooking({
        event_name: next.name,
        event_type: next.type,
        ...(next.eventDate != null ? { event_date: next.eventDate } : {}),
      });
      toast("Event details saved");
    },
    [persistBooking, toast],
  );

  const setCoverFromUrl = useCallback(
    async (url: string) => {
      setCoverBusy(true);
      try {
        await persistBooking({ background_image: url });
        // API response may not echo background_image, so patch meta directly.
        setMeta((prev) => (prev ? { ...prev, backgroundImage: url } : prev));
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
        await persistBooking({ background_image: url });
        // API response may not echo background_image, so patch meta directly.
        setMeta((prev) => (prev ? { ...prev, backgroundImage: url } : prev));
        toast("Cover photo updated");
      } catch (err) {
        toast(err instanceof Error ? err.message : "Could not set cover");
      } finally {
        setCoverBusy(false);
      }
    },
    [engine, folders, persistBooking, toast],
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
        toast(err instanceof Error ? err.message : "Could not delete — try again");
      }
    },
    [persistBooking, reload, toast],
  );

  /* ── publish / activation actions ───────────────────────────── */

  const doPublish = useCallback(async () => {
    try {
      await publishGallery(bookingId);
      await reloadBooking();
      setBanner(null);
      toast("Publishing started — the AI gallery is getting ready. We'll notify you once it's live.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not start publishing");
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
      toast(err instanceof Error ? err.message : "Could not start republishing");
    }
  }, [bookingId, reloadBooking, toast]);

  const doDeactivate = useCallback(async () => {
    try {
      await updateGalleryActivationStatus(bookingId, false);
      await reloadBooking();
      toast("Gallery deactivated — guests can't open the link until you reactivate.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not deactivate");
    }
  }, [bookingId, reloadBooking, toast]);

  const doActivate = useCallback(async () => {
    try {
      await updateGalleryActivationStatus(bookingId, true);
      await reloadBooking();
      toast("Gallery reactivated — it's live for guests again.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not reactivate");
    }
  }, [bookingId, reloadBooking, toast]);

  /* ── topbar LivePill ────────────────────────────────────────── */

  // The pill is inert for the whole run (incl. paused) — publishing a partial
  // gallery mid-upload would be wrong; it re-enables only once the run ends.
  const pillNode = useMemo(
    () => (
      <LivePill
        state={pillState}
        disabled={engineActive}
        unsyncedCount={pub.unsyncedCount}
        onPublish={doPublish}
        onRepublish={doRepublish}
        onActivate={doActivate}
        onDeactivate={doDeactivate}
      />
    ),
    [pillState, engineActive, pub.unsyncedCount, doPublish, doRepublish, doActivate, doDeactivate],
  );
  usePageTopbarExtra(pillNode);

  /* ── tab gating ─────────────────────────────────────────────── */

  const galleryLocked = !mediaReady || activeLocked;
  const accessLocked = pub.status !== "published" || activeLocked;
  // If the active tab becomes locked (media deleted, upload starts), the strip
  // and body fall back to Media without mutating `activeTab` state.
  const effectiveTab: TabId =
    (activeTab === "gallery" && galleryLocked) || (activeTab === "access" && accessLocked) ? "media" : activeTab;

  const tabs = useMemo(
    () => [
      { id: "media" as TabId, label: "Media", count: mediaReady ? media.length : null },
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
    ],
    [mediaReady, media.length, galleryLocked, accessLocked, pub.status],
  );

  const ctx = useMemo(
    () => ({
      bookingId,
      meta: meta ?? { name: "Untitled event", type: "Event", eventDate: null },
      media,
      folders,
      setFolders,
      reload,
      engine,
      activeLocked,
      saveMeta,
      setCoverFromUrl,
      setCoverFromFile,
      coverBusy,
      deleteMediaIds,
      toast,
    }),
    [bookingId, meta, media, folders, reload, engine, activeLocked, saveMeta, setCoverFromUrl, setCoverFromFile, coverBusy, deleteMediaIds, toast],
  );

  const eventDateLabel = meta?.eventDate != null ? formatDate(meta.eventDate) : null;

  return (
    <EventProvider value={ctx}>
      <div className="flex min-w-0 flex-1 flex-col">
        <EventTabStrip tabs={tabs} active={effectiveTab} onChange={setActiveTab} />

        {banner && (
          <PostUploadBanner type={banner.type} photoCount={banner.count} onDismiss={() => setBanner(null)} />
        )}

        {effectiveTab === "media" && <MediaTab loading={loading} />}
        {effectiveTab === "gallery" && (
          <GalleryDesignTab
            eventName={ctx.meta.name}
            eventType={ctx.meta.type}
            eventDateLabel={eventDateLabel}
            coverUrl={ctx.meta.backgroundImage}
            initialStyleVariant={ctx.meta.styleVariant}
            initialCustomMessage={ctx.meta.customMessage}
            initialIncludeBranding={ctx.meta.includeBranding}
            onSave={async (vals) => {
              await persistBooking(vals);
              toast("Gallery design saved");
            }}
          />
        )}
        {effectiveTab === "access" && <AccessSharingTab eventName={ctx.meta.name} bookingId={bookingId} />}
      </div>

      {infoDialog != null && (
        <PostUploadInfoDialog photoCount={infoDialog} onClose={() => setInfoDialog(null)} />
      )}

      {toastMsg && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[230] flex justify-center px-4">
          <div className="toast-rise pointer-events-auto inline-flex items-center gap-2 rounded-lg bg-[var(--color-brand-ink)] px-4 py-2.5 text-[13px] font-semibold text-white shadow-[0_8px_24px_rgba(42,34,24,0.25)]">
            {toastMsg}
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
