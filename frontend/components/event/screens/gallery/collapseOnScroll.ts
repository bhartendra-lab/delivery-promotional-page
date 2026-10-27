/**
 * When the phone gallery folds its chrome away: the top bar, the folder pills
 * and the bottom nav hide while the guest scrolls down, and all come back on
 * the first scroll up. Pure, so the thresholds are tested rather than buried
 * in a scroll handler.
 *
 * The chrome is in the page flow, so folding it makes the scroller taller.
 * Near the end of the gallery that lowers the furthest it can scroll, the
 * browser pulls the position back, and that reads as a scroll up. Two guards
 * stop the header from bouncing on its own:
 *   - for a moment after every change, scroll events only update the position;
 *   - the header folds only when there is far more to scroll than it frees.
 *
 * No aliased imports: unit-tested under `node --test`.
 */

/** Never folds this close to the top: the header is part of the first view. */
export const COLLAPSE_AFTER = 72;
/** Downward travel, in one run, before the header folds. Filters out jitter. */
export const COLLAPSE_TRAVEL = 12;
/** An upward move this large unfolds it (the "first scroll up"). */
export const EXPAND_TRAVEL = 3;
/** At or above this position the header is always open. */
export const EXPAND_NEAR_TOP = 24;
/** How long scroll events are ignored after a change: the fold animation and a
 *  little more, so the scroller has settled at its new height. */
export const COLLAPSE_LOCK_MS = 320;
/** Space the folded chrome frees, with margin. A gallery that cannot scroll
 *  twice this far never folds, so folding can never leave it unscrollable. */
export const CHROME_SPACE = 180;

export type ScrollMachine = {
  /** The last position seen, clamped to the scrollable range. */
  lastTop: number;
  /** Downward travel since the last upward move. */
  travel: number;
  /** Scroll events before this time only update `lastTop`. */
  lockUntil: number;
};

export const INITIAL_MACHINE: ScrollMachine = { lastTop: 0, travel: 0, lockUntil: 0 };

/**
 * One scroll event. `top` is the scroller's scrollTop, `max` the furthest it
 * can scroll (scrollHeight - clientHeight), `now` a monotonic clock in ms.
 * The position is clamped first: iOS reports values past both ends while it
 * rubber-bands, and the bounce back from the bottom must not count as a
 * scroll up.
 */
export function stepCollapse(
  machine: ScrollMachine,
  collapsed: boolean,
  { top, max, now }: { top: number; max: number; now: number },
): { machine: ScrollMachine; collapsed: boolean } {
  const pos = Math.min(Math.max(top, 0), Math.max(max, 0));
  const delta = pos - machine.lastTop;
  const toggle = (next: boolean) => ({
    machine: { lastTop: pos, travel: 0, lockUntil: now + COLLAPSE_LOCK_MS },
    collapsed: next,
  });

  if (now < machine.lockUntil) return { machine: { ...machine, lastTop: pos, travel: 0 }, collapsed };

  if (pos <= EXPAND_NEAR_TOP) {
    return collapsed ? toggle(false) : { machine: { ...machine, lastTop: pos, travel: 0 }, collapsed };
  }

  if (delta < 0) {
    if (collapsed && -delta >= EXPAND_TRAVEL) return toggle(false);
    return { machine: { ...machine, lastTop: pos, travel: 0 }, collapsed };
  }

  const travel = machine.travel + delta;
  if (!collapsed && pos > COLLAPSE_AFTER && travel >= COLLAPSE_TRAVEL && max >= 2 * CHROME_SPACE) return toggle(true);
  return { machine: { ...machine, lastTop: pos, travel }, collapsed };
}
