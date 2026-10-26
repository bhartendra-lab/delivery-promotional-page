/**
 * The decisions behind the reel viewer's gestures, as pure functions so the
 * thresholds are tested rather than buried in pointer handlers.
 *
 * Sign convention throughout: `dy` and `velocity` are the finger's movement,
 * positive DOWN (screen coordinates). Swiping up (dy < 0) means "next", like
 * Instagram Reels; a step of +1 is the next photo, -1 the previous.
 *
 * No aliased imports: unit-tested under `node --test`.
 */

/** A release past this share of the screen height moves on. */
export const REEL_DISTANCE_RATIO = 0.18;
/** A release faster than this (px/ms) moves on, however short the drag. */
export const REEL_VELOCITY = 0.45;
/** The settle animation's length. */
export const REEL_ANIM_MS = 320;
/** How far back velocity is measured from the release. Long enough to smooth
 *  out one noisy sample, short enough that a drag that stopped before
 *  release reads as stopped. */
export const VELOCITY_WINDOW_MS = 80;
/** Rubber-band stiffness at the ends (the iOS scroll-view constant). */
export const RUBBER_BAND_C = 0.55;

/** A press that moved less than this and lasted less than TAP_MAX_MS is a tap. */
export const TAP_SLOP = 10;
export const TAP_MAX_MS = 300;
/** A second tap this soon after, and this close to, the first is a double. */
export const DOUBLE_TAP_MS = 250;
export const DOUBLE_TAP_SLOP = 32;

export type Step = -1 | 0 | 1;

/**
 * Where a released drag goes. A fast flick decides on its own; a slow release
 * decides by distance. A flick AGAINST the drag (pulled up, then flicked back
 * down) cancels rather than jumping the other way: the guest changed their
 * mind, they did not ask for the previous photo. Never steps past either end.
 */
export function reelStep({
  dy,
  velocity,
  viewportHeight,
  canPrev,
  canNext,
}: {
  dy: number;
  velocity: number;
  viewportHeight: number;
  canPrev: boolean;
  canNext: boolean;
}): Step {
  let dir: Step = 0;
  if (Math.abs(velocity) > REEL_VELOCITY) {
    dir = velocity < 0 ? 1 : -1;
    if (dy !== 0 && (dy < 0 ? 1 : -1) !== dir) dir = 0;
  } else if (Math.abs(dy) > REEL_DISTANCE_RATIO * viewportHeight) {
    dir = dy < 0 ? 1 : -1;
  }
  if (dir === 1 && !canNext) return 0;
  if (dir === -1 && !canPrev) return 0;
  return dir;
}

/**
 * The slide's offset for a drag of `dy`. Free in a direction that has a photo
 * to go to; past an end it follows the finger with growing resistance, so the
 * guest feels the edge instead of hitting a wall. The damped distance never
 * reaches a full screen however far the finger goes.
 */
export function rubberBand(dy: number, viewportHeight: number, canPrev: boolean, canNext: boolean): number {
  const atEnd = (dy > 0 && !canPrev) || (dy < 0 && !canNext);
  if (!atEnd || viewportHeight <= 0) return dy;
  const x = Math.abs(dy);
  const damped = (1 - 1 / ((x * RUBBER_BAND_C) / viewportHeight + 1)) * viewportHeight;
  return Math.sign(dy) * damped;
}

/** Finger velocity (px/ms, positive down) over the last VELOCITY_WINDOW_MS of
 *  samples. Zero for fewer than two samples or no elapsed time. */
export function releaseVelocity(samples: { t: number; y: number }[], windowMs = VELOCITY_WINDOW_MS): number {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  let first = last;
  for (let i = samples.length - 2; i >= 0; i--) {
    if (last.t - samples[i].t > windowMs) break;
    first = samples[i];
  }
  const dt = last.t - first.t;
  return dt > 0 ? (last.y - first.y) / dt : 0;
}

export type Tap = { t: number; x: number; y: number };

/** Was this press a tap at all (not a drag, not a long hold)? */
export function isTap(down: Tap, up: Tap): boolean {
  return up.t - down.t <= TAP_MAX_MS && Math.hypot(up.x - down.x, up.y - down.y) <= TAP_SLOP;
}

/**
 * What the taps mean at time `now`.
 *
 * - "double": `current` came within DOUBLE_TAP_MS of `previous`, and close to
 *   it. The reel likes the photo.
 * - "single": `current` stood alone for the whole double-tap window. The reel
 *   toggles its chrome. Waiting is the price of having both gestures: a
 *   single tap acted on immediately could not be taken back when the second
 *   tap of a double arrives.
 * - "none": nothing to decide yet.
 */
export function classifyTaps(previous: Tap | null, current: Tap | null, now: number): "single" | "double" | "none" {
  if (!current) return "none";
  if (
    previous &&
    current.t - previous.t >= 0 &&
    current.t - previous.t <= DOUBLE_TAP_MS &&
    Math.hypot(current.x - previous.x, current.y - previous.y) <= DOUBLE_TAP_SLOP
  ) {
    return "double";
  }
  return now - current.t >= DOUBLE_TAP_MS ? "single" : "none";
}
