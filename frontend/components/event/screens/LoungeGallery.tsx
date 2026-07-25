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
import { TopBar } from "./lounge/TopBar";
import { CoverMasthead } from "./lounge/CoverMasthead";
import { DesktopCover } from "./lounge/DesktopCover";
import { MobileTopBar } from "./lounge/MobileTopBar";
import { ReviewNudge, OutroBand, type NudgeReason } from "./lounge/ReviewNudge";
import { GalleryGrid } from "./gallery/GalleryGrid";
import { StickyControlRow } from "./gallery/StickyControlRow";
import { ALL, UnlockAwareSwitcher, FolderPillsRow, ActionsCluster } from "./gallery/GalleryControls";
import { IconHeart, IconGrid, IconHome } from "@/components/ui/icons";

const PAGE = 60;
/** Guests who like this many photos in-session get the "loving the gallery?" nudge. */
const LIKE_NUDGE_THRESHOLD = 3;
/** Breathing room after the gallery first paints before the gentle load nudge. */
const LOAD_NUDGE_DELAY_MS = 6000;

/**
 * The authenticated guest experience. Desktop: a slim sticky top bar + ONE
 * continuous scroll (editorial cover → welcome band → sectioned grid).
 * Mobile: bottom nav switching between separate Home and Gallery tabs. Same
 * data/logic underneath either way — likes, select/download/zip, the
 * PhotoViewer lightbox, folders, host/guest gating, passcode unlock, the
 * policy overlay, infinite scroll, toasts.
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
  const hasStudio = branding && !!event.company_name;

  // Only ONE shell is mounted at a time (not two CSS-toggled trees): a hidden
  // `display:none` GalleryGrid measures 0 width and would render nothing, and
  // mounting both doubles the DOM + ResizeObservers for no benefit. The parent
  // owns all data, so switching shells never re-fetches.
  const isDesktop = useIsDesktop();

  // Full-gallery ZIP is host-only and now built in the browser (client-zip,
  // streamed to disk), so it's available whenever the guest is unlocked — there's
  // no backend zip state to gate on any more.
  const canDownloadAll = unlocked;

  const reviewUrl = event.company_google_place_id
    ? `https://search.google.com/local/writereview?placeid=${event.company_google_place_id}`
    : event.company_gmb_link || null;
  // Contact opens a WhatsApp chat with the studio's number (digits only).
  const waNumber = (event.company_contact_number || "").replace(/\D/g, "");
  const contactUrl = waNumber ? `https://wa.me/${waNumber}` : null;

  const [view, setView] = useState<"home" | "gallery">("home");
  const [tab, setTab] = useState<"mine" | "all">("mine");
  const [folder, setFolder] = useState<string>(ALL);
  const [likedView, setLikedView] = useState(false);

  const [items, setItems] = useState<GuestMediaItem[]>([]);
  const [folders, setFolders] = useState<CustomFolder[]>([]);
  const [folderCounts, setFolderCounts] = useState<Record<string, number>>({});
  const [totalForView, setTotalForView] = useState(0);
  /** Total for the unfiltered "All" view of the CURRENT tab — drives the All
   *  pill's count, which `folderCounts` (custom folders only) can't supply.
   *  Captured whenever an unfiltered view loads; a folder selection doesn't
   *  change the tab, so it stays valid while a folder pill is active. */
  const [allCount, setAllCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [passcodeOpen, setPasscodeOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [nudge, setNudge] = useState<NudgeReason | null>(null);
  /** One action-triggered nudge (download OR likes) per page load. */
  const actionNudgeShown = useRef(false);
  /** One gentle on-load nudge per page load; latched on dismiss too. */
  const loadNudgeShown = useRef(false);

  // Highlights (B2): a locked (non-host) guest picking "All Photos" is no
  // longer forced back to "mine" — the backend scopes that request to public
  // (Highlights) folders on its own via the guest's real session, so the tab
  // the guest sees always matches the tab that's actually requested.
  const effTab: "mine" | "all" = tab;
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
        const total = typeof res.total === "number" ? res.total : media.length;
        setTotalForView(total);
        if (!likedView && folder === ALL) setAllCount(total);
        seedLikes(media);
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
  const galleryDone = !loading && !loadError && items.length > 0 && !hasMore;

  /**
   * The review nudge appears at most twice per page load and never two at
   * once: a gentle one shortly after the gallery first renders, and one in
   * response to an action (download, or liking several photos). Both are
   * latched by refs, so a dismissal sticks until the next full reload.
   */
  const triggerNudge = useCallback(
    (reason: "download" | "likes") => {
      if (!reviewUrl) return;
      if (actionNudgeShown.current) return; // one action nudge, whichever fires first
      actionNudgeShown.current = true;
      // Cancel any still-pending load nudge so the two can never stack; an
      // action nudge is the more relevant of the two, so it takes over.
      loadNudgeShown.current = true;
      setNudge(reason);
    },
    [reviewUrl],
  );

  // Gentle nudge once the guest has liked several photos this session.
  useEffect(() => {
    if (liked.size >= LIKE_NUDGE_THRESHOLD) triggerNudge("likes");
  }, [liked.size, triggerNudge]);

  // …and once, a few seconds after the gallery first paints. setState only
  // happens inside the timer (never synchronously in the effect body).
  // Gated on the guest actually looking at photos: desktop is one continuous
  // scroll so that's always true, but on mobile the data loads while Home is
  // still showing — without this the nudge would pop over the Home tab before
  // any gallery had rendered.
  const galleryReady =
    !loading && !loadError && items.length > 0 && (isDesktop || view === "gallery");
  useEffect(() => {
    if (!reviewUrl || !galleryReady || loadNudgeShown.current) return;
    const id = setTimeout(() => {
      if (loadNudgeShown.current || actionNudgeShown.current) return;
      loadNudgeShown.current = true;
      setNudge("load");
    }, LOAD_NUDGE_DELAY_MS);
    return () => clearTimeout(id);
  }, [reviewUrl, galleryReady, isDesktop]);

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
        if (zipped > 0) triggerNudge("download");
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
    [zipping, onReauth, triggerNudge],
  );

  // Per-tile hover download (item 7) — same single-photo path as the select
  // bar's one-item case, just triggered straight from the tile instead of
  // going through select mode.
  const downloadOne = useCallback(
    async (item: GuestMediaItem) => {
      setToast("Downloading 1 photo…");
      await downloadMany([item.url]);
      setToast("Download started");
      triggerNudge("download");
    },
    [triggerNudge],
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
      triggerNudge("download");
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

  const onShare = useCallback(() => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const nav = typeof navigator !== "undefined" ? navigator : undefined;
    if (nav?.share) {
      nav.share({ url, title: event.event_name }).catch(() => {});
      return;
    }
    nav?.clipboard
      ?.writeText(url)
      .then(() => setToast("Link copied"))
      .catch(() => setToast("Couldn’t share"));
  }, [event.event_name]);

  const gridSectionRef = useRef<HTMLDivElement>(null);
  const desktopScrollRef = useRef<HTMLDivElement>(null);
  const mastheadSentinelRef = useRef<HTMLDivElement>(null);
  const controlRowRef = useRef<HTMLDivElement>(null);
  /** Home and Gallery are mutually exclusive on mobile, so one ref serves
   *  whichever tab's scroll container is mounted. */
  const mobileScrollRef = useRef<HTMLDivElement>(null);
  const [showTopName, setShowTopName] = useState(false);

  // The grid's scroll-margin has to equal the PINNED control row's real height,
  // or scrollIntoView tucks the first photo row under it (too small) or leaves
  // a gap (too large). Measured rather than hard-coded so it can't drift as the
  // row's contents/fonts change. The observer's initial callback seeds it.
  const [controlRowH, setControlRowH] = useState(60);
  useEffect(() => {
    if (!isDesktop) return;
    const el = controlRowRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setControlRowH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [isDesktop]);

  // Fades the couple/event name into the desktop top bar once the cover
  // masthead has scrolled past it. Re-attaches when the desktop shell (re)mounts
  // — its refs only exist while `isDesktop` is true.
  useEffect(() => {
    if (!isDesktop) return;
    const root = desktopScrollRef.current;
    const target = mastheadSentinelRef.current;
    if (!root || !target) return;
    const io = new IntersectionObserver(([entry]) => setShowTopName(!entry.isIntersecting), {
      root,
      rootMargin: "-64px 0px 0px 0px",
      threshold: 0,
    });
    io.observe(target);
    return () => io.disconnect();
  }, [isDesktop]);

  // Desktop's whole page scrolls in one container (the cover flows into the
  // grid), so infinite scroll hangs off that container — not the grid element.
  const onDesktopScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (hasMore && !loadingMore && el.scrollTop + el.clientHeight >= el.scrollHeight - 600) loadMore();
  };

  function gotoGallery(nextTab: "mine" | "all") {
    setTab(nextTab);
    setFolder(ALL);
    setLikedView(false);
    exitSelect();
    setView("gallery");
    gridSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
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
  /* Desktop control-row handlers. Liked, the folder pills and the My/All
     switcher are mutually exclusive filters, so each one clears the others —
     `onlyLiked` and a folder id must never go to the API together. Every one
     of them also returns the grid to its starting position under the pinned
     control row, so changing a filter never leaves you mid-scroll in a
     shorter result set. */
  const scrollToGridTop = () => {
    gridSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const desktopSelectLiked = () => {
    setLikedView(true);
    setFolder(ALL);
    exitSelect();
    scrollToGridTop();
  };
  const desktopSelectFolder = (f: string) => {
    setFolder(f);
    setLikedView(false);
    exitSelect();
    scrollToGridTop();
  };
  const desktopSetTab = (k: "mine" | "all") => {
    setTab(k);
    setFolder(ALL);
    setLikedView(false);
    exitSelect();
    scrollToGridTop();
  };
  /** Top-bar identity → back to the cover. Pure scroll; no reload, no refetch. */
  const resetToTop = () => {
    desktopScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };
  /** Same, for whichever mobile tab's scroll container is currently mounted. */
  const resetMobileToTop = () => {
    mobileScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const date = formatDate(event.event_date);

  /* ── render ───────────────────────────────────────────────────────────── */

  return (
    <div className="relative flex h-[100dvh] flex-col overflow-hidden" style={{ background: t.bg, fontFamily: t.font, color: t.text }}>
      {/* ── DESKTOP: sticky top bar + one continuous scroll ──────────────── */}
      {isDesktop && (
      <div className="flex min-h-0 flex-1 flex-col">
        <TopBar
          t={t}
          event={event}
          hasStudio={hasStudio}
          showName={showTopName}
          reviewUrl={reviewUrl}
          contactUrl={contactUrl}
          onReviewClick={onReviewClick}
          onContactClick={onContactClick}
          onShare={onShare}
          onOpenProfile={() => setProfileOpen(true)}
          onResetToTop={resetToTop}
          guestName={session.name}
          selfieUrl={session.selfie_url}
        />
        <div ref={desktopScrollRef} onScroll={onDesktopScroll} className="min-h-0 flex-1 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
          <DesktopCover
            t={t}
            event={event}
            branding={branding}
            matchCount={mediaIds?.length ?? 0}
            guestName={session.name}
            onSeeMine={() => gotoGallery("mine")}
            onScrollToGrid={() => gridSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            date={date}
          />
          <div ref={mastheadSentinelRef} />

          <StickyControlRow
            rowRef={controlRowRef}
            t={t}
            unlocked={unlocked}
            tab={tab}
            setTab={desktopSetTab}
            onOpenPrivate={() => setPasscodeOpen(true)}
            folders={folders}
            folderCounts={folderCounts}
            folder={folder}
            setFolder={desktopSelectFolder}
            likedView={likedView}
            onSelectLiked={desktopSelectLiked}
            selectMode={selectMode}
            onToggleSelectMode={() => (selectMode ? exitSelect() : setSelectMode(true))}
            canDownloadAll={canDownloadAll}
            zipping={zipping}
            onDownloadAll={downloadGalleryZip}
            allCount={allCount ?? undefined}
          />

          {/* scrollMarginTop = the measured pinned control-row height, so
              scrollIntoView lands the first grid row flush beneath it. */}
          <div ref={gridSectionRef} className="mx-auto w-full max-w-[1440px] px-8 pb-16 pt-6" style={{ scrollMarginTop: controlRowH }}>
            {loading ? (
              <LoadingSkeleton />
            ) : loadError && items.length === 0 ? (
              <ErrorState t={t} onRetry={() => setReloadKey((k) => k + 1)} />
            ) : items.length === 0 ? (
              <EmptyState t={t} likedView={likedView} tab={tab} unlocked={unlocked} />
            ) : (
              <>
                {/* ONE continuous justified grid over the full flat list — every
                    loaded photo appears exactly once, in API order (folder
                    pills filter server-side, so no client-side partitioning). */}
                <GalleryGrid
                  t={t}
                  items={displayed}
                  selectMode={selectMode}
                  selected={selected}
                  liked={liked}
                  onOpen={(i) => setViewerIndex(i)}
                  onToggleSelect={toggleSel}
                  onToggleLike={toggleLike}
                  onEnterSelectWith={enterSelectWith}
                  onDownload={downloadOne}
                />
                {loadingMore && (
                  <div className="flex justify-center py-6">
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" style={{ color: t.brand }} />
                  </div>
                )}
              </>
            )}

            {galleryDone && (
              <OutroBand
                t={t}
                event={event}
                reviewUrl={reviewUrl}
                onReviewClick={onReviewClick}
                contactUrl={contactUrl}
                onContactClick={onContactClick}
              />
            )}
          </div>

          <PolicyFooter t={t} className="pb-10" />
        </div>
      </div>
      )}

      {/* ── MOBILE: bottom nav + separate Home / Gallery tabs ────────────── */}
      {!isDesktop && (
      <div className="flex min-h-0 flex-1 flex-col">
        <MobileTopBar
          t={t}
          event={event}
          hasStudio={hasStudio}
          showEventName={view !== "home"}
          reviewUrl={reviewUrl}
          contactUrl={contactUrl}
          onReviewClick={onReviewClick}
          onContactClick={onContactClick}
          onShare={onShare}
          onOpenProfile={() => setProfileOpen(true)}
          onResetToTop={resetMobileToTop}
          guestName={session.name}
          selfieUrl={session.selfie_url}
        />
        {view === "home" ? (
          <div ref={mobileScrollRef} className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
            <CoverMasthead
              t={t}
              event={event}
              branding={branding}
              matchCount={mediaIds?.length ?? 0}
              guestName={session.name}
              onSeeMine={() => gotoGallery("mine")}
              date={date}
            />
            <div className="mx-auto w-full max-w-[460px] px-5 pb-[120px] pt-6">
              <PolicyFooter t={t} />
            </div>
          </div>
        ) : (
          <MobileGalleryView
            t={t}
            unlocked={unlocked}
            tab={tab}
            setTab={(k) => {
              setTab(k);
              setFolder(ALL);
              setLikedView(false);
              exitSelect();
            }}
            onOpenPrivate={() => setPasscodeOpen(true)}
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
            totalForViewAll={allCount ?? undefined}
            scrollRef={mobileScrollRef}
            likedView={likedView}
            onSelectLiked={() => {
              setLikedView(true);
              exitSelect();
              mobileScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
            }}
            selectMode={selectMode}
            selected={selected}
            liked={liked}
            onToggleSelect={toggleSel}
            onToggleLike={toggleLike}
            onEnterSelectWith={enterSelectWith}
            onDownload={downloadOne}
            onOpen={(i) => setViewerIndex(i)}
            onToggleSelectMode={() => (selectMode ? exitSelect() : setSelectMode(true))}
            canDownloadAll={canDownloadAll}
            zipping={zipping}
            onDownloadAll={downloadGalleryZip}
            galleryDone={galleryDone}
            event={event}
            reviewUrl={reviewUrl}
            onReviewClick={onReviewClick}
            contactUrl={contactUrl}
            onContactClick={onContactClick}
          />
        )}

        <BottomNav t={t} active={navActive} onHome={goHome} onGallery={goGallery} onLiked={goLiked} />
      </div>
      )}

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
          onDownloaded={() => triggerNudge("download")}
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

      {/* triggered review nudge — mobile bottom sheet, desktop corner card */}
      {nudge && reviewUrl && (
        <ReviewNudge
          t={t}
          variant={isDesktop ? "corner" : "sheet"}
          reason={nudge}
          reviewUrl={reviewUrl}
          onReviewClick={onReviewClick}
          onDismiss={() => setNudge(null)}
        />
      )}
    </div>
  );
}

type Theme = ReturnType<typeof useEventTheme>["theme"];

/** Tracks the `lg` (1024px) breakpoint so exactly one shell mounts at a time.
 *  Reads synchronously on first render (this tree is client-only, mounted
 *  behind a loading gate) so there's no wrong-shell flash. */
const LG_QUERY = "(min-width: 1024px)";
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(LG_QUERY).matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia(LG_QUERY);
    const onChange = () => setIsDesktop(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isDesktop;
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

/* ── mobile gallery tab ─────────────────────────────────────────────────── */

function MobileGalleryView(props: {
  t: Theme;
  unlocked: boolean;
  tab: "mine" | "all";
  setTab: (k: "mine" | "all") => void;
  onOpenPrivate: () => void;
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
  likedView: boolean;
  onSelectLiked: () => void;
  selectMode: boolean;
  selected: Set<string>;
  liked: Set<string>;
  onToggleSelect: (i: GuestMediaItem) => void;
  onToggleLike: (i: GuestMediaItem) => void;
  onEnterSelectWith: (i: GuestMediaItem) => void;
  onDownload: (i: GuestMediaItem) => void;
  onOpen: (index: number) => void;
  onToggleSelectMode: () => void;
  canDownloadAll: boolean;
  zipping: boolean;
  onDownloadAll: () => void;
  galleryDone: boolean;
  event: ReturnType<typeof useEventTheme>["event"];
  reviewUrl: string | null;
  onReviewClick: () => void;
  contactUrl: string | null;
  onContactClick: () => void;
  /** Count shown on the "All" pill. */
  totalForViewAll?: number;
  scrollRef?: React.Ref<HTMLDivElement>;
}) {
  const { t, unlocked, tab, setTab, onOpenPrivate, folders, folderCounts, folder, setFolder, items, loading, loadingMore, hasMore, onLoadMore, likedView, onSelectLiked, selectMode, selected, liked, canDownloadAll, zipping, galleryDone, event, reviewUrl, onReviewClick, contactUrl, onContactClick, totalForViewAll, scrollRef } = props;

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (hasMore && !loadingMore && el.scrollTop + el.clientHeight >= el.scrollHeight - 400) onLoadMore();
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* Control row, two lines: switcher + Download-all/Select on the first,
          folder pills (with counts) on the second. The old "All Photos"
          heading and standalone "N photos" line are gone — counts now live
          only next to the folder names they describe. In Liked (a bottom-nav
          tab on mobile, not a pill) the filters don't apply, so only the
          select/download cluster shows. */}
      <div className="fx-rise px-4 pt-3" style={{ background: t.bg }}>
        <div className="flex items-center justify-between gap-2">
          {likedView ? (
            <span className="text-[13px] font-bold" style={{ color: t.text }}>
              {selectMode ? `${selected.size} selected` : "Liked"}
            </span>
          ) : selectMode ? (
            <span className="text-[13px] font-bold" style={{ color: t.text }}>
              {selected.size} selected
            </span>
          ) : (
            <UnlockAwareSwitcher t={t} tab={tab} setTab={setTab} />
          )}
          <ActionsCluster
            t={t}
            likedView={likedView}
            onSelectLiked={onSelectLiked}
            selectMode={selectMode}
            onToggleSelectMode={props.onToggleSelectMode}
            canDownloadAll={canDownloadAll}
            zipping={zipping}
            onDownloadAll={props.onDownloadAll}
            unlocked={unlocked}
            onOpenPrivate={onOpenPrivate}
            iconOnly
          />
        </div>

        {!likedView && (
          <FolderPillsRow
            t={t}
            folders={folders}
            folderCounts={folderCounts}
            folder={folder}
            setFolder={setFolder}
            allCount={totalForViewAll}
            className="mt-2.5 pb-1"
          />
        )}
      </div>

      {/* grid */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto pb-[130px] pt-6" onScroll={onScroll} style={{ scrollbarWidth: "none" }}>
        <div className="mx-auto w-full max-w-[760px] px-4">
          {loading ? (
            <LoadingSkeleton />
          ) : props.loadError && items.length === 0 ? (
            <ErrorState t={t} onRetry={props.onRetry} />
          ) : items.length === 0 ? (
            <EmptyState t={t} likedView={likedView} tab={tab} unlocked={unlocked} />
          ) : (
            <>
              <GalleryGrid
                t={t}
                items={items}
                selectMode={selectMode}
                selected={selected}
                liked={liked}
                onOpen={props.onOpen}
                onToggleSelect={props.onToggleSelect}
                onToggleLike={props.onToggleLike}
                onEnterSelectWith={props.onEnterSelectWith}
                onDownload={props.onDownload}
              />
              {loadingMore && (
                <div className="flex justify-center py-6">
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" style={{ color: t.brand }} />
                </div>
              )}
            </>
          )}

          {galleryDone && (
            <OutroBand
              t={t}
              event={event}
              reviewUrl={reviewUrl}
              onReviewClick={onReviewClick}
              contactUrl={contactUrl}
              onContactClick={onContactClick}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  // A generic flex-wrap placeholder (no CSS columns) — varied box sizes so the
  // load state still reads as a photo wall.
  return (
    <div className="flex flex-wrap gap-2">
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="skeleton rounded-[10px]"
          style={{ width: 110 + (i % 3) * 50, height: 130 + (i % 4) * 45, flex: "1 1 auto", animationDelay: `${i * 0.04}s` }}
        />
      ))}
    </div>
  );
}

function EmptyState({
  t,
  likedView,
  tab,
  unlocked,
}: {
  t: Theme;
  likedView: boolean;
  tab: "mine" | "all";
  /** Distinguishes a host's empty "All Photos" from a locked guest's empty
   *  Highlights view — the latter needs a nudge toward the passcode, not a
   *  generic "nothing here". */
  unlocked: boolean;
}) {
  const msg = likedView
    ? "No liked photos yet — tap the heart on any photo."
    : tab === "mine"
      ? "No photos matched your face yet. More may appear as the studio adds them."
      : !unlocked
        ? "No highlighted photos yet. Ask the couple for the family passcode to see everything."
        : "No photos here yet.";
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-8 py-20 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: t.sunken, color: t.faint }}>
        <IconGrid size={24} />
      </span>
      <p className="max-w-[280px] text-[13.5px] font-semibold" style={{ color: t.muted }}>{msg}</p>
    </div>
  );
}

function ErrorState({ t, onRetry }: { t: Theme; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-8 py-20 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: t.errorSoft, color: t.error }}>
        <IconGrid size={24} />
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
    { key: "home", label: "Home", icon: <IconHome size={18} weight={active === "home" ? "fill" : "regular"} />, on: onHome },
    { key: "gallery", label: "Gallery", icon: <IconGrid size={18} weight={active === "gallery" ? "fill" : "regular"} />, on: onGallery },
    { key: "liked", label: "Liked", icon: <IconHeart size={18} filled={active === "liked"} />, on: onLiked },
  ] as const;
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-5 pb-3 lg:hidden">
      <div className="flex w-full max-w-[460px] gap-1 rounded-full p-1" style={{ background: t.card, boxShadow: t.shadow }}>
        {items.map((n) => {
          const on = active === n.key;
          return (
            <button
              key={n.key}
              type="button"
              onClick={n.on}
              className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full py-2 text-[12px] transition-colors"
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

