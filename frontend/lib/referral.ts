// lib/referral.ts — the Studio referral program on the client. PURE apart
// from the browser storage it is handed (window.localStorage by default).
//
// A Studio invited by another arrives through a link such as
// /login?ref=PIXL7K2Q (or the short /r/PIXL7K2Q). The code is kept in this
// browser from the first page it lands on until onboarding attaches it to the
// new studio, across the email sign-in, the Google round trip (same origin, so
// localStorage survives it; the code is never put in OAuth state) and a closed
// tab.
//
//  - First touch wins: a second link does not replace a code already kept.
//  - It is forgotten after 30 days.
//  - Every read and write is wrapped: private windows and blocked storage
//    throw, and a referral must never break sign-in.
//
// The code is only ever attribution. It is not a coupon, and nothing here
// knows what the reward is: every figure comes from the API.

export const REFERRAL_STORAGE_KEY = "vy_referral";
/** How long a captured referral is remembered in this browser. */
export const REFERRAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Same charset as a coupon code on the backend (a Referral code is a subset of it). */
const CODE_PATTERN = /^[A-Z0-9+_-]{2,24}$/;

export type StoredReferral = { code: string; captured_at: number };

type KeyValueStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function defaultStore(): KeyValueStore | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** A typed or linked code as the backend stores it (trimmed, uppercased), or null when it cannot be one. */
export function normalizeReferralCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const code = input.trim().toUpperCase();
  return CODE_PATTERN.test(code) ? code : null;
}

/** The kept referral, or null when there is none, it is malformed, or it is older than 30 days. */
export function getStoredReferral(store: KeyValueStore | null = defaultStore(), now: number = Date.now()): StoredReferral | null {
  if (!store) return null;
  try {
    const raw = store.getItem(REFERRAL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredReferral>;
    const code = normalizeReferralCode(parsed?.code);
    const capturedAt = Number(parsed?.captured_at);
    if (!code || !Number.isFinite(capturedAt) || now - capturedAt > REFERRAL_TTL_MS) {
      store.removeItem(REFERRAL_STORAGE_KEY);
      return null;
    }
    return { code, captured_at: capturedAt };
  } catch {
    return null;
  }
}

/** Keeps `code` unless a live referral is already kept (first touch wins). Returns what is kept afterwards. */
export function storeReferral(rawCode: unknown, store: KeyValueStore | null = defaultStore(), now: number = Date.now()): StoredReferral | null {
  const existing = getStoredReferral(store, now);
  if (existing) return existing;
  const code = normalizeReferralCode(rawCode);
  if (!code || !store) return null;
  const value = { code, captured_at: now };
  try {
    store.setItem(REFERRAL_STORAGE_KEY, JSON.stringify(value));
    return value;
  } catch {
    return null;
  }
}

/** Forgets the kept referral, once it is attached (or the studio already had one). */
export function clearStoredReferral(store: KeyValueStore | null = defaultStore()): void {
  try {
    store?.removeItem(REFERRAL_STORAGE_KEY);
  } catch {
    // Nothing to do: it expires by itself.
  }
}

/** Reads `?ref=` from a query string (location.search) and keeps it. Called on every page load of the dashboard app. */
export function captureReferralFromUrl(
  search: string = typeof window === "undefined" ? "" : window.location.search,
  store: KeyValueStore | null = defaultStore(),
  now: number = Date.now(),
): StoredReferral | null {
  let ref: string | null = null;
  try {
    ref = new URLSearchParams(search).get("ref");
  } catch {
    return null;
  }
  return ref == null ? null : storeReferral(ref, store, now);
}

/* ── API shapes (/referrals) ───────────────────────────────────────────── */

/** GET /referrals/resolve/:code */
export type ReferralResolution = { valid: false } | { valid: true; studio_name: string | null; studio_logo: string | null };

export type ReferralRewardType = "event_credit" | "validity_days" | "pending";

/** GET /referrals/me */
export type MyReferrals = {
  /** Only a studio that has paid has a code to share. */
  eligible: boolean;
  program_active: boolean;
  code: string | null;
  link: string | null;
  /** What this studio gets per referral on the plan it is on now; null while the program is off. */
  rewards_for_my_plan: { type: ReferralRewardType; quantity: number | null } | null;
  /** The WhatsApp share text with the link already in it, or null. */
  share_message: string | null;
  stats: { joined: number; rewarded: number; pending: number } | null;
  referrals: Array<{
    studio_name: string | null;
    status: "joined" | "rewarded" | "reward_saved";
    reward: { type: ReferralRewardType; quantity: number } | null;
    createdAt: string;
  }>;
  referred_by: { studio_name: string | null } | null;
  /** A coupon to pre-apply at checkout: set only for a referred studio that has not paid, while the program offers one. */
  referee_coupon_code: string | null;
};

/** POST /referrals/attach */
export type AttachReferralResult = { referral_id: string; studio_name: string | null };

/* ── Copy ──────────────────────────────────────────────────────────────── */

/** The reward on this studio's current plan, as one sentence. Figures come from the API. No dashes. */
export function rewardForMyPlanSentence(reward: MyReferrals["rewards_for_my_plan"]): string | null {
  if (!reward) return null;
  const n = reward.quantity ?? 0;
  if (reward.type === "event_credit") return `You get ${n} free event${n === 1 ? "" : "s"} for every studio that joins with your code and pays.`;
  if (reward.type === "validity_days") return `Your plan runs ${n} day${n === 1 ? "" : "s"} longer for every studio that joins with your code and pays.`;
  return "Rewards are saved while your plan is not active, and added when it is active again.";
}

/** A referred studio's row on the list. */
export function referralStatusLabel(status: MyReferrals["referrals"][number]["status"]): string {
  if (status === "rewarded") return "Paid, reward added";
  if (status === "reward_saved") return "Reward saved until your plan is active";
  return "Joined";
}

/** https://wa.me/?text=... with the message (or just the link) encoded. */
export function whatsappShareUrl(message: string | null, link: string): string {
  const text = message && message.includes(link) ? message : [message, link].filter(Boolean).join(" ");
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/**
 * Under a storage plan's end date when referral days are part of it. On a plan
 * with autopay the days sit after the paid period and the charge date does
 * not move, which the line says, so nobody waits for a delayed charge.
 */
export function referralBonusDaysLine(days: number | null | undefined, autopay: boolean): string | null {
  if (!days || days <= 0) return null;
  const base = `Includes ${days} bonus day${days === 1 ? "" : "s"} from referrals.`;
  return autopay ? `${base} Your autopay date does not change.` : base;
}
