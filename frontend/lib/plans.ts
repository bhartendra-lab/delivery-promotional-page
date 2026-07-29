// lib/plans.ts — PURE. No React, no fetch, no env. Identical byte-for-byte in
// Vyavasth-landing-page/lib/plans.ts and delivery-promotional-page/frontend/lib/plans.ts.
// If you change one, change the other in the same commit.

export type ServiceType = "Free" | "Event-based" | "Monthly" | "Yearly";
export type BillingInterval = "one_time" | "monthly" | "yearly";

export type Plan = {
  _id: string;
  name?: string | null;
  description?: string | null;
  service_type: ServiceType;
  billing_interval?: BillingInterval | null;
  price?: number | null;
  event_unit_price?: number | null;
  storage_limit?: number | null;
  included_events?: number | null;
  qr_limit?: number | null;
  features?: string[] | null;
};

/**
 * `billing_interval` is optional in the backend schema (no default, not
 * required) — older Service documents may not have it. service_type is
 * required, so derive from it and treat billing_interval as a hint only.
 */
export function intervalOf(p: Plan): BillingInterval {
  if (p.service_type === "Yearly") return "yearly";
  if (p.service_type === "Monthly") return "monthly";
  return "one_time";
}

export type StorageTier = {
  storage_limit: number; // GB
  monthly: Plan | null;
  yearly: Plan | null;
};

/**
 * Every distinct storage_limit across active Monthly/Yearly plans, ascending.
 * A tier exists if EITHER interval offers it — so the slider track keeps the
 * same stops when the user toggles Monthly ↔ Yearly, and a tier that only
 * exists on one interval renders as an unavailable stop rather than silently
 * reshaping the track.
 *
 * Adding a new Service with a new storage_limit adds a stop automatically.
 * Nothing here is hardcoded.
 */
export function buildStorageTiers(plans: Plan[]): StorageTier[] {
  const storage = plans.filter(
    (p) =>
      (p.service_type === "Monthly" || p.service_type === "Yearly") &&
      typeof p.storage_limit === "number" &&
      p.storage_limit > 0 &&
      typeof p.price === "number" &&
      p.price > 0,
  );
  const limits = Array.from(new Set(storage.map((p) => p.storage_limit as number))).sort(
    (a, b) => a - b,
  );
  return limits.map((gb) => ({
    storage_limit: gb,
    monthly: storage.find((p) => p.storage_limit === gb && intervalOf(p) === "monthly") ?? null,
    yearly: storage.find((p) => p.storage_limit === gb && intervalOf(p) === "yearly") ?? null,
  }));
}

export function planForTier(tier: StorageTier, interval: "monthly" | "yearly"): Plan | null {
  return interval === "monthly" ? tier.monthly : tier.yearly;
}

/** Nearest tier (by index) that HAS a plan for `interval`. Used when toggling
 *  interval would land on an unavailable stop. Prefers the lower tier on a tie. */
export function nearestAvailableIndex(
  tiers: StorageTier[],
  from: number,
  interval: "monthly" | "yearly",
): number {
  if (planForTier(tiers[from], interval)) return from;
  for (let d = 1; d < tiers.length; d++) {
    const lo = from - d;
    const hi = from + d;
    if (lo >= 0 && planForTier(tiers[lo], interval)) return lo;
    if (hi < tiers.length && planForTier(tiers[hi], interval)) return hi;
  }
  return from;
}

/** The one Event-based plan. Backend sorts by sort_order, so first wins. */
export function eventPlanOf(plans: Plan[]): Plan | null {
  return (
    plans.find(
      (p) =>
        p.service_type === "Event-based" &&
        typeof p.event_unit_price === "number" &&
        p.event_unit_price > 0,
    ) ?? null
  );
}

export function freePlanOf(plans: Plan[]): Plan | null {
  return plans.find((p) => p.service_type === "Free") ?? null;
}

/** Whole percent saved by paying yearly vs 12× monthly. null when incomparable. */
export function yearlySavingsPercent(tier: StorageTier): number | null {
  const m = tier.monthly?.price;
  const y = tier.yearly?.price;
  if (typeof m !== "number" || typeof y !== "number" || m <= 0 || y <= 0) return null;
  const pct = Math.round((1 - y / (m * 12)) * 100);
  return pct > 0 ? pct : null;
}

/** 150 → "150 GB" · 1024 → "1 TB" · 1536 → "1.5 TB" */
export function formatStorage(gb: number): string {
  if (gb >= 1024) {
    const tb = gb / 1024;
    return `${Number.isInteger(tb) ? tb : tb.toFixed(1)} TB`;
  }
  return `${gb} GB`;
}

export function formatInr(amount: number, opts?: { paise?: boolean }): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: opts?.paise ? 2 : 0,
    maximumFractionDigits: opts?.paise ? 2 : 0,
  }).format(amount);
}

/** Display label for a plan — never print the raw enum. */
export function planLabel(p: Plan): string {
  if (p.name) return p.name;
  if (p.service_type === "Event-based") return "Pay per event";
  if (p.service_type === "Free") return "Free";
  if (typeof p.storage_limit === "number") {
    return `${formatStorage(p.storage_limit)} · ${p.service_type === "Yearly" ? "Yearly" : "Monthly"}`;
  }
  return p.service_type;
}
