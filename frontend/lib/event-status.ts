/**
 * One reading of "what state is this event in", for every screen that shows it.
 *
 * Before this, the event cards read `gallery_publish_status` alone and said
 * "Live" for a gallery the studio had switched off (deactivating only sets
 * `is_active = false`; the publish status stays `published`). Everything that
 * shows or counts an event's state now goes through `eventDisplayStatus`.
 *
 * Pure, so the Studio app and the node tests share it.
 */

export type EventDisplayStatus = "live" | "deactivated" | "archived" | "expired" | "draft";

type StatusInput = {
  /** `published`, `archived`, `expired` or `unpublished` (a draft). Absent reads as published. */
  gallery_publish_status?: string | null;
  /** False once the studio deactivated the gallery. Absent (an older event) reads as active. */
  is_active?: boolean | null;
};

/**
 * Order matters: an archived or expired event is over whatever its switch says,
 * and a draft was never live. Only a published event can be deactivated.
 */
export function eventDisplayStatus(row: StatusInput): EventDisplayStatus {
  const status = row.gallery_publish_status ?? "published";
  if (status === "expired") return "expired";
  if (status === "archived") return "archived";
  if (status === "unpublished") return "draft";
  return row.is_active === false ? "deactivated" : "live";
}

/** What the pill says. */
export const EVENT_STATUS_LABEL: Record<EventDisplayStatus, string> = {
  live: "Live",
  deactivated: "Deactivated",
  archived: "Archived",
  expired: "Expired",
  draft: "Draft",
};

/** The pill's dot colour (a brand token). Deactivated is neutral grey: switched off, not a warning. */
export const EVENT_STATUS_DOT: Record<EventDisplayStatus, string> = {
  live: "var(--color-brand-success)",
  deactivated: "var(--color-brand-muted)",
  archived: "var(--color-brand-warning)",
  expired: "var(--color-brand-muted)",
  draft: "var(--color-brand-warning)",
};

/** Counts as a live event: published and not switched off. The one rule behind "Total Live Events". */
export function isLiveEvent(row: StatusInput): boolean {
  return eventDisplayStatus(row) === "live";
}

/** The Events page's four filters. */
export type EventsFilter = "all" | "active" | "deactivated" | "archived";

/** Counts per filter, as the list endpoint returns them. */
export type EventsCounts = { all: number; active: number; deactivated: number; archived: number };

/** Which of the four non-"all" filters an event belongs to (draft events sit in none of them). */
export function filterOf(row: StatusInput): Exclude<EventsFilter, "all"> | null {
  const s = eventDisplayStatus(row);
  if (s === "live") return "active";
  if (s === "deactivated") return "deactivated";
  if (s === "archived" || s === "expired") return "archived";
  return null;
}
