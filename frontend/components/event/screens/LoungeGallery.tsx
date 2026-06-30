"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CustomFolder, GuestMediaItem, GuestSession } from "@/lib/types";
import { SIGNAL } from "@/lib/client-theme";
import { GuestAuthError, getGuestMedia, likePhoto, markZipAsDownloaded, requestZipGeneration, unlikePhoto } from "@/lib/guest-api";
import { downloadMany, downloadZip } from "@/lib/media-actions";
import { useEventTheme } from "../EventThemeContext";
import { usePolicy } from "../policy/PolicyContext";
import { PhotoViewer } from "./lounge/PhotoViewer";
import { PasscodeSheet } from "./lounge/PasscodeSheet";
import { ProfileSheet } from "./lounge/ProfileSheet";

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

  // Full-gallery ZIP — host-only. The backend marks a fresh zip "generated" and a
  // previously-fetched one "downloaded" (both still downloadable); "ready" is the
  // build-spec alias. "expired" offers a re-request; anything else shows nothing.
  const zipStatus = event.zip_status;
  const zipUrl = event.zip_url;
  const zipReady =
    unlocked && !!zipUrl && (zipStatus === "generated" || zipStatus === "downloaded" || zipStatus === "ready");
  const zipExpired = unlocked && zipStatus === "expired";

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
  const [zipRequestOpen, setZipRequestOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const effTab: "mine" | "all" = unlocked ? tab : "mine";
  const loadingMoreRef = useRef(false);

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

  // Load the first page whenever the view (tab/folder/liked) changes.
  useEffect(() => {
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
        });
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
  }, [uniqueIdentifier, bookingId, effTab, folder, likedView, onReauth, reloadKey, seedLikes]);

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
      });
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
  }, [uniqueIdentifier, bookingId, effTab, folder, likedView, items.length, totalForView, seedLikes]);

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

  async function downloadSelected() {
    const urls = displayed.filter((i) => selected.has(i._id)).map((i) => i.url);
    if (!urls.length) return;
    setToast(`Downloading ${urls.length} photo${urls.length === 1 ? "" : "s"}…`);
    await downloadMany(urls);
    setToast("Downloads started");
    exitSelect();
  }

  // Download the whole gallery as a ZIP. The download fires first/independently so
  // a tracking failure can never deprive the guest of their photos.
  const downloadAllZip = useCallback(() => {
    if (!zipUrl) return;
    setToast("Preparing your download…");
    downloadZip(zipUrl, `${event.event_name || "gallery"}.zip`);
    markZipAsDownloaded(uniqueIdentifier, bookingId).catch((e) =>
      console.warn("[markZipAsDownloaded] failed", e),
    );
    window.setTimeout(() => setToast("Download started"), 700);
  }, [zipUrl, event.event_name, uniqueIdentifier, bookingId]);

  // Expired ZIP → fire a (re)generation request and confirm via the info dialog.
  const requestZip = useCallback(() => {
    requestZipGeneration(uniqueIdentifier, bookingId).catch((e) =>
      console.warn("[requestZipGeneration] failed", e),
    );
    setZipRequestOpen(true);
  }, [uniqueIdentifier, bookingId]);

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
      <SideRail t={t} event={event} guestName={session.name} selfieUrl={session.selfie_url} onOpenProfile={() => setProfileOpen(true)} active={navActive} onHome={goHome} onGallery={goGallery} onLiked={goLiked} />
      <div className="flex min-h-0 flex-1 flex-col">
      {view === "home" ? (
        <LoungeHome
          t={t}
          event={event}
          branding={branding}
          unlocked={unlocked}
          matchCount={session.media_ids.length}
          guestName={session.name}
          selfieUrl={session.selfie_url}
          onOpenProfile={() => setProfileOpen(true)}
          homeThumbs={homeThumbs}
          zipReady={zipReady}
          onDownloadAll={downloadAllZip}
          onSeeMine={() => gotoGallery("mine")}
          onSeeAll={() => gotoGallery("all")}
          onUnlock={() => setPasscodeOpen(true)}
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
          zipReady={zipReady}
          zipExpired={zipExpired}
          onDownloadAll={downloadAllZip}
          onRequestZip={requestZip}
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

      {/* zip re-request confirmation */}
      {zipRequestOpen && <ZipRequestDialog t={t} onClose={() => setZipRequestOpen(false)} />}

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
  zipReady,
  onDownloadAll,
  onSeeMine,
  onSeeAll,
  onUnlock,
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
  zipReady: boolean;
  onDownloadAll: () => void;
  onSeeMine: () => void;
  onSeeAll: () => void;
  onUnlock: () => void;
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
      {/* hero */}
      <div className="relative min-h-[200px] overflow-hidden px-6 pb-7 pt-7 lg:min-h-[320px] lg:px-12 lg:pb-12 lg:pt-12" style={{ borderRadius: "0 0 28px 28px" }}>
        <div className={`absolute inset-0 ${event.background_image ? "hero-kenburns" : ""}`} style={heroBg} />
        <div className="absolute inset-0" style={{ background: t.heroScrim }} />
        <div className="relative flex items-center justify-between">
          {branding && event.company_name ? (
            <span className="text-[13px] font-extrabold lowercase text-white/85">{event.company_name}</span>
          ) : (
            <span />
          )}
          {guestName && (
            <button
              type="button"
              onClick={onOpenProfile}
              aria-label="Your profile"
              className="flex h-8 w-8 cursor-pointer items-center justify-center overflow-hidden rounded-full text-[12px] font-extrabold text-white transition-transform active:scale-95"
              style={{ background: t.brand }}
            >
              {selfieUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={selfieUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                (guestName[0] ?? "·").toUpperCase()
              )}
            </button>
          )}
        </div>
        <div className="relative mt-8 hero-text">
          <div className="text-white" style={{ fontFamily: "var(--font-playfair), Georgia, serif", fontStyle: "italic", fontSize: "clamp(32px, 4vw, 46px)", fontWeight: 700, lineHeight: 1.12 }}>
            {event.event_name}
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-2 text-white/70">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/55">
              {event.event_type ? `${event.event_type} gallery` : "Gallery"}
            </span>
            {date && (
              <>
                <span className="h-[3px] w-[3px] rounded-full bg-white/40" />
                <span className="text-[12.5px] font-semibold text-white/65">{date}</span>
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
                  className="relative flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-[14px] font-extrabold transition-transform active:scale-95"
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
                  <div className="mt-0.5 text-[11.5px] font-semibold" style={{ color: t.muted }}>
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
                        <div className="absolute inset-0 flex items-center justify-center text-[15px] font-extrabold text-white" style={{ background: "rgba(31,26,14,0.55)" }}>
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
                className="cta-shine flex cursor-pointer items-center justify-center gap-2 rounded-full py-3.5 text-[14px] font-extrabold transition-transform active:scale-[0.99]"
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
                style={{ background: t.card, boxShadow: t.shadowSm, animationDelay: "0.1s" }}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: t.brand, color: t.onBrand }}>
                  <GridIcon size={19} />
                </span>
                <span className="flex-1">
                  <span className="block text-[14px] font-extrabold" style={{ color: t.text }}>Browse all photos</span>
                  <span className="mt-0.5 block text-[11.5px] font-semibold" style={{ color: t.muted }}>The complete gallery is unlocked</span>
                </span>
                <ChevronIcon size={18} dir="right" color={t.muted} />
              </button>
            )}

            {/* download all photos (zip) — host-only, primary/premium action */}
            {unlocked && zipReady && (
              <button
                type="button"
                onClick={onDownloadAll}
                className="lounge-rise lounge-card flex cursor-pointer items-center gap-3.5 rounded-2xl p-4 text-left transition-transform active:scale-[0.99]"
                style={{ background: `linear-gradient(100deg, ${t.brand}, ${t.brandDeep})`, color: t.onBrand, boxShadow: t.shadow, animationDelay: "0.14s" }}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "rgba(255,255,255,0.18)", color: t.onBrand }}>
                  <DownloadIcon size={19} />
                </span>
                <span className="flex-1">
                  <span className="block text-[14px] font-extrabold">Download all photos</span>
                  <span className="mt-0.5 block text-[11.5px] font-semibold" style={{ opacity: 0.82 }}>Save the complete gallery as a zip</span>
                </span>
              </button>
            )}
          </div>

          {/* RIGHT — studio branding */}
          {hasStudio && (
            <div className="flex flex-col gap-4 lg:gap-5">
              <div className="lounge-rise lounge-card flex flex-col gap-3.5 rounded-2xl p-4 pl-3.5" style={{ background: t.card, boxShadow: t.shadowSm, borderLeft: `4px solid ${t.brand}`, animationDelay: "0.12s" }}>
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl" style={{ background: t.ink, color: t.brand }}>
                    {event.company_logo_light || event.company_logo ? (
                      // Avatar sits on a dark chip (t.ink), so prefer the light logo.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={event.company_logo_light || event.company_logo} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-[13px] font-extrabold">{initials(event.company_name ?? "")}</span>
                    )}
                  </span>
                  <div>
                    <div className="text-[14px] font-extrabold" style={{ color: t.text }}>{event.company_name}</div>
                    <div className="text-[11.5px] font-semibold" style={{ color: t.muted }}>Photography &amp; films</div>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  {reviewUrl && (
                    <a href={reviewUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center rounded-full py-3 text-[13px] font-extrabold" style={{ background: t.brand, color: t.onBrand }}>
                      Leave us a Google review ↗
                    </a>
                  )}
                  {contactUrl && (
                    <a href={contactUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center rounded-full py-2.5 text-[13px] font-extrabold" style={{ border: `1.5px solid ${t.border}`, color: t.text }}>
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
            <button type="button" onClick={onUnlock} className="lounge-rise flex cursor-pointer items-center justify-center gap-2 py-2 text-[12.5px] font-bold" style={{ color: t.muted, animationDelay: "0.18s" }}>
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
      className={`flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11.5px] font-bold ${className}`}
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
        <a key={l.label} href={l.url} target="_blank" rel="noopener noreferrer" className="text-[11.5px] font-bold underline-offset-2 hover:underline" style={{ color: t.brand }}>
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
  zipReady: boolean;
  zipExpired: boolean;
  onDownloadAll: () => void;
  onRequestZip: () => void;
}) {
  const { t, unlocked, tab, setTab, folders, folderCounts, folder, setFolder, items, loading, loadingMore, hasMore, onLoadMore, totalForView, likedView, selectMode, selected, liked, zipReady, zipExpired } = props;

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

        {/* My / All tabs — only once unlocked */}
        {unlocked && !likedView && (
          <div className="mt-3 flex rounded-full p-1" style={{ background: t.card, boxShadow: t.shadowSm }}>
            {(["mine", "all"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className="flex-1 cursor-pointer rounded-full py-2.5 text-[13px] font-extrabold"
                style={{ background: tab === k ? t.brand : "transparent", color: tab === k ? t.onBrand : t.text }}
              >
                {k === "mine" ? "My Photos" : "All Photos"}
              </button>
            ))}
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
                  className="shrink-0 cursor-pointer rounded-full px-3.5 py-1.5 text-[12px] font-extrabold"
                  style={{ background: active ? t.brand : t.card, color: active ? t.onBrand : t.text, boxShadow: active ? "none" : t.shadowSm }}
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
          <span className="text-[11.5px] font-bold" style={{ color: t.muted }}>
            {selectMode ? `${selected.size} selected` : countLabel}
          </span>
          <div className="flex items-center gap-2">
            {/* download all (zip) — host-only, primary action */}
            {!selectMode && zipReady && (
              <button
                type="button"
                onClick={props.onDownloadAll}
                className="flex cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-extrabold transition-transform active:scale-95"
                style={{ background: t.brand, color: t.onBrand }}
              >
                <DownloadIcon size={14} />
                Download all
              </button>
            )}
            {/* expired zip → re-request lives in the overflow menu */}
            {!selectMode && zipExpired && (
              <OverflowMenu
                t={t}
                items={[{ label: "Request a zip download", icon: <DownloadIcon size={15} />, onClick: props.onRequestZip }]}
              />
            )}
            <button
              type="button"
              onClick={props.onToggleSelectMode}
              className="cursor-pointer rounded-full px-3.5 py-1.5 text-[12px] font-extrabold"
              style={{ background: selectMode ? t.brand : t.card, color: selectMode ? t.onBrand : t.text, boxShadow: selectMode ? "none" : t.shadowSm }}
            >
              {selectMode ? "Cancel" : "Select"}
            </button>
          </div>
        </div>
      </div>

      {/* grid */}
      <div className="min-h-0 flex-1 overflow-y-auto pb-[150px] pt-3" onScroll={onScroll} style={{ scrollbarWidth: "none" }}>
        <div className="mx-auto w-full max-w-[760px] px-4 lg:max-w-[1180px] lg:px-8">
          {loading ? (
            <div className="grid grid-cols-3 gap-1 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 2xl:grid-cols-7 lg:gap-1.5">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="skeleton aspect-square rounded-lg" style={{ animationDelay: `${i * 0.04}s` }} />
              ))}
            </div>
          ) : props.loadError && items.length === 0 ? (
            <ErrorState t={t} onRetry={props.onRetry} />
          ) : items.length === 0 ? (
            <EmptyState t={t} likedView={likedView} tab={tab} />
          ) : (
            <>
              <div className="grid grid-cols-3 gap-1 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 2xl:grid-cols-7 lg:gap-1.5">
                {items.map((item, index) => (
                  <PhotoTile
                    key={item._id}
                    t={t}
                    item={item}
                    index={index}
                    selectMode={selectMode}
                    isSel={selected.has(item._id)}
                    isLiked={liked.has(item._id)}
                    onOpen={() => props.onOpen(index)}
                    onToggleSelect={() => props.onToggleSelect(item)}
                    onToggleLike={() => props.onToggleLike(item)}
                    onEnterSelectWith={() => props.onEnterSelectWith(item)}
                  />
                ))}
              </div>
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

function PhotoTile({
  t,
  item,
  index,
  selectMode,
  isSel,
  isLiked,
  onOpen,
  onToggleSelect,
  onToggleLike,
  onEnterSelectWith,
}: {
  t: Theme;
  item: GuestMediaItem;
  index: number;
  selectMode: boolean;
  isSel: boolean;
  isLiked: boolean;
  onOpen: () => void;
  onToggleSelect: () => void;
  onToggleLike: () => void;
  onEnterSelectWith: () => void;
}) {
  const pad = selectMode && isSel ? 4 : 0;
  return (
    <div
      className="group tile-in relative aspect-square cursor-pointer transition-colors"
      style={{ background: selectMode && isSel ? t.brand : "transparent", animationDelay: `${(index % 14) * 0.03}s` }}
      onClick={() => (selectMode ? onToggleSelect() : onOpen())}
    >
      <div className="absolute overflow-hidden transition-all" style={{ inset: pad, borderRadius: selectMode && isSel ? 9 : 8 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.url} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-[450ms] ease-out group-hover:scale-[1.08]" />
      </div>

      {/* select badge — always in select mode; desktop hover otherwise */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (selectMode) onToggleSelect();
          else onEnterSelectWith();
        }}
        aria-label="Select photo"
        className={`absolute left-1.5 top-1.5 z-10 flex h-[22px] w-[22px] cursor-pointer items-center justify-center rounded-full transition-opacity ${
          selectMode ? "flex" : "hidden opacity-0 sm:flex sm:group-hover:opacity-100"
        }`}
        style={{
          background: isSel ? t.brand : "rgba(20,16,8,0.3)",
          border: isSel ? "none" : "2px solid rgba(255,255,255,0.9)",
          color: t.onBrand,
        }}
      >
        {isSel && <CheckIcon size={13} />}
      </button>

      {/* like — always visible, shows the total like count */}
      {!selectMode && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleLike();
          }}
          aria-label={isLiked ? "Unlike photo" : "Like photo"}
          className="absolute bottom-1.5 left-1.5 z-10 flex cursor-pointer items-center gap-1 rounded-full px-1.5 py-1 transition-transform active:scale-95"
          style={{ background: isLiked ? "rgba(255,255,255,0.92)" : "rgba(20,16,8,0.42)" }}
        >
          <HeartIcon size={14} filled={isLiked} color={isLiked ? SIGNAL.liked : "#fff"} />
          {(item.likes_count ?? 0) > 0 && (
            <span className="pr-0.5 text-[11px] font-extrabold tabular-nums" style={{ color: isLiked ? SIGNAL.viewer : "#fff" }}>
              {item.likes_count}
            </span>
          )}
        </button>
      )}
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
  guestName,
  selfieUrl,
  onOpenProfile,
  active,
  onHome,
  onGallery,
  onLiked,
}: {
  t: Theme;
  event: ReturnType<typeof useEventTheme>["event"];
  guestName?: string;
  selfieUrl: string | null;
  onOpenProfile: () => void;
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
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[13px] font-extrabold" style={{ background: t.ink, color: t.brand }}>
            {event.company_name ? initials(event.company_name) : "·"}
          </span>
        )}
        <div className="min-w-0">
          <div className="truncate text-[14px] font-extrabold" style={{ color: t.text }}>{event.event_name}</div>
          {event.include_company_branding && event.company_name && (
            <div className="truncate text-[11.5px] font-semibold" style={{ color: t.muted }}>{event.company_name}</div>
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
              className="flex cursor-pointer items-center gap-3 rounded-xl px-3.5 py-3 text-left text-[14px] font-extrabold transition-colors"
              style={{ background: on ? t.brand : "transparent", color: on ? t.onBrand : t.text }}
            >
              {n.icon}
              {n.label}
            </button>
          );
        })}
      </nav>
      {guestName && (
        <button
          type="button"
          onClick={onOpenProfile}
          className="mt-auto flex cursor-pointer items-center gap-2.5 border-t pt-5 text-left transition-opacity hover:opacity-80"
          style={{ borderColor: t.border }}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-[13px] font-extrabold text-white" style={{ background: t.brand }}>
            {selfieUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selfieUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              (guestName[0] ?? "·").toUpperCase()
            )}
          </span>
          <span className="min-w-0 truncate text-[13px] font-bold" style={{ color: t.text }}>{guestName}</span>
        </button>
      )}
      <PolicyFooter t={t} className={`${guestName ? "mt-4" : "mt-auto"} justify-start pt-4`} />
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
              className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full py-2.5 text-[12.5px] font-extrabold"
              style={{ background: on ? t.brand : "transparent", color: on ? t.onBrand : t.text }}
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

/* ── zip: overflow menu + request dialog ────────────────────────────────── */

/** Small accessible "⋯" menu: opens a popover, closes on outside-click + Escape. */
function OverflowMenu({ t, items }: { t: Theme; items: { label: string; icon?: React.ReactNode; onClick: () => void }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="More options"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-full transition-colors"
        style={{ background: open ? t.brand : t.card, color: open ? t.onBrand : t.text, boxShadow: open ? "none" : t.shadowSm }}
      >
        <MoreIcon size={16} />
      </button>
      {open && (
        <div
          role="menu"
          className="popup-pop absolute right-0 top-[calc(100%+8px)] z-50 min-w-[210px] overflow-hidden rounded-2xl p-1.5"
          style={{ background: t.card, boxShadow: t.shadow, border: `1px solid ${t.border}` }}
        >
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] font-extrabold transition-colors hover:bg-black/[0.04]"
              style={{ color: t.text }}
            >
              {it.icon}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Informational confirmation shown after re-requesting an expired zip. */
function ZipRequestDialog({ t, onClose }: { t: Theme; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="dash-fade fixed inset-0 z-[60] flex items-center justify-center p-5" style={{ background: "rgba(31,26,14,0.55)" }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Request received"
        className="popup-pop w-full max-w-[400px] rounded-3xl p-7 text-center sm:p-8"
        style={{ background: t.card, fontFamily: t.font, boxShadow: t.shadow }}
      >
        <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: t.successSoft, color: t.success }}>
          <CheckIcon size={26} />
        </span>
        <div className="text-[19px] font-extrabold" style={{ color: t.text }}>Request received</div>
        <p className="mx-auto mt-2 max-w-[300px] text-[13px] font-semibold leading-relaxed" style={{ color: t.muted }}>
          Your download is being prepared. We’ll notify you by email once your zip is ready.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full cursor-pointer rounded-full py-3.5 text-[14px] font-extrabold transition-transform active:scale-[0.99]"
          style={{ background: t.brand, color: t.onBrand }}
        >
          Got it
        </button>
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
function CheckIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="5 12 10 17 19 7" />
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
function MoreIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}
