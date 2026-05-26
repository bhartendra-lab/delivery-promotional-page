"use client";

/**
 * Shared helpers for the delivery page templates.
 *
 * Most of the old helpers (CustomMessage, DeliverySectionHeading, ScrollCue,
 * yearsSince, etc.) lived here when each template rendered its own bespoke
 * layout. Those are gone — the page now uses one shared layout in
 * `frontend/components/client/delivery/`. Only `formatEventDate` remains.
 */
export function formatEventDate(unix?: number): string {
  if (!unix) return "";
  const date = new Date(unix * 1000);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
