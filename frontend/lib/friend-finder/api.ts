/**
 * "Find your friends group" — the two calls the feature makes.
 *
 * Kept out of `lib/guest-api.ts` on purpose. That module is imported eagerly by
 * `EventFlow` and `LoungeGallery`, and everything in it lands in the lounge's
 * initial JavaScript; this module is reached only from the lazily-loaded
 * friends chunk. It borrows `guestFetch` rather than re-implementing the token
 * and refresh-and-retry behaviour.
 */

import { guestFetch } from "../guest-api";
import type {
  AddResult,
  ChooseResult,
  DeclineResult,
  FriendFinderAction,
  FriendFinderBlock,
  FriendFinderPeopleResponse,
  MuteResult,
  ProfileResult,
  RemoveResult,
  StopResult,
} from "./types";

/**
 * The directory of everyone at the event, as this guest may see them.
 *
 * Nested on `get-guest-session` rather than given an endpoint of its own,
 * because the client needs `rev` and `group_updated_at` from the session block
 * to make its NEXT request conditional — and two round trips to learn that
 * would defeat the short-circuit. So one call returns three things: the
 * refreshed session block (including a current `pending_count`), the directory,
 * and the plain guest record.
 *
 * Send both `ifRev` and `ifGroup` to revalidate: when both match, the server
 * answers `{ unchanged: true }` and the cached payload still stands. The
 * backend ignores a lone one, so they are only sent as a pair.
 */
export function getFriendFinderPeople(
  uid: string,
  conditional?: { ifRev: number; ifGroup: number },
) {
  const params = new URLSearchParams({ include: "friend_finder_people" });
  if (conditional) {
    params.set("if_rev", String(conditional.ifRev));
    params.set("if_group", String(conditional.ifGroup));
  }
  return guestFetch<{
    friend_finder?: FriendFinderBlock;
    friend_finder_people?: FriendFinderPeopleResponse;
  }>(uid, `/deliverables/get-guest-session?${params.toString()}`);
}

/** Result of one action, discriminated by the action that was sent. */
export type FriendFinderActionResult<A extends FriendFinderAction["action"]> =
  A extends "choose" ? ChooseResult
  : A extends "add" ? AddResult
  : A extends "remove" ? RemoveResult
  : A extends "decline" ? DeclineResult
  : A extends "profile" ? ProfileResult
  : A extends "mute" ? MuteResult
  : A extends "stop" ? StopResult
  : never;

/**
 * Every write this feature makes, through its single endpoint.
 *
 * Throws `ApiError` like any other guest call. Two statuses are worth handling
 * at the call site rather than as a generic failure: 429 is the daily request
 * cap (the guest is fine, they have simply done this a lot today), and 403 with
 * `code: "FRIEND_FINDER_DISABLED"` means the studio switched the feature off
 * while this tab was open.
 */
export function friendFinderAction<A extends FriendFinderAction>(
  uid: string,
  body: A,
): Promise<FriendFinderActionResult<A["action"]>> {
  return guestFetch<FriendFinderActionResult<A["action"]>>(uid, "/deliverables/friend-finder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
