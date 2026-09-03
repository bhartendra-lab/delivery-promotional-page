"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CustomFolder, GuestMediaItem, GuestSession } from "@/lib/types";
import { normalizeDeliveryPreferences } from "@/lib/delivery-preferences";
import { SIGNAL } from "@/lib/client-theme";
import { catchGuestBehavior, GuestAuthError, getArchiveDownloadUrls, getGuestMedia, likePhoto, searchSelfie, unlikePhoto, updateGuestSubType } from "@/lib/guest-api";
import { getCachedMediaIds, setCachedMediaIds } from "@/lib/guest-auth";
import { nameFromUrl } from "@/lib/media-actions";
import { useDownloadFlow } from "@/lib/download/useDownloadFlow";
import { useSinglePhotoDownload } from "@/lib/download/useSinglePhotoDownload";
import { QualityChoiceSheet } from "@/components/event/download/QualityChoiceSheet";
import type { PlanSource } from "@/lib/download/plan";
import type { ArchiveUrlResolver } from "@/lib/download/engines";
import { DownloadPlanModal } from "@/components/event/download/DownloadPlanModal";
import { useEventTheme } from "../EventThemeContext";
import { usePolicy } from "../policy/PolicyContext";
import { PhotoViewer } from "./lounge/PhotoViewer";
import { PasscodeSheet } from "./lounge/PasscodeSheet";
import { ProfileSheet } from "./lounge/ProfileSheet";
import { IntakeSheet } from "./lounge/IntakeSheet";
import { TopBar } from "./lounge/TopBar";
import { CoverMasthead } from "./lounge/CoverMasthead";
import { DesktopCover } from "./lounge/DesktopCover";
import { MobileTopBar } from "./lounge/MobileTopBar";
import { ReviewNudge, OutroBand, type NudgeReason } from "./lounge/ReviewNudge";
import { GalleryGrid } from "./gallery/GalleryGrid";
import { StickyControlRow } from "./gallery/StickyControlRow";
import { ALL, UnlockAwareSwitcher, FolderPillsRow, ActionsCluster, SelectionSummary } from "./gallery/GalleryControls";
import { IconHeart, IconGrid, IconHome, IconLock } from "@/components/ui/icons";

const PAGE = 60;
/**
 * The custom folder a photo should be filed under when downloading. A photo can
 * belong to several folders (membership is an array); the first one the folder
 * registry knows about wins, and a photo in none goes to the root. Read from the
 * MEDIA DOCUMENT rather than from whatever folder view happened to be open,
 * because a selection can span folders — the `directory` engine mirrors this as
 * a subdirectory, which is what stops two DSC_4821.jpg from colliding.
 */
function folderNameOf(m: GuestMediaItem, folders: CustomFolder[]): string {
  for (const id of m.custom_folder_ids ?? []) {
    const name = folders.find((f) => f._id === id)?.name?.trim();
    if (name) return name;
  }
  return "";
}
/** Guests who like this many photos in-session get the "loving the gallery?" nudge. */
const LIKE_NUDGE_THRESHOLD = 3;
/** Breathing room after the gallery first paints before the gentle load nudge. */
const LOAD_NUDGE_DELAY_MS = 6000;
/** Above this many photos a selection is worth a word of warning about how long
 *  the download runs — but never a confirm dialog, since the toast already
 *  streams per-photo progress. */
const LARGE_SELECTION = 300;

/** What the grid is currently showing, in the shape `getGuestMedia` and the
 *  ZIP paginator both take. Never carries `skip`/`limit` — it describes the
 *  view, not a page of it. */
type MediaScope = { mine?: boolean; onlyLiked?: boolean; customFolderId?: string };

/** Same match set? Positional compare — the backend returns a stable order, and
 *  a false negative only costs one extra page fetch. */
const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every((id, i) => id === b[i]);

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

  // "Tell us about you" sheet — raised once, over the Lounge, for whichever
  // of these the guest hasn't answered yet. Computed locally (not routed to
  // by EventFlow) so a returning guest who already has both never sees it.
  const needsName = !session.name || session.name === "Guest";
  const intakeTeams = event.guest_types ?? [];
  const needsTeam = intakeTeams.length > 0 && !session.guest_sub_type;
  const showIntakeSheet = needsName || needsTeam;

  async function submitIntake(patch: { name?: string; team?: string }) {
    await updateGuestSubType(uniqueIdentifier, { name: patch.name, guestSubType: patch.team });
    onSessionChange({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.team !== undefined ? { guest_sub_type: patch.team } : {}),
    });
  }

  // Only ONE shell is mounted at a time (not two CSS-toggled trees): a hidden
  // `display:none` GalleryGrid measures 0 width and would render nothing, and
  // mounting both doubles the DOM + ResizeObservers for no benefit. The parent
  // owns all data, so switching shells never re-fetches.
  const isDesktop = useIsDesktop();

  // Event-scoped studio preference. Off means no download affordance anywhere in
  // the gallery, for every guest — a passcode-unlocked host included. Note this
  // turns downloads OFF; media still lives at public R2 URLs, so it is not a
  // cryptographic block on someone who already holds a photo's URL.
  const prefs = useMemo(
    () => normalizeDeliveryPreferences(event.delivery_preferences),
    [event.delivery_preferences],
  );
  const canDownload = prefs.allow_download;

  // Full-gallery ZIP is host-only and now built in the browser (client-zip,
  // streamed to disk), so it's available whenever the guest is unlocked — there's
  // no backend zip state to gate on any more. The studio preference gates it too.
  const canDownloadAll = unlocked && canDownload;

  /**
   * Select mode exists solely to download a subset — its action bar is Cancel +
   * Download and nothing else. With downloads off it is a dead end, so the
   * entry points are hidden and entering it is refused outright.
   */
  const canSelect = canDownload;

  const reviewUrl = event.company_google_place_id
    ? `https://search.google.com/local/writereview?placeid=${event.company_google_place_id}`
    : event.company_gmb_link || null;
  // Contact opens a WhatsApp chat with the studio's number (digits only).
  // company_whatsapp_number is the OTP-verified field; company_contact_number
  // is a legacy fallback for delivery pages published before its removal.
  const waNumber = (event.company_whatsapp_number || event.company_contact_number || "").replace(/\D/g, "");
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
  /** Select-all is modelled as SCOPE MINUS EXCLUSIONS, never as a materialised
   *  id list: collecting every id would cost a full pagination walk per tap,
   *  hold thousands of ids in state for nothing, and still race infinite
   *  scroll. With this shape, tiles loaded later render checked for free. */
  const [selectAll, setSelectAll] = useState(false);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [passcodeOpen, setPasscodeOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  /**
   * The bulk-download pre-flight + progress surface. Every bulk download in this
   * gallery goes through it — the modal is where the plan is shown, the tier is
   * chosen and progress lives, so there is no separate progress toast any more.
   * Single-photo downloads still bypass it entirely.
   */
  const downloadFlow = useDownloadFlow();
  const zipping = downloadFlow.state.open;
  /** Server-derived: may this viewer pick an unwatermarked archive tier? Comes
   *  back on the first page of get-media. Advisory only — the URL endpoint
   *  re-checks and is the real gate. */
  const [archiveAccess, setArchiveAccess] = useState(false);
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
  // not stored server-side: the cached set (from a fresh scan or an earlier
  // visit in this tab) only seeds the initial render so the grid can paint
  // immediately — search-selfie still re-runs on every mount below, because the
  // studio keeps uploading and yesterday's match set misses today's photos.
  const [mediaIds, setMediaIds] = useState<string[] | null>(() => getCachedMediaIds(uniqueIdentifier));
  // Captured once at mount: whether the match count still needs to resolve
  // during THIS visit (a fresh scan, or a returning guest whose cache was
  // empty). Drives the dismissible "Found N photos" banner below — a guest
  // who already had a warm cache at mount (mediaIds non-null from the start)
  // has seen their count before, so no banner replay on every reload.
  const [mediaIdsResolvingThisVisit] = useState(() => mediaIds === null);
  const [matchBannerDismissed, setMatchBannerDismissed] = useState(false);
  const showMatchBanner =
    mediaIdsResolvingThisVisit && mediaIds !== null && mediaIds.length > 0 && !matchBannerDismissed;

  // EventFlow rebuilds `onReauth` on every render of its own, so it's read
  // through a ref rather than being a dependency below — otherwise an unrelated
  // session patch (a passcode unlock, say) would fire a second face search.
  const onReauthRef = useRef(onReauth);
  useEffect(() => {
    onReauthRef.current = onReauth;
  });

  useEffect(() => {
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
        // Hold on to the previous array when the match set is unchanged: its
        // identity is a dependency of the media loader below, so swapping in an
        // equal-but-new array would refetch the first page for nothing.
        setMediaIds((prev) => (prev && sameIds(prev, ids) ? prev : ids));
      } catch (err) {
        if (cancelled) return;
        if (err instanceof GuestAuthError) {
          onReauthRef.current();
          return;
        }
        // Search failed — keep showing the last known match set rather than an
        // empty gallery. Only a cold cache falls back to "no matches", which
        // also unblocks the media loader (it waits on a non-null value).
        setMediaIds((prev) => prev ?? []);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uniqueIdentifier, bookingId, session.selfie_id]);

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
      // A fresh page-1 load replaces the result set under any live selection —
      // a reloadKey retry or an unlock must not leave an "All 4,812 selected"
      // banner describing photos that are no longer on screen.
      setSelectAll(false);
      setExcluded(new Set());
      setSelected(new Set());
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
        setArchiveAccess(res.archive_access === true);
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

  /* ── selection, as scope-minus-exclusions ───────────────────────────────
     `isSelected` is threaded down to the grid instead of a Set, so a tile the
     infinite scroll hasn't loaded yet still resolves correctly the moment it
     arrives — there is no second source of truth to drift from. */
  const isSelected = useCallback(
    (id: string) => (selectAll ? !excluded.has(id) : selected.has(id)),
    [selectAll, excluded, selected],
  );
  /** Preview only. `totalForView` is the server's `total`, which
   *  fetchMediaEntriesForZip warns may be capped; the completion toast reports
   *  the number actually zipped, and that one is the truth. */
  const selectedCount = selectAll ? Math.max(0, totalForView - excluded.size) : selected.size;
  const allSelected = selectAll && excluded.size === 0;
  const selectionLabel = allSelected
    ? `All ${selectedCount.toLocaleString("en-IN")} selected`
    : `${selectedCount.toLocaleString("en-IN")} selected`;
  const selectionHint = selectedCount > LARGE_SELECTION ? "This can take a few minutes." : undefined;
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

  const toggleSel = useCallback(
    (item: GuestMediaItem) => {
      // In select-all mode a tap subtracts from (or restores to) the scope;
      // otherwise it's the original additive set.
      if (selectAll) {
        setExcluded((prev) => {
          const n = new Set(prev);
          if (n.has(item._id)) n.delete(item._id);
          else n.add(item._id);
          return n;
        });
        return;
      }
      setSelected((prev) => {
        const n = new Set(prev);
        if (n.has(item._id)) n.delete(item._id);
        else n.add(item._id);
        return n;
      });
    },
    [selectAll],
  );
  /** Clears the select-all scope without leaving select mode. */
  const clearSelectAll = useCallback(() => {
    setSelectAll(false);
    setExcluded(new Set());
    setSelected(new Set());
  }, []);
  /** The single teardown point for selection — every tab, folder, Liked and
   *  nav handler routes through here, so the scope can't outlive its view. */
  const exitSelect = useCallback(() => {
    setSelectMode(false);
    setSelected(new Set());
    setSelectAll(false);
    setExcluded(new Set());
  }, []);
  const enterSelectWith = useCallback(
    (item: GuestMediaItem) => {
      // Belt to the hidden entry points' braces: never enter a mode whose only
      // action has been turned off.
      if (!canSelect) return;
      setSelectMode(true);
      setSelectAll(false);
      setExcluded(new Set());
      setSelected(new Set([item._id]));
    },
    [canSelect],
  );
  /** "Select all": enters select mode and takes the whole active scope in one
   *  gesture. A hand-built selection is discarded, which is conventional. */
  const selectAllInView = useCallback(() => {
    setSelectMode(true);
    setSelected(new Set());
    setExcluded(new Set());
    setSelectAll(true);
  }, []);

  /**
   * Mints archive (unwatermarked) download URLs, chunked at the endpoint's
   * 500-id ceiling. Passed to the engine rather than called by it, so the
   * engines stay free of any notion of a tier.
   *
   * A chunk that fails is logged and skipped rather than failing the run: the
   * items it covered fall back to their web copies and are reported as
   * degraded, which is exactly what happens to a photo with no archive object.
   */
  const resolveArchiveUrls = useCallback<ArchiveUrlResolver>(
    async (items, signal) => {
      const resolved = new Map<string, { url: string; name?: string }>();
      const CHUNK = 500;
      for (let i = 0; i < items.length; i += CHUNK) {
        if (signal.aborted) break;
        const chunk = items.slice(i, i + CHUNK);
        try {
          const rows = await getArchiveDownloadUrls(
            uniqueIdentifier,
            bookingId,
            chunk.map((item) => item.mediaId),
          );
          for (const row of rows) resolved.set(row.media_id, { url: row.url, name: row.filename });
        } catch (err) {
          if (err instanceof GuestAuthError) throw err;
          console.warn("[download] archive URL chunk failed", err);
        }
      }
      return resolved;
    },
    [uniqueIdentifier, bookingId],
  );

  // The post-download review nudge. The modal owns the run now, so the nudge
  // fires off its outcome rather than off a resolved promise — and only when
  // photos actually landed, so a cancelled or wholly-failed run doesn't ask the
  // guest for a review.
  const downloadSaved = downloadFlow.state.result?.saved ?? 0;
  const downloadFinished = downloadFlow.state.phase === "finished";
  useEffect(() => {
    if (downloadFinished && downloadSaved > 0) triggerNudge("download");
  }, [downloadFinished, downloadSaved, triggerNudge]);

  /** One photo's archive URL, for the lightbox's tier choice. Null when the
   *  server declines or the photo has no archive object — the caller falls back
   *  to the web copy rather than failing. */
  const resolveOneArchiveUrl = useCallback(
    async (mediaId: string) => {
      try {
        const rows = await getArchiveDownloadUrls(uniqueIdentifier, bookingId, [mediaId]);
        const row = rows[0];
        return row ? { url: row.url, filename: row.filename } : null;
      } catch (err) {
        if (err instanceof GuestAuthError) onReauth();
        else console.warn("[download] archive URL failed", err);
        return null;
      }
    },
    [uniqueIdentifier, bookingId, onReauth],
  );

  /** Open the download pre-flight. Every bulk download in this gallery goes
   *  through here; the modal owns the plan, the tier, progress and cancelling. */
  const startDownload = useCallback(
    (baseName: string, resolveSources: (signal: AbortSignal) => Promise<PlanSource[]>) => {
      if (zipping) return;
      setToast(null);
      // Close the photo viewer first. The pre-flight is a full-attention
      // surface that stays up for the whole run, so leaving a viewer mounted
      // underneath it means cancelling the download drops the guest back into a
      // preview they had forgotten was open.
      setViewerIndex(null);
      void downloadFlow.start({
        bookingId,
        baseName,
        resolveSources,
        archiveAccess,
        resolveArchiveUrls,
      });
    },
    [zipping, downloadFlow, bookingId, archiveAccess, resolveArchiveUrls],
  );

  /**
   * Every single-photo save in this gallery — the per-tile hover button, the
   * lightbox chip, and a one-item selection — goes through here, so all three
   * offer the same quality choice (and skip it identically when the photo has
   * no unwatermarked copy, or this guest isn't entitled to one).
   *
   * `archiveAccess` already folds in the studio's `allow_download` and
   * `archive_download_access`, so there is no separate preference check here.
   */
  const singleDownload = useSinglePhotoDownload({
    archiveAccess,
    resolveArchiveUrl: resolveOneArchiveUrl,
    onStart: () => setToast("Downloading 1 photo…"),
    onDone: () => {
      setToast("Download started");
      triggerNudge("download");
    },
    // The photo saved, just not at the tier they picked. Said out loud rather
    // than left to look like a successful full-size download.
    onFellBack: () => {
      setToast("Full-size copy unavailable — saved the web version");
      triggerNudge("download");
    },
    onError: () => setToast("Download failed — please try again"),
  });

  const downloadOne = useCallback(
    (item: GuestMediaItem) => {
      singleDownload.request({
        mediaId: item.media_id,
        url: item.url,
        archiveVariant: item.archive_variant ?? null,
      });
    },
    [singleDownload],
  );

  /** One media row as the download planner wants it. `folderName` comes from the
   *  media document (via the folder registry), never from whatever folder view
   *  happened to be open — a selection can span custom folders, and the
   *  `directory` engine mirrors these as subdirectories. */
  const toPlanSource = useCallback(
    (m: GuestMediaItem): PlanSource => ({
      mediaId: m.media_id,
      url: m.url,
      name: nameFromUrl(m.url),
      folderName: folderNameOf(m, folders),
      bytes: m.size ?? 0,
      archiveVariant: m.archive_variant ?? null,
      archiveBytes: m.archive_size ?? null,
    }),
    [folders],
  );

  function downloadSelected() {
    // Select-all with pages still unfetched: walk the same scope the grid is
    // showing and subtract the exclusions, so photos infinite scroll never
    // reached are included. `hasMore` guarantees at least a full page is
    // loaded, so this branch can never resolve to the single-photo case below.
    if (selectAll && hasMore) {
      const name = nameForScope(selectedCount);
      const excludedIds = excluded;
      const scope = currentScope();
      exitSelect();
      startDownload(name, async (signal) => {
        const all = await fetchPlanSources(scope, signal);
        return excludedIds.size ? all.filter((e) => !excludedIds.has(e._id)) : all;
      });
      return;
    }

    // Everything in scope is already loaded (or this is a hand-built
    // selection), so resolve it locally — no pagination walk needed.
    const chosen = selectAll
      ? displayed.filter((i) => !excluded.has(i._id))
      : displayed.filter((i) => selected.has(i._id));
    if (!chosen.length) return;
    // One photo → a straight download, no bulk pre-flight: it works on every
    // browser at any size, so there is nothing to warn about. It still gets the
    // quality choice, via the same path the tile and lightbox use.
    if (chosen.length === 1) {
      const only = chosen[0];
      exitSelect();
      downloadOne(only);
      return;
    }
    const sources = chosen.map(toPlanSource);
    exitSelect();
    startDownload(nameForScope(sources.length), async () => sources);
  }

  /**
   * Paginate the guest media API into plan sources. `_id` rides along so a
   * select-all download can drop its exclusions without a second request.
   *
   * This walk now runs BEFORE the modal shows its plan rather than after the
   * save picker opens: the pre-flight has to state an exact size, and resolving
   * first is also what keeps the picker inside the confirm click's user
   * activation (see useDownloadFlow).
   */
  const fetchPlanSources = useCallback(
    async (scope: MediaScope, signal?: AbortSignal): Promise<(PlanSource & { _id: string })[]> => {
      const entries: (PlanSource & { _id: string })[] = [];
      const seen = new Set<string>();
      const PAGE_SIZE = 500;
      for (let skip = 0; ; skip += PAGE_SIZE) {
        // Cancelling during the walk stops it here rather than after every
        // page of a large gallery has been requested.
        if (signal?.aborted) break;
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
          entries.push({ _id: m._id, ...toPlanSource(m) });
        }
        // Stop on an empty or short page only — don't trust `total` for stopping;
        // the API may report a capped total (e.g. 1000) even when more media exists.
        if (media.length === 0 || media.length < PAGE_SIZE) break;
      }
      return entries;
    },
    [uniqueIdentifier, bookingId, mediaIds, toPlanSource],
  );

  /** The scope of what the grid is currently showing. Liked wins over tab and
   *  folder; a folder pill narrows within the active tab; otherwise the tab
   *  alone decides. `mine` must stay falsy (not the string "false") for a
   *  non-host "All" request, or the backend's Highlights path is skipped —
   *  `getGuestMedia` drops a falsy `mine` rather than sending mine=false. */
  const currentScope = useCallback((): MediaScope => {
    if (likedView) return { onlyLiked: true };
    const mine = effTab === "mine";
    return folder === ALL ? { mine } : { mine, customFolderId: folder };
  }, [likedView, effTab, folder]);

  /** Base name for the active view's download, naming the scope and the count.
   *  The engines append ".zip" (or " - part i of n.zip"). */
  const nameForScope = useCallback(
    (count: number) => {
      const base = (event.event_name || "gallery").trim() || "gallery";
      const n = `(${count.toLocaleString("en-IN")} photo${count === 1 ? "" : "s"})`;
      if (likedView) return `${base} - liked ${n}`;
      if (folder !== ALL) {
        const folderName = folders.find((f) => f._id === folder)?.name?.trim() || "folder";
        return `${base} - ${folderName} ${n}`;
      }
      return `${base} ${n}`;
    },
    [event.event_name, likedView, folder, folders],
  );

  // Gallery header "Download": the whole active view. This used to fall through
  // to an unscoped { mine: false } whenever the folder pill was on All, so My
  // Photos + All quietly zipped the entire gallery; `currentScope` is now the
  // single source of truth for both this and the select-all download.
  const downloadGalleryZip = useCallback(() => {
    const scope = currentScope();
    startDownload(nameForScope(totalForView), (signal) => fetchPlanSources(scope, signal));
  }, [startDownload, fetchPlanSources, currentScope, nameForScope, totalForView]);

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

  /* Desktop keyboard: Cmd/Ctrl+A takes the whole scope, Escape leaves select
     mode. Bound to `window` rather than the gallery container on purpose — a
     plain div receives no keydown unless it holds focus, so a container-scoped
     listener would silently never fire. The overlay guard below is what keeps
     these from acting behind the PhotoViewer, PasscodeSheet, ProfileSheet or
     IntakeSheet, and the target check keeps them out of text fields. */
  const overlayOpen = viewerIndex != null || passcodeOpen || profileOpen || showIntakeSheet;
  useEffect(() => {
    if (!isDesktop) return;
    const onKey = (e: KeyboardEvent) => {
      if (overlayOpen) return;
      const el = e.target as HTMLElement | null;
      if (el?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el?.tagName ?? "")) return;
      if (e.key === "Escape" && selectMode) {
        exitSelect();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === "a" || e.key === "A") && selectMode) {
        e.preventDefault(); // otherwise the browser selects the page's text
        selectAllInView();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isDesktop, overlayOpen, selectMode, exitSelect, selectAllInView]);

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

  // Fades the host/event name into the desktop top bar once the cover
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
    exitSelect(); // peer of goLiked/goHome — leaving Liked changes the result set
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
            canSelect={canSelect}
            onToggleSelectMode={() => (selectMode ? exitSelect() : setSelectMode(true))}
            selectAll={selectAll}
            onSelectAll={selectAllInView}
            onClearSelectAll={clearSelectAll}
            selectionLabel={selectionLabel}
            selectionHint={selectionHint}
            scopeTotal={totalForView}
            canDownloadAll={canDownloadAll}
            zipping={zipping}
            onDownloadAll={downloadGalleryZip}
            downloadCount={totalForView}
            allCount={allCount ?? undefined}
          />

          {/* scrollMarginTop = the measured pinned control-row height, so
              scrollIntoView lands the first grid row flush beneath it. */}
          <div ref={gridSectionRef} className="mx-auto w-full max-w-[1440px] px-8 pb-16 pt-6" style={{ scrollMarginTop: controlRowH }}>
            {showMatchBanner && (
              <MatchBanner t={t} count={mediaIds?.length ?? 0} onDismiss={() => setMatchBannerDismissed(true)} className="mb-5" />
            )}
            {loading ? (
              <LoadingSkeleton />
            ) : loadError && items.length === 0 ? (
              <ErrorState t={t} onRetry={() => setReloadKey((k) => k + 1)} />
            ) : items.length === 0 ? (
              !likedView && tab === "mine" ? (
                <NoMatchState t={t} onRescan={onRescan} onBrowseAll={() => gotoGallery("all")} contactUrl={contactUrl} onContactClick={onContactClick} />
              ) : (
                <EmptyState t={t} likedView={likedView} unlocked={unlocked} tab={tab} onOpenPrivate={() => setPasscodeOpen(true)} />
              )
            ) : (
              <>
                {/* ONE continuous justified grid over the full flat list — every
                    loaded photo appears exactly once, in API order (folder
                    pills filter server-side, so no client-side partitioning). */}
                <GalleryGrid
                  t={t}
                  items={displayed}
                  selectMode={selectMode}
                  isSelected={isSelected}
                  liked={liked}
                  onOpen={(i) => setViewerIndex(i)}
                  onToggleSelect={toggleSel}
                  onToggleLike={toggleLike}
                  onEnterSelectWith={canSelect ? enterSelectWith : undefined}
                  onDownload={canDownload ? downloadOne : undefined}
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
            isSelected={isSelected}
            selectionLabel={selectionLabel}
            selectionHint={selectionHint}
            scopeTotal={totalForView}
            selectAll={selectAll}
            onSelectAll={selectAllInView}
            onClearSelectAll={clearSelectAll}
            liked={liked}
            onToggleSelect={toggleSel}
            onToggleLike={toggleLike}
            onEnterSelectWith={canSelect ? enterSelectWith : undefined}
            onDownload={canDownload ? downloadOne : undefined}
            onOpen={(i) => setViewerIndex(i)}
            onToggleSelectMode={() => (selectMode ? exitSelect() : setSelectMode(true))}
            canSelect={canSelect}
            canDownloadAll={canDownloadAll}
            zipping={zipping}
            onDownloadAll={downloadGalleryZip}
            downloadCount={totalForView}
            galleryDone={galleryDone}
            event={event}
            reviewUrl={reviewUrl}
            onReviewClick={onReviewClick}
            contactUrl={contactUrl}
            onContactClick={onContactClick}
            onRescan={onRescan}
            onBrowseAll={() => gotoGallery("all")}
            showMatchBanner={showMatchBanner}
            matchCount={mediaIds?.length ?? 0}
            onDismissMatchBanner={() => setMatchBannerDismissed(true)}
          />
        )}

        <BottomNav t={t} active={navActive} onHome={goHome} onGallery={goGallery} onLiked={goLiked} />
      </div>
      )}

      {/* Select action bar — Cancel + Download only. The count and Select all
          live in the control row at the top, next to each other, so the bar
          stays a one-line commit step rather than a second summary. Download is
          also the ONLY action here, which is why select mode is unreachable
          when the studio has downloads off (see `canSelect`); the guard below
          is belt-and-braces for a mode that can no longer be entered. */}
      {selectMode && (
        <div className="fixed inset-x-0 bottom-[84px] z-40 flex justify-center px-5 lg:bottom-6">
          <div className="flex w-full max-w-[460px] items-center justify-between gap-3 rounded-full px-4 py-2" style={{ background: t.card, boxShadow: t.shadow }}>
            <span className="truncate text-[12.5px] font-extrabold" style={{ color: t.text }}>
              {selectionLabel}
            </span>
            <div className="flex shrink-0 items-center gap-1">
              <button type="button" onClick={exitSelect} className="cursor-pointer rounded-full px-2.5 py-2 text-[12.5px] font-bold" style={{ color: t.muted }}>
                Cancel
              </button>
              {canDownload && (
                <button
                  type="button"
                  onClick={downloadSelected}
                  disabled={selectedCount === 0 || zipping}
                  className="cursor-pointer whitespace-nowrap rounded-full px-4 py-2 text-[12.5px] font-extrabold disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ background: t.brand, color: t.onBrand }}
                >
                  {zipping ? (
                    "Preparing…"
                  ) : (
                    <>
                      Download
                      <span className="hidden sm:inline"> ({selectedCount.toLocaleString("en-IN")})</span>
                    </>
                  )}
                </button>
              )}
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
          isSelected={isSelected}
          onToggleSelect={toggleSel}
          onToast={setToast}
          canDownload={canDownload}
          onDownload={downloadOne}
        />
      )}

      {/* "tell us about you" — non-dismissible, held over everything else */}
      {showIntakeSheet && <IntakeSheet showName={needsName} teams={needsTeam ? intakeTeams : []} onSubmit={submitIntake} />}

      {/* passcode */}
      {passcodeOpen && (
        <PasscodeSheet
          onClose={() => setPasscodeOpen(false)}
          onSuccess={() => {
            onSessionChange({ guest_type: "host" });
            setPasscodeOpen(false);
            // The media loader keys on the VIEW (tab/folder/liked), not on auth,
            // so promoting the guest to host doesn't refetch on its own — a guest
            // sitting on All Photos would keep staring at the Highlights subset
            // until they touched a tab. Bump reloadKey instead of adding
            // session.guest_type to the effect's deps, so that dependency list
            // stays about the view. Whichever tab they were on is the tab they
            // stay on; it just widens under them.
            exitSelect();
            setReloadKey((k) => k + 1);
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

      {/* The bulk-download pre-flight, and then the progress surface for the
          same run — one component, deliberately not closed when the download
          starts. A multi-hour download deserves better than a toast, and a
          batched download structurally needs somewhere to click each part. */}
      <DownloadPlanModal
        flow={downloadFlow}
        theme={t}
        shareUrl={typeof window !== "undefined" ? window.location.href : undefined}
        onSelectFewer={selectAllInView}
      />

      {/* Quality choice for a SINGLE photo. Opens only when this guest is
          entitled to the unwatermarked copy and the photo actually has one —
          otherwise the tile, chip and one-item selection all save straight away
          as they always did. */}
      <QualityChoiceSheet {...singleDownload.sheet} theme={t} />

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
  isSelected: (id: string) => boolean;
  /** "All N selected" / "N selected" for the compact header (see the parent). */
  selectionLabel: string;
  /** Quiet line under Select all; only set for large selections. */
  selectionHint?: string;
  /** Photos in the active view — shown on the Select all button. */
  scopeTotal: number;
  selectAll: boolean;
  onSelectAll: () => void;
  onClearSelectAll: () => void;
  liked: Set<string>;
  onToggleSelect: (i: GuestMediaItem) => void;
  onToggleLike: (i: GuestMediaItem) => void;
  /** Absent when the studio has turned downloads off — select mode's only
   *  action is Download, so there is nothing to enter select mode for. */
  onEnterSelectWith?: (i: GuestMediaItem) => void;
  /** Absent when the studio has turned downloads off — the tile renders no
   *  download button at all rather than a disabled one. */
  onDownload?: (i: GuestMediaItem) => void;
  onOpen: (index: number) => void;
  onToggleSelectMode: () => void;
  /** False hides the Select entry point (its only action is Download). */
  canSelect: boolean;
  canDownloadAll: boolean;
  zipping: boolean;
  onDownloadAll: () => void;
  /** Photos the header Download would fetch, shown on its label. */
  downloadCount?: number;
  galleryDone: boolean;
  event: ReturnType<typeof useEventTheme>["event"];
  reviewUrl: string | null;
  onReviewClick: () => void;
  contactUrl: string | null;
  onContactClick: () => void;
  onRescan: () => void;
  onBrowseAll: () => void;
  showMatchBanner: boolean;
  matchCount: number;
  onDismissMatchBanner: () => void;
  /** Count shown on the "All" pill. */
  totalForViewAll?: number;
  scrollRef?: React.Ref<HTMLDivElement>;
}) {
  const { t, unlocked, tab, setTab, onOpenPrivate, folders, folderCounts, folder, setFolder, items, loading, loadingMore, hasMore, onLoadMore, likedView, onSelectLiked, selectMode, isSelected, selectionLabel, selectionHint, scopeTotal, selectAll, onSelectAll, onClearSelectAll, liked, canSelect, canDownloadAll, zipping, galleryDone, event, reviewUrl, onReviewClick, contactUrl, onContactClick, onRescan, onBrowseAll, showMatchBanner, matchCount, onDismissMatchBanner, totalForViewAll, scrollRef } = props;

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
          {selectMode ? (
            <SelectionSummary
              t={t}
              label={selectionLabel}
              selectAll={selectAll}
              scopeTotal={scopeTotal}
              onSelectAll={onSelectAll}
              onClearSelectAll={onClearSelectAll}
              hint={selectionHint}
            />
          ) : likedView ? (
            <span className="text-[13px] font-bold" style={{ color: t.text }}>
              Liked
            </span>
          ) : (
            <UnlockAwareSwitcher t={t} tab={tab} setTab={setTab} />
          )}
          <ActionsCluster
            t={t}
            likedView={likedView}
            onSelectLiked={onSelectLiked}
            selectMode={selectMode}
            canSelect={canSelect}
            onToggleSelectMode={props.onToggleSelectMode}
            canDownloadAll={canDownloadAll}
            zipping={zipping}
            onDownloadAll={props.onDownloadAll}
            downloadCount={props.downloadCount}
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
          {showMatchBanner && <MatchBanner t={t} count={matchCount} onDismiss={onDismissMatchBanner} className="mb-5" />}
          {loading ? (
            <LoadingSkeleton />
          ) : props.loadError && items.length === 0 ? (
            <ErrorState t={t} onRetry={props.onRetry} />
          ) : items.length === 0 ? (
            !likedView && tab === "mine" ? (
              <NoMatchState t={t} onRescan={onRescan} onBrowseAll={onBrowseAll} contactUrl={contactUrl} onContactClick={onContactClick} />
            ) : (
              <EmptyState t={t} likedView={likedView} unlocked={unlocked} tab={tab} onOpenPrivate={onOpenPrivate} />
            )
          ) : (
            <>
              <GalleryGrid
                t={t}
                items={items}
                selectMode={selectMode}
                isSelected={isSelected}
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

/** Covers the liked-tab and "all"-tab empty cases. `tab === "mine"` with zero
 *  items is handled separately by `NoMatchState`, which has real recovery
 *  actions instead of a passive message.
 *
 *  One case gets real actions here too: a locked guest on All Photos when the
 *  studio has flagged nothing as a Highlight. `restrictToPublicFolders` then
 *  matches nothing, so the guest lands on a dead end whose only exit — the
 *  passcode — was a lock icon in the toolbar they had no reason to connect to
 *  this screen. Mirrors `NoMatchState`'s shape rather than inventing one. */
function EmptyState({
  t,
  likedView,
  unlocked,
  tab,
  onOpenPrivate,
}: {
  t: Theme;
  likedView: boolean;
  /** Distinguishes a host's empty "All Photos" from a locked guest's empty
   *  Highlights view — the latter needs a nudge toward the passcode, not a
   *  generic "nothing here". */
  unlocked: boolean;
  tab: "mine" | "all";
  /** Opens the passcode sheet — the same one the toolbar's Unlock action uses. */
  onOpenPrivate: () => void;
}) {
  const canUnlock = !likedView && tab === "all" && !unlocked;
  if (canUnlock) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 px-8 py-16 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: t.sunken, color: t.faint }}>
          <IconLock size={24} />
        </span>
        <div className="flex flex-col gap-1.5">
          <h2 className="text-[16px] font-extrabold" style={{ color: t.text }}>Nothing shared publicly yet</h2>
          <p className="max-w-[300px] text-[13px] font-semibold leading-[1.5]" style={{ color: t.muted }}>
            The host hasn’t published any photos for everyone yet. If you have the gallery passcode,
            unlock it to see the full gallery.
          </p>
        </div>
        <div className="mt-1 flex w-full max-w-[280px] flex-col gap-2">
          <button
            type="button"
            onClick={onOpenPrivate}
            className="cursor-pointer rounded-full py-3 text-[13px] font-extrabold"
            style={{ background: t.brand, color: t.onBrand }}
          >
            Enter passcode
          </button>
        </div>
      </div>
    );
  }
  const msg = likedView
    ? "No liked photos yet — tap the heart on any photo."
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

/** Dismissible "Found N photos" banner — replaces the old dedicated ScanFlow
 *  "matched" reveal screen. Only shown once, when the match count resolves
 *  during this visit (see `mediaIdsResolvingThisVisit` at the call site). */
function MatchBanner({ t, count, onDismiss, className = "" }: { t: Theme; count: number; onDismiss: () => void; className?: string }) {
  return (
    <div
      className={`fx-rise flex items-center justify-between gap-3 rounded-2xl px-4 py-3 ${className}`}
      style={{ background: t.accentWash, border: `1px solid ${t.brand}` }}
    >
      <span className="text-[13px] font-bold" style={{ color: t.text }}>
        Found <span style={{ color: t.brand }}>{count}</span> photo{count === 1 ? "" : "s"} of you
      </span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-[15px] font-bold"
        style={{ color: t.muted }}
      >
        ×
      </button>
    </div>
  );
}

/** The "mine" tab came back empty. Covers both "the studio hasn't finished
 *  adding photos yet" and "genuinely not in any photo" — the frontend can't
 *  tell these apart (and mostly doesn't need to: `validateSelfie` already
 *  rejects a bad selfie with specific retake guidance before search ever
 *  runs) — so it offers all the honest recovery paths rather than guessing. */
function NoMatchState({
  t,
  onRescan,
  onBrowseAll,
  contactUrl,
  onContactClick,
}: {
  t: Theme;
  onRescan: () => void;
  onBrowseAll: () => void;
  contactUrl: string | null;
  onContactClick: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-8 py-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: t.sunken, color: t.faint }}>
        <IconGrid size={24} />
      </span>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-[16px] font-extrabold" style={{ color: t.text }}>No matches yet</h2>
        <p className="max-w-[300px] text-[13px] font-semibold leading-[1.5]" style={{ color: t.muted }}>
          We couldn’t match any photos to your selfie. This can happen if the studio hasn’t finished adding
          photos, or if none show your face clearly yet.
        </p>
      </div>
      <div className="mt-1 flex w-full max-w-[280px] flex-col gap-2">
        <button
          type="button"
          onClick={onRescan}
          className="cursor-pointer rounded-full py-3 text-[13px] font-extrabold"
          style={{ background: t.brand, color: t.onBrand }}
        >
          Rescan my face
        </button>
        <button
          type="button"
          onClick={onBrowseAll}
          className="cursor-pointer rounded-full py-3 text-[13px] font-bold"
          style={{ background: t.sunken, color: t.text, border: `1px solid ${t.border}` }}
        >
          Browse all photos
        </button>
        {contactUrl && (
          <a
            href={contactUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onContactClick}
            className="cursor-pointer rounded-full py-3 text-center text-[13px] font-bold"
            style={{ color: t.muted }}
          >
            Contact the studio
          </a>
        )}
      </div>
      <p className="mt-1 max-w-[280px] text-[11px] font-semibold leading-[1.4]" style={{ color: t.faint }}>
        Face recognition is trained predominantly on adult faces and is therefore less reliable at identifying
        children.
      </p>
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

export function formatDate(epoch?: number | null): string | null {
  if (epoch == null) return null;
  const d = new Date(epoch);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

