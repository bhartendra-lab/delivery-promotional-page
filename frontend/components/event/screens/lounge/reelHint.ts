/**
 * The reel viewer's swipe-up hint: a few seconds after a photo opens, it lifts
 * a little and settles back, so the next photo peeks in from below and the
 * guest learns that the reel scrolls. It never changes the photo.
 *
 * Shown until the guest's first swipe to another photo, then never again in
 * this browser session (sessionStorage). At most `REEL_HINT_MAX` nudges per
 * opening, so a guest who is only looking at one photo is not bounced for as
 * long as they look.
 *
 * No aliased imports: unit-tested under `node --test`.
 */

/** Delay before each nudge, counted from the opening or the last nudge. */
export const REEL_HINT_EVERY_MS = 3000;
/** Nudges per opening of the viewer. */
export const REEL_HINT_MAX = 3;
/** How far the photo lifts. */
export const REEL_HINT_LIFT_PX = 44;
export const REEL_HINT_MS = 850;

const KEY = "vyv:reel-swipe-hint-done";

type SessionStore = Pick<Storage, "getItem" | "setItem">;

/** This tab's sessionStorage, or null where reading it throws (Safari with
 *  site data blocked throws on the property itself). */
export function sessionStore(): SessionStore | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Whether the guest has already swiped this session. Storage that is missing
 *  or throws (a private window, blocked site data) reads as "not yet": the
 *  hint then simply plays again, which is harmless. */
export function hintDone(store: SessionStore | null | undefined): boolean {
  try {
    return store?.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** Record the first swipe. Never throws. */
export function markHintDone(store: SessionStore | null | undefined): void {
  try {
    store?.setItem(KEY, "1");
  } catch {
    // Nothing to do: the hint stops for this opening anyway.
  }
}

/** Whether another nudge is due on the photo on screen. */
export function wantsNudge({
  done,
  nudges,
  canNext,
  zoomed,
  reducedMotion,
}: {
  done: boolean;
  /** Nudges already played in this opening. */
  nudges: number;
  /** There is a next photo to peek in. */
  canNext: boolean;
  /** A zoomed photo pans under the finger; a lift would fight it. */
  zoomed: boolean;
  reducedMotion: boolean;
}): boolean {
  return !done && canNext && !zoomed && !reducedMotion && nudges < REEL_HINT_MAX;
}
