/**
 * The face filter's two requests. Both are `get-guest-session` with
 * `include=face_filter` (see lib/face-filter/types.ts), through the same
 * `guestFetch` as every other guest call: token, refresh-and-retry on a 401,
 * `GuestAuthError` when the guest must sign in again.
 */

import { getGuestSession } from "../guest-api";
import { faceFilterQuery } from "./query";
import type { FaceFilterScope } from "./types";

/** The chips for one scope. Send the last `key` as `ifKey` and an unchanged
 *  bar comes back as `{ unchanged: true }`. */
export function getFaceFilter(uid: string, { scope, ifKey }: { scope: FaceFilterScope; ifKey?: string | null }) {
  return getGuestSession(uid, { query: faceFilterQuery({ scope, ifKey }) });
}

/**
 * One selection's photos. Abortable: only the answer for the latest selection
 * is ever applied. With `ifKey`, unchanged chips are not re-sent; changed ones
 * come back in full beside the answer.
 */
export function getFaceFilterMedia(
  uid: string,
  {
    scope,
    faces,
    ifKey,
    signal,
  }: { scope: FaceFilterScope; faces: readonly string[]; ifKey?: string | null; signal?: AbortSignal },
) {
  return getGuestSession(uid, { query: faceFilterQuery({ scope, ifKey, faces }), signal });
}
