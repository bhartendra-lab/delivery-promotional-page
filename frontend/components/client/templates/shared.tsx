"use client";

/**
 * Shared helpers for the delivery page templates.
 *
 * Most of the old helpers (CustomMessage, DeliverySectionHeading, ScrollCue,
 * yearsSince, etc.) lived here when each template rendered its own bespoke
 * layout. Those are gone — the page now uses one shared layout in
 * `frontend/components/client/delivery/`. Only `formatEventDate` remains.
 */
/**
 * Format a unix timestamp (seconds) as "5 February 2026".
 *
 * Pinned to en-GB so server and client produce identical strings —
 * `toLocaleDateString(undefined, …)` would otherwise drift between
 * server (en-US default) and a user's browser (en-GB / en-IN here)
 * and trigger a React hydration mismatch.
 */
export function formatEventDate(unix?: number): string {
  if (!unix) return "";
  const date = new Date(unix * 1000);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
