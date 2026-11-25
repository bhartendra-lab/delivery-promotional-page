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

import { applyPosthogConsent, capturePosthog } from "./posthog.ts";
import { posthogEnabled } from "./posthog-config.ts";

export const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID;

/** True when anything is configured that the cookie notice has to cover: GTM, or PostHog. */
export const analyticsConfigured = (): boolean => Boolean(GTM_ID) || posthogEnabled();

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
 * Where tracking waits for "OK": the EEA, the UK and Switzerland, whose rules
 * require opt-in. Everywhere else (India, our market) it is on by default and
 * the banner is a notice with an opt-out. Google applies a region-specific
 * default over the general one whatever the order. Revisit before the DPDP
 * consent obligations start (13 May 2027).
 */
export const CONSENT_REQUIRED_REGIONS = [
  "AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE","IT","LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE",
  "IS","LI","NO","GB","CH",
];

/**
 * Runs before GTM loads: denied by default in CONSENT_REQUIRED_REGIONS,
 * granted elsewhere, then a saved choice (OK or opt out) is re-applied. Kept
 * as a string so it can be inlined (it must run before any tag fires).
 */
export const CONSENT_BOOTSTRAP_SCRIPT = `
window.dataLayer=window.dataLayer||[];
function gtag(){dataLayer.push(arguments)}
gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied',region:${JSON.stringify(CONSENT_REQUIRED_REGIONS)},wait_for_update:500});
gtag('consent','default',{ad_storage:'granted',ad_user_data:'granted',ad_personalization:'granted',analytics_storage:'granted'});
try{var c=localStorage.getItem('${CONSENT_KEY}');if(c==='granted'||c==='denied'){gtag('consent','update',{ad_storage:c,ad_user_data:c,ad_personalization:c,analytics_storage:c})}}catch(e){}
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
  // PostHog follows the same choice: Opt out stops capturing and the replay at once.
  applyPosthogConsent(choice);
}

type EventParams = Record<string, unknown>;

// GTM's data model keeps values pushed earlier, so a `location` set by one
// event would leak into the next event that maps it. Every event therefore
// starts by clearing the shared parameter keys (undefined resets a key).
const SHARED_PARAM_KEYS = ["location", "method", "plan", "purpose", "step", "event_type", "plan_kind", "tier", "photo_count_bucket", "channel", "language", "format", "scope", "type", "coupon"] as const;

/**
 * Push a custom event to the dataLayer. GTM decides what to do with it (GA4
 * event, Meta Pixel event, ...), and PostHog gets the same event. A no-op when analytics isn't configured, and
 * it never throws, so tracking can't break a purchase or sign-in flow.
 */
export function trackEvent(event: string, params: EventParams = {}) {
  // The same event and the same non-personal parameters go to PostHog (a no-op unless it is set up and allowed).
  capturePosthog(event, params);
  try {
    if (!GTM_ID || typeof window === "undefined") return;
    const cleared = Object.fromEntries(SHARED_PARAM_KEYS.map((k) => [k, undefined]));
    (window.dataLayer ||= []).push({ ...cleared, event, ...params });
  } catch {
    // Analytics must never break the product.
  }
}
