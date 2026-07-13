export function formatEventDate(unix?: number): string {
  if (!unix) return "—";
  const date = new Date(unix * 1000);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatCreatedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function buildShareUrl(id: string): string {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "";
  return `${base.replace(/\/$/, "")}/c/${id}`;
}

export function toDateInputValue(unix?: number): string {
  if (!unix) return "";
  const date = new Date(unix * 1000);
  if (Number.isNaN(date.getTime())) return "";
  const yyyy = date.getFullYear().toString().padStart(4, "0");
  const mm = (date.getMonth() + 1).toString().padStart(2, "0");
  const dd = date.getDate().toString().padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function fromDateInputValue(value: string): number | undefined {
  if (!value) return undefined;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  const date = new Date(y, m - 1, d);
  return Math.floor(date.getTime() / 1000);
}

/* ── Archive / expiry countdown ─────────────────────────────────── */

const DAY_MS = 1000 * 60 * 60 * 24;

/**
 * Days remaining until `sinceMs + windowDays` elapses, clamped at 0 (never
 * negative). Mirrors the nightly gallery-cleanup cron's arithmetic exactly so
 * the UI never predicts a different expiry day than the one the sweep uses.
 */
export function daysRemaining(sinceMs: number, windowDays: number): number {
  const elapsed = Date.now() - sinceMs;
  return Math.max(0, Math.ceil(windowDays - elapsed / DAY_MS));
}

export type ExpiryWarning = { daysLeft: number; label: string } | null;

/**
 * Resolve the "expires in X days" warning for a booking row, matching the two
 * cron paths:
 *   - Free / Event-based → 90 days from `createdAt`
 *   - archived (any plan, in practice Monthly/Yearly) → 7 days from archive
 * Expired bookings never warn; Monthly/Yearly that aren't archived never warn.
 */
export function getExpiryWarning(row: {
  service_type?: string | null;
  gallery_publish_status?: string;
  createdAt?: string;
  gallery_archived_at?: number | null;
}): ExpiryWarning {
  if (row.gallery_publish_status === "expired") return null; // never a warning
  if (row.gallery_publish_status === "archived") {
    if (!row.gallery_archived_at) return null;
    const daysLeft = daysRemaining(row.gallery_archived_at, 7);
    return {
      daysLeft,
      label: daysLeft <= 0 ? "Expires today" : `Expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`,
    };
  }
  if ((row.service_type === "Free" || row.service_type === "Event-based") && row.createdAt) {
    const daysLeft = daysRemaining(new Date(row.createdAt).getTime(), 90);
    return {
      daysLeft,
      label: daysLeft <= 0 ? "Expires today" : `Expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`,
    };
  }
  return null; // Monthly/Yearly, not archived → no warning, ever
}
