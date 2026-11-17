// lib/analytics.ts — Google Tag Manager + Consent Mode helpers.
//
// Used ONLY by the studio dashboard route group (app/(dashboard)/layout.tsx).
// Guest gallery pages (app/(client)/…, app/e/…) never load GTM: guests' faces
// and event photos must not feed an ad network.
//
// GA4 and the Meta Pixel are configured inside the GTM container (shared with
// vyavasth.in), not here. This file only pushes events to the dataLayer and
// manages the visitor's consent choice. Nothing loads unless
// NEXT_PUBLIC_GTM_ID is set (inlined at build time).
//
// NEVER put personal data in event params: no names, emails, phone numbers,
// couple/event names or photo content.

export const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID;

export const CONSENT_KEY = "vyavasth-consent";
/** Window event the "Cookie settings" control fires to reopen the banner. */
export const OPEN_CONSENT_EVENT = "vyavasth:open-consent";

export type ConsentChoice = "granted" | "denied";

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

// Consent Mode requires gtag-style pushes (an `arguments` object, not an array).
// `args` is only there to type the call sites; the `arguments` object is pushed.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function gtag(...args: unknown[]) {
  // eslint-disable-next-line prefer-rest-params
  (window.dataLayer ||= []).push(arguments);
}

/**
 * Runs before GTM loads: every storage type starts denied, then a previously
 * saved "granted" choice is re-applied. Kept as a string so it can be inlined
 * (it must run before any tag fires).
 */
export const CONSENT_BOOTSTRAP_SCRIPT = `
window.dataLayer=window.dataLayer||[];
function gtag(){dataLayer.push(arguments)}
gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied',wait_for_update:500});
try{if(localStorage.getItem('${CONSENT_KEY}')==='granted'){gtag('consent','update',{ad_storage:'granted',ad_user_data:'granted',ad_personalization:'granted',analytics_storage:'granted'})}}catch(e){}
`.trim();

export function getStoredConsent(): ConsentChoice | null {
  try {
    const v = window.localStorage.getItem(CONSENT_KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch {
    return null;
  }
}

/** Persist the visitor's choice and tell GTM about it. */
export function setConsent(choice: ConsentChoice) {
  try {
    window.localStorage.setItem(CONSENT_KEY, choice);
  } catch {
    // Storage blocked: the choice still applies for this page view.
  }
  gtag("consent", "update", {
    ad_storage: choice,
    ad_user_data: choice,
    ad_personalization: choice,
    analytics_storage: choice,
  });
}

type EventParams = Record<string, unknown>;

// GTM's data model keeps values pushed earlier, so a `location` set by one
// event would leak into the next event that maps it. Every event therefore
// starts by clearing the shared parameter keys (undefined resets a key).
const SHARED_PARAM_KEYS = ["location", "method", "plan", "purpose"] as const;

/**
 * Push a custom event to the dataLayer. GTM decides what to do with it (GA4
 * event, Meta Pixel event, ...). A no-op when analytics isn't configured, and
 * it never throws, so tracking can't break a purchase or sign-in flow.
 */
export function trackEvent(event: string, params: EventParams = {}) {
  try {
    if (!GTM_ID || typeof window === "undefined") return;
    const cleared = Object.fromEntries(SHARED_PARAM_KEYS.map((k) => [k, undefined]));
    (window.dataLayer ||= []).push({ ...cleared, event, ...params });
  } catch {
    // Analytics must never break the product.
  }
}
