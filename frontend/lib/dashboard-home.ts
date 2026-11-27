/**
 * The Dashboard's pure rules: how the attention list reads (copy, the one
 * action per row, where it goes), how uploads join it, and how the month's
 * numbers are worded. No browser globals, so it is tested.
 *
 * Copy is plain words with no dashes, written for a studio owner at a glance.
 */

export type AttentionKind = "expiring" | "deactivated" | "missing_number" | "no_photos" | "change_request" | "upload";

/** A row from GET /bookings/dashboard-attention. */
export type ServerAttentionItem =
  | { kind: "expiring"; booking_id: string; name: string; ends_at: number; days_left: number; plan: "pay_per_event" | "storage" }
  | { kind: "deactivated"; booking_id: string; name: string }
  | { kind: "missing_number"; booking_id: string; name: string; roles: ("bride" | "groom")[] }
  | { kind: "no_photos"; booking_id: string; name: string; created_at: number }
  | { kind: "change_request"; booking_id: string; name: string; request_type: "event_name" | "cover_photo" };

export type AttentionResponse = { items: ServerAttentionItem[]; total: number; by_kind: Record<string, number> };

/** An upload the browser is running or has paused (lib/r2-upload registry). */
export type UploadItem = { booking_id: string; name: string; paused: boolean; percent: number };

export type AttentionRow = {
  key: string;
  kind: AttentionKind;
  booking_id: string;
  name: string;
  /** What is wrong, in one short sentence. */
  text: string;
  /** The one action, or null for a status only row. */
  action: { label: string; href: string } | { label: string; reactivate: true } | null;
  /** What closing this row stores on its booking (POST .../dismiss), or null when it cannot be closed (an upload in this browser). */
  dismissKey: string | null;
};

/** Most rows the Dashboard shows before "View all". */
export const ATTENTION_MAX_ROWS = 6;

const eventHref = (id: string, query = "") => `/dashboard/events/${encodeURIComponent(id)}${query}`;

const REQUEST_WORDS = { event_name: "the event name", cover_photo: "the cover photo" } as const;

function daysWord(n: number): string {
  if (n <= 0) return "today";
  return n === 1 ? "in 1 day" : `in ${n} days`;
}

/** The key a row is closed by; the server keeps the same list (dashboardHome.service.js attentionDismissKey). */
export function attentionDismissKey(item: ServerAttentionItem): string {
  return item.kind === "change_request" ? `change_request:${item.request_type}` : item.kind;
}

export function attentionRowOf(item: ServerAttentionItem): AttentionRow {
  const dismissKey = attentionDismissKey(item);
  const base = { key: `${dismissKey}:${item.booking_id}`, kind: item.kind, booking_id: item.booking_id, name: item.name, dismissKey };
  switch (item.kind) {
    case "expiring":
      return {
        ...base,
        text: `Closes ${daysWord(item.days_left)}`,
        // A pay per event event is extended in a dialog the link opens; a storage plan event's expiry day is changed in Edit event details.
        action: { label: "Extend", href: eventHref(item.booking_id, item.plan === "pay_per_event" ? "?extend=1" : "") },
      };
    case "deactivated":
      return { ...base, text: "Switched off. Guests cannot open it", action: { label: "Reactivate", reactivate: true } };
    case "missing_number": {
      const who = item.roles.length === 2 ? "the Bride and the Groom" : item.roles[0] === "bride" ? "the Bride" : "the Groom";
      return { ...base, text: `No WhatsApp number for ${who}`, action: { label: "Add number", href: eventHref(item.booking_id, "?tab=access") } };
    }
    case "no_photos":
      return { ...base, text: "No photos yet", action: { label: "Upload photos", href: eventHref(item.booking_id) } };
    case "change_request":
      return { ...base, text: `Change requested for ${REQUEST_WORDS[item.request_type]}. We are looking at it`, action: null };
  }
}

/** Uploads first (they are happening now), then the server's rows, cut to the cap. Returns the rows and how many were left out. */
export function mergeAttention(
  server: ServerAttentionItem[],
  uploads: UploadItem[],
  max = ATTENTION_MAX_ROWS,
  serverTotal = server.length,
): { rows: AttentionRow[]; hidden: number } {
  const uploadRows: AttentionRow[] = uploads.map((u) => ({
    key: `upload:${u.booking_id}`,
    kind: "upload",
    booking_id: u.booking_id,
    name: u.name,
    text: u.paused ? `Upload paused at ${Math.round(u.percent)}%` : `Uploading, ${Math.round(u.percent)}% done`,
    action: { label: "Open", href: eventHref(u.booking_id) },
    dismissKey: null,
  }));
  const all = [...uploadRows, ...server.map(attentionRowOf)];
  const total = uploadRows.length + Math.max(serverTotal, server.length);
  return { rows: all.slice(0, max), hidden: Math.max(0, total - Math.min(all.length, max)) };
}

/** Where "View all" goes: deactivated galleries have their own filter, everything else is in Active. */
export function viewAllHref(rows: AttentionRow[]): string {
  const onlyDeactivated = rows.length > 0 && rows.every((r) => r.kind === "deactivated");
  return `/dashboard/events?filter=${onlyDeactivated ? "deactivated" : "active"}`;
}

/** "Up 50% on last month", "Down 20% on last month", "Same as last month", or null when there is nothing to compare with. */
export function changeLabel(change: number | null | undefined): string | null {
  if (change === null || change === undefined) return null;
  if (change === 0) return "Same as last month";
  return change > 0 ? `Up ${change}% on last month` : `Down ${Math.abs(change)}% on last month`;
}

export type MonthStat = { value: number; previous: number | null; change: number | null };
export type MonthStatsResponse = {
  month_start: number;
  views: MonthStat;
  leads: MonthStat;
  whatsapp_free: MonthStat;
  review_taps: MonthStat;
};

/** The four tiles, in the order shown. `hint` says what the number counts. */
export function monthTiles(stats: MonthStatsResponse): { key: string; label: string; value: number; change: string | null; up: boolean | null; hint: string }[] {
  const tile = (key: string, label: string, s: MonthStat, hint: string) => ({
    key,
    label,
    value: s.value,
    change: changeLabel(s.change),
    up: s.change === null || s.change === 0 ? null : s.change > 0,
    hint,
  });
  return [
    tile("views", "Gallery views", stats.views, "Guests who opened a gallery for the first time"),
    tile("leads", "New guest contacts", stats.leads, "Guests with a phone number or email"),
    tile("whatsapp_free", "WhatsApp messages sent free", stats.whatsapp_free, "Gallery notices we sent for you"),
    tile("review_taps", "Google review taps", stats.review_taps, "All time, across your events"),
  ];
}
