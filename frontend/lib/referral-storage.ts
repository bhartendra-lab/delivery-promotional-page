// lib/referral-storage.ts — lib/referral.ts bound to this browser: the
// referral is kept in window.localStorage and read from location.search.
// The rules (first touch wins, 30 days, every access wrapped) all live in
// lib/referral.ts, which is pure so the studio app can share it.

import {
  captureReferralFromUrl as captureFrom,
  clearStoredReferral as clearFrom,
  getStoredReferral as getFrom,
  storeReferral as storeIn,
  type KeyValueStore,
  type StoredReferral,
} from "./referral.ts";

function browserStore(): KeyValueStore | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The kept referral, or null (see lib/referral.ts getStoredReferral). */
export function getStoredReferral(): StoredReferral | null {
  return getFrom(browserStore());
}

/** Keeps `code` unless a live referral is already kept (first touch wins). */
export function storeReferral(rawCode: unknown): StoredReferral | null {
  return storeIn(rawCode, browserStore());
}

/** Forgets the kept referral, once it is attached (or the studio already had one). */
export function clearStoredReferral(): void {
  clearFrom(browserStore());
}

/** Reads `?ref=` from this page's query string and keeps it. Called on every page load of the dashboard app. */
export function captureReferralFromUrl(): StoredReferral | null {
  return captureFrom(typeof window === "undefined" ? "" : window.location.search, browserStore());
}
