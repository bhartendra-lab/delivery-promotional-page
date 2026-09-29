"use client";

/**
 * The one entry point for "Find my people" inside the lounge.
 *
 * LoungeGallery pulls this in through `next/dynamic`, so every byte of the
 * feature — the sheets, the card, the copy, the API and storage modules — lands
 * in a chunk that is only fetched on galleries where `friend_finder.enabled` is
 * true. The lounge's own initial JavaScript gains a dynamic import and a
 * conditional render, and nothing else.
 *
 * It is mounted ONCE, at the lounge root next to the other overlays, and
 * portals its card into a slot the shells provide. That placement is deliberate:
 * mounting it inside the mobile Home column instead would unmount the whole
 * feature — sheet included — the moment the guest switched to the Gallery tab.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ApiError } from "@/lib/api";
import { getGuestMedia, GuestAuthError } from "@/lib/guest-api";
import { getGuestToken, decodeGuestToken } from "@/lib/guest-auth";
import type { ClientTheme } from "@/lib/client-theme";
import { friendFinderAction } from "@/lib/friend-finder/api";
import { buildGroupFeed, rankFeedIds, type GroupFeed } from "@/lib/friend-finder/feed";
import { ACTION_FAILED_TOAST } from "@/lib/friend-finder/copy";
import {
  clearIntent,
  invalidatePeopleCache,
  readIntent,
  setIntent,
} from "@/lib/friend-finder/storage";
import type {
  FriendAvatarCandidate,
  FriendChoice,
  FriendConsentMethod,
  FriendFinderBlock,
  FriendPerson,
} from "@/lib/friend-finder/types";
import { SIGNAL } from "@/lib/client-theme";
import { IconUsers } from "@/components/ui/icons";
import { FaceFilterBar } from "./FaceFilterBar";
import { FriendsCard, type FriendsCardState } from "./FriendsCard";
import { FriendsSheet } from "./FriendsSheet";
import { FriendsToast, type FriendsToastState } from "./FriendsToast";
import { PeopleScreen } from "./PeopleScreen";
import { ChangePhotoSheet } from "./ChangePhotoSheet";
import { FriendsSettingsSheet } from "./FriendsSettingsSheet";
import { GroupEmpty } from "./GroupEmpty";
import { useFriendsDirectory } from "./useFriendsDirectory";

export function FriendsSurface({
  t,
  uid,
  bookingId,
  block,
  hasSelfie,
  guestName,
  desktop,
  slot,
  manageSlot,
  requestsBannerSlot,
  faceFilterSlot,
  groupEmptySlot,
  groupTabActive,
  onGroupFeedChange,
  onGroupStateChange,
  onShowGroup,
  blocked,
  onOpenChange,
  onBlockChange,
  onRescan,
  onReauth,
}: {
  t: ClientTheme;
  uid: string;
  bookingId: string;
  /** The session block. The caller has already checked `enabled`. */
  block: FriendFinderBlock;
  hasSelfie: boolean;
  guestName?: string;
  /** The lounge's own `lg` breakpoint, passed down rather than re-measured so
   *  both shells and these surfaces always agree on which they are. */
  desktop: boolean;
  /** Where the card renders. Null while the shell showing it is unmounted —
   *  the mobile Gallery tab, for instance — and then no card renders at all. */
  slot: HTMLElement | null;
  /**
   * Where the "Manage my people" control renders — the phone's overflow menu,
   * or the top of the My People tab on a laptop. The shells decide where; this
   * decides what it says and does, so none of its copy leaves this chunk.
   */
  manageSlot: HTMLElement | null;
  /** Where the pending-requests banner renders: under the tabs, above the
   *  photos. Null unless the My People tab is showing with requests waiting. */
  requestsBannerSlot: HTMLElement | null;
  /** Where the face filter bar renders: directly under the tabs row, above
   *  the requests banner. Null unless the My People tab is showing. */
  faceFilterSlot: HTMLElement | null;
  /** Where My People's empty state renders. Null unless that tab is showing. */
  groupEmptySlot: HTMLElement | null;
  /**
   * The guest is LOOKING at My People.
   *
   * Load-bearing, not a hint. The directory used to be fetched only while the
   * people screen was open, so a guest who went straight to this tab depended
   * entirely on a cached payload — and the cache is invalidated by the event's
   * `rev`, which moves every time ANY guest at the wedding scans or adds
   * somebody. Miss it and `groupFeed` stayed null, which the gallery renders as
   * a skeleton with nothing behind it, for ever. That was the indefinite
   * shimmer; this is the fix.
   */
  groupTabActive: boolean;
  /** Hands the gallery the pager for My People. The gallery pages it with the
   *  same machinery it uses for every other tab and knows nothing about how a
   *  bucket is worked out. */
  onGroupFeedChange: (feed: GroupFeed | null) => void;
  /**
   * How the directory is getting on, so the gallery can tell "still loading"
   * apart from "loaded and failed". Without it a failed load is
   * indistinguishable from a slow one and the tab waits for ever.
   */
  onGroupStateChange: (state: "loading" | "ready" | "error") => void;
  /** Switch the gallery to My People. */
  onShowGroup: () => void;
  /**
   * Another lounge modal or gate is open (or its pop-up is pending). No friends
   * sheet may open over one, so the tab's first-visit sheet and the approval
   * link's intent wait here rather than being dropped: when this goes false
   * the effect re-runs and the queued sheet opens.
   */
  blocked: boolean;
  /** Lets the lounge treat an open friends sheet as an overlay of its own. */
  onOpenChange: (open: boolean) => void;
  onBlockChange: (patch: Partial<FriendFinderBlock>) => void;
  /** The existing face-scan flow, for a guest with no selfie. */
  onRescan: () => void;
  /** The token expired mid-action — the same re-auth path every other guest
   *  call in this gallery takes, rather than a toast the Guest cannot act on. */
  onReauth: () => void;
}) {
  /** This guest's own id, for the cache key. It is in the token they are
   *  already using for every call on this screen. */
  const guestId = useMemo(() => {
    const token = getGuestToken(uid);
    return token ? (decodeGuestToken(token)?.id ?? null) : null;
  }, [uid]);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  /** The people screen was opened by a request link, so it should land on the
   *  "Wants to add you" section rather than the top of the list. */
  const [focusRequests, setFocusRequests] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  /**
   * The mute toggle WHILE a write is in flight, and null the rest of the time.
   *
   * The setting itself lives on the session block, so there is no second copy
   * of it here to drift: this exists only so the switch moves the instant it is
   * tapped instead of waiting for a round trip, and is dropped again the moment
   * the block carries the answer.
   */
  const [toast, setToast] = useState<FriendsToastState>(null);
  const [busy, setBusy] = useState(false);
  /** Which trigger opened the sheet — it travels with the consent row, because
   *  "they agreed" is a weaker record than "they agreed HERE". */
  const [method, setMethod] = useState<FriendConsentMethod>("people_tab");
  /** Where Continue on the preference sheet leads: Manage my people, landing
   *  on "Wants to add you" when the sheet stood in front of an approval link. */
  const afterChoice = useRef<"people" | "requests">("people");
  /** The tab's first-visit sheet opens once per lounge visit. Dismissing it
   *  records nothing, and the tab's empty state is how it is reopened. */
  const tabSheetShown = useRef(false);
  /**
   * The face filter's selection: guest ids of the connected members being
   * looked at. Empty means everyone.
   *
   * Held here, where the feed is built, and at this level because this
   * surface is mounted once for the whole lounge visit — so the selection
   * survives switching tabs and back, and is dropped on reload. Never
   * persisted, and never sent anywhere.
   */
  const [filterIds, setFilterIds] = useState<ReadonlySet<string>>(() => new Set());

  /**
   * The directory lives HERE, not inside the people screen.
   *
   * The screen is mounted only while it is open, but the lounge card behind it
   * renders the group's faces from the same payload — so a hook that unmounted
   * with the screen would blank the card every time it was closed. Kept at this
   * level, the payload is seeded from a valid cache at mount, refreshed
   * whenever the screen opens, and updated in place by every action.
   */
  const directory = useFriendsDirectory({
    uid,
    bookingId,
    guestId,
    rev: block.rev,
    groupUpdatedAt: block.group_updated_at ?? 0,
    // Either surface that renders from this payload keeps it live. See
    // `groupTabActive` above for why the tab has to be one of them.
    active: peopleOpen || groupTabActive,
    onReauth,
  });

  /**
   * Open and close go through these rather than through an effect watching
   * `sheetOpen`: the lounge has to know an overlay is up, and telling it as
   * part of the same action avoids a second render pass just to announce what
   * already happened.
   */
  const openSheet = useCallback(
    (via: FriendConsentMethod) => {
      setMethod(via);
      setSheetOpen(true);
      onOpenChange(true);
    },
    [onOpenChange],
  );
  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    onOpenChange(false);
  }, [onOpenChange]);

  const closePeople = useCallback(() => {
    setPeopleOpen(false);
    setFocusRequests(false);
    onOpenChange(false);
  }, [onOpenChange]);

  /**
   * Open the people screen. The consent sheet hands straight over to it after
   * Continue, the card opens it directly, and the approval link arrives here
   * with `atRequests` set so it lands on the section the guest came for.
   *
   * It closes the consent sheet on the way rather than stacking on top of it:
   * the question has been answered, and leaving it underneath would put the
   * guest back on it when they close the list.
   */
  const openPeople = useCallback(
    (atRequests = false) => {
      setSheetOpen(false);
      setFocusRequests(atRequests);
      setPeopleOpen(true);
      onOpenChange(true);
    },
    [onOpenChange],
  );
  /** Switch the gallery to My People, closing whatever friends surface is up —
   *  the guest asked to look at photos, not to keep reading a list. */
  const openGroup = useCallback(() => {
    setSheetOpen(false);
    setPeopleOpen(false);
    onOpenChange(false);
    onShowGroup();
  }, [onOpenChange, onShowGroup]);

  /**
   * My People's pager.
   *
   * Rebuilt whenever the payload changes, which includes every optimistic row
   * patch the people screen makes. That is deliberately fine: the feed carries
   * a `key` that is a signature of its CONTENTS, and the gallery keys its
   * loader on that rather than on this object — so a rebuild that produces the
   * same group never reloads the grid under the guest's finger.
   */
  /** The selection, minus anyone who has since left the group — a selected
   *  member who is removed simply drops out, rather than pinning the feed to
   *  someone the guest can no longer look at. */
  const activeFilter = useMemo(() => {
    const present = new Set(directory.members.map((m) => m.guest_id));
    return new Set([...filterIds].filter((id) => present.has(id)));
  }, [filterIds, directory.members]);
  const lookedAt = useMemo(
    () => (activeFilter.size > 0 ? directory.members.filter((m) => activeFilter.has(m.guest_id)) : directory.members),
    [activeFilter, directory.members],
  );

  const groupFeed = useMemo<GroupFeed | null>(() => {
    const payload = directory.payload;
    if (!payload) return null;
    /* The face filter is a SUBSET of data already on this device, run back
     * through the same builder: no endpoint, no request per tap, nothing the
     * guest could not already see. Do not add a server call for it. */
    return buildGroupFeed({
      mediaIds: payload.media_ids,
      likeCounts: payload.like_counts,
      members: lookedAt,
      filtered: activeFilter.size > 0,
      // The gallery's own endpoint, asked for one slice of the ranked ids.
      // My People is a subset of My Photos, so `mine` is true and the backend
      // applies exactly the rules it always has. `get-media` answers in its
      // own order; the feed puts each page back in ranked order.
      fetchPage: async (ids) => {
        const res = await getGuestMedia(uid, bookingId, { mine: true, skip: 0, limit: ids.length }, ids);
        return res.media ?? [];
      },
    });
  }, [directory.payload, lookedAt, activeFilter, uid, bookingId]);

  /** Photos with ALL connected members, whatever the filter says — the bar
   *  shows only while this is above zero. */
  const unfilteredTotal = useMemo(
    () =>
      directory.payload
        ? rankFeedIds({ mediaIds: directory.payload.media_ids, members: directory.members }).length
        : 0,
    [directory.payload, directory.members],
  );
  const toggleFilter = useCallback((guestId: string) => {
    setFilterIds((prev) => {
      const next = new Set(prev);
      if (next.has(guestId)) next.delete(guestId);
      else next.add(guestId);
      return next;
    });
  }, []);
  const clearFilter = useCallback(() => setFilterIds(new Set()), []);

  useEffect(() => {
    onGroupFeedChange(groupFeed);
  }, [groupFeed, onGroupFeedChange]);

  /* "loading" until there is something to render, then ready — or error, which
   * is the state the gallery needs in order to stop waiting. A failed
   * REVALIDATION with a payload still in hand is `ready`: the list on screen is
   * seconds stale, not wrong. */
  useEffect(() => {
    onGroupStateChange(
      groupFeed ? "ready" : directory.status === "error" ? "error" : "loading",
    );
  }, [groupFeed, directory.status, onGroupStateChange]);
  // Take the feed away when this surface goes, so the gallery cannot page a
  // feature that is no longer mounted.
  const onGroupFeedChangeRef = useRef(onGroupFeedChange);
  useEffect(() => {
    onGroupFeedChangeRef.current = onGroupFeedChange;
  });
  useEffect(() => () => onGroupFeedChangeRef.current(null), []);

  // The one case the pair above cannot cover: this surface unmounting with a
  // sheet still open (the studio switches the feature off mid-visit). Without
  // this the lounge would go on believing an overlay it can no longer see is
  // covering the gallery.
  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  });
  useEffect(() => () => onOpenChangeRef.current(false), []);

  /**
   * The approval link's remembered intent.
   *
   * Gated on `blocked` exactly like the consent sheet, which is the rule that
   * matters most here: following a "Review request" button must not let a guest
   * past the studio's required-visit gate, the passcode, or the name question.
   * The intent simply waits — it lives in `sessionStorage`, so it survives the
   * sign-in round trip and every gate in front of it.
   *
   * Cleared the moment the screen is SHOWN, not when it is read, so a guest who
   * is still working through a gate does not lose their place.
   */
  const undecided = block.choice === null;

  /** Ask the preference, then carry on to Manage my people — to its requests
   *  section when that is what the guest came for. */
  const askThenManage = useCallback(
    (then: "people" | "requests", via: FriendConsentMethod = "people_tab") => {
      afterChoice.current = then;
      openSheet(via);
    },
    [openSheet],
  );

  const intentHandled = useRef(false);
  useEffect(() => {
    if (intentHandled.current || blocked) return;
    if (readIntent() !== "requests") return;
    let cancelled = false;
    (async () => {
      await Promise.resolve(); // defer — no synchronous setState in an effect body
      if (cancelled) return;
      intentHandled.current = true;
      clearIntent();
      // An undecided guest answers the preference first — there is no answer
      // to a request without it — and Continue then lands on the requests.
      if (undecided) askThenManage("requests");
      else openPeople(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [blocked, openPeople, undecided, askThenManage]);

  /* ── the one automatic trigger: the My People tab's first visit ────────
   *
   * The preference is asked in exactly ONE place now. It used to open by
   * itself after the selfie and again on a lounge visit; both are gone, and
   * the lounge card sends an undecided guest to this tab rather than to the
   * sheet. So: the first time an undecided guest with a selfie is LOOKING at
   * My People, the sheet opens; Continue records the choice and opens Manage.
   * Dismissing records nothing, and the tab's empty state reopens it.
   *
   * Without a selfie the tab shows the scan prompt instead, and the preference
   * waits for the next visit after the selfie. A guest who followed an
   * approval link is handled by the intent above, not here. */
  useEffect(() => {
    if (!groupTabActive || !undecided || !hasSelfie || blocked || tabSheetShown.current) return;
    if (readIntent()) return;
    let cancelled = false;
    (async () => {
      // Deferred, house style — no synchronous setState in an effect body.
      await Promise.resolve();
      if (cancelled) return;
      tabSheetShown.current = true;
      askThenManage("people");
    })();
    return () => {
      cancelled = true;
    };
  }, [groupTabActive, undecided, hasSelfie, blocked, askThenManage]);


  /** Every message this layer raises. Plain text, or text with one action. */
  const say = useCallback(
    (message: string, action?: { label: string; onSelect: () => void }) =>
      setToast({ message, ...(action ? { action } : {}) }),
    [],
  );

  /** Post a `choose` and fold the answer back into the session block.
   *  `via` names where the answer was given when that is not the sheet's own
   *  `method` — the settings sheet passes "settings" here directly, because a
   *  `setMethod` in the same tick would not reach this closure and the row
   *  would record wherever the sheet was last opened from. */
  const sendChoice = useCallback(
    async (choice: FriendChoice, via?: FriendConsentMethod) => {
      setBusy(true);
      try {
        const result = await friendFinderAction(uid, {
          action: "choose",
          choice,
          consent_method: via ?? method,
        });
        // "Everyone" accepts the requests already waiting (see the backend's
        // chooseFriendsConsent), and says so in its answer, so the badge clears
        // and the card moves on without a refetch. Each field is folded in only
        // when the answer carries it: "selected" leaves the count alone, and a
        // backend that predates the auto-accept sends neither.
        onBlockChange({
          choice: result.choice,
          face_visible: result.face_visible,
          ...(typeof result.pending_count === "number" ? { pending_count: result.pending_count } : {}),
          ...(result.has_group === true ? { has_group: true } : {}),
        });
        // `rev` has moved for everyone at this event, so whatever is cached no
        // longer describes it. The payload is kept; only its token is poisoned,
        // so the next open revalidates instead of short-circuiting.
        if (guestId) invalidatePeopleCache(bookingId, guestId);
        closeSheet();
        return true;
      } catch (err) {
        if (err instanceof GuestAuthError) {
          onReauth();
          return false;
        }
        say(
          err instanceof ApiError && err.status === 403
            ? "Find my people isn't available for this gallery."
            : ACTION_FAILED_TOAST,
        );
        return false;
      } finally {
        setBusy(false);
      }
    },
    [uid, method, onBlockChange, say, bookingId, guestId, closeSheet, onReauth],
  );

  /** Everyone this guest has put in their group, answered or not: connected,
   *  still asked, or turned down. Zero is My People's "nobody added" state. */
  const addedCount = useMemo(
    () =>
      (directory.payload?.people ?? []).filter(
        (person) => person.rel === "in_group" || person.rel === "requested" || person.rel === "declined",
      ).length,
    [directory.payload],
  );

  const openSettings = useCallback(() => setSettingsOpen(true), []);
  /* Closing settings does NOT tell the lounge the overlay is gone: the people
   * screen this opened from is still up underneath, and reporting `false` here
   * would let the lounge's auto-triggers fire over it. `closePeople` is what
   * ends the overlay. */
  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    setPhotoOpen(false);
  }, []);

  /**
   * One wrapper for the settings actions that are not `choose`.
   *
   * They share the same three concerns: lock the sheet while the request is in
   * flight, report a failure in words the guest can act on, and send an expired
   * token down the same re-auth path as every other call in this gallery.
   */
  const runSetting = useCallback(
    async <T,>(work: () => Promise<T>): Promise<T | null> => {
      setBusy(true);
      try {
        return await work();
      } catch (err) {
        if (err instanceof GuestAuthError) {
          onReauth();
          return null;
        }
        say(ACTION_FAILED_TOAST);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [onReauth, say],
  );

  const setAvatar = useCallback(
    (avatar: "auto" | { media_id: string; face_index: number }) => {
      void runSetting(async () => {
        const result = await friendFinderAction(uid, { action: "profile", avatar });
        if (guestId) invalidatePeopleCache(bookingId, guestId);
        setPhotoOpen(false);
        // The crop is cut server-side after the response, so the new picture is
        // not ready the moment this returns. Said plainly rather than leaving
        // the guest staring at the old one wondering if the tap registered.
        say(result.avatar_pending ? "Updating your picture…" : "Picture updated");
        return result;
      });
    },
    [uid, bookingId, guestId, runSetting, say],
  );

  const candidates: FriendAvatarCandidate[] = directory.payload?.me.avatar_candidates ?? [];

  const cardState = resolveCardState({ block, hasSelfie, members: directory.members });

  /* The card no longer opens the preference sheet itself: undecided and
   * chosen-but-nobody-yet both go to the My People tab, whose first visit asks
   * the preference (undecided) or shows the "add some people" state. The
   * question is asked in exactly one place. */
  const onCardAction = useCallback(() => {
    switch (cardState.kind) {
      case "no_selfie":
        onRescan();
        return;
      case "undecided":
      case "chosen_no_group":
      case "has_group":
        openGroup();
    }
  }, [cardState.kind, onRescan, openGroup]);

  /** "Add more people" on the empty tab: while the preference is still
   *  unanswered it is asked first, then Manage opens. */
  const onAddMore = useCallback(() => {
    if (undecided) askThenManage("people");
    else openPeople();
  }, [undecided, askThenManage, openPeople]);

  return (
    <>
      {slot &&
        createPortal(
          <FriendsCard t={t} state={cardState} pendingCount={block.pending_count} onAction={onCardAction} />,
          slot,
        )}

      {/* My People's own furniture, portalled into the gallery's slots. Each
          exists only while its slot does, so none needs a guard of its own.

          The old "Your group" header — the face strip with Manage and a gear
          beside it — is gone. It sat above the photos repeating what the tab
          already said, and on a phone it pushed the first row of the grid off
          screen. What it actually offered is here instead: Manage in the
          overflow menu (or on the tab, on a laptop), and the gear inside the
          screen it opens. */}
      {manageSlot &&
        createPortal(
          <ManageControl t={t} desktop={desktop} pendingCount={block.pending_count} onOpen={() => openPeople()} />,
          manageSlot,
        )}

      {/* Only with photos to narrow (the UNFILTERED feed is not empty) and at
          least two connected people — with one, it would filter nothing. */}
      {faceFilterSlot &&
        unfilteredTotal > 0 &&
        directory.members.length >= 2 &&
        createPortal(
          <FaceFilterBar
            t={t}
            members={directory.members}
            selected={activeFilter}
            onToggle={toggleFilter}
            onClear={clearFilter}
            desktop={desktop}
          />,
          faceFilterSlot,
        )}

      {requestsBannerSlot &&
        block.pending_count > 0 &&
        createPortal(
          <RequestsBanner t={t} count={block.pending_count} onOpen={() => openPeople(true)} />,
          requestsBannerSlot,
        )}

      {groupEmptySlot &&
        createPortal(
          <GroupEmpty
            t={t}
            addedCount={addedCount}
            preparing={directory.payload?.state === "preparing"}
            needsSelfie={!hasSelfie}
            onAddMore={onAddMore}
            onScan={onRescan}
          />,
          groupEmptySlot,
        )}

      {peopleOpen && (
      <PeopleScreen
        t={t}
        open
        uid={uid}
        block={block}
        hasSelfie={hasSelfie}
        desktop={desktop}
        directory={directory}
        focusRequests={focusRequests}
        onClose={closePeople}
        onBlockChange={onBlockChange}
        onToast={say}
        onFirstGroup={(message) =>
          say(message, { label: "View My People", onSelect: () => { closePeople(); openGroup(); } })
        }
        onOpenSettings={openSettings}
        onNeedSelfie={() => {
          // Leave the note that brings them back to this screen, then hand off
          // to the existing face-scan flow. The scan unmounts the whole lounge,
          // so an in-memory "reopen me" flag would not survive it — and this is
          // the same mechanism the request link already uses, rather than a
          // second one that does the same job.
          setIntent("requests");
          closePeople();
          onRescan();
        }}
      />
      )}

      <FriendsSheet
        t={t}
        open={sheetOpen}
        busy={busy}
        // Dismissing records NOTHING — no choice, no consent row, and the sheet
        // is free to come back on the guest's next visit.
        onClose={closeSheet}
        onChoose={(choice) => {
          void sendChoice(choice).then((ok) => {
            if (ok) openPeople(afterChoice.current === "requests");
          });
        }}
      />

      {settingsOpen && (
        <FriendsSettingsSheet
          t={t}
          open
          block={block}
          busy={busy}
          onClose={closeSettings}
          // From Settings the consent method is "settings", which is what the
          // audit row records — a choice changed here is a different event from
          // the same choice made in the sheet after a scan.
          onChoose={(choice) => {
            void sendChoice(choice, "settings");
          }}
          onChangePhoto={() => setPhotoOpen(true)}
        />
      )}

      {photoOpen && guestId && (
        <ChangePhotoSheet
          t={t}
          open
          uid={uid}
          bookingId={bookingId}
          guestId={guestId}
          name={guestName ?? ""}
          currentUrl={block.avatar_url}
          currentSource={directory.payload?.me.avatar_source ?? null}
          candidates={candidates}
          busy={busy}
          onClose={() => setPhotoOpen(false)}
          onPick={(candidate) =>
            setAvatar({ media_id: candidate.media_id, face_index: candidate.face_index })
          }
          onUseAutomatic={() => setAvatar("auto")}
          onReauth={onReauth}
        />
      )}

      <FriendsToast t={t} toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}

/**
 * "Manage my people" — one control, two shapes.
 *
 * On a phone it is a row in the gallery's overflow menu, so it reads as a menu
 * item: full width, left-aligned, with an icon. On a laptop it sits at the top
 * of the My People tab and has to earn its space, so it is a compact pill
 * rather than the full-width card the old header was.
 */
function ManageControl({
  t,
  desktop,
  pendingCount,
  onOpen,
}: {
  t: ClientTheme;
  desktop: boolean;
  /** People waiting on this guest. Above zero, the badge at the end of the
   *  control — the same one the phone's menu button and the laptop's tab
   *  carry, so the count leads here. */
  pendingCount: number;
  onOpen: () => void;
}) {
  const badge = pendingCount > 0 && <CountBadge count={pendingCount} />;
  const label =
    pendingCount > 0 ? `Manage my people, ${pendingCount} ${pendingCount === 1 ? "request" : "requests"} waiting` : undefined;
  if (desktop) {
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-label={label}
        className="flex min-h-[38px] cursor-pointer items-center gap-2 rounded-full px-4 text-[13px] font-extrabold"
        style={{ background: t.sunken, color: t.text, border: `1px solid ${t.border}` }}
      >
        <IconUsers size={15} />
        Manage my people
        {badge}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      className="flex min-h-[44px] w-full cursor-pointer items-center gap-2.5 px-4 text-left text-[13.5px] font-bold"
      style={{ color: t.text }}
    >
      <IconUsers size={16} />
      <span className="min-w-0 flex-1">Manage my people</span>
      {badge}
    </button>
  );
}

/** The red request count, in the same shape and signal colour wherever it
 *  appears (the gallery's menu button and My People tab draw their own copy,
 *  outside this chunk). "9+" past nine. */
function CountBadge({ count }: { count: number }) {
  return (
    <span
      aria-hidden
      className="flex h-[17px] min-w-[17px] shrink-0 items-center justify-center rounded-full px-[4px] text-[10px] font-extrabold leading-none tabular-nums"
      style={{ background: SIGNAL.liked, color: "#fff" }}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

/**
 * The slim banner under the tabs: N people are waiting on an answer.
 *
 * Deliberately driven by `pending_count` off the session block rather than by
 * the directory payload, so it appears the instant the tab is opened — before
 * the people list has been fetched, and whether or not that fetch succeeds.
 */
function RequestsBanner({ t, count, onOpen }: { t: ClientTheme; count: number; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-[44px] w-full cursor-pointer items-center gap-2.5 rounded-2xl px-3.5 py-2 text-left"
      style={{ background: t.accentWash, border: `1px solid ${t.brand}` }}
    >
      <span
        className="flex h-[22px] min-w-[22px] shrink-0 items-center justify-center rounded-full px-1 text-[11px] font-extrabold tabular-nums"
        style={{ background: t.brand, color: t.onBrand }}
        aria-hidden
      >
        {count > 9 ? "9+" : count}
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] font-extrabold" style={{ color: t.brand }}>
        {count === 1 ? "1 person wants to add you" : `${count} people want to add you`}
      </span>
      <span className="shrink-0 text-[12.5px] font-extrabold" style={{ color: t.brand }}>
        View
      </span>
    </button>
  );
}

/** Which of the four card states applies. */
function resolveCardState({
  block,
  hasSelfie,
  members,
}: {
  block: FriendFinderBlock;
  hasSelfie: boolean;
  members: FriendPerson[] | null;
}): FriendsCardState {
  if (!hasSelfie) return { kind: "no_selfie" };
  if (block.choice === null) return { kind: "undecided" };
  if (block.has_group) {
    return { kind: "has_group", members: members ?? [], count: members?.length ?? null };
  }
  return { kind: "chosen_no_group" };
}
