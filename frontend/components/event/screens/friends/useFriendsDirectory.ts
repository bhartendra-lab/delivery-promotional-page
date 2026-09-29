"use client";

/**
 * The people payload: loading it, caching it, and changing it.
 *
 * One hook owns all three because they are the same problem. Every action
 * mutates a row the cache is holding, so an action that wrote through a
 * different path would leave the cache describing an event that no longer
 * exists.
 *
 * The caching rule, from the design: the payload is valid only while BOTH
 * `rev` and `group_updated_at` still match the session block. `rev` moves when
 * anything about other guests changes; `group_updated_at` when this guest's own
 * group does. Neither alone covers both, so a mismatch on either is a miss.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { GuestAuthError } from "@/lib/guest-api";
import { friendFinderAction, getFriendFinderPeople } from "@/lib/friend-finder/api";
import {
  invalidatePeopleCache,
  readPeopleCache,
  writePeopleCache,
} from "@/lib/friend-finder/storage";
import {
  isUnchanged,
  type FriendFinderPeople,
  type FriendPerson,
  type FriendRel,
} from "@/lib/friend-finder/types";

export type DirectoryStatus = "idle" | "loading" | "ready" | "error";

/**
 * What a row becomes the instant it is tapped, before the server answers.
 *
 * Every one of these is derivable from what the row already told us, which is
 * why the update can be optimistic at all:
 *   open      → they already allow me, so adding connects us: in_group.
 *   ask       → they do not, so adding sends a request: requested.
 *   added_you → they named me; adding back connects us: in_group.
 *   declined  → they said no; asking again reopens it: requested.
 *   in_group  → removing drops my side; theirs stands, so they are open to me.
 *   requested → cancelling drops my side; they never allowed me: ask.
 *   declined  → removing drops my side; they refused me: ask.
 * The server's own `rel` is applied on top when it answers, so a wrong guess
 * corrects itself rather than sticking.
 */
function optimisticRel(current: FriendRel, action: "add" | "remove" | "decline"): FriendRel {
  const pendingOnThem = current === "ask" || current === "declined";
  if (action === "add") return pendingOnThem ? "requested" : "in_group";
  if (action === "remove") return current === "requested" || current === "declined" ? "ask" : "open";
  // decline: they still allow me, I simply have not answered with a yes.
  return "open";
}

/** How long to wait before the single `preparing` retry. Long enough for the
 *  store that follows a guest's own search, short enough not to be a wait. */
const PREPARING_RETRY_MS = 2500;

export function useFriendsDirectory({
  uid,
  bookingId,
  guestId,
  /** From the session block — the tokens the cache is checked against. */
  rev,
  groupUpdatedAt,
  /**
   * Load (and revalidate) while ANY surface that renders from this payload is
   * showing — the people screen, or the My People tab.
   *
   * It used to be the people screen alone, which is what produced an
   * indefinite skeleton on that tab: the payload came only from a cache that
   * the event's `rev` invalidates on every guest's scan or add, and nothing
   * ever fetched a replacement for a guest who had not opened the list.
   */
  active,
  onReauth,
}: {
  uid: string;
  bookingId: string;
  guestId: string | null;
  rev: number;
  groupUpdatedAt: number;
  active: boolean;
  onReauth: () => void;
}) {
  /**
   * Seeded from a VALID cache at mount, before anything is fetched and whether
   * or not the screen is open.
   *
   * That seed is what lets the lounge card show its group avatars with no
   * request at all. It also survives an action poisoning the cache: after an
   * add, the stored entry's `rev` is deliberately wrong so the next open
   * revalidates, but this in-memory copy is the freshest thing anyone has and
   * the card should go on using it. "In memory AND in localStorage" is the
   * design, and these are the two halves of it.
   */
  const [payload, setPayload] = useState<FriendFinderPeople | null>(() => {
    if (!guestId) return null;
    const cached = readPeopleCache(bookingId, guestId);
    if (!cached || cached.rev !== rev || cached.group_updated_at !== groupUpdatedAt) return null;
    return cached.payload;
  });
  const [status, setStatus] = useState<DirectoryStatus>("idle");
  /** Group members, for the lounge card. Derived here so the card and the
   *  people screen can never disagree about who is in the group. */
  const members = useMemo(
    () => (payload?.people ?? []).filter((person) => person.rel === "in_group"),
    [payload],
  );
  /** Rows with a request in flight — their button shows as busy and cannot be
   *  tapped again, which is what stops a double tap sending two `add`s. */
  const [pending, setPending] = useState<Set<string>>(new Set());

  // `active` flipping true is what triggers a load; the payload itself must not
  // be a dependency of that effect or applying a result would re-run it.
  const payloadRef = useRef<FriendFinderPeople | null>(null);
  const activeRef = useRef(active);
  useEffect(() => {
    payloadRef.current = payload;
    activeRef.current = active;
  });

  /**
   * Fresh like counts that arrived while a surface was on screen, held back
   * until the Guest leaves it.
   *
   * The counts decide My People's order, and they arrive a moment AFTER the
   * cached payload has painted the grid, so applying them at once reordered
   * (and reloaded) the grid right under a Guest who had only just opened it.
   * They are written to the cache immediately and applied here when the
   * surface closes, so the next open paints in the new order from the start.
   * Kept with the ids they line up with, and applied only if those still match.
   */
  const pendingCounts = useRef<{ mediaIds: string[]; counts: number[] } | null>(null);
  useEffect(() => {
    if (active || !pendingCounts.current) return;
    let cancelled = false;
    (async () => {
      await Promise.resolve(); // defer — no synchronous setState in an effect body
      if (cancelled) return;
      const held = pendingCounts.current;
      pendingCounts.current = null;
      if (!held) return;
      setPayload((prev) =>
        prev &&
        prev.media_ids.length === held.mediaIds.length &&
        prev.media_ids.every((id, i) => id === held.mediaIds[i])
          ? { ...prev, like_counts: held.counts }
          : prev,
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [active]);

  const load = useCallback(async () => {
    // A cache hit paints first and then revalidates behind the guest's eyes;
    // a miss shows the skeleton. Either way the request is made, because the
    // studio keeps uploading and other guests keep answering.
    const cached = guestId ? readPeopleCache(bookingId, guestId) : null;
    const fresh = cached && cached.rev === rev && cached.group_updated_at === groupUpdatedAt;
    if (fresh && cached) {
      setPayload(cached.payload);
      setStatus("ready");
    } else if (!payloadRef.current) {
      setStatus("loading");
    }

    try {
      const res = await getFriendFinderPeople(
        uid,
        // Only ever sent as a pair, and only when there is something for the
        // server to compare against. The backend ignores a lone one.
        fresh && cached ? { ifRev: cached.rev, ifGroup: cached.group_updated_at } : undefined,
      );
      const people = res.friend_finder_people;
      if (!people) {
        // The event switch went off under us, or the aggregation failed and the
        // controller dropped the key. Whatever is cached is the best we have.
        setStatus(payloadRef.current ? "ready" : "error");
        return;
      }
      if (isUnchanged(people)) {
        /* The cache still holds — but its LIKE COUNTS may not. Likes do not
         * move `rev` (a heart must not invalidate every Guest's cache at the
         * wedding), so the short-circuit carries fresh counts keyed by media
         * id, and they are folded into the payload in hand here. Only when
         * something actually moved: an identical array would rebuild the feed
         * for nothing. The new order waits for the Guest to leave the surface
         * (see pendingCounts), so neither the first paint nor a heart tapped
         * on My People is ever reordered under the Guest. */
        const byId = people.like_counts_by_id;
        // The cached payload this request was conditional on, if the render
        // that puts it in the ref has not happened yet.
        const current = payloadRef.current ?? (fresh && cached ? cached.payload : null);
        if (byId && current) {
          const next = current.media_ids.map((id) => byId[id] ?? 0);
          const prev = current.like_counts;
          const moved = !prev || prev.length !== next.length || prev.some((n, i) => n !== next[i]);
          if (moved) {
            const merged = { ...current, like_counts: next };
            if (guestId) writePeopleCache(bookingId, guestId, merged);
            if (activeRef.current) pendingCounts.current = { mediaIds: current.media_ids, counts: next };
            else setPayload(merged);
          }
        }
        setStatus("ready");
        return;
      }
      setPayload(people);
      setStatus("ready");
      if (guestId) writePeopleCache(bookingId, guestId, people);
    } catch (err) {
      if (err instanceof GuestAuthError) {
        onReauth();
        return;
      }
      // A failed revalidation keeps the cached list on screen — it is stale by
      // seconds, not wrong — and only a cold load has nothing to show.
      setStatus(payloadRef.current ? "ready" : "error");
    }
  }, [uid, bookingId, guestId, rev, groupUpdatedAt, onReauth]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      await Promise.resolve(); // defer — no synchronous setState in an effect body
      if (cancelled) return;
      await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [active, load]);

  /**
   * ONE retry when the server says it is still working.
   *
   * `preparing` means this guest has a selfie but no stored matched set yet.
   * `search-selfie` now stores the set BEFORE it answers, so this is only the
   * gallery's own search still in flight when the tab opened (it runs on every
   * visit) or a store that failed. It used to mean "a background sweep will
   * get to you", which could be ten minutes; there is no sweep any more.
   *
   * So a single delayed refetch covers the in-flight case, and the guest sees
   * their photos instead of a message telling them to come back. Not a poll:
   * if the one retry still says `preparing`, something actually failed and
   * their next visit is what fixes it.
   */
  useEffect(() => {
    if (!active || payload?.state !== "preparing") return;
    const id = setTimeout(() => {
      void load();
    }, PREPARING_RETRY_MS);
    return () => clearTimeout(id);
  }, [active, payload?.state, load]);

  /** Patch one row in place, leaving the list's order alone — a row must not
   *  jump out from under the finger that just tapped it. */
  const patchRow = useCallback((personId: string, rel: FriendRel) => {
    setPayload((prev) =>
      prev
        ? { ...prev, people: prev.people.map((p) => (p.guest_id === personId ? { ...p, rel } : p)) }
        : prev,
    );
  }, []);

  /**
   * Run one row action optimistically.
   *
   * Resolves to the server's `rel` on success and null on failure, so the
   * caller can say the right thing — "in your group" reads very differently
   * from "request sent", and only the server knows which happened.
   */
  const act = useCallback(
    async (
      person: FriendPerson,
      action: "add" | "remove" | "decline",
    ): Promise<{ rel: FriendRel; connected: boolean } | null> => {
      const before = person.rel;
      patchRow(person.guest_id, optimisticRel(before, action));
      setPending((prev) => new Set(prev).add(person.guest_id));
      try {
        const result = await friendFinderAction(uid, { action, guest_id: person.guest_id });
        // The server recomputes the relationship from the state as it now
        // stands rather than predicting it, so this is the value to render.
        patchRow(person.guest_id, result.rel);
        // `rev` has moved for everyone at this event. The payload is kept so
        // the card keeps its avatars; only the token is poisoned, so the next
        // open revalidates instead of short-circuiting.
        if (guestId) invalidatePeopleCache(bookingId, guestId);
        return {
          rel: result.rel,
          connected: "connected" in result ? result.connected === true : result.rel === "in_group",
        };
      } catch (err) {
        patchRow(person.guest_id, before);
        if (err instanceof GuestAuthError) {
          onReauth();
          return null;
        }
        throw err instanceof ApiError ? err : new Error("friend-finder action failed");
      } finally {
        setPending((prev) => {
          const next = new Set(prev);
          next.delete(person.guest_id);
          return next;
        });
      }
    },
    [uid, bookingId, guestId, patchRow, onReauth],
  );

  // NOTE: there is deliberately no "settle the declined row" helper here.
  // A decline's new relationship comes back from the server (`declineRequest`
  // recomputes it from the state as it now stands), and forcing the row to
  // `open` locally would be guessing at an answer the server is already
  // sending. The row leaves the "Wants to add you" section on its own, because
  // its `rel` is no longer `added_you`.

  return { payload, members, status, pending, act, reload: load };
}

/** What the hook hands back — see PeopleScreen, which receives it as a prop. */
export type UseFriendsDirectory = ReturnType<typeof useFriendsDirectory>;
