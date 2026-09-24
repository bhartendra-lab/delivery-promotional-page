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
 *   in_group  → removing drops my side; theirs stands, so they are open to me.
 *   requested → cancelling drops my side; they never allowed me: ask.
 * The server's own `rel` is applied on top when it answers, so a wrong guess
 * corrects itself rather than sticking.
 */
function optimisticRel(current: FriendRel, action: "add" | "remove" | "decline"): FriendRel {
  if (action === "add") return current === "ask" ? "requested" : "in_group";
  if (action === "remove") return current === "requested" ? "ask" : "open";
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
  /** Load (and revalidate) only while the screen using this is open. */
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
  useEffect(() => {
    payloadRef.current = payload;
  });

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
   * `preparing` now means only one thing: this guest's own `search-selfie` has
   * answered them but the write that stores their matched set has not landed
   * yet — a sub-second gap in the same visit. It used to mean "a background
   * sweep will get to you", which could be ten minutes and which no amount of
   * retrying would have helped; there is no sweep any more.
   *
   * So a single delayed refetch closes the only gap that is left, and the guest
   * sees their photos instead of a message telling them to come back. Not a
   * poll: if the one retry still says `preparing`, something actually failed
   * and their next visit is what fixes it.
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
  // recomputes it), and forcing the row to `open` locally would be wrong for
  // the one case that matters: someone who stopped sharing between asking and
  // being declined, whose true state is `not_sharing`. The row leaves the
  // "Wants to add you" section on its own, because its `rel` is no longer
  // `added_you`.

  return { payload, members, status, pending, act, reload: load };
}

/** What the hook hands back — see PeopleScreen, which receives it as a prop. */
export type UseFriendsDirectory = ReturnType<typeof useFriendsDirectory>;
