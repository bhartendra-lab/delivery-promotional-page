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
import { buildGroupFeed, type GroupFeed } from "@/lib/friend-finder/feed";
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
import { IconUsers } from "@/components/ui/icons";
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
  groupEmptySlot,
  groupTabActive,
  onGroupFeedChange,
  onGroupStateChange,
  onShowGroup,
  blocked,
  scanJustCompleted,
  onScanTriggerConsumed,
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
   * sheet may open over one, so an auto-trigger waits here rather than being
   * dropped: when this goes false the effect re-runs and the queued sheet opens.
   */
  blocked: boolean;
  /** A scan finished during this visit — the `sheet_after_scan` trigger. */
  scanJustCompleted: boolean;
  onScanTriggerConsumed: () => void;
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
  const [method, setMethod] = useState<FriendConsentMethod>("lounge_card");
  /** One automatic sheet per lounge visit, whichever trigger fires first. */
  const autoOpened = useRef(false);

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
  const groupFeed = useMemo<GroupFeed | null>(() => {
    const payload = directory.payload;
    if (!payload) return null;
    return buildGroupFeed({
      mediaIds: payload.media_ids,
      members: directory.members,
      // The gallery's own endpoint, scoped to one bucket's ids. My People is a
      // subset of My Photos, so `mine` is true and the backend applies exactly
      // the rules it always has.
      fetchPage: async (ids, skip, limit) => {
        const res = await getGuestMedia(uid, bookingId, { mine: true, skip, limit }, ids);
        return res.media ?? [];
      },
    });
  }, [directory.payload, directory.members, uid, bookingId]);

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
      openPeople(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [blocked, openPeople]);

  /* ── the two automatic triggers ───────────────────────────────────────
     Both are for a guest who has not answered the question yet. A guest who
     chose (or who chose and then stopped) has answered it, and re-asking by
     pop-up would be nagging — the card is how they change their mind. */
  const undecided = block.choice === null;

  useEffect(() => {
    if (!undecided) return;
    // A guest who followed a "Review request" link is here to answer somebody,
    // not to be asked a question of our own.
    if (readIntent()) return;
    // Queued, not dropped: this effect re-runs when the gate in front of it
    // closes, and the sheet the Guest was owed opens then.
    if (blocked) return;
    if (!scanJustCompleted && (!hasSelfie || autoOpened.current)) return;

    let cancelled = false;
    (async () => {
      // Deferred, house style — no synchronous setState in an effect body.
      await Promise.resolve();
      if (cancelled) return;
      autoOpened.current = true;
      if (scanJustCompleted) {
        openSheet("sheet_after_scan");
        onScanTriggerConsumed();
      } else {
        openSheet("sheet_lounge_visit");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [undecided, blocked, scanJustCompleted, hasSelfie, onScanTriggerConsumed, openSheet]);


  /** Every message this layer raises. Plain text, or text with one action. */
  const say = useCallback(
    (message: string, action?: { label: string; onSelect: () => void }) =>
      setToast({ message, ...(action ? { action } : {}) }),
    [],
  );

  /** Post a `choose` and fold the answer back into the session block. */
  const sendChoice = useCallback(
    async (choice: FriendChoice) => {
      setBusy(true);
      try {
        const result = await friendFinderAction(uid, {
          action: "choose",
          choice,
          consent_method: method,
        });
        onBlockChange({ choice: result.choice, face_visible: result.face_visible });
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

  /** People this guest has asked who have not answered yet — the "N waiting"
   *  pill, and the names the empty state says it is waiting for. */
  const waitingPeople = useMemo(
    () => (directory.payload?.people ?? []).filter((person) => person.rel === "requested"),
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

  const onCardAction = useCallback(() => {
    switch (cardState.kind) {
      case "no_selfie":
        onRescan();
        return;
      case "undecided":
        openSheet("lounge_card");
        return;
      case "chosen_no_group":
        openPeople();
        return;
      case "has_group":
        openGroup();
    }
  }, [cardState.kind, onRescan, openPeople, openGroup, openSheet]);

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
        createPortal(<ManageControl t={t} desktop={desktop} onOpen={() => openPeople()} />, manageSlot)}

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
            memberCount={directory.members.length}
            waitingNames={waitingPeople.map((person) => person.name)}
            preparing={directory.payload?.state === "preparing"}
            onAddMore={() => openPeople()}
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
            if (ok) openPeople();
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
            setMethod("settings");
            void sendChoice(choice);
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
  onOpen,
}: {
  t: ClientTheme;
  desktop: boolean;
  onOpen: () => void;
}) {
  if (desktop) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-[38px] cursor-pointer items-center gap-2 rounded-full px-4 text-[13px] font-extrabold"
        style={{ background: t.sunken, color: t.text, border: `1px solid ${t.border}` }}
      >
        <IconUsers size={15} />
        Manage my people
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-[44px] w-full cursor-pointer items-center gap-2.5 px-4 text-left text-[13.5px] font-bold"
      style={{ color: t.text }}
    >
      <IconUsers size={16} />
      Manage my people
    </button>
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
