// lib/plans.ts — PURE. No React, no fetch, no env. Identical byte-for-byte in
// Vyavasth-landing-page/lib/plans.ts and delivery-promotional-page/frontend/lib/plans.ts.
// If you change one, change the other in the same commit.

export type ServiceType = "Free" | "Event-based" | "Monthly" | "Yearly";
export type BillingInterval = "one_time" | "monthly" | "yearly";

/**
 * The first-purchase offer on the pay-per-event plan: bonus events added to a
 * studio's FIRST event purchase. A fixed number per studio, not per event
 * bought. The API sends null whenever the offer is not live right now, so
 * nothing here does date math: show it if it is there.
 */
export type FirstPurchaseOffer = {
  bonus_events: number;
  /** epoch ms; null = no end date */
  valid_until: number | null;
};

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
  /* ── Event-based plan only. Optional: an API that predates them sends none. */
  /** Media items one pay-per-event event can hold at a time. */
  photo_cap?: number | null;
  /** Items added by one paid capacity block. */
  photo_cap_addon_size?: number | null;
  /** GST-inclusive rupees for one capacity block. */
  photo_cap_addon_price?: number | null;
  first_purchase_offer?: FirstPurchaseOffer | null;
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

/** The live first-purchase offer on a plan, or null. Never a zero-bonus offer. */
export function firstPurchaseOfferOf(plan: Plan | null | undefined): FirstPurchaseOffer | null {
  const offer = plan?.first_purchase_offer;
  if (!offer || typeof offer.bonus_events !== "number" || offer.bonus_events <= 0) return null;
  return {
    bonus_events: offer.bonus_events,
    valid_until: typeof offer.valid_until === "number" ? offer.valid_until : null,
  };
}

/** "Buy 1 event, get 1 free" — the one wording of the offer, used everywhere. */
export function offerLine(offer: FirstPurchaseOffer): string {
  return `Buy 1 event, get ${offer.bonus_events} free`;
}

/** "1 free event" / "2 free events" */
export function freeEventsLabel(count: number): string {
  return `${count} free event${count === 1 ? "" : "s"}`;
}

/**
 * Fallbacks for the photo-cap terms, used ONLY when the API does not send
 * them (an older API, or the plans request failed). Every figure a studio
 * reads should come from the plans API; these exist so copy never renders
 * "undefined".
 */
export const FALLBACK_PHOTO_CAP = 20000;
export const FALLBACK_PHOTO_CAP_ADDON_SIZE = 5000;
export const FALLBACK_PHOTO_CAP_ADDON_PRICE = 50;

export type PhotoCapTerms = {
  /** Items one pay-per-event event holds at a time, before any add-on. */
  cap: number;
  addonSize: number;
  /** GST-inclusive rupees per add-on block. */
  addonPrice: number;
};

export function photoCapTermsOf(plan: Plan | null | undefined): PhotoCapTerms {
  const num = (value: number | null | undefined, fallback: number) =>
    typeof value === "number" && value >= 0 ? value : fallback;
  return {
    cap: num(plan?.photo_cap, FALLBACK_PHOTO_CAP),
    addonSize: num(plan?.photo_cap_addon_size, FALLBACK_PHOTO_CAP_ADDON_SIZE) || FALLBACK_PHOTO_CAP_ADDON_SIZE,
    addonPrice: num(plan?.photo_cap_addon_price, FALLBACK_PHOTO_CAP_ADDON_PRICE),
  };
}

/**
 * The pay-per-event terms, one sentence per line, with every figure taken from
 * the plan. This is the text behind every "T&C apply": the app's terms dialog
 * and the pricing page render exactly these lines, so they cannot disagree.
 *
 * `includeOffer: false` drops the offer line for a studio that cannot get it.
 */
export function payPerEventTerms(
  plan: Plan | null | undefined,
  opts: { includeOffer?: boolean } = {},
): string[] {
  const { cap, addonSize, addonPrice } = photoCapTermsOf(plan);
  const lines = [
    `Each event can hold up to ${formatCount(cap)} photos and videos at a time.`,
    "You can delete photos and upload new ones whenever you like. Only what is in the event right now counts.",
    `Need more room? Add ${formatCount(addonSize)} photos to an event for ${formatInr(addonPrice)}. Capacity is added in blocks of ${formatCount(addonSize)}.`,
    "Extra capacity belongs to that one event. It cannot be moved to another event and is not refundable.",
    "Each event stays live for 3 months from the day you create it. Unused events never expire.",
  ];
  const offer = opts.includeOffer === false ? null : firstPurchaseOfferOf(plan);
  if (offer) {
    const until = offer.valid_until != null ? ` Offer valid till ${formatOfferDate(offer.valid_until)}.` : "";
    lines.push(
      `First purchase offer for new studios: buy at least 1 event and get ${offer.bonus_events} free. One time per studio, whatever number of events you buy.${until}`,
    );
  }
  return lines;
}

/** 20000 → "20,000" */
export function formatCount(n: number): string {
  return new Intl.NumberFormat("en-IN").format(n);
}

/**
 * An offer's end date as a studio reads it: "31 Dec 2026". Pinned to India
 * time so a server render and the browser can never disagree about the day.
 */
export function formatOfferDate(ms: number): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(ms));
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
