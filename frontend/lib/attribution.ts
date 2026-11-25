// lib/attribution.ts — where a studio came from, kept in this browser until
// sign up. PURE: the storage is handed in (lib/attribution-storage.ts binds the
// browser's localStorage, location and cookie), like lib/referral.ts.
//
// On every dashboard page load we note the marketing tags in the URL (utm_*,
// the ad click ids gclid / gbraid / wbraid) and the campaign recipient id from
// the vy_acq cookie (set by the /w/<id> tracking link). Right after sign up
// the kept touch is sent once to the backend (POST /onboarding/attribution),
// which saves it on the studio write-once.
//
//  - First touch wins: a later link does not replace a touch already kept. The
//    one exception is the recipient id, which fills in only when the kept touch
//    has none (the cookie can arrive on a later page of the same visit).
//  - It is forgotten after 30 days.
//  - Only a tag, a click id or a recipient id counts as a touch. A plain visit
//    keeps nothing.
//  - The landing path is the path only, never the query string.
//  - Every read and write is wrapped: private windows and blocked storage
//    throw, and tracking must never break sign in.
//
// Nothing personal is kept here, and none of it goes to a third party: it goes
// to our own backend only.

export const ATTRIBUTION_STORAGE_KEY = "vy_attribution";
export const ATTRIBUTION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** The first-party cookie set by the /w tracking link (lib/campaign-link.ts). */
export const ACQ_COOKIE_NAME = "vy_acq";

const TEXT_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
const CLICK_ID_KEYS = ["gclid", "gbraid", "wbraid"] as const;
const UTM_MAX = 100;
const CLICK_ID_MAX = 200;
const LANDING_PATH_MAX = 200;
const RECIPIENT_ID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export type Attribution = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
  campaign_recipient_id?: string;
  landing_path?: string;
  /** Milliseconds since 1970, the browser's clock at the first touch. */
  first_touch_at: number;
};

export type KeyValueStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function clean(value: string | null, max: number): string {
  if (!value) return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanClickId(value: string | null): string {
  if (value && value.trim().length > CLICK_ID_MAX) return "";
  const v = clean(value, CLICK_ID_MAX);
  return /^[A-Za-z0-9_\-.=]+$/.test(v) ? v : "";
}

/** The recipient id out of a `Cookie` header string (document.cookie), or "" when there is none or it is malformed. */
export function recipientFromCookie(cookie: string): string {
  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === ACQ_COOKIE_NAME) {
      const v = rest.join("=").trim();
      return RECIPIENT_ID.test(v) ? v : "";
    }
  }
  return "";
}

/** The touch a page load shows: tags from `search`, the recipient from `cookie`. Null when there is nothing to keep. */
export function touchFromPage(search: string, pathname: string, cookie: string, now: number): Attribution | null {
  const params = new URLSearchParams(search);
  const touch: Attribution = { first_touch_at: now };
  let found = false;
  for (const key of TEXT_KEYS) {
    const v = clean(params.get(key), UTM_MAX);
    if (v) {
      touch[key] = v;
      found = true;
    }
  }
  for (const key of CLICK_ID_KEYS) {
    const v = cleanClickId(params.get(key));
    if (v) {
      touch[key] = v;
      found = true;
    }
  }
  const recipient = recipientFromCookie(cookie);
  if (recipient) {
    touch.campaign_recipient_id = recipient;
    found = true;
  }
  if (!found) return null;
  const path = pathname.startsWith("/") && !pathname.startsWith("//") ? pathname.split(/[?#]/)[0].slice(0, LANDING_PATH_MAX) : "";
  if (path) touch.landing_path = path;
  return touch;
}

/** The kept touch, or null when there is none, it is malformed, or it is older than 30 days. */
export function getStoredAttribution(store: KeyValueStore | null, now: number = Date.now()): Attribution | null {
  if (!store) return null;
  try {
    const raw = store.getItem(ATTRIBUTION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Attribution> | null;
    const at = Number(parsed?.first_touch_at);
    if (!parsed || typeof parsed !== "object" || !Number.isFinite(at) || now - at > ATTRIBUTION_TTL_MS) {
      store.removeItem(ATTRIBUTION_STORAGE_KEY);
      return null;
    }
    return { ...parsed, first_touch_at: at };
  } catch {
    return null;
  }
}

/**
 * Notes this page load. Keeps the touch unless a live one is already kept
 * (first touch wins); fills in the recipient id when the kept touch has none.
 * Returns what is kept afterwards.
 */
export function captureAttribution(
  search: string,
  pathname: string,
  cookie: string,
  store: KeyValueStore | null,
  now: number = Date.now(),
): Attribution | null {
  const existing = getStoredAttribution(store, now);
  const touch = touchFromPage(search, pathname, cookie, now);
  if (existing) {
    if (!existing.campaign_recipient_id && touch?.campaign_recipient_id && store) {
      const merged = { ...existing, campaign_recipient_id: touch.campaign_recipient_id };
      try {
        store.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(merged));
      } catch {
        /* a touch kept is a courtesy, never a requirement */
      }
      return merged;
    }
    return existing;
  }
  if (!touch || !store) return null;
  try {
    store.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(touch));
  } catch {
    return null;
  }
  return touch;
}

/** Forgets the kept touch, once the backend has it (or already had one). */
export function clearStoredAttribution(store: KeyValueStore | null): void {
  try {
    store?.removeItem(ATTRIBUTION_STORAGE_KEY);
  } catch {
    /* nothing to do */
  }
}
