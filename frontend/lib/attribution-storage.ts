// lib/attribution-storage.ts — lib/attribution.ts bound to this browser:
// localStorage, location and document.cookie. The rules (first touch wins,
// 30 days, every access wrapped) live in lib/attribution.ts.

import {
  captureAttribution as captureFrom,
  clearStoredAttribution as clearFrom,
  getStoredAttribution as getFrom,
  type Attribution,
  type KeyValueStore,
} from "./attribution.ts";

function browserStore(): KeyValueStore | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function cookie(): string {
  try {
    return typeof document === "undefined" ? "" : document.cookie;
  } catch {
    return "";
  }
}

/** Notes this page load (tags in the URL, the tracking link cookie). Called on every dashboard page load. */
export function captureAttributionFromPage(): Attribution | null {
  if (typeof window === "undefined") return null;
  return captureFrom(window.location.search, window.location.pathname, cookie(), browserStore());
}

/** The kept touch, or null. */
export function getStoredAttribution(): Attribution | null {
  return getFrom(browserStore());
}

/** Forgets the kept touch. */
export function clearStoredAttribution(): void {
  clearFrom(browserStore());
}
