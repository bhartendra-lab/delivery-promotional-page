"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { CustomFolder, GuestMediaItem, GuestSession } from "@/lib/types";
import type { FriendFinderBlock } from "@/lib/friend-finder/types";
import type { GroupCursor, GroupFeed } from "@/lib/friend-finder/feed";
import { normalizeDeliveryPreferences } from "@/lib/delivery-preferences";
import { resolveWelcomeBand } from "@/lib/welcome-band";
import { resolveSocialVisitGate, type SocialPlatformKey } from "@/lib/social-platforms";
import { resolveGoogleReviewUrl } from "@/lib/google-review";
import { SIGNAL } from "@/lib/client-theme";
import { catchGuestBehavior, GuestAuthError, getArchiveDownloadUrls, getGuestMedia, getGuestSession, likePhoto, recordSocialVisit, searchSelfie, unlikePhoto, updateGuestSubType } from "@/lib/guest-api";
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
import { ALL, UnlockAwareSwitcher, FolderPillsRow, ActionsCluster, SelectionSummary, type GalleryTab } from "./gallery/GalleryControls";
import { IconHeart, IconGrid, IconHome, IconLock, IconScanFace } from "@/components/ui/icons";

/**
 * "Find your friends group", behind a dynamic import.
 *
 * The whole feature — card, sheets, copy, API and storage modules — lives in
 * this one chunk, which is fetched only on a gallery where `friend_finder` came
 * back `enabled`. What the lounge itself carries is this declaration and the
 * conditional render at the bottom of the tree, so the initial JavaScript for
 * every gallery without the feature is what it always was.
 *
 * `ssr: false` because it reads localStorage and the guest token on mount, and
 * there is no server-rendered markup worth producing for a surface that only
 * exists for a signed-in guest.
 */
const FriendsSurface = dynamic(
  () => import("./friends/FriendsSurface").then((m) => m.FriendsSurface),
  { ssr: false },
);

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
/** Upper bound on one attempt to record the required visit. Continue waits on
 *  this at most twice (the click's attempt, then one retry), and then lets the
 *  Guest in regardless — see submitIntake. */
const VISIT_RECORD_TIMEOUT_MS = 6000;

/** How often a returning tab may re-check this Guest's access. The check is one
 *  small authenticated read, but focus and visibilitychange both fire on a
 *  single alt-tab and a Guest can flick between tabs all afternoon, so it is
 *  throttled rather than run on every event. Thirty seconds is well inside the
 *  time it takes a Studio to click the button and tell someone to look. */
const ACCESS_RECHECK_MIN_INTERVAL_MS = 30_000;

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
  friendFinder,
  onFriendFinderChange,
  scanJustCompleted,
  onScanTriggerConsumed,
  onReauth,
  onRescan,
  onSignOut,
}: {
  session: GuestSession;
  onSessionChange: (patch: Partial<GuestSession>) => void;
  /** "Find your friends group" as the session reports it, or null when the
   *  backend's global switch is off. Nothing renders unless `enabled` is true. */
  friendFinder: FriendFinderBlock | null;
  onFriendFinderChange: (patch: Partial<FriendFinderBlock>) => void;
  /** A scan finished during this visit — arms the friends sheet. */
  scanJustCompleted: boolean;
  onScanTriggerConsumed: () => void;
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
  // by EventFlow) so a returning guest who already has them all never sees it.
  const needsName = !session.name || session.name === "Guest";
  const intakeTeams = event.guest_types ?? [];
  const needsTeam = intakeTeams.length > 0 && !session.guest_sub_type;

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

  /* ── face search, and what a Guest is left with without it ──────────────
     Four flags, derived once here and threaded everywhere, because every one
     of them is read by both shells and by half a dozen child components. */

  /** The Studio's per-event switch. Off means no selfie step, no My Photos
   *  anywhere, and no face-search call from this screen. */
  const faceSearchOn = prefs.face_search_enabled;
  /** A validated selfie — the thing My Photos is actually built on. A Guest who
   *  skipped the scan has none, and neither has one who never got that far. */
  const hasSelfie = !!session.selfie_id;
  /**
   * The event has something for a Guest without the passcode to look at.
   * `sample_media_urls` is filled by the landing endpoint from images in PUBLIC
   * folders only, so it is exactly the right signal and costs nothing — it is
   * already on the page. Known edge: a public folder holding only videos reads
   * as "nothing public" here.
   */
  const hasPublicPhotos = (event.sample_media_urls?.length ?? 0) > 0;
  /**
   * The passcode stops being optional. With face search off there is no matched
   * set, and with no public folder there are no Highlights either — so this
   * Guest can currently see nothing at all, and a dismissible "Unlock" hidden
   * in the toolbar would leave them staring at an empty gallery wondering what
   * they did wrong. Raised as a sheet they cannot dismiss instead.
   */
  const passcodeRequired = !faceSearchOn && !unlocked && !hasPublicPhotos;

  // The Studio's required visit. Catches EVERY Guest once per gallery — not
  // just Guests missing a name — so a Guest who signed in with Google (name
  // already present) still gets the sheet, for the link alone.
  const gate = useMemo(
    () =>
      resolveSocialVisitGate({
        socialLinks: event.company_social_links,
        mandatoryPlatform: event.company_mandatory_visit_platform,
        preferences: prefs,
        includeCompanyBranding: event.include_company_branding,
      }),
    [event.company_social_links, event.company_mandatory_visit_platform, event.include_company_branding, prefs],
  );
  // Satisfaction is once per event and platform-independent by design — see the
  // comment on `mandatory_link_visited_at`.
  const needsSocialVisit = !!gate && !session.mandatory_link_visited_at;
  const showIntakeSheet = needsName || needsTeam || needsSocialVisit;

  /** The Guest opened the gate's link from the sheet. Local and optimistic: set
   *  by the link's own click, before (and regardless of) the record request. */
  const [visitedPlatform, setVisitedPlatform] = useState<SocialPlatformKey | null>(null);
  /** The record request fired by that click, resolving to the stored stamp or
   *  null on any failure. It never rejects. */
  const visitAttempt = useRef<Promise<{ mandatory_link_visited_at: number | null; mandatory_link_platform: string | null } | null> | null>(null);

  const sendVisit = useCallback(
    (platform: SocialPlatformKey) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), VISIT_RECORD_TIMEOUT_MS);
      return recordSocialVisit(uniqueIdentifier, platform, controller.signal)
        .catch((err) => {
          console.warn("[recordSocialVisit] failed", err);
          return null;
        })
        .finally(() => clearTimeout(timer));
    },
    [uniqueIdentifier],
  );

  const onVisit = useCallback(
    (platform: SocialPlatformKey) => {
      setVisitedPlatform(platform);
      // One request per sheet; "Open again" doesn't resend. A failure is
      // retried once from Continue instead.
      if (!visitAttempt.current) visitAttempt.current = sendVisit(platform);
    },
    [sendVisit],
  );

  async function submitIntake(patch: { name?: string; team?: string }) {
    // The visit never blocks entry. A failed or timed-out record is retried
    // once here; if that fails too the Guest is let in on a local stamp. The
    // Studio losing one recorded click is nothing; a Guest locked out of their
    // wedding photos is a support call and a broken promise. (On a reload
    // before a record lands, the Guest is simply asked again.)
    let visit: Partial<Pick<GuestSession, "mandatory_link_visited_at" | "mandatory_link_platform">> = {};
    if (needsSocialVisit && visitedPlatform) {
      const result = (await visitAttempt.current) ?? (await sendVisit(visitedPlatform));
      visit = {
        mandatory_link_visited_at: result?.mandatory_link_visited_at ?? Date.now(),
        mandatory_link_platform: result?.mandatory_link_platform ?? visitedPlatform,
      };
    }
    // Only when there is something to save: a Guest who only had the link to
    // open must not be held up by a request with nothing in it.
    if (patch.name !== undefined || patch.team !== undefined) {
      await updateGuestSubType(uniqueIdentifier, { name: patch.name, guestSubType: patch.team });
    }
    // The session is patched HERE, on Continue, and not when the record lands:
    // for a Guest who only had the link, that would close the sheet while they
    // are still in the portal's tab.
    onSessionChange({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.team !== undefined ? { guest_sub_type: patch.team } : {}),
      ...visit,
    });
  }

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

  // One value governs every review affordance in the gallery: the pop-up, the
  // top-bar link (both breakpoints) and the outro CTA each render behind a
  // `reviewUrl &&`, so null here removes them all. Null when the Studio has no
  // listing, has switched reviews off company-wide, or has switched them off
  // for this event (the company field is read `!== false` — see the helper).
  const reviewUrl = resolveGoogleReviewUrl({
    placeId: event.company_google_place_id,
    gmbLink: event.company_gmb_link,
    enabledGlobally: event.company_google_review_enabled,
    enabledForEvent: prefs.show_google_review,
  });
  // Contact opens a WhatsApp chat with the studio's number (digits only).
  // company_whatsapp_number is the OTP-verified field; company_contact_number
  // is a legacy fallback for delivery pages published before its removal.
  const waNumber = (event.company_whatsapp_number || event.company_contact_number || "").replace(/\D/g, "");
  const contactUrl = waNumber ? `https://wa.me/${waNumber}` : null;

  const [view, setView] = useState<"home" | "gallery">("home");
  /**
   * Which tab the grid opens on. "My Photos" is only ever the right landing
   * place for a Guest who has something in it — or who is being invited to
   * scan, with nowhere better to go:
   *   - face search off  → All, the only tab there is;
   *   - has a selfie     → My Photos, as before;
   *   - skipped the scan → All when there IS an All worth showing (unlocked, or
   *     public folders), otherwise My Photos, whose scan prompt is that Guest's
   *     best way into the gallery.
   */
  const [tab, setTab] = useState<GalleryTab>(() => {
    if (!faceSearchOn) return "all";
    if (hasSelfie) return "mine";
    return unlocked || hasPublicPhotos ? "all" : "mine";
  });
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
   * A "Find your friends group" sheet is on screen. Reported UP from the lazily
   * loaded surface rather than owned here, so this screen stays ignorant of the
   * feature's own state while still being able to treat it as an overlay: no
   * Cmd+A behind it, and no review nudge popping over it.
   */
  const [friendsSheetOpen, setFriendsSheetOpen] = useState(false);
  /**
   * Where the friends card renders, held as STATE rather than a ref so the
   * surface re-renders into it the moment the slot mounts. Null whenever the
   * shell that owns the slot is unmounted — the mobile Gallery tab, say — and
   * then no card renders at all, which is the intended behaviour rather than a
   * gap to work around.
   */
  const [friendsSlot, setFriendsSlot] = useState<HTMLDivElement | null>(null);
  /** The My Group header (faces, count, waiting pill, Manage) and its empty
   *  state both come from the friends chunk, through slots of their own. */
  const [groupHeaderSlot, setGroupHeaderSlot] = useState<HTMLDivElement | null>(null);
  const [groupEmptySlot, setGroupEmptySlot] = useState<HTMLDivElement | null>(null);
  /**
   * My Group's pager, handed over by the friends surface.
   *
   * This is the whole seam. The gallery knows how to page a feed and nothing
   * about how one is built: the bucketing, the labels and the intersection
   * maths all live on the other side of this type. Null until the friends
   * payload has resolved, which is why the group tab waits rather than asking
   * for photos it cannot scope yet.
   */
  const [groupFeed, setGroupFeed] = useState<GroupFeed | null>(null);
  const [groupCursor, setGroupCursor] = useState<GroupCursor | null>(null);
  /**
   * Which bucket each loaded item belongs to, parallel to `items`.
   *
   * Kept beside the list rather than folded into it, so `items` stays exactly
   * the shape every other tab produces — one flat array, which is what the
   * lightbox, the selection and the download planner all read.
   */
  const [itemBuckets, setItemBuckets] = useState<number[]>([]);
  /**
   * Whether the gallery offers My Group at all.
   *
   * `has_group` is set on the guest's FIRST add ever and the backend never
   * clears it, not even on Stop sharing — so `stopped` has to be checked here
   * or a guest who withdrew would keep a tab onto a group they have left.
   * `faceSearchOn` too: a group feed is an intersection of face-matched sets,
   * and without face search there is nothing to intersect.
   */
  const showGroupTab =
    faceSearchOn && friendFinder?.enabled === true && friendFinder.has_group && !friendFinder.stopped;
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
  // With face search off, "mine" is not a view this gallery has — pin every
  // request and every empty state to All, whatever `tab` happens to hold (a
  // Guest can be sitting on My Photos when the Studio flips the switch).
  /**
   * With face search off there is no My Photos — and no My Group either, since
   * a group feed is an intersection of face-matched sets. Either tab can be the
   * one a Guest is sitting on when the Studio flips the switch, so both fall
   * back to All here rather than being merely hidden.
   */
  const effTab: GalleryTab = !faceSearchOn
    ? "all"
    : // A Guest can be sitting on My Group when the tab stops being offered —
      // they hit Stop sharing in another tab, or removed their last friend.
      // Pinning it back to My Photos here means the grid never holds a feed
      // whose switch segment has gone.
      tab === "group" && !showGroupTab
      ? "mine"
      : tab;
  const loadingMoreRef = useRef(false);

  // The guest's matched media_ids drive "My Photos" and the match count. They're
  // not stored server-side: the cached set (from a fresh scan or an earlier
  // visit in this tab) only seeds the initial render so the grid can paint
  // immediately — search-selfie still re-runs on every mount below, because the
  // studio keeps uploading and yesterday's match set misses today's photos.
  // With face search off there is no matched set and never will be: start at
  // EMPTY rather than null (null means "still resolving" and would hold the
  // media loader forever), and ignore the per-tab cache, which may still hold
  // a set from before the Studio switched it off.
  const [mediaIds, setMediaIds] = useState<string[] | null>(() =>
    faceSearchOn ? getCachedMediaIds(uniqueIdentifier) : [],
  );
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

  // Same reasoning as onReauthRef, for the access re-check further down: it
  // subscribes window listeners once, and EventFlow hands it a fresh
  // `onSessionChange` on every render of its own. Read through refs so a
  // re-render never tears the listeners down and rebuilds them.
  const onSessionChangeRef = useRef(onSessionChange);
  const guestTypeRef = useRef(session.guest_type);
  const onFriendFinderChangeRef = useRef(onFriendFinderChange);
  useEffect(() => {
    onSessionChangeRef.current = onSessionChange;
    guestTypeRef.current = session.guest_type;
    onFriendFinderChangeRef.current = onFriendFinderChange;
  });

  useEffect(() => {
    // Nothing to search for, and the backend would refuse anyway (it checks the
    // same switch on the way in, to catch exactly this tab).
    if (!faceSearchOn) return;
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
  }, [uniqueIdentifier, bookingId, session.selfie_id, faceSearchOn]);

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
    // Nothing this Guest can see yet, so nothing worth asking for: the request
    // would come back empty and the required passcode sheet is over the grid
    // anyway. The unlock path bumps `reloadKey`, and unlocking also clears
    // `passcodeRequired`, so the first real load happens the moment they are in.
    if (passcodeRequired) return;
    // My Group is paged by its own effect below, against a bucketed feed
    // rather than a scope. Bailing out HERE rather than branching inside keeps
    // this effect's dependency list exactly what it was: adding the feed to it
    // would refetch My Photos every time the friends payload changed.
    if (effTab === "group") return;
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
  }, [uniqueIdentifier, bookingId, effTab, folder, likedView, onReauth, reloadKey, seedLikes, mediaIds, passcodeRequired]);

  /**
   * My Group's first page.
   *
   * Keyed on `groupFeed?.key` — a signature of the feed's contents — rather
   * than on the feed object: the people screen patches its payload optimistically
   * on every tap, and rebuilding an identical feed must not reload the grid
   * under the guest. The feed itself is read through a ref for the same reason.
   */
  const groupFeedRef = useRef<GroupFeed | null>(null);
  useEffect(() => {
    groupFeedRef.current = groupFeed;
  });
  const groupFeedKey = groupFeed?.key ?? null;

  useEffect(() => {
    if (effTab !== "group") return;
    const feed = groupFeedRef.current;
    // The friends payload has not arrived yet. The grid holds its loading
    // state rather than showing an empty group that is merely unresolved.
    if (!feed) return;
    let cancelled = false;
    (async () => {
      await Promise.resolve(); // defer — no synchronous setState in the effect body
      if (cancelled) return;
      setLoading(true);
      setLoadError(false);
      // Same reasoning as the gallery loader: a fresh result set must not leave
      // a selection banner describing photos that are no longer on screen.
      setSelectAll(false);
      setExcluded(new Set());
      setSelected(new Set());
      try {
        const page = await feed.loadPage(null);
        if (cancelled) return;
        setItems(page.items);
        setItemBuckets(page.items.map(() => page.bucket));
        setGroupCursor(page.nextCursor);
        // Exact, and known before a single request: the feed is an
        // intersection the client already holds.
        setTotalForView(feed.total);
        seedLikes(page.items);
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
  }, [effTab, groupFeedKey, reloadKey, seedLikes, onReauth]);

  const loadMore = useCallback(async () => {
    // My Group knows it is finished from its CURSOR, not from a count: a photo
    // deleted since the last face scan would leave `items.length` short of
    // `total` for ever, and the grid would keep asking for a page that is not
    // there.
    if (effTab === "group") {
      const feed = groupFeedRef.current;
      if (loadingMoreRef.current || !feed || !groupCursor) return;
      loadingMoreRef.current = true;
      setLoadingMore(true);
      try {
        const page = await feed.loadPage(groupCursor);
        if (page.items.length) {
          seedLikes(page.items);
          setItems((prev) => {
            const seen = new Set(prev.map((m) => m._id));
            const fresh = page.items.filter((m) => !seen.has(m._id));
            // The bucket array is extended in the SAME step, against the same
            // filtered list, so the two can never drift apart.
            setItemBuckets((buckets) => [...buckets, ...fresh.map(() => page.bucket)]);
            return [...prev, ...fresh];
          });
        }
        setGroupCursor(page.nextCursor);
      } catch {
        /* leave as-is; scrolling again retries */
      } finally {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
      return;
    }

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
  }, [uniqueIdentifier, bookingId, effTab, folder, likedView, items.length, totalForView, seedLikes, mediaIds, groupCursor]);

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
  const hasMore = effTab === "group" ? groupCursor !== null : items.length < totalForView;
  /**
   * My Group is also "loading" while its pager has not arrived.
   *
   * Without this, tapping the tab before the friends payload resolves would
   * leave the PREVIOUS tab's photos on screen under a My Group header — the
   * grid's own `loading` only goes true once there is a feed to ask.
   */
  const showLoading = loading || (effTab === "group" && !groupFeed);
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
  // any gallery had rendered. Nor while the intake sheet is up: a Guest who
  // is still being asked for a name or to open the Studio's link is not
  // looking at photos yet, and two asks at once is one too many. The delay
  // simply starts once the sheet closes.
  const galleryReady =
    !loading &&
    !loadError &&
    items.length > 0 &&
    (isDesktop || view === "gallery") &&
    !showIntakeSheet &&
    // Nor behind the required passcode sheet: a Guest who has not been let in
    // yet has seen no photos to be delighted by, and cannot dismiss the nudge
    // without first dealing with the sheet under it.
    !passcodeRequired &&
    // Nor over a friends sheet. The two never stack, and of the pair the sheet
    // is the one the Guest's own action just raised. Flipping this false also
    // CLEARS a pending nudge timer (the effect below cleans up on change), so
    // the countdown simply restarts once the sheet is done with.
    !friendsSheetOpen;
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
   * Full access can change while this tab is open — the Studio can give it from
   * Access & Sharing, or take it back — and nothing pushes that to the browser.
   * So the tab asks when it comes back into view: on `visibilitychange` and on
   * `focus`, throttled to one check per ACCESS_RECHECK_MIN_INTERVAL_MS.
   *
   * The clock starts at mount because EventFlow has just read the session to
   * get here; without that seed, the first alt-tab after a page load would
   * repeat a call whose answer is seconds old.
   *
   * On a change the grid must actually reload: the media loader keys on the
   * VIEW (tab / folder / liked), not on auth, so the set of photos would not
   * widen or narrow on its own. This is the same treatment the passcode unlock
   * gets below, for the same reason — bump reloadKey rather than making
   * guest_type a dependency of a list that should stay about the view.
   *
   * Only a promotion is announced. Losing access is not news the Guest asked
   * for and not something a toast can soften, so the grid simply narrows.
   */
  useEffect(() => {
    let cancelled = false;
    let lastCheckedAt = Date.now();
    let inFlight = false;

    const check = async () => {
      if (cancelled || inFlight) return;
      if (Date.now() - lastCheckedAt < ACCESS_RECHECK_MIN_INTERVAL_MS) return;
      lastCheckedAt = Date.now();
      inFlight = true;
      try {
        const { guest, friend_finder } = await getGuestSession(uniqueIdentifier);
        if (cancelled) return;
        // Free ride on a request that was already being made: this is what
        // keeps the friends card's "N want to add you" badge current after the
        // Guest has been away in another tab. Applied BEFORE the guest_type
        // guard below, which returns early on the common no-change path.
        if (friend_finder) onFriendFinderChangeRef.current(friend_finder);
        if (guest.guest_type === guestTypeRef.current) return;
        const promoted = guest.guest_type === "host";
        onSessionChangeRef.current({ guest_type: guest.guest_type });
        // A selection made under the old access no longer describes a view the
        // Guest can act on, so it goes rather than silently changing meaning.
        exitSelect();
        setPasscodeOpen(false);
        setReloadKey((k) => k + 1);
        if (promoted) setToast("Full gallery unlocked");
      } catch (err) {
        if (cancelled) return;
        // The token expired while the tab sat in the background — the same
        // re-auth path every other guest call takes.
        if (err instanceof GuestAuthError) onReauthRef.current();
        // Anything else (offline, a blip) is ignored: this is a background
        // refresh the Guest never asked for, and the next focus retries it.
      } finally {
        inFlight = false;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") void check();
    };
    const onFocus = () => void check();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, [uniqueIdentifier, exitSelect]);

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
      const groupIds = effTab === "group" ? groupFeedRef.current?.allIds : undefined;
      startDownload(name, async (signal) => {
        const all = await fetchPlanSources(scope, signal, groupIds);
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
    async (
      scope: MediaScope,
      signal?: AbortSignal,
      /**
       * Restrict the walk to these media ids instead of the Guest's whole
       * matched set. Only My Group passes it, so it can download its own feed
       * through the identical mechanism rather than a second one. Omitted
       * everywhere else, which is byte-for-byte the previous behaviour.
       */
      idsOverride?: string[],
    ): Promise<(PlanSource & { _id: string })[]> => {
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
          idsOverride ?? mediaIds ?? [],
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
    // My Group is a subset of My Photos — the same `mine=true` request, with
    // the feed's own id list passed alongside it (see `downloadGalleryZip`).
    // No folder ever narrows it: the feed is grouped by who is in each photo,
    // and the folder pills are hidden while it is showing.
    if (effTab === "group") return { mine: true };
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
      if (effTab === "group") return `${base} - my group ${n}`;
      if (folder !== ALL) {
        const folderName = folders.find((f) => f._id === folder)?.name?.trim() || "folder";
        return `${base} - ${folderName} ${n}`;
      }
      return `${base} ${n}`;
    },
    [event.event_name, likedView, folder, folders, effTab],
  );

  // Gallery header "Download": the whole active view. This used to fall through
  // to an unscoped { mine: false } whenever the folder pill was on All, so My
  // Photos + All quietly zipped the entire gallery; `currentScope` is now the
  // single source of truth for both this and the select-all download.
  const downloadGalleryZip = useCallback(() => {
    const scope = currentScope();
    // My Group passes its OWN id list into the same planner every other view
    // uses. `allIds` is the feed in order, so the ZIP holds exactly the photos
    // the tab is showing and nothing else.
    const groupIds = effTab === "group" ? groupFeedRef.current?.allIds : undefined;
    startDownload(nameForScope(totalForView), (signal) => fetchPlanSources(scope, signal, groupIds));
  }, [startDownload, fetchPlanSources, currentScope, nameForScope, totalForView, effTab]);

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
  /** The passcode sheet is up — opened deliberately, or held open because this
   *  Guest cannot see anything without it. The intake sheet always comes first,
   *  so a Guest is never asked for a name and a passcode at once. */
  const passcodeSheetOpen = passcodeOpen || (passcodeRequired && !showIntakeSheet);
  /** The lounge's OWN modals and gates — what this screen showed before the
   *  friends feature existed. Kept separate from `overlayOpen` below so the
   *  friends surface can be gated on it without depending on itself. */
  const loungeModalOpen = viewerIndex != null || passcodeSheetOpen || profileOpen || showIntakeSheet;
  const overlayOpen = loungeModalOpen || friendsSheetOpen;
  /**
   * Everything that must finish before a friends sheet may open itself.
   *
   * The lounge's modals and gates, plus the two surfaces that are not in
   * `loungeModalOpen` because nothing else needed them there: the review
   * pop-up, and either download surface. An automatic trigger QUEUES on this
   * rather than being dropped — when the last of them closes this goes false
   * and the sheet the Guest was owed finally appears.
   */
  const friendsBlocked =
    loungeModalOpen || nudge !== null || zipping || singleDownload.sheet.open;
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

  /** The single teardown for My Group's pager. Any view change invalidates the
   *  cursor and the per-item bucket map, so they go together, always. */
  const resetGroupPaging = useCallback(() => {
    setGroupCursor(null);
    setItemBuckets([]);
  }, []);

  function gotoGallery(nextTab: GalleryTab) {
    setTab(nextTab);
    setFolder(ALL);
    setLikedView(false);
    resetGroupPaging();
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
    // Liked is its own result set, so whatever My Group had paged no longer
    // describes what is on screen.
    resetGroupPaging();
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
    resetGroupPaging();
    exitSelect();
    scrollToGridTop();
  };
  const desktopSelectFolder = (f: string) => {
    setFolder(f);
    setLikedView(false);
    exitSelect();
    scrollToGridTop();
  };
  const desktopSetTab = (k: GalleryTab) => {
    setTab(k);
    setFolder(ALL);
    setLikedView(false);
    resetGroupPaging();
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

  /**
   * The cover's one sentence, and what tapping it does. Both covers render this
   * same object — see `lib/welcome-band.ts` for the copy table.
   *
   * `matchCount` is deliberately `mediaIds?.length ?? null`, NOT `?? 0`: null
   * means the face search has not answered yet, and the band says "Finding your
   * photos…" instead of flashing "No matches yet" at a Guest who is in forty of
   * them. `accessibleCount` falls back to the booking's own photo_count for an
   * unlocked Guest, so the number is there on first paint rather than after the
   * All view loads.
   */
  const welcomeBand = resolveWelcomeBand({
    faceSearchOn,
    hasSelfie,
    matchCount: mediaIds?.length ?? null,
    unlocked,
    hasPublicPhotos,
    accessibleCount: allCount ?? (unlocked ? event.photo_count ?? null : null),
    guestName: session.name,
  });

  /** Run whatever the band offers. The covers stay ignorant of tabs, sheets and
   *  the scan flow; this is the only place the mapping lives. */
  const onBandAction = () => {
    switch (welcomeBand.action) {
      case "scan":
        onRescan();
        return;
      case "passcode":
        setPasscodeOpen(true);
        return;
      case "mine":
      case "all":
        gotoGallery(welcomeBand.action);
    }
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
            band={welcomeBand}
            onBandAction={onBandAction}
            onScrollToGrid={() => gridSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            date={date}
          />
          <div ref={mastheadSentinelRef} />

          {/* Find your friends group — below the cover, above the grid's
              controls. `empty:hidden` keeps this from reserving any space
              before the lazily-loaded card arrives (or on a gallery where the
              card has nothing to say). */}
          {friendFinder?.enabled && (
            <div className="mx-auto w-full max-w-[1440px] px-8">
              <div ref={setFriendsSlot} className="max-w-[560px] pt-6 empty:hidden" />
            </div>
          )}

          <StickyControlRow
            rowRef={controlRowRef}
            t={t}
            unlocked={unlocked}
            tab={tab}
            setTab={desktopSetTab}
            showMine={faceSearchOn}
            showGroup={showGroupTab}
            showFolders={effTab !== "group"}
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
            {/* My Group's header — faces, count, waiting pill and Manage. Comes
                from the friends chunk through a slot, so none of its copy or
                logic is in the lounge's own bundle. */}
            {effTab === "group" && <div ref={setGroupHeaderSlot} className="mb-5 empty:hidden" />}
            {showLoading ? (
              <LoadingSkeleton />
            ) : loadError && items.length === 0 ? (
              <ErrorState t={t} onRetry={() => setReloadKey((k) => k + 1)} />
            ) : items.length === 0 ? (
              // My Group's empty state names the people who have not answered
              // yet, so it too comes from the friends chunk through a slot.
              effTab === "group" ? (
                <div ref={setGroupEmptySlot} />
              ) : !likedView && effTab === "mine" ? (
                // A Guest with no selfie has nothing to have failed at — they
                // have not searched yet. Invite the scan instead of reporting
                // a match that was never attempted.
                faceSearchOn && !hasSelfie ? (
                  <ScanPromptState t={t} onRescan={onRescan} onBrowseAll={() => gotoGallery("all")} />
                ) : (
                  <NoMatchState t={t} onRescan={onRescan} onBrowseAll={() => gotoGallery("all")} contactUrl={contactUrl} onContactClick={onContactClick} />
                )
              ) : (
                <EmptyState
                  t={t}
                  likedView={likedView}
                  unlocked={unlocked}
                  tab={effTab}
                  onOpenPrivate={() => setPasscodeOpen(true)}
                  onRescan={faceSearchOn && !hasSelfie ? onRescan : undefined}
                />
              )
            ) : (
              <>
                {/* ONE continuous justified grid over the full flat list — every
                    loaded photo appears exactly once, in API order (folder
                    pills filter server-side, so no client-side partitioning).
                    My Group is the one view that sections it, by how many of
                    the Guest's friends are in each photo. */}
                {effTab === "group" ? (
                  <BucketedGrid
                    t={t}
                    items={displayed}
                    buckets={itemBuckets}
                    labels={groupFeed?.labels ?? []}
                    stickyTop={controlRowH}
                    selectMode={selectMode}
                    isSelected={isSelected}
                    liked={liked}
                    onOpen={(i) => setViewerIndex(i)}
                    onToggleSelect={toggleSel}
                    onToggleLike={toggleLike}
                    onEnterSelectWith={canSelect ? enterSelectWith : undefined}
                    onDownload={canDownload ? downloadOne : undefined}
                  />
                ) : (
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
                )}
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
              band={welcomeBand}
              onBandAction={onBandAction}
              date={date}
            />
            <div className="mx-auto w-full max-w-[460px] px-5 pb-[120px] pt-6">
              {friendFinder?.enabled && <div ref={setFriendsSlot} className="mb-6 empty:hidden" />}
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
              resetGroupPaging();
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
            loading={showLoading}
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
            faceSearchOn={faceSearchOn}
            hasSelfie={hasSelfie}
            showMatchBanner={showMatchBanner}
            matchCount={mediaIds?.length ?? 0}
            onDismissMatchBanner={() => setMatchBannerDismissed(true)}
            showGroup={showGroupTab}
            itemBuckets={itemBuckets}
            groupLabels={groupFeed?.labels ?? []}
            groupHeaderRef={setGroupHeaderSlot}
            groupEmptyRef={setGroupEmptySlot}
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
      {showIntakeSheet && (
        <IntakeSheet
          showName={needsName}
          teams={needsTeam ? intakeTeams : []}
          gate={needsSocialVisit ? gate : null}
          visited={visitedPlatform !== null}
          onVisit={onVisit}
          onSubmit={submitIntake}
        />
      )}

      {/* passcode — the optional "Unlock" action, or (face search off, nothing
          public) the non-dismissible sheet that is this Guest's only way in.
          Never over the intake sheet: the name/team question always comes
          first. The in-gallery access re-check above closes this on its own if
          the Studio grants access while the Guest sits here, because that
          patches `guest_type` and `passcodeRequired` goes false with it. */}
      {passcodeSheetOpen && (
        <PasscodeSheet
          required={passcodeRequired}
          studioName={hasStudio ? event.company_name : undefined}
          contactUrl={contactUrl}
          onContactClick={onContactClick}
          onSignOut={onSignOut}
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
          faceSearchOn={faceSearchOn}
          hasSelfie={hasSelfie}
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
        audience="guest"
        shareUrl={typeof window !== "undefined" ? window.location.href : undefined}
        onSelectFewer={selectAllInView}
      />

      {/* Quality choice for a SINGLE photo. Opens only when this guest is
          entitled to the unwatermarked copy and the photo actually has one —
          otherwise the tile, chip and one-item selection all save straight away
          as they always did. */}
      <QualityChoiceSheet {...singleDownload.sheet} audience="guest" theme={t} />

      {/* toast */}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[150px] z-50 flex justify-center px-5 lg:bottom-8">
          <div className="rounded-full px-4 py-2.5 text-[12.5px] font-bold text-white shadow-lg" style={{ background: SIGNAL.viewer }}>
            {toast}
          </div>
        </div>
      )}

      {/* Find your friends group. Mounted ONCE here rather than inside a shell:
          the mobile Home and Gallery tabs swap their whole subtree, and a sheet
          living in one of them would vanish mid-question. It portals its card
          into whichever slot is currently mounted, and nothing at all is
          rendered — or even fetched — unless the event has the feature on. */}
      {friendFinder?.enabled && (
        <FriendsSurface
          t={t}
          uid={uniqueIdentifier}
          bookingId={bookingId}
          block={friendFinder}
          hasSelfie={hasSelfie}
          guestName={session.name}
          slot={friendsSlot}
          groupHeaderSlot={groupHeaderSlot}
          groupEmptySlot={groupEmptySlot}
          onGroupFeedChange={setGroupFeed}
          onShowGroup={() => (isDesktop ? desktopSetTab("group") : gotoGallery("group"))}
          blocked={friendsBlocked}
          scanJustCompleted={scanJustCompleted}
          onScanTriggerConsumed={onScanTriggerConsumed}
          desktop={isDesktop}
          onOpenChange={setFriendsSheetOpen}
          onBlockChange={onFriendFinderChange}
          onRescan={onRescan}
          onReauth={onReauth}
        />
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
  tab: GalleryTab;
  setTab: (k: GalleryTab) => void;
  /** True once this Guest has a friends group — adds the third segment, the
   *  header slot and the bucketed feed. */
  showGroup: boolean;
  /** Bucket index per item and divider text per bucket, for My Group. */
  itemBuckets: number[];
  groupLabels: string[];
  /** Portal targets for the group header and its empty state, both of which
   *  are rendered by the lazily-loaded friends surface. */
  groupHeaderRef: (el: HTMLDivElement | null) => void;
  groupEmptyRef: (el: HTMLDivElement | null) => void;
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
  /** The event's face search switch — hides the My Photos segment and swaps
   *  the empty states, exactly as on desktop. */
  faceSearchOn: boolean;
  /** This Guest has a validated selfie. */
  hasSelfie: boolean;
  showMatchBanner: boolean;
  matchCount: number;
  onDismissMatchBanner: () => void;
  /** Count shown on the "All" pill. */
  totalForViewAll?: number;
  scrollRef?: React.Ref<HTMLDivElement>;
}) {
  const { t, unlocked, tab, setTab, onOpenPrivate, folders, folderCounts, folder, setFolder, items, loading, loadingMore, hasMore, onLoadMore, likedView, onSelectLiked, selectMode, isSelected, selectionLabel, selectionHint, scopeTotal, selectAll, onSelectAll, onClearSelectAll, liked, canSelect, canDownloadAll, zipping, galleryDone, event, reviewUrl, onReviewClick, contactUrl, onContactClick, onRescan, onBrowseAll, faceSearchOn, hasSelfie, showMatchBanner, matchCount, onDismissMatchBanner, totalForViewAll, scrollRef, showGroup, itemBuckets, groupLabels, groupHeaderRef, groupEmptyRef } = props;

  // Mirrors the parent's `effTab`: with face search off there is no My Photos,
  // whatever `tab` still holds.
  const effTab: GalleryTab = !faceSearchOn ? "all" : tab === "group" && !showGroup ? "mine" : tab;

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
            <UnlockAwareSwitcher t={t} tab={tab} setTab={setTab} showMine={faceSearchOn} showGroup={showGroup} />
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

        {/* Folder pills do not apply to My Group: its feed is grouped by who is
            in each photo, not by folder. */}
        {!likedView && effTab !== "group" && (
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
          {effTab === "group" && <div ref={groupHeaderRef} className="mb-5 empty:hidden" />}
          {loading ? (
            <LoadingSkeleton />
          ) : props.loadError && items.length === 0 ? (
            <ErrorState t={t} onRetry={props.onRetry} />
          ) : items.length === 0 ? (
            effTab === "group" ? (
              <div ref={groupEmptyRef} />
            ) : !likedView && effTab === "mine" ? (
              faceSearchOn && !hasSelfie ? (
                <ScanPromptState t={t} onRescan={onRescan} onBrowseAll={onBrowseAll} />
              ) : (
                <NoMatchState t={t} onRescan={onRescan} onBrowseAll={onBrowseAll} contactUrl={contactUrl} onContactClick={onContactClick} />
              )
            ) : (
              <EmptyState
                t={t}
                likedView={likedView}
                unlocked={unlocked}
                tab={effTab}
                onOpenPrivate={onOpenPrivate}
                onRescan={faceSearchOn && !hasSelfie ? onRescan : undefined}
              />
            )
          ) : (
            <>
              {effTab === "group" ? (
                <BucketedGrid
                  t={t}
                  items={items}
                  buckets={itemBuckets}
                  labels={groupLabels}
                  // The mobile control row sits outside the scroll container,
                  // so a divider pins at the top of the scroller itself.
                  stickyTop={0}
                  selectMode={selectMode}
                  isSelected={isSelected}
                  liked={liked}
                  onOpen={props.onOpen}
                  onToggleSelect={props.onToggleSelect}
                  onToggleLike={props.onToggleLike}
                  onEnterSelectWith={props.onEnterSelectWith}
                  onDownload={props.onDownload}
                />
              ) : (
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
              )}
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

/**
 * My Group's grid: the same `GalleryGrid`, once per bucket, with a divider
 * between the runs.
 *
 * One flat `items` array still backs the whole thing — the lightbox, the
 * selection and the downloads all read it unchanged — and each run simply
 * renders a window into it. `onOpen` is the only thing that needs care: the
 * grid reports an index within the slice it was given, so the run's own start
 * is added back before it reaches the viewer.
 *
 * Not a change to GalleryGrid. It stays a component that renders whatever list
 * it is handed, which is exactly why this could be built on top of it.
 */
function BucketedGrid({
  t,
  items,
  buckets,
  labels,
  stickyTop,
  onOpen,
  ...grid
}: {
  t: Theme;
  items: GuestMediaItem[];
  /** Bucket index per item, parallel to `items`. */
  buckets: number[];
  /** Divider text per bucket index. An empty string means no divider — which
   *  is what a one-member group gets, since there is only ever one bucket. */
  labels: string[];
  /** Where a divider pins: under the desktop control row, or the top of the
   *  mobile scroll container. */
  stickyTop: number;
  onOpen: (index: number) => void;
  selectMode: boolean;
  isSelected: (id: string) => boolean;
  liked: Set<string>;
  onToggleSelect: (i: GuestMediaItem) => void;
  onToggleLike: (i: GuestMediaItem) => void;
  onEnterSelectWith?: (i: GuestMediaItem) => void;
  onDownload?: (i: GuestMediaItem) => void;
}) {
  // Runs of consecutive items from the same bucket. Pages arrive in bucket
  // order, so in practice there is one run per bucket; building it this way
  // rather than assuming that keeps the render honest if a page ever straddles.
  const runs: { bucket: number; start: number; end: number }[] = [];
  for (let i = 0; i < items.length; i++) {
    const bucket = buckets[i] ?? 0;
    const last = runs[runs.length - 1];
    if (last && last.bucket === bucket) last.end = i + 1;
    else runs.push({ bucket, start: i, end: i + 1 });
  }

  return (
    <div className="flex flex-col">
      {runs.map((run) => {
        const label = labels[run.bucket] ?? "";
        return (
          <div key={`${run.bucket}-${run.start}`}>
            {label && (
              <h3
                className="sticky z-20 -mx-1 mb-2 px-1 py-2 text-[12px] font-extrabold uppercase tracking-[0.06em]"
                style={{ top: stickyTop, background: t.bg, color: t.muted }}
              >
                {label}
              </h3>
            )}
            <div className={run.start > 0 ? "mt-1" : ""}>
              <GalleryGrid
                t={t}
                items={items.slice(run.start, run.end)}
                onOpen={(i) => onOpen(run.start + i)}
                {...grid}
              />
            </div>
          </div>
        );
      })}
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
  onRescan,
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
  /** Present only when face search is on and this Guest has no selfie: then the
   *  passcode is not their only way in, and scanning may well be the easier
   *  one. Absent otherwise, and the button isn't rendered. */
  onRescan?: () => void;
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
          {onRescan && (
            <button
              type="button"
              onClick={onRescan}
              className="cursor-pointer rounded-full py-3 text-[13px] font-bold"
              style={{ background: t.sunken, color: t.text, border: `1px solid ${t.border}` }}
            >
              Scan my face
            </button>
          )}
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

/**
 * My Photos, for a Guest who has not scanned — because they skipped it, or
 * because they have not been asked yet.
 *
 * Deliberately NOT `NoMatchState`: that screen apologises for a search that
 * found nothing, which is a confusing thing to read when you never ran one.
 * This one is an invitation, and it offers the gallery as the other way out, so
 * a Guest who does not want to be face-matched is not cornered.
 */
function ScanPromptState({
  t,
  onRescan,
  onBrowseAll,
}: {
  t: Theme;
  onRescan: () => void;
  onBrowseAll: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-8 py-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: t.accentWash, color: t.brand }}>
        <IconScanFace size={24} />
      </span>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-[16px] font-extrabold" style={{ color: t.text }}>Find the photos you&rsquo;re in</h2>
        <p className="max-w-[300px] text-[13px] font-semibold leading-[1.5]" style={{ color: t.muted }}>
          Take a quick selfie and we&rsquo;ll gather every photo you appear in.
        </p>
      </div>
      <div className="mt-1 flex w-full max-w-[280px] flex-col gap-2">
        <button
          type="button"
          onClick={onRescan}
          className="cursor-pointer rounded-full py-3 text-[13px] font-extrabold"
          style={{ background: t.brand, color: t.onBrand }}
        >
          Scan my face
        </button>
        <button
          type="button"
          onClick={onBrowseAll}
          className="cursor-pointer rounded-full py-3 text-[13px] font-bold"
          style={{ background: t.sunken, color: t.text, border: `1px solid ${t.border}` }}
        >
          Browse all photos
        </button>
      </div>
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

