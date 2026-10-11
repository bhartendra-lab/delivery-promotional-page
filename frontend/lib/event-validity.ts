// lib/event-validity.ts — PURE. No React, no fetch, no env.
//
// The words, dates and small sums behind pay per event validity: the Studio's
// "Extend validity" dialog and the Client's extension page share them, so the
// two can never say the same thing two different ways. Every price, period and
// date they format comes from the API; nothing here decides when an event
// ends or what an extension costs.

/* ── What the API sends ─────────────────────────────────────────────────── */

/** One period on sale for ONE event, with what buying it would do. */
export type ValidityOption = {
  months: number;
  /** Rupees, as the Event-based plan lists it: with or without GST, as the
   *  `gst_inclusive` beside the options says. */
  price: number;
  /** The same period as charged, GST included. Absent from an API that
   *  predates the GST switch, where `price` already included GST. */
  price_with_gst?: number | null;
  /** Epoch ms: the last moment the event would be live after buying this. */
  new_end: number;
  /** The cheapest per month. At most one option carries it, and often none. */
  best_value: boolean;
};

/** What someone about to pay is told about extensions already made. */
export type ValidityGuard = {
  extended: boolean;
  count: number;
  last: {
    at: number;
    months: number;
    to: number;
    /** "you" only on a Client's own link, for an extension they made themselves. */
    by: "you" | "studio" | "client";
    /** A first name at most; often null. */
    by_name: string | null;
  } | null;
};

/** One past extension, as the Studio's dashboard lists it. */
export type ValidityExtensionRecord = {
  at: number;
  months: number;
  to: number;
  channel: "link" | "dashboard";
  by: "studio" | "client";
  by_name: string | null;
};

export type ValidityReelItem = {
  url: string;
  width: number | null;
  height: number | null;
  /** Epoch ms the photo was taken, when known. */
  captured_at: number | null;
  /** True only for a camera's own time. Only then is a clock time printed. */
  time_reliable: boolean;
  liked_by_client: boolean;
};

export type ValidityReelFavourite = {
  url: string;
  width: number | null;
  height: number | null;
  hearts: number;
  liked_by_client: boolean;
};

export type ValidityReel = {
  items: ValidityReelItem[];
  favourite: ValidityReelFavourite | null;
  stats: {
    photos: number;
    people: number;
    first_at: number | null;
    last_at: number | null;
    times_reliable: boolean;
  };
};

/** GET /billing/validity/:token */
export type ValidityLinkView = {
  status: "active" | "expired";
  event_name: string | null;
  studio_name: string | null;
  event_date: number | null;
  client_first_name: string | null;
  /** Epoch ms: the last moment the event is live. Always the end of an IST day. */
  ends_at: number | null;
  /** The gallery's style variant, for resolveTheme. */
  theme: string | null;
  reel: ValidityReel | null;
  /** Used only while there is no reel: the welcome strip's copies, then the cover. */
  fallback_photos?: string[];
  cover?: string | null;
  options: ValidityOption[];
  /** Whether each option's `price` includes GST. Absent means it does. */
  gst_inclusive?: boolean;
  guard: ValidityGuard;
  lock_held_by_other: boolean;
  billing: { email: string | null; state_code: string | null };
  gallery_url: string | null;
  key_id: string;
};

/** POST /billing/validity/:token/checkout, and the dashboard's checkout for a validity extension. */
export type ValidityCheckoutResponse = {
  razorpay_order_id: string;
  amount: number;
  key_id: string;
  checkout_timeout_seconds: number;
  order_ref: string;
};

/** POST /billing/validity/:token/confirm */
export type ValidityConfirmResponse = {
  state: "paid" | "pending" | "failed";
  ends_at: number | null;
};

/* ── Dates, always in India time ────────────────────────────────────────── */

const IST = "Asia/Kolkata";

/** The named parts of a moment on the IST wall clock. Built from parts rather
 *  than a locale's own pattern, so a phone and a server can never punctuate
 *  the same date two ways. */
function istParts(ms: number, options: Intl.DateTimeFormatOptions): Record<string, string> {
  const parts = new Intl.DateTimeFormat("en-GB", { ...options, timeZone: IST }).formatToParts(new Date(ms));
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

/** "17 Oct 2026": the date an event is live till. */
export function formatValidityDate(ms: number): string {
  const p = istParts(ms, { day: "numeric", month: "short", year: "numeric" });
  return `${p.day} ${p.month} ${p.year}`;
}

/** "3 Oct": when something happened, where the year would be noise. */
export function formatShortDay(ms: number): string {
  const p = istParts(ms, { day: "numeric", month: "short" });
  return `${p.day} ${p.month}`;
}

/** "Saturday, 14 February 2026": the day of the event, said in full. */
export function formatEventDay(ms: number): string {
  const p = istParts(ms, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return `${p.weekday}, ${p.day} ${p.month} ${p.year}`;
}

/** "4:12 PM": when a photo was taken. */
export function formatClockTime(ms: number): string {
  const p = istParts(ms, { hour: "numeric", minute: "2-digit", hour12: true });
  return `${p.hour}:${p.minute} ${String(p.dayPeriod ?? "").toUpperCase()}`;
}

/** The hour (0 to 23) the IST wall clock read when a photo was taken. */
export function istHour(ms: number): number {
  return Number(istParts(ms, { hour: "numeric", hourCycle: "h23" }).hour) % 24;
}

/**
 * Whole days still to come before the day the event closes on. An event's end
 * is always the last millisecond of a day, so on that day itself this is 0
 * (it is live till midnight), the day before it is 1, and so on.
 */
export function validityDaysLeft(endsAt: number, now: number = Date.now()): number {
  return Math.max(0, Math.ceil((endsAt - now) / (24 * 60 * 60 * 1000)) - 1);
}

/** How near the end must be before the dashboard says "Closes in..." instead
 *  of the date. The same week the reminders go out in. */
export const VALIDITY_CLOSING_SOON_DAYS = 7;

/** "Closes today" / "Closes tomorrow" / "Closes in 3 days". */
export function closesInLabel(endsAt: number, now: number = Date.now()): string {
  const days = validityDaysLeft(endsAt, now);
  if (days <= 0) return "Closes today";
  if (days === 1) return "Closes tomorrow";
  return `Closes in ${days} days`;
}

/* ── Periods and prices ─────────────────────────────────────────────────── */

/** "3 months", "1 month". */
export function periodLabel(months: number): string {
  return `${months} month${months === 1 ? "" : "s"}`;
}

/**
 * What one period costs to buy, GST included: the figure the API sends, or
 * the listed price from an API that predates the GST switch (where the listed
 * price already included GST). The API works out the tax; this only picks.
 */
export function chargedOptionPrice(option: Pick<ValidityOption, "price" | "price_with_gst">): number {
  return typeof option.price_with_gst === "number" ? option.price_with_gst : option.price;
}

/**
 * Which option is the best value: the lowest price per month, the longer
 * period on a tie. -1 when there is nothing to compare (one option, or every
 * option at the same rate). Computed, never assumed to be the longest.
 *
 * The API marks the same option with `best_value`; this is what the page uses
 * when it is handed bare { months, price } pairs.
 */
export function bestValueIndex(options: ReadonlyArray<{ months: number; price: number }>): number {
  if (options.length < 2) return -1;
  const rates = options.map((option) => (option.months > 0 ? Math.round((option.price / option.months) * 100) / 100 : Infinity));
  const lowest = Math.min(...rates);
  if (!Number.isFinite(lowest) || lowest >= Math.max(...rates)) return -1;
  return rates.lastIndexOf(lowest);
}

/* ── The guard rail ─────────────────────────────────────────────────────── */

/**
 * The sentence shown before someone pays for an event that has already been
 * extended, or null when it never has been.
 *
 * `audience` is who is reading: a Client on their link is told about "your
 * photographer", a Studio in the dashboard about "a Client".
 */
export function guardSentence(guard: ValidityGuard | null | undefined, audience: "client" | "studio"): string | null {
  const last = guard?.extended ? guard.last : null;
  if (!last) return null;
  const tail = `extended this on ${formatShortDay(last.at)} by ${periodLabel(last.months)}.`;
  if (audience === "client") {
    if (last.by === "you") return `You ${tail}`;
    if (last.by === "studio") return `Your photographer ${tail}`;
    return `${last.by_name || "Someone"} ${tail}`;
  }
  if (last.by === "studio") return `Your studio ${tail}`;
  return last.by_name ? `A Client, ${last.by_name}, ${tail}` : `A Client ${tail}`;
}

/** The line under it: where the event stands, and what paying again does. */
export function guardFollowUp(guard: ValidityGuard | null | undefined): string | null {
  const last = guard?.extended ? guard.last : null;
  if (!last) return null;
  return `It is live till ${formatValidityDate(last.to)}. Paying again adds more time on top.`;
}

/* ── The Client's page ──────────────────────────────────────────────────── */

/** "a•••@gmail.com": enough to recognise your own address, not to read it. */
export function maskEmail(email: string | null | undefined): string {
  const value = String(email ?? "").trim();
  const at = value.lastIndexOf("@");
  if (at < 1 || at === value.length - 1) return value;
  return `${value[0]}•••${value.slice(at)}`;
}

const TINTS = {
  // Pale gold, warm white, apricot, deep umber.
  morning: [244, 213, 141],
  afternoon: [255, 244, 224],
  golden: [247, 178, 122],
  night: [59, 42, 32],
} as const;

/** How strong the wash is. Under a tenth, so it colours the page without ever
 *  fighting the gallery's own theme. */
export const TIME_TINT_STRENGTH = 0.08;

/** Which part of the day an IST hour falls in. */
export function partOfDay(hour: number): keyof typeof TINTS {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  if (h >= 5 && h < 11) return "morning";
  if (h >= 11 && h < 16) return "afternoon";
  if (h >= 16 && h < 19) return "golden";
  return "night";
}

function parseHex(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const digits = match[1].length === 3 ? match[1].replace(/./g, "$&$&") : match[1];
  return [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16)) as [number, number, number];
}

/**
 * The page background behind the strip, for the photo in its centre: the
 * theme's own background with a little of that hour's light mixed in. Derived
 * from the theme rather than chosen, so it never fights it. Returns the
 * background unchanged for a colour it cannot read.
 */
export function timeOfDayTint(hour: number, background: string): string {
  const base = parseHex(background);
  if (!base) return background;
  const tint = TINTS[partOfDay(hour)];
  const mixed = base.map((channel, i) => Math.round(channel + (tint[i] - channel) * TIME_TINT_STRENGTH));
  return `rgb(${mixed[0]}, ${mixed[1]}, ${mixed[2]})`;
}

/**
 * "9 hours, start to finish", from the first photo to the last. Null unless
 * both times are known, and for anything under an hour (a number that small
 * says nothing) or over a week (a stray camera clock, not a celebration).
 */
export function daySpanLabel(firstAt: number | null | undefined, lastAt: number | null | undefined): string | null {
  if (typeof firstAt !== "number" || typeof lastAt !== "number" || lastAt <= firstAt) return null;
  const hours = Math.round((lastAt - firstAt) / (60 * 60 * 1000));
  if (hours < 1) return null;
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"}, start to finish`;
  const days = Math.ceil((lastAt - firstAt) / (24 * 60 * 60 * 1000));
  if (days > 7) return null;
  return `${days} days, start to finish`;
}

/** Alt text for one photo of the reel. */
export function reelPhotoAlt(eventName: string | null | undefined, item: Pick<ValidityReelItem, "captured_at" | "time_reliable">): string {
  const from = eventName ? `Photo from ${eventName}` : "Photo from the event";
  return item.time_reliable && typeof item.captured_at === "number" ? `${from}, ${formatClockTime(item.captured_at)}` : from;
}

/** The line after the last photo of the strip. */
export function lastPhotoLine(reel: ValidityReel | null | undefined): string | null {
  const last = reel?.items[reel.items.length - 1];
  if (!last) return null;
  return last.time_reliable && typeof last.captured_at === "number"
    ? `And that was the last one, at ${formatClockTime(last.captured_at)}.`
    : "And that was the last one.";
}

/** The caption under the favourite photo. */
export function favouriteCaption(favourite: ValidityReelFavourite): string {
  if (favourite.liked_by_client && favourite.hearts <= 1) return "One of yours";
  return favourite.liked_by_client ? "Your favourite too" : "Everyone's favourite";
}

/** A basic shape check for an email, for the page's inline error. The server
 *  validates properly; this only catches an obvious slip before the round trip. */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim()) && value.trim().length <= 254;
}
