// lib/gallery-closing.ts — PURE. No React, no fetch, no env.
//
// The countdown a Guest sees on a gallery that is on its way out.
//
// When a Studio archives an event (or the event reaches the expiry the Studio
// chose) its gallery is not taken away: it stays open for seven more days and
// its photos are deleted after that. The API sends the moment that happens as
// `closes_at` on the public event, and only then. This turns it into the few
// words the gallery shows.

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whole days left before a gallery closes, counted the way a person counts
 * them: any part of a day still to come is a day. Seven on the day it is
 * archived, one through its last 24 hours, zero once the moment has passed
 * (its photos go in the next nightly run). Null when the gallery is not
 * closing.
 */
export function closingDaysLeft(closesAt: number | null | undefined, now: number = Date.now()): number | null {
  if (typeof closesAt !== "number" || !Number.isFinite(closesAt)) return null;
  return Math.max(0, Math.ceil((closesAt - now) / DAY_MS));
}

/**
 * "7 days to expire", "1 day to expire", "Expires today". Null when the
 * gallery is not closing, so a caller can show nothing at all.
 */
export function closingCountdownLabel(closesAt: number | null | undefined, now: number = Date.now()): string | null {
  const days = closingDaysLeft(closesAt, now);
  if (days == null) return null;
  if (days === 0) return "Expires today";
  return `${days} day${days === 1 ? "" : "s"} to expire`;
}
