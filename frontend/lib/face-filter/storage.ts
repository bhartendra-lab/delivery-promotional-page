/**
 * Client storage for the face filter: the last chips and the selection, per
 * gallery and scope, in `sessionStorage` so a reload in the same tab paints
 * the bar at once and keeps what was picked.
 *
 *   faces:v1:{uid}:{scope}:chips   the chip block (key, state, faces)
 *   faces:v1:{uid}:{scope}:sel     the selected chip ids
 *
 * Kept as two entries because a host's "all" chips can run to a few hundred
 * KB, and a tap on the bar must not rewrite them.
 *
 * Every access is wrapped: Safari private mode throws on `setItem`, site data
 * can be blocked, and none of that may break the gallery. A read that does not
 * look right is a miss. `clear()` is never called on the store: the guest token
 * and the matched-set cache live beside these keys (see `lib/guest-auth.ts`).
 *
 * The session carries no guest id to key these on, so they are dropped on
 * sign-out and re-auth (`clearFaceFilterCache`); a different guest in the same
 * tab starts empty.
 */

import { parseFaceChips } from "./query.ts";
import type { FaceChips, FaceFilterScope } from "./types";

const PREFIX = "faces:v1:";
const chipsKey = (uid: string, scope: FaceFilterScope) => `${PREFIX}${uid}:${scope}:chips`;
const selectionKey = (uid: string, scope: FaceFilterScope) => `${PREFIX}${uid}:${scope}:sel`;

function store(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

export function readFaceChips(uid: string, scope: FaceFilterScope): FaceChips | null {
  try {
    const raw = store()?.getItem(chipsKey(uid, scope));
    if (!raw) return null;
    const chips = parseFaceChips(JSON.parse(raw));
    // An entry for the other scope under this key is not this scope's chips.
    return chips && chips.scope === scope ? chips : null;
  } catch {
    return null;
  }
}

export function writeFaceChips(uid: string, scope: FaceFilterScope, chips: FaceChips | null): void {
  try {
    const s = store();
    if (!s) return;
    if (chips) s.setItem(chipsKey(uid, scope), JSON.stringify(chips));
    else s.removeItem(chipsKey(uid, scope));
  } catch {
    /* quota, private mode, blocked site data: the bar works without it */
  }
}

export function readFaceSelection(uid: string, scope: FaceFilterScope): string[] {
  try {
    const raw = store()?.getItem(selectionKey(uid, scope));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string").slice(0, 30) : [];
  } catch {
    return [];
  }
}

export function writeFaceSelection(uid: string, scope: FaceFilterScope, selected: readonly string[]): void {
  try {
    const s = store();
    if (!s) return;
    if (selected.length > 0) s.setItem(selectionKey(uid, scope), JSON.stringify(selected));
    else s.removeItem(selectionKey(uid, scope));
  } catch {
    /* as above */
  }
}

/** Forget both scopes for this gallery: on sign-out and re-auth. */
export function clearFaceFilterCache(uid: string): void {
  for (const scope of ["mine", "all"] as const) {
    writeFaceChips(uid, scope, null);
    writeFaceSelection(uid, scope, []);
  }
}
