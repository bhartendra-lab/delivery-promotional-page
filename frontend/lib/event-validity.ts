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

/**
 * One photo of the reel. It carries no date and no time: a camera's clock is
 * whatever its owner last set it to, so the page shows nothing read from one.
 * The reel arrives folder by folder, in the Studio's own order of folders, and
 * in the order the photos were taken inside each.
 */
export type ValidityReelItem = {
  url: string;
  width: number | null;
  height: number | null;
  /** The name of the folder the Studio filed it in ("Haldi", "Reception").
   *  Null for a photo in no folder; absent from an API that does not send it yet. */
  folder?: string | null;
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
  };
};

/**
 * Which memory lane page a link opens. It follows the event's own plan.
 *
 *   "renew"     a pay per event event: the page ends by asking the Client to
 *               pay for more time.
 *   "keepsake"  a storage plan event: nothing is on sale. The page ends with a
 *               review ask and a referral nudge, under the Studio's branding.
 */
export type MemoryLaneMode = "renew" | "keepsake";

/** A Studio as its Clients' keepsake page shows it. Sent for "keepsake" only. */
export type ValidityStudio = {
  /** The default (dark) logo, for light surfaces. */
  logo: string | null;
  /** The light logo, for dark surfaces. Often absent. */
  logo_light: string | null;
  website: string | null;
  /** Profile and listing links, keyed by platform (lib/social-platforms.ts). */
  social_links: Record<string, string>;
  /** The number a WhatsApp chat with the Studio opens on. */
  whatsapp_number: string | null;
  /** The four inputs of the gallery's own review rule (lib/google-review.ts),
   *  so this page asks for a review exactly when the gallery would. */
  google_place_id: string | null;
  gmb_link: string | null;
  google_review_enabled: boolean;
  show_google_review: boolean;
};

/** GET /billing/validity/:token */
export type ValidityLinkView = {
  status: "active" | "expired";
  /** Absent from an API that predates storage plan pages: every link was a renewal. */
  mode?: MemoryLaneMode;
  /** The Studio's branding and contact, on a keepsake. */
  studio?: ValidityStudio;
  event_name: string | null;
  studio_name: string | null;
  /** Epoch ms. The event's own date, as the Studio entered it; with none
   *  entered, the day its photos were first uploaded. Never a camera's date. */
  event_date: number | null;
  client_first_name: string | null;
  /** Epoch ms: the last moment the gallery is open. On a renewal, the end of
   *  the event's validity (always the end of an IST day). On a keepsake, when
   *  the gallery closes, or null when no end is in sight. */
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
  /** The Razorpay key a renewal pays with. Null on a keepsake, which takes no payment. */
  key_id: string | null;
  /** "Wedding", "Birthday" and so on, as the Studio set it. The page takes its
   *  words, colours and music from it (lib/memory-lane.ts). Null or absent
   *  when it was never set, or from an API that does not send it yet. */
  event_type?: string | null;
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

/** Alt text for one photo of the reel: where it is from, and its folder when it has one. */
export function reelPhotoAlt(eventName: string | null | undefined, folder?: string | null): string {
  const from = eventName ? `Photo from ${eventName}` : "Photo from the event";
  const name = (folder ?? "").trim();
  return name ? `${from}, ${name}` : from;
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
