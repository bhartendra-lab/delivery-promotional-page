/**
 * The studio dashboard's bell: what one notice looks like, and the pure rules
 * for showing it (the badge, "2h ago", where a click goes, and the Smart
 * Selects deep link the click lands on).
 *
 * Today every notice comes from collections ("Priya sent Priya's Side"), and
 * the endpoint answers 404 while COLLECTIONS_ENABLED is off; the bell reads
 * that as "nothing to show" and stops asking for the session.
 */

export type StudioNotice = {
  _id: string;
  type: "selection_sent";
  /** "Priya sent Priya's Side and Rahul's Side (322 photos)" */
  title: string;
  /** The event's name, or null. */
  body: string | null;
  booking_id: string;
  data: {
    collection_ids: string[];
    collection_names: string[];
    client_name: string | null;
    photo_count: number;
  };
  read: boolean;
  createdAt: string | number;
};

export type NotificationList = { items: StudioNotice[]; unread_count: number };

/** How often the bell asks while the tab is visible. */
export const NOTIFICATIONS_POLL_MS = 60_000;

/**
 * What the bell's badge says: nothing at all with nothing unread, a plain dot
 * for one, the number from two to nine, and "9+" above that.
 */
export function unreadBadge(unread: number): { dot: boolean; label: string | null } {
  if (!(unread > 0)) return { dot: false, label: null };
  if (unread === 1) return { dot: true, label: null };
  return { dot: true, label: unread > 9 ? "9+" : String(unread) };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const IST_MS = 330 * 60 * 1000;

/** "Just now", "5m ago", "2h ago", "Yesterday", "3d ago", then "26 Oct" (India's dates). */
export function timeAgo(when: string | number | null | undefined, now: number): string {
  const t = typeof when === "number" ? when : when ? new Date(when).getTime() : NaN;
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  const dayOf = (ms: number) => Math.floor((ms + IST_MS) / 86_400_000);
  const days = dayOf(now) - dayOf(t);
  if (days === 0) return `${Math.floor(s / 3600)}h ago`;
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  const d = new Date(t + IST_MS);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** Where a notice opens: the event's Smart Selects, on its first collection. */
export function noticeHref(n: Pick<StudioNotice, "booking_id" | "data">): string {
  const first = n.data?.collection_ids?.[0];
  const q = new URLSearchParams({ tab: "smart" });
  if (first) q.set("collection", first);
  return `/dashboard/events/${encodeURIComponent(n.booking_id)}?${q.toString()}`;
}

/** The Smart Selects deep link in a query string, or null when there is none. */
export function smartDeepLink(search: string): { collectionId: string | null } | null {
  const p = new URLSearchParams(search);
  if (p.get("tab") !== "smart") return null;
  const id = p.get("collection");
  return { collectionId: id && /^[0-9a-f]{24}$/i.test(id) ? id : null };
}

/** The same URL with the deep link's parameters removed (everything else kept). */
export function withoutDeepLink(href: string): string {
  const url = new URL(href);
  url.searchParams.delete("tab");
  url.searchParams.delete("collection");
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * The window event the bell sends when its notice is for the event already on
 * screen: navigating to the same page would not run the page's on-mount read
 * of the link, so the page listens for this instead.
 */
export const OPEN_COLLECTION_EVENT = "vyv:open-smart-collection";
export type OpenCollectionDetail = { bookingId: string; collectionId: string | null };
