/**
 * Client storage for "Find your friends group".
 *
 * Exactly two things are ever written, and nothing else in this app owns either
 * key space:
 *
 *   localStorage    `ff:v1:{booking_id}:{guest_id}`  the people payload + its
 *                   two conditional tokens, so a returning tab can paint the
 *                   card preview and My Group with no request.
 *   sessionStorage  `ff_intent`                      "the guest arrived on the
 *                   approval link", remembered across the sign-in round trip.
 *
 * Every access is wrapped: Safari private mode throws on `setItem`, a guest can
 * have site data blocked, and none of that is a reason for the gallery to fall
 * over. `clear()` is never called — the guest token and the matched-media cache
 * live in the same stores (see `lib/guest-auth.ts`), and wiping those would sign
 * the guest out.
 */

import type { FriendFinderPeople } from "./types";

const CACHE_PREFIX = "ff:v1:";
const INTENT_KEY = "ff_intent";

/** The only intent there is today. Typed as a union so a second one has to be
 *  added here rather than spelled freehand at a call site. */
export type FriendIntent = "requests";

const cacheKey = (bookingId: string, guestId: string) =>
  `${CACHE_PREFIX}${bookingId}:${guestId}`;

/**
 * The cached directory, with the pair of tokens it was valid at.
 *
 * Both must match the session block before the cache may be rendered: `rev`
 * moves when anything about OTHER guests changes, `group_updated_at` when this
 * guest's own group does, and neither alone covers both.
 */
export type CachedPeople = {
  rev: number;
  group_updated_at: number;
  payload: FriendFinderPeople;
};

export function readPeopleCache(bookingId: string, guestId: string): CachedPeople | null {
  try {
    const raw = localStorage.getItem(cacheKey(bookingId, guestId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedPeople;
    // Shape-check rather than trust: this is guest-writable storage, and a
    // half-written or older-format entry must read as a miss, not as a payload
    // whose `people` is undefined three components deep.
    if (
      typeof parsed?.rev !== "number" ||
      typeof parsed?.group_updated_at !== "number" ||
      !Array.isArray(parsed?.payload?.people) ||
      !Array.isArray(parsed?.payload?.media_ids)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writePeopleCache(bookingId: string, guestId: string, payload: FriendFinderPeople): void {
  try {
    const entry: CachedPeople = {
      rev: payload.rev,
      group_updated_at: payload.group_updated_at,
      payload,
    };
    localStorage.setItem(cacheKey(bookingId, guestId), JSON.stringify(entry));
  } catch {
    /* quota, private mode, blocked site data — the feature works without it */
  }
}

/**
 * Drop what this feature keeps for one guest on this device.
 *
 * Called on Stop sharing. Removes the `ff:v1:` key BY NAME — never `clear()`,
 * which would take the guest token and the matched-media cache with it and
 * sign them out of the gallery.
 */
export function clearPeopleCache(bookingId: string, guestId: string): void {
  try {
    localStorage.removeItem(cacheKey(bookingId, guestId));
  } catch {
    /* nothing to do: the cache is only ever an optimisation */
  }
}

/**
 * Keep the payload but poison its `rev`, so the next open revalidates instead
 * of short-circuiting.
 *
 * Used after every action: the row the guest just changed is already correct
 * on screen (the update is optimistic), but `rev` has moved server-side and the
 * cached copy no longer describes the event. Dropping the whole entry would
 * work too, and would cost the card its avatars for no reason.
 */
export function invalidatePeopleCache(bookingId: string, guestId: string): void {
  const cached = readPeopleCache(bookingId, guestId);
  if (!cached) return;
  try {
    localStorage.setItem(
      cacheKey(bookingId, guestId),
      JSON.stringify({ ...cached, rev: -1 }),
    );
  } catch {
    /* see writePeopleCache */
  }
}

/* ── the approval link's remembered intent ──────────────────────────────── */

export function readIntent(): FriendIntent | null {
  try {
    return sessionStorage.getItem(INTENT_KEY) === "requests" ? "requests" : null;
  } catch {
    return null;
  }
}

export function setIntent(intent: FriendIntent): void {
  try {
    sessionStorage.setItem(INTENT_KEY, intent);
  } catch {
    /* the guest lands on the gallery instead of the people screen */
  }
}

export function clearIntent(): void {
  try {
    sessionStorage.removeItem(INTENT_KEY);
  } catch {
    /* worst case the people screen opens once more on the next load */
  }
}
