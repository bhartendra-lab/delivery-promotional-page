"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CustomFolder, GuestMediaItem, GuestSession } from "@/lib/types";
import { SIGNAL } from "@/lib/client-theme";
import { catchGuestBehavior, GuestAuthError, getGuestMedia, likePhoto, searchSelfie, unlikePhoto } from "@/lib/guest-api";
import { getCachedMediaIds, setCachedMediaIds } from "@/lib/guest-auth";
import { downloadMany, nameFromUrl, streamZipToDisk } from "@/lib/media-actions";
import { useEventTheme } from "../EventThemeContext";
import { usePolicy } from "../policy/PolicyContext";
import { PhotoViewer } from "./lounge/PhotoViewer";
import { PasscodeSheet } from "./lounge/PasscodeSheet";
import { ProfileSheet } from "./lounge/ProfileSheet";
import { GalleryGrid } from "./gallery/GalleryGrid";

const PAGE = 60;
const ALL = "__all__";

/**
 * The authenticated guest experience: themed lounge (hero + match + studio) and
 * the gallery (folder pills, infinite scroll, select, like, viewer). Pre-passcode
 * only My Photos exist; unlocking reveals the My Photos | All Photos tabs.
 */
export function LoungeGallery({
  session,
  onSessionChange,
  onReauth,
  onRescan,
  onSignOut,
}: {
  session: GuestSession;
  onSessionChange: (patch: Partial<GuestSession>) => void;
  onReauth: () => void;
  onRescan: () => void;
  onSignOut: () => void;
}) {
  const { theme: t, event, uniqueIdentifier } = useEventTheme();
  const bookingId = event.booking_id;
  const branding = event.include_company_branding === true;
  const unlocked = session.guest_type === "host";

  // Full-gallery ZIP is host-only and now built in the browser (client-zip,
  // streamed to disk), so it's available whenever the guest is unlocked — there's
  // no backend zip state to gate on any more.
  const canDownloadAll = unlocked;

  const [view, setView] = useState<"home" | "gallery">("home");
  const [tab, setTab] = useState<"mine" | "all">("mine");
  const [folder, setFolder] = useState<string>(ALL);
  const [likedView, setLikedView] = useState(false);

  const [items, setItems] = useState<GuestMediaItem[]>([]);
  const [folders, setFolders] = useState<CustomFolder[]>([]);
  const [folderCounts, setFolderCounts] = useState<Record<string, number>>({});
  const [totalForView, setTotalForView] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [homeThumbs, setHomeThumbs] = useState<GuestMediaItem[]>([]);
  const homeThumbsLoaded = useRef(false);

  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [passcodeOpen, setPasscodeOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const effTab: "mine" | "all" = unlocked ? tab : "mine";
  const loadingMoreRef = useRef(false);

  // The guest's matched media_ids drive "My Photos" and the match count. They're
  // not stored server-side: seed from the per-session cache (a fresh scan / prior
  // visit in this tab fills it), and `null` means "not resolved yet" — the effect
  // below runs search-selfie once to populate it. Closing the tab clears the
  // cache, so reopening re-runs the search.
  const [mediaIds, setMediaIds] = useState<string[] | null>(() => getCachedMediaIds(uniqueIdentifier));

  useEffect(() => {
    if (mediaIds !== null) return; // cache hit (or already resolved) — nothing to do
    let cancelled = false;
    (async () => {
      await Promise.resolve(); // defer — no synchronous setState in the effect body
      if (cancelled) return;
      if (!session.selfie_id) {
        setMediaIds([]); // no selfie to search with → empty matched set
        return;
      }
      try {
        const res = await searchSelfie(uniqueIdentifier, {
          selfie_id: session.selfie_id,
          booking_id: bookingId,
        });
        if (cancelled) return;
        const ids = res.data ?? [];
        setCachedMediaIds(uniqueIdentifier, ids);
        setMediaIds(ids);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof GuestAuthError) onReauth();
        else setMediaIds([]); // fail closed to "no matches"; the grid shows empty
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mediaIds, uniqueIdentifier, bookingId, session.selfie_id, onReauth]);

  // Seed the liked set from the server's per-photo liked_by_me flag so hearts
  // persist across reloads (additive — optimistic toggles still win in-session).
  const seedLikes = useCallback((media: GuestMediaItem[]) => {
    setLiked((prev) => {
      let changed = false;
      const n = new Set(prev);
      for (const m of media) {
        if (m.liked_by_me && !n.has(m._id)) {
          n.add(m._id);
          changed = true;
        }
      }
      return changed ? n : prev;
    });
  }, []);

  // Load the first page whenever the view (tab/folder/liked) changes. Waits for
  // the matched set to resolve first — the backend restricts non-host guests to
  // those ids, so firing before they're known would return an empty gallery.
  useEffect(() => {
    if (mediaIds === null) return;
    let cancelled = false;
    (async () => {
      await Promise.resolve(); // defer — no synchronous setState in the effect body
      if (cancelled) return;
      setLoading(true);
      setLoadError(false);
      try {
        const res = await getGuestMedia(uniqueIdentifier, bookingId, {
          mine: !likedView && effTab === "mine",
          onlyLiked: likedView,
          customFolderId: likedView || folder === ALL ? undefined : folder,
          skip: 0,
          limit: PAGE,
        }, mediaIds);
        if (cancelled) return;
        const media = res.media ?? [];
        setItems(media);
        if (res.customFolders) setFolders(res.customFolders);
        if (res.folderCounts) setFolderCounts(res.folderCounts);
        setTotalForView(typeof res.total === "number" ? res.total : media.length);
        seedLikes(media);
        if (!homeThumbsLoaded.current && !likedView && effTab === "mine" && folder === ALL) {
          setHomeThumbs(media.slice(0, 4));
          homeThumbsLoaded.current = true;
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof GuestAuthError) onReauth();
        else setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uniqueIdentifier, bookingId, effTab, folder, likedView, onReauth, reloadKey, seedLikes, mediaIds]);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || items.length >= totalForView) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const res = await getGuestMedia(uniqueIdentifier, bookingId, {
        mine: !likedView && effTab === "mine",
        onlyLiked: likedView,
        customFolderId: likedView || folder === ALL ? undefined : folder,
        skip: items.length,
        limit: PAGE,
      }, mediaIds ?? []);
      const more = res.media ?? [];
      if (more.length) {
        seedLikes(more);
        setItems((prev) => {
          const seen = new Set(prev.map((m) => m._id));
          return [...prev, ...more.filter((m) => !seen.has(m._id))];
        });
      }
    } catch {
      /* leave as-is; scrolling again retries */
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [uniqueIdentifier, bookingId, effTab, folder, likedView, items.length, totalForView, seedLikes, mediaIds]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(id);
  }, [toast]);

  // Server returns the right set per view, so no client-side filtering.
  const displayed = items;
  const hasMore = items.length < totalForView;

  const toggleLike = useCallback(
    (item: GuestMediaItem) => {
      const wasLiked = liked.has(item._id);
      const bumpCount = (delta: number) =>
        setItems((prev) =>
          prev.map((m) => (m._id === item._id ? { ...m, likes_count: Math.max(0, (m.likes_count ?? 0) + delta) } : m)),
        );
      const setLikedFlag = (on: boolean) =>
        setLiked((prev) => {
          const n = new Set(prev);
          if (on) n.add(item._id);
          else n.delete(item._id);
          return n;
        });

      // optimistic
      setLikedFlag(!wasLiked);
      bumpCount(wasLiked ? -1 : 1);

      (wasLiked ? unlikePhoto(uniqueIdentifier, item.media_id) : likePhoto(uniqueIdentifier, item.media_id)).catch((err) => {
        // revert
        setLikedFlag(wasLiked);
        bumpCount(wasLiked ? 1 : -1);
        if (err instanceof GuestAuthError) onReauth();
      });
    },
    [liked, uniqueIdentifier, onReauth],
  );

  const toggleSel = useCallback((item: GuestMediaItem) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(item._id)) n.delete(item._id);
      else n.add(item._id);
      return n;
    });
  }, []);
  const exitSelect = useCallback(() => {
    setSelectMode(false);
    setSelected(new Set());
  }, []);
  const enterSelectWith = useCallback((item: GuestMediaItem) => {
    setSelectMode(true);
    setSelected(new Set([item._id]));
  }, []);

  // Build a ZIP in the browser and stream it to disk (client-zip + File System
  // Access API, Blob fallback). `getEntries` resolves the {url,name} list (may
  // paginate); the toast carries progress, and `zipping` guards against re-entry.
  const runZip = useCallback(
    async (getEntries: () => Promise<{ url: string; name: string }[]>, filename: string) => {
      if (zipping) return;
      setZipping(true);
      setToast("Preparing your download…");
      try {
        // Pass the provider so the "Save as" dialog opens on the click gesture,
        // before the (possibly slow) full-gallery pagination runs.
        const { zipped, failed, cancelled } = await streamZipToDisk(getEntries, filename, (done, total) =>
          setToast(`Downloading ${done.toLocaleString("en-IN")}/${total.toLocaleString("en-IN")}…`),
        );
        if (cancelled) {
          setToast(null);
          return;
        }
        setToast(
          zipped === 0
            ? "No photos to download"
            : failed > 0
              ? `Saved ${zipped.toLocaleString("en-IN")} — ${failed.toLocaleString("en-IN")} couldn't be fetched`
              : "Saved to your downloads",
        );
      } catch (e) {
        if (e instanceof GuestAuthError) {
          onReauth();
          return;
        }
        console.warn("[runZip] failed", e);
        setToast("Download failed — please try again");
      } finally {
        setZipping(false);
      }
    },
    [zipping, onReauth],
  );

  async function downloadSelected() {
    const chosen = displayed.filter((i) => selected.has(i._id));
    if (!chosen.length) return;
    // One photo → straight download; several → a single browser-built ZIP.
    if (chosen.length === 1) {
      setToast("Downloading 1 photo…");
      await downloadMany([chosen[0].url]);
      setToast("Download started");
      exitSelect();
      return;
    }
    const entries = chosen.map((i) => ({ url: i.url, name: nameFromUrl(i.url) }));
    exitSelect();
    void runZip(async () => entries, `${event.event_name || "gallery"} (${entries.length} photos).zip`);
  }

  // Paginate the guest media API into {url,name} entries for a browser-built ZIP.
  const fetchMediaEntriesForZip = useCallback(
    async (scope: { mine?: boolean; onlyLiked?: boolean; customFolderId?: string }) => {
      const entries: { url: string; name: string }[] = [];
      const seen = new Set<string>();
      const PAGE_SIZE = 500;
      for (let skip = 0; ; skip += PAGE_SIZE) {
        const res = await getGuestMedia(
          uniqueIdentifier,
          bookingId,
          {
            mine: scope.mine,
            onlyLiked: scope.onlyLiked,
            customFolderId: scope.customFolderId,
            skip,
            limit: PAGE_SIZE,
          },
          mediaIds ?? [],
        );
        const media = res.media ?? [];
        for (const m of media) {
          if (seen.has(m._id)) continue;
          seen.add(m._id);
          entries.push({ url: m.url, name: nameFromUrl(m.url) });
        }
        // Stop on an empty or short page only — don't trust `total` for stopping;
        // the API may report a capped total (e.g. 1000) even when more media exists.
        if (media.length === 0 || media.length < PAGE_SIZE) break;
      }
      return entries;
    },
    [uniqueIdentifier, bookingId, mediaIds],
  );

  // Lounge + gallery "All" folder: the complete unlocked gallery.
  const downloadFullGalleryZip = useCallback(() => {
    const base = (event.event_name || "gallery").trim() || "gallery";
    void runZip(() => fetchMediaEntriesForZip({ mine: false }), `${base}.zip`);
  }, [runZip, fetchMediaEntriesForZip, event.event_name]);

  // Gallery header: honour the active folder pill; "All" still means every photo.
  const downloadGalleryZip = useCallback(() => {
    const base = (event.event_name || "gallery").trim() || "gallery";
    if (likedView) {
      void runZip(() => fetchMediaEntriesForZip({ onlyLiked: true }), `${base} - liked.zip`);
      return;
    }
    if (folder !== ALL) {
      const folderName = folders.find((f) => f._id === folder)?.name?.trim() || "folder";
      void runZip(
        () =>
          fetchMediaEntriesForZip({
            mine: effTab === "mine",
            customFolderId: folder,
          }),
        `${base} - ${folderName}.zip`,
      );
      return;
    }
    downloadFullGalleryZip();
  }, [runZip, fetchMediaEntriesForZip, event.event_name, likedView, folder, folders, effTab, downloadFullGalleryZip]);

  // Studio-CTA engagement tracking. Fire-and-forget so it can never block the
  // link's navigation (both CTAs open an external page in a new tab).
  const onReviewClick = useCallback(() => {
    catchGuestBehavior(uniqueIdentifier, { review_button_clicked: true }).catch((e) =>
      console.warn("[catchGuestBehavior] review failed", e),
    );
  }, [uniqueIdentifier]);
  const onContactClick = useCallback(() => {
    catchGuestBehavior(uniqueIdentifier, { contact_button_clicked: true }).catch((e) =>
      console.warn("[catchGuestBehavior] contact failed", e),
    );
  }, [uniqueIdentifier]);

  function gotoGallery(nextTab: "mine" | "all") {
    setTab(nextTab);
    setFolder(ALL);
    setLikedView(false);
    exitSelect();
    setView("gallery");
  }

  const navActive = view === "home" ? "home" : likedView ? "liked" : "gallery";
  const goHome = () => {
    setView("home");
    exitSelect();
  };
  const goGallery = () => {
    setLikedView(false);
    setView("gallery");
  };
  const goLiked = () => {
    setLikedView(true);
    exitSelect();
    setView("gallery");
  };

  /* ── render ───────────────────────────────────────────────────────────── */

  return (
    <div className="relative flex h-[100dvh] overflow-hidden" style={{ background: t.bg, fontFamily: t.font, color: t.text }}>
      <SideRail t={t} event={event} active={navActive} onHome={goHome} onGallery={goGallery} onLiked={goLiked} />
      <div className="flex min-h-0 flex-1 flex-col">
      {view === "home" ? (
        <LoungeHome
          t={t}
          event={event}
          branding={branding}
          unlocked={unlocked}
          matchCount={mediaIds?.length ?? 0}
          guestName={session.name}
          selfieUrl={session.selfie_url}
          onOpenProfile={() => setProfileOpen(true)}
          homeThumbs={homeThumbs}
          canDownloadAll={canDownloadAll}
          zipping={zipping}
          onDownloadAll={downloadFullGalleryZip}
          onSeeMine={() => gotoGallery("mine")}
          onSeeAll={() => gotoGallery("all")}
          onUnlock={() => setPasscodeOpen(true)}
          onReviewClick={onReviewClick}
          onContactClick={onContactClick}
        />
      ) : (
        <GalleryView
          t={t}
          unlocked={unlocked}
          tab={tab}
          setTab={(k) => {
            setTab(k);
            setFolder(ALL);
            setLikedView(false);
            exitSelect();
          }}
          effTab={effTab}
          folders={folders}
          folderCounts={folderCounts}
          folder={folder}
          setFolder={(f) => {
            setFolder(f);
            exitSelect();
          }}
          items={displayed}
          loading={loading}
          loadError={loadError}
          onRetry={() => setReloadKey((k) => k + 1)}
          loadingMore={loadingMore}
          hasMore={hasMore}
          onLoadMore={loadMore}
          totalForView={likedView ? displayed.length : totalForView}
          likedView={likedView}
          selectMode={selectMode}
          selected={selected}
          liked={liked}
          onToggleSelect={toggleSel}
          onToggleLike={toggleLike}
          onEnterSelectWith={enterSelectWith}
          onOpen={(i) => setViewerIndex(i)}
          onToggleSelectMode={() => (selectMode ? exitSelect() : setSelectMode(true))}
          canDownloadAll={canDownloadAll}
          zipping={zipping}
          onDownloadAll={downloadGalleryZip}
        />
      )}
      </div>

      {/* bottom nav (mobile only — desktop uses the side rail) */}
      <BottomNav t={t} active={navActive} onHome={goHome} onGallery={goGallery} onLiked={goLiked} />

      {/* select action bar */}
      {selectMode && (
        <div className="fixed inset-x-0 bottom-[84px] z-40 flex justify-center px-5 lg:bottom-6">
          <div className="flex w-full max-w-[460px] items-center justify-between rounded-full px-4 py-2.5" style={{ background: t.card, boxShadow: t.shadow }}>
            <span className="text-[12.5px] font-extrabold" style={{ color: t.text }}>
              {selected.size} selected
            </span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={exitSelect} className="cursor-pointer rounded-full px-3 py-2 text-[12.5px] font-bold" style={{ color: t.muted }}>
                Cancel
              </button>
              <button
                type="button"
                onClick={downloadSelected}
                disabled={selected.size === 0}
                className="cursor-pointer rounded-full px-4 py-2 text-[12.5px] font-extrabold disabled:cursor-not-allowed disabled:opacity-50"
                style={{ background: t.brand, color: t.onBrand }}
              >
                Download
              </button>
            </div>
          </div>
        </div>
      )}

      {/* viewer */}
      {viewerIndex != null && displayed[viewerIndex] && (
        <PhotoViewer
          items={displayed}
          index={viewerIndex}
          onClose={() => setViewerIndex(null)}
          onNav={setViewerIndex}
          liked={liked}
          onToggleLike={toggleLike}
          selectMode={selectMode}
          selected={selected}
          onToggleSelect={toggleSel}
          onToast={setToast}
        />
      )}

      {/* passcode */}
      {passcodeOpen && (
        <PasscodeSheet
          onClose={() => setPasscodeOpen(false)}
          onSuccess={() => {
            onSessionChange({ guest_type: "host" });
            setPasscodeOpen(false);
            setToast("Full gallery unlocked");
          }}
        />
      )}

      {/* profile / DP */}
      {profileOpen && (
        <ProfileSheet
          name={session.name}
          selfieUrl={session.selfie_url}
          onClose={() => setProfileOpen(false)}
          onRescan={() => {
            setProfileOpen(false);
            onRescan();
          }}
          onSignOut={onSignOut}
        />
      )}

      {/* toast */}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[150px] z-50 flex justify-center px-5 lg:bottom-8">
          <div className="rounded-full px-4 py-2.5 text-[12.5px] font-bold text-white shadow-lg" style={{ background: SIGNAL.viewer }}>
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── lounge home ────────────────────────────────────────────────────────── */

type Theme = ReturnType<typeof useEventTheme>["theme"];

function LoungeHome({
  t,
  event,
  branding,
  unlocked,
  matchCount,
  guestName,
  selfieUrl,
  onOpenProfile,
  homeThumbs,
  canDownloadAll,
  zipping,
  onDownloadAll,
  onSeeMine,
  onSeeAll,
  onUnlock,
  onReviewClick,
  onContactClick,
}: {
  t: Theme;
  event: ReturnType<typeof useEventTheme>["event"];
  branding: boolean;
  unlocked: boolean;
  matchCount: number;
  guestName?: string;
  selfieUrl: string | null;
  onOpenProfile: () => void;
  homeThumbs: GuestMediaItem[];
  canDownloadAll: boolean;
  zipping: boolean;
  onDownloadAll: () => void;
  onSeeMine: () => void;
  onSeeAll: () => void;
  onUnlock: () => void;
  onReviewClick: () => void;
  onContactClick: () => void;
}) {
  const date = formatDate(event.event_date);
  const heroBg = event.background_image
    ? { backgroundImage: `url(${event.background_image})`, backgroundSize: "cover", backgroundPosition: event.background_position || "center" }
    : { backgroundImage: `linear-gradient(150deg, ${t.cover[0]}, ${t.cover[1]})` };
  const reviewUrl = event.company_google_place_id
    ? `https://search.google.com/local/writereview?placeid=${event.company_google_place_id}`
    : event.company_gmb_link || null;
  // Contact opens a WhatsApp chat with the studio's number (digits only).
  const waNumber = (event.company_contact_number || "").replace(/\D/g, "");
  const contactUrl = waNumber ? `https://wa.me/${waNumber}` : null;
  const hasStudio = branding && !!event.company_name;

  return (
    <div className="flex-1 overflow-y-auto pb-[150px] lg:pb-14">
      {/* hero — cover-first first impression: taller & immersive on desktop, compact
          on mobile; the title anchors to the bottom (flex justify-between) so the
          cover reads before any chrome. */}
      <div className="relative flex min-h-[200px] flex-col justify-between overflow-hidden px-6 pb-7 pt-7 lg:min-h-[62vh] lg:px-12 lg:pb-12 lg:pt-10" style={{ borderRadius: "0 0 28px 28px" }}>
        <div className={`absolute inset-0 ${event.background_image ? "hero-kenburns" : ""}`} style={heroBg} />
        <div className="absolute inset-0" style={{ background: t.heroScrim }} />
        <div className="relative flex items-center justify-between">
          {branding && event.company_name ? (
            <span className="text-[13px] font-semibold lowercase text-white/85">{event.company_name}</span>
          ) : (
            <span />
          )}

        </div>
        <div className="relative mt-8 hero-text lg:mt-0">
          <div className="text-white" style={{ fontFamily: "var(--font-playfair), Georgia, serif", fontStyle: "italic", fontSize: "clamp(32px, 4vw, 46px)", fontWeight: 700, lineHeight: 1.12 }}>
            {event.event_name}
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-2 text-white/70">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/55">
              {event.event_type ? `${event.event_type} gallery` : "Gallery"}
            </span>
            {date && (
              <>
                <span className="h-[3px] w-[3px] rounded-full bg-white/40" />
                <span className="text-[12.5px] font-medium text-white/65">{date}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className={`mx-auto w-full max-w-[460px] px-5 pt-5 lg:pt-8 ${hasStudio ? "lg:max-w-[920px]" : "lg:max-w-[460px]"}`}>
        <div className={`flex flex-col gap-4 lg:gap-5 ${hasStudio ? "lg:grid lg:grid-cols-[1.15fr_1fr] lg:items-start" : ""}`}>
          {/* LEFT — see my photos + browse all */}
          <div className="flex flex-col gap-4 lg:gap-5">
            {/* match card — see my photos */}
            <div className="lounge-rise lounge-card flex flex-col gap-3.5 rounded-3xl p-4" style={{ background: t.card, boxShadow: t.shadow, animationDelay: "0.05s" }}>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onOpenProfile}
                  aria-label="Your profile"
                  className="relative flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-[14px] font-semibold transition-transform active:scale-95"
                  style={{ background: t.ring, padding: 3 }}
                >
                  <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full" style={{ background: t.card, color: t.brand }}>
                    {selfieUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={selfieUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      (guestName?.[0] ?? "·").toUpperCase()
                    )}
                  </span>
                </button>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-extrabold" style={{ color: t.text }}>
                    {matchCount > 0 ? `Found you in ${matchCount} photo${matchCount === 1 ? "" : "s"}` : "No matches yet"}
                  </div>
                  <div className="mt-0.5 text-[11.5px] font-medium" style={{ color: t.muted }}>
                    {matchCount > 0 ? "Sorted just for you" : "Check back as the studio adds more"}
                  </div>
                </div>
              </div>
              {homeThumbs.length > 0 && (
                <div className="flex gap-1.5">
                  {homeThumbs.slice(0, 4).map((m, i) => (
                    <div key={m._id} className="group relative aspect-square flex-1 overflow-hidden rounded-xl" style={{ background: t.sunken }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={m.url} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-[600ms] ease-out group-hover:scale-110" />
                      {i === 3 && matchCount > 4 && (
                        <div className="absolute inset-0 flex items-center justify-center text-[15px] font-semibold text-white" style={{ background: "rgba(31,26,14,0.55)" }}>
                          +{matchCount - 4}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={onSeeMine}
                className="cta-shine flex cursor-pointer items-center justify-center gap-2 rounded-full py-3.5 text-[14px] font-semibold transition-transform active:scale-[0.99]"
                style={{ background: `linear-gradient(100deg, ${t.brand}, ${t.brandDeep})`, color: t.onBrand }}
              >
                See my photos
              </button>
            </div>

            {/* browse all (post-passcode) */}
            {unlocked && (
              <button
                type="button"
                onClick={onSeeAll}
                className="lounge-rise lounge-card flex cursor-pointer items-center gap-3.5 rounded-2xl p-4 text-left"
                style={{ background: t.card, border: `1px solid ${t.border}`, animationDelay: "0.1s" }}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: t.accentWash, color: t.brand }}>
                  <GridIcon size={19} />
                </span>
                <span className="flex-1">
                  <span className="block text-[14px] font-semibold" style={{ color: t.text }}>Browse all photos</span>
                  <span className="mt-0.5 block text-[11.5px] font-medium" style={{ color: t.muted }}>The complete gallery is unlocked</span>
                </span>
                <ChevronIcon size={18} dir="right" color={t.muted} />
              </button>
            )}

            {/* download all photos (zip) — host-only, primary/premium action.
                Built in the browser (client-zip) and streamed to the download
                tray, so it's available as soon as the guest is unlocked. */}
            {canDownloadAll && (
              <button
                type="button"
                onClick={onDownloadAll}
                disabled={zipping}
                className="lounge-rise lounge-card flex cursor-pointer items-center gap-3.5 rounded-2xl p-4 text-left transition-transform active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                style={{ background: t.card, border: `1px solid ${t.border}`, animationDelay: "0.14s" }}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: t.accentWash, color: t.brand }}>
                  <DownloadIcon size={19} />
                </span>
                <span className="flex-1">
                  <span className="block text-[14px] font-semibold" style={{ color: t.text }}>Download all photos</span>
                  <span className="mt-0.5 block text-[11.5px] font-medium" style={{ color: t.muted }}>
                    {zipping ? "Preparing your download…" : "Save the complete gallery as a zip"}
                  </span>
                </span>
                <ChevronIcon size={18} dir="right" color={t.muted} />
              </button>
            )}
          </div>

          {/* RIGHT — studio branding */}
          {hasStudio && (
            <div className="flex flex-col gap-4 lg:gap-5">
              <div className="lounge-rise lounge-card flex flex-col gap-3.5 rounded-2xl p-4" style={{ background: t.card, border: `1px solid ${t.border}`, animationDelay: "0.12s" }}>
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl" style={{ background: t.ink, color: t.brand }}>
                    {event.company_logo_light || event.company_logo ? (
                      // Avatar sits on a dark chip (t.ink), so prefer the light logo.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={event.company_logo_light || event.company_logo} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-[13px] font-semibold">{initials(event.company_name ?? "")}</span>
                    )}
                  </span>
                  <div>
                    <div className="text-[14px] font-semibold" style={{ color: t.text }}>{event.company_name}</div>
                    {/* No studio-tagline field exists on the event yet, so this stays a
                        de-emphasised default (lighter weight + faint) until one lands. */}
                    <div className="text-[11px] font-medium" style={{ color: t.faint }}>Photography &amp; films</div>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  {reviewUrl && (
                    <a href={reviewUrl} target="_blank" rel="noopener noreferrer" onClick={onReviewClick} className="flex items-center justify-center rounded-full py-3 text-[13px] font-semibold" style={{ background: t.brand, color: t.onBrand }}>
                      Leave us a Google review ↗
                    </a>
                  )}
                  {contactUrl && (
                    <a href={contactUrl} target="_blank" rel="noopener noreferrer" onClick={onContactClick} className="flex items-center justify-center rounded-full py-2.5 text-[13px] font-semibold" style={{ border: `1.5px solid ${t.border}`, color: t.text }}>
                      Contact us
                    </a>
                  )}
                  <SocialRow event={event} t={t} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* passcode CTA (locked only) — bottom */}
        {!unlocked && (
          <div className="flex justify-center pt-1">
            <button type="button" onClick={onUnlock} className="lounge-rise flex cursor-pointer items-center justify-center gap-2 py-2 text-[12.5px] font-medium" style={{ color: t.muted, animationDelay: "0.18s" }}>
              <LockIcon size={13} /> Have a passcode? Unlock the full gallery
            </button>
          </div>
        )}

        <PolicyFooter t={t} className="pt-8" />
      </div>
    </div>
  );
}

function PolicyFooter({ t, className = "" }: { t: Theme; className?: string }) {
  const { openPolicy } = usePolicy();
  const linkCls = "cursor-pointer underline-offset-2 hover:underline";
  return (
    <div
      className={`flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11.5px] font-medium ${className}`}
      style={{ color: t.faint }}
    >
      <button type="button" onClick={() => openPolicy("terms")} className={linkCls}>
        Terms
      </button>
      <span aria-hidden>·</span>
      <button type="button" onClick={() => openPolicy("privacy")} className={linkCls}>
        Privacy
      </button>
      <span aria-hidden>·</span>
      <button type="button" onClick={() => openPolicy("cookies")} className={linkCls}>
        Cookies
      </button>
    </div>
  );
}

function SocialRow({ event, t }: { event: ReturnType<typeof useEventTheme>["event"]; t: Theme }) {
  const sl = event.company_social_links ?? {};
  const links = [
    (sl.instagram ?? event.company_instagram_link) && { label: "Instagram", url: ensureHttp(sl.instagram ?? event.company_instagram_link ?? "") },
    (sl.facebook ?? event.company_facebook_link) && { label: "Facebook", url: ensureHttp(sl.facebook ?? event.company_facebook_link ?? "") },
    sl.youtube && { label: "YouTube", url: ensureHttp(sl.youtube) },
    sl.vimeo && { label: "Vimeo", url: ensureHttp(sl.vimeo) },
    sl.linkedin && { label: "LinkedIn", url: ensureHttp(sl.linkedin) },
    sl.x && { label: "X", url: ensureHttp(sl.x) },
  ].filter(Boolean) as { label: string; url: string }[];
  if (links.length === 0) return null;
  return (
    <div className="flex justify-center gap-2 pt-1">
      {links.map((l) => (
        <a key={l.label} href={l.url} target="_blank" rel="noopener noreferrer" className="text-[11.5px] font-medium underline-offset-2 hover:underline" style={{ color: t.brand }}>
          {l.label}
        </a>
      ))}
    </div>
  );
}

/* ── gallery view ───────────────────────────────────────────────────────── */

function GalleryView(props: {
  t: Theme;
  unlocked: boolean;
  tab: "mine" | "all";
  setTab: (k: "mine" | "all") => void;
  effTab: "mine" | "all";
  folders: CustomFolder[];
  folderCounts: Record<string, number>;
  folder: string;
  setFolder: (f: string) => void;
  items: GuestMediaItem[];
  loading: boolean;
  loadError: boolean;
  onRetry: () => void;
  loadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  totalForView: number;
  likedView: boolean;
  selectMode: boolean;
  selected: Set<string>;
  liked: Set<string>;
  onToggleSelect: (i: GuestMediaItem) => void;
  onToggleLike: (i: GuestMediaItem) => void;
  onEnterSelectWith: (i: GuestMediaItem) => void;
  onOpen: (index: number) => void;
  onToggleSelectMode: () => void;
  canDownloadAll: boolean;
  zipping: boolean;
  onDownloadAll: () => void;
}) {
  const { t, unlocked, tab, setTab, folders, folderCounts, folder, setFolder, items, loading, loadingMore, hasMore, onLoadMore, totalForView, likedView, selectMode, selected, liked, canDownloadAll, zipping } = props;

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (hasMore && !loadingMore && el.scrollTop + el.clientHeight >= el.scrollHeight - 400) onLoadMore();
  };

  const title = likedView ? "Liked" : tab === "mine" ? "My Photos" : "All Photos";
  const countLabel = `${totalForView.toLocaleString("en-IN")} photo${totalForView === 1 ? "" : "s"}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="fx-rise relative z-20 mx-auto w-full max-w-[760px] px-4 pt-4">
        <div className="flex items-center gap-3">
          <h1 className="flex-1 text-[18px] font-extrabold" style={{ color: t.text }}>{title}</h1>
        </div>

        {/* My / All tabs — quiet, compact segmented switch (not a full-width pill).
            Only the active segment carries brand, and only as text. */}
        {unlocked && !likedView && (
          <div className="mt-3 inline-flex rounded-full p-0.5" style={{ background: t.sunken }}>
            {(["mine", "all"] as const).map((k) => {
              const on = tab === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTab(k)}
                  className="cursor-pointer rounded-full px-4 py-1.5 text-[12.5px] transition-colors"
                  style={{
                    background: on ? t.card : "transparent",
                    color: on ? t.brand : t.muted,
                    fontWeight: on ? 600 : 500,
                    boxShadow: on ? t.shadowSm : "none",
                  }}
                >
                  {k === "mine" ? "My Photos" : "All Photos"}
                </button>
              );
            })}
          </div>
        )}

        {/* folder pills */}
        {folders.length > 0 && !likedView && (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
            {[{ _id: ALL, name: "All" } as Pick<CustomFolder, "_id" | "name">, ...folders].map((f) => {
              const active = folder === f._id;
              return (
                <button
                  key={f._id}
                  type="button"
                  onClick={() => setFolder(f._id)}
                  className="shrink-0 cursor-pointer rounded-full px-3.5 py-1.5 text-[12px] transition-colors"
                  style={{
                    background: active ? t.accentWash : "transparent",
                    color: active ? t.brand : t.muted,
                    border: `1px solid ${active ? "transparent" : t.border}`,
                    fontWeight: active ? 600 : 500,
                  }}
                >
                  {f.name}
                  {f._id !== ALL && folderCounts[f._id] != null && <span className="ml-1 opacity-70">{folderCounts[f._id]}</span>}
                </button>
              );
            })}
          </div>
        )}

        {/* count + select */}
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-[11.5px] font-medium" style={{ color: t.muted }}>
            {selectMode ? `${selected.size} selected` : countLabel}
          </span>
          <div className="flex items-center gap-2">
            {/* download all (zip) — host-only; the ONE brand-filled element in this
                row. Built in-browser + streamed to the tray; disabled while busy. */}
            {!selectMode && canDownloadAll && (
              <button
                type="button"
                onClick={props.onDownloadAll}
                disabled={zipping}
                className="flex cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
                style={{ background: t.brand, color: t.onBrand }}
              >
                <DownloadIcon size={14} />
                {zipping ? "Preparing…" : "Download all"}
              </button>
            )}
            {/* select — ghost/text button; brand tint only while active */}
            <button
              type="button"
              onClick={props.onToggleSelectMode}
              className="cursor-pointer rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors"
              style={{ background: "transparent", color: selectMode ? t.brand : t.muted }}
            >
              {selectMode ? "Cancel" : "Select"}
            </button>
          </div>
        </div>
      </div>

      {/* grid */}
      <div className="min-h-0 flex-1 overflow-y-auto pb-[150px] pt-3" onScroll={onScroll} style={{ scrollbarWidth: "none" }}>
        <div className="mx-auto w-full max-w-[760px] px-4 lg:max-w-[1440px] lg:px-8">
          {loading ? (
            // masonry-shaped skeleton so the load state matches the photo wall
            <div className="columns-2 gap-[14px] lg:columns-3 xl:columns-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={i}
                  className="skeleton mb-3 w-full break-inside-avoid rounded-[10px]"
                  style={{ height: 150 + (i % 4) * 60, animationDelay: `${i * 0.04}s` }}
                />
              ))}
            </div>
          ) : props.loadError && items.length === 0 ? (
            <ErrorState t={t} onRetry={props.onRetry} />
          ) : items.length === 0 ? (
            <EmptyState t={t} likedView={likedView} tab={tab} />
          ) : (
            <>
              <GalleryGrid
                t={t}
                layout="masonry"
                items={items}
                selectMode={selectMode}
                selected={selected}
                liked={liked}
                onOpen={props.onOpen}
                onToggleSelect={props.onToggleSelect}
                onToggleLike={props.onToggleLike}
                onEnterSelectWith={props.onEnterSelectWith}
              />
              {loadingMore && (
                <div className="flex justify-center py-6">
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" style={{ color: t.brand }} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ t, likedView, tab }: { t: Theme; likedView: boolean; tab: "mine" | "all" }) {
  const msg = likedView
    ? "No liked photos yet — tap the heart on any photo."
    : tab === "mine"
      ? "No photos matched your face yet. More may appear as the studio adds them."
      : "No photos here yet.";
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-8 py-20 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: t.sunken, color: t.faint }}>
        <GridIcon size={24} />
      </span>
      <p className="max-w-[280px] text-[13.5px] font-semibold" style={{ color: t.muted }}>{msg}</p>
    </div>
  );
}

function SideRail({
  t,
  event,
  active,
  onHome,
  onGallery,
  onLiked,
}: {
  t: Theme;
  event: ReturnType<typeof useEventTheme>["event"];
  active: "home" | "gallery" | "liked";
  onHome: () => void;
  onGallery: () => void;
  onLiked: () => void;
}) {
  const items = [
    { key: "home", label: "Home", icon: <HomeIcon size={19} />, on: onHome },
    { key: "gallery", label: "Gallery", icon: <GridIcon size={19} />, on: onGallery },
    { key: "liked", label: "Liked", icon: <HeartIcon size={19} color="currentColor" />, on: onLiked },
  ] as const;
  const studioLogo = event.include_company_branding ? event.company_logo : undefined;
  return (
    <aside className="hidden h-[100dvh] w-[248px] shrink-0 flex-col border-r p-5 lg:flex" style={{ borderColor: t.border, background: t.card }}>
      <div className="mb-8 flex items-center gap-2.5">
        {studioLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={studioLogo} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
        ) : (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[13px] font-semibold" style={{ background: t.ink, color: t.brand }}>
            {event.company_name ? initials(event.company_name) : "·"}
          </span>
        )}
        <div className="min-w-0">
          <div className="truncate text-[14px] font-semibold" style={{ color: t.text }}>{event.event_name}</div>
          {event.include_company_branding && event.company_name && (
            <div className="truncate text-[11.5px] font-medium" style={{ color: t.muted }}>{event.company_name}</div>
          )}
        </div>
      </div>
      <nav className="flex flex-col gap-1.5">
        {items.map((n) => {
          const on = active === n.key;
          return (
            <button
              key={n.key}
              type="button"
              onClick={n.on}
              className="flex cursor-pointer items-center gap-3 rounded-xl px-3.5 py-3 text-left text-[14px] transition-colors"
              style={{ background: on ? t.accentWash : "transparent", color: on ? t.brand : t.muted, fontWeight: on ? 600 : 500 }}
            >
              {n.icon}
              {n.label}
            </button>
          );
        })}
      </nav>
      <PolicyFooter t={t} className="mt-auto justify-start pt-4" />
    </aside>
  );
}

function ErrorState({ t, onRetry }: { t: Theme; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-8 py-20 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: t.errorSoft, color: t.error }}>
        <GridIcon size={24} />
      </span>
      <p className="max-w-[300px] text-[13.5px] font-semibold" style={{ color: t.muted }}>
        Couldn’t load photos. Check your connection and try again.
      </p>
      <button type="button" onClick={onRetry} className="cursor-pointer rounded-full px-5 py-2.5 text-[13px] font-extrabold" style={{ background: t.brand, color: t.onBrand }}>
        Try again
      </button>
    </div>
  );
}

function BottomNav({ t, active, onHome, onGallery, onLiked }: { t: Theme; active: "home" | "gallery" | "liked"; onHome: () => void; onGallery: () => void; onLiked: () => void }) {
  const items = [
    { key: "home", label: "Home", icon: <HomeIcon size={18} />, on: onHome },
    { key: "gallery", label: "Gallery", icon: <GridIcon size={18} />, on: onGallery },
    { key: "liked", label: "Liked", icon: <HeartIcon size={18} color="currentColor" />, on: onLiked },
  ] as const;
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-5 pb-4 lg:hidden">
      <div className="flex w-full max-w-[460px] gap-1.5 rounded-full p-1.5" style={{ background: t.card, boxShadow: t.shadow }}>
        {items.map((n) => {
          const on = active === n.key;
          return (
            <button
              key={n.key}
              type="button"
              onClick={n.on}
              className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full py-2.5 text-[12.5px] transition-colors"
              style={{ background: on ? t.accentWash : "transparent", color: on ? t.brand : t.muted, fontWeight: on ? 600 : 500 }}
            >
              {n.icon}
              {on && n.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── helpers + icons ────────────────────────────────────────────────────── */

function formatDate(epoch?: number | null): string | null {
  if (epoch == null) return null;
  const d = new Date(epoch);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}
function ensureHttp(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}
function initials(name: string): string {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "·";
}

function HeartIcon({ size = 18, filled, color = "currentColor" }: { size?: number; filled?: boolean; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? color : "none"} stroke={color} strokeWidth={2} strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}
function GridIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}
function HomeIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 11l8-7 8 7M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9" />
    </svg>
  );
}
function LockIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
function ChevronIcon({ size = 18, dir, color = "currentColor" }: { size?: number; dir: "left" | "right"; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" style={{ transform: dir === "left" ? "rotate(180deg)" : undefined }}>
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}
function DownloadIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12M7 11l5 5 5-5M5 21h14" />
    </svg>
  );
}
