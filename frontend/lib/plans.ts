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
  /**
   * The GST switch for every price on this plan. true: the prices include
   * GST. false: they are before GST, and GST is added at checkout. Absent (an
   * API from before the switch) means true. Read it with gstInclusiveOf.
   */
  gst_inclusive?: boolean | null;
  /** As the plan lists it: with or without GST, as `gst_inclusive` says. */
  price?: number | null;
  /** `price` as charged, GST included. The same number on a GST-inclusive plan. */
  price_with_gst?: number | null;
  /** One event, as the plan lists it. */
  event_unit_price?: number | null;
  /** One event as charged, GST included. */
  event_unit_price_with_gst?: number | null;
  storage_limit?: number | null;
  included_events?: number | null;
  qr_limit?: number | null;
  features?: string[] | null;
  /* ── Event-based plan only. Optional: an API that predates them sends none. */
  /** Media items one pay-per-event event can hold at a time. */
  photo_cap?: number | null;
  /** Items added by one paid capacity block. */
  photo_cap_addon_size?: number | null;
  /** Rupees for one capacity block, as the plan lists it. */
  photo_cap_addon_price?: number | null;
  /** One capacity block as charged, GST included. */
  photo_cap_addon_price_with_gst?: number | null;
  first_purchase_offer?: FirstPurchaseOffer | null;
  /** Days a pay-per-event event stays live from the day it is created. */
  validity_base_days?: number | null;
  /** Paid validity extensions on sale: months added to an event's current end
   *  date, for a price in rupees. */
  validity_extension_options?: ValidityExtensionOption[] | null;
};

/**
 * One paid validity extension: `months` more, for `price` rupees as the plan
 * lists it. `price_with_gst` is the same period as charged, GST included.
 */
export type ValidityExtensionOption = { months: number; price: number; price_with_gst?: number | null };

/* ── The GST switch ─────────────────────────────────────────────────────────
 * Each plan says whether its prices include GST (Service.gst_inclusive in the
 * API). Nothing here works out tax: the API sends every price as listed and
 * again as charged. These helpers only choose which figure to show and which
 * words go beside it.
 */

/** Whether a plan's prices already include GST. No answer means they do. */
export function gstInclusiveOf(plan: Plan | null | undefined): boolean {
  return plan?.gst_inclusive !== false;
}

/** The words beside a listed price: "GST included" or "plus GST". */
export function gstNote(inclusive: boolean): string {
  return inclusive ? "GST included" : "plus GST";
}

/** A price with its paise only when it has any: ₹249, ₹234.82. */
export function formatPrice(amount: number): string {
  return formatInr(amount, { paise: !Number.isInteger(amount) });
}

/** A listed price as it is read: "₹249" when GST is in it, "₹249 + GST" when not. */
export function formatListPrice(amount: number, inclusive: boolean): string {
  return inclusive ? formatPrice(amount) : `${formatPrice(amount)} + GST`;
}

/**
 * A price as charged, GST included: the `*_with_gst` figure when the API
 * sends one, otherwise the listed price (an API from before the switch, when
 * every listed price included GST). Use it wherever two prices are compared
 * or a total to pay is shown.
 */
export function chargedPrice(listed: number | null | undefined, withGst: number | null | undefined): number | null {
  if (typeof withGst === "number") return withGst;
  return typeof listed === "number" ? listed : null;
}

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

export type PhotoCapTerms = {
  /** Items one pay-per-event event holds at a time, before any add-on. */
  cap: number;
  addonSize: number;
  /** Rupees per add-on block, as the plan lists it. */
  addonPrice: number;
  /** Whether `addonPrice` includes GST. */
  gstInclusive: boolean;
};

/**
 * The photo limit, the size of one paid block and its price, from the plan.
 *
 * Null when the plan is missing or does not carry all three: NO figure is
 * kept in this file to stand in for them. The limit and the prices live on
 * the Event-based Service in the database and reach both apps only through
 * the plans API, so changing them there changes every sentence built here. A
 * caller with nothing to show leaves the sentence out.
 */
export function photoCapTermsOf(plan: Plan | null | undefined): PhotoCapTerms | null {
  const cap = plan?.photo_cap;
  const addonSize = plan?.photo_cap_addon_size;
  const addonPrice = plan?.photo_cap_addon_price;
  if (typeof cap !== "number" || cap < 0) return null;
  if (typeof addonSize !== "number" || addonSize <= 0) return null;
  if (typeof addonPrice !== "number" || addonPrice < 0) return null;
  return { cap, addonSize, addonPrice, gstInclusive: gstInclusiveOf(plan) };
}

/**
 * How long a pay-per-event event lives before it must be extended, for an API
 * that does not say. Not a price: it mirrors AUTO_DELETE_WINDOW_DAYS, a
 * constant in the API's own code (retention.utils.js).
 */
export const FALLBACK_VALIDITY_BASE_DAYS = 90;

/**
 * The validity extensions on sale, shortest first, exactly as the plan lists
 * them. Empty when the plan has none to show: like the photo limit, no period
 * and no price is kept in this file.
 */
export function validityOptionsOf(plan: Plan | null | undefined): ValidityExtensionOption[] {
  const seen = new Set<number>();
  const usable = (plan?.validity_extension_options ?? []).filter((option) => {
    const ok =
      Number.isInteger(option?.months) && option.months > 0 && typeof option?.price === "number" && option.price > 0;
    if (!ok || seen.has(option.months)) return false;
    seen.add(option.months);
    return true;
  });
  return usable
    .map(({ months, price, price_with_gst }) => ({ months, price, price_with_gst: chargedPrice(price, price_with_gst) }))
    .sort((a, b) => a.months - b.months);
}

/** Days a pay-per-event event stays live before it must be extended. */
export function validityBaseDaysOf(plan: Plan | null | undefined): number {
  const days = plan?.validity_base_days;
  return typeof days === "number" && days > 0 ? days : FALLBACK_VALIDITY_BASE_DAYS;
}

/** 90 → "3 months" · 45 → "45 days". Whole months read better when they are whole. */
export function baseLifetimeLabel(days: number): string {
  if (days % 30 === 0) {
    const months = days / 30;
    return `${months} month${months === 1 ? "" : "s"}`;
  }
  return `${days} days`;
}

/** "3 months for ₹199, 6 months for ₹299 or 12 months for ₹499", at the listed prices. */
export function validityOptionsSentence(options: ValidityExtensionOption[]): string {
  const parts = options.map(
    (option) => `${option.months} month${option.months === 1 ? "" : "s"} for ${formatPrice(option.price)}`,
  );
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} or ${parts[parts.length - 1]}`;
}

/**
 * The pay-per-event terms, one sentence per line, with every figure taken from
 * the plan. This is the text behind every "T&C apply": the app's terms dialog
 * and the pricing page render exactly these lines, so they cannot disagree.
 *
 * No plan, no terms: the list is empty, since there is no figure to quote. A
 * line whose figures the plan does not carry is left out on its own.
 *
 * `includeOffer: false` drops the offer line for a studio that cannot get it.
 */
export function payPerEventTerms(
  plan: Plan | null | undefined,
  opts: { includeOffer?: boolean } = {},
): string[] {
  if (!plan) return [];
  const capTerms = photoCapTermsOf(plan);
  const options = validityOptionsOf(plan);
  const note = gstNote(gstInclusiveOf(plan));
  const lifetime = baseLifetimeLabel(validityBaseDaysOf(plan));
  const lines = [
    ...(capTerms
      ? [
          `Each event can hold up to ${formatCount(capTerms.cap)} photos at a time.`,
          "You can delete photos and upload new ones whenever you like. Only what is in the event right now counts.",
          `Need more room? Add ${formatCount(capTerms.addonSize)} photos to an event for ${formatPrice(capTerms.addonPrice)}, ${note}. Capacity is added in blocks of ${formatCount(capTerms.addonSize)}.`,
          "Extra capacity belongs to that one event. It cannot be moved to another event and is not refundable.",
        ]
      : []),
    `Each event stays live for ${lifetime} from the day you create it. Unused events never expire.`,
    ...(options.length
      ? [
          `Need it for longer? Before an event closes, you or your Client can extend it: ${validityOptionsSentence(options)}, ${note}. The time is added to the date the event was due to close.`,
        ]
      : []),
    "We email you 7 days before an event closes, and message your Clients on WhatsApp with their own link to extend it.",
    "When an event closes, guests can no longer open it and its photos are deleted. A closed event cannot be extended. Extensions are not refundable.",
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

/**
 * Whole percent saved by paying yearly vs 12× monthly. null when incomparable.
 * Compared as charged, GST included, so a tier whose two plans list their
 * prices differently is still measured in the same money.
 */
export function yearlySavingsPercent(tier: StorageTier): number | null {
  const m = chargedPrice(tier.monthly?.price, tier.monthly?.price_with_gst);
  const y = chargedPrice(tier.yearly?.price, tier.yearly?.price_with_gst);
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
