// lib/posthog-config.ts — the pure decisions behind PostHog on the studio
// dashboard (lib/posthog.ts is the browser runtime that applies them).
//
// PostHog is dashboard only (app/(dashboard)). The guest gallery never loads
// it, and nothing here runs for a guest. It is inert unless BOTH
// NEXT_PUBLIC_POSTHOG_KEY and NEXT_PUBLIC_POSTHOG_HOST are set.
//
// What it records: pageviews (path only, never the query string), the same
// funnel events as the dataLayer (lib/analytics.ts trackEvent), and a session
// replay with every input, all text and all images hidden. A person is known
// by the company id only, never a name, email or phone.

export type Consent = "granted" | "denied" | null;

type Env = Record<string, string | undefined>;

// Next.js inlines NEXT_PUBLIC_* into the browser bundle only where they are written out in full as
// `process.env.NEXT_PUBLIC_NAME`. Reading them off `process.env` as a whole object finds nothing in the
// browser, so the two are listed one by one here.
const publicEnv = (): Env => ({
  NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
  NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
});

export function posthogKey(env: Env = publicEnv()): string | null {
  return env.NEXT_PUBLIC_POSTHOG_KEY?.trim() || null;
}

/** The PostHog host without a trailing slash, or null when it is not an https URL. */
export function posthogHost(env: Env = publicEnv()): string | null {
  const raw = env.NEXT_PUBLIC_POSTHOG_HOST?.trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return null;
    return u.origin;
  } catch {
    return null;
  }
}

/** On only when both the key and the host are set (and the host is a real https URL). */
export function posthogEnabled(env: Env = publicEnv()): boolean {
  return posthogKey(env) !== null && posthogHost(env) !== null;
}

/** Our own path the browser talks to, so an ad blocker that blocks posthog.com does not drop events. */
export const INGEST_PATH = "/ingest";

/** PostHog's cloud serves static files from a separate assets host per region. Anything else uses the same host. */
export function assetsHostFor(host: string): string {
  const m = /^https:\/\/(us|eu)\.i\.posthog\.com$/.exec(host);
  return m ? `https://${m[1]}-assets.i.posthog.com` : host;
}

/** The Next.js rewrites that proxy /ingest to PostHog. Empty when PostHog is not configured. */
export function posthogRewrites(env: Env = publicEnv()): { source: string; destination: string }[] {
  const host = posthogHost(env);
  if (!host || !posthogKey(env)) return [];
  return [
    { source: `${INGEST_PATH}/static/:path*`, destination: `${assetsHostFor(host)}/static/:path*` },
    { source: `${INGEST_PATH}/:path*`, destination: `${host}/:path*` },
  ];
}

/**
 * Where tracking waits for an explicit OK: the EEA, the UK and Switzerland (lib/analytics.ts
 * CONSENT_REQUIRED_REGIONS). A browser cannot tell the region, so this goes by the device's time zone and
 * errs on the side of asking: every European zone counts. Outside it, tracking is on until the visitor opts out.
 */
export function consentRequiredForTimezone(tz: string | null | undefined): boolean {
  if (!tz) return false;
  return tz.startsWith("Europe/") || tz === "Atlantic/Reykjavik" || tz === "Atlantic/Canary" || tz === "Atlantic/Madeira" || tz === "Atlantic/Azores";
}

/** Whether PostHog may capture, given the stored choice and the device's time zone. An explicit "denied" always wins. */
export function mayCapture(stored: Consent, tz: string | null | undefined): boolean {
  if (stored === "denied") return false;
  if (stored === "granted") return true;
  return !consentRequiredForTimezone(tz);
}

/** A URL with its query string and fragment removed: a link can carry a token, a code or a campaign id. */
export function stripUrl(url: unknown): unknown {
  if (typeof url !== "string") return url;
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url.split(/[?#]/)[0];
  }
}

/** Pages where a recording must never run: they hold a sign-in token in the URL, or show the studio's guests' gallery. */
export function recordingBlockedOn(pathname: string): boolean {
  return (
    pathname.startsWith("/auth/callback") ||
    pathname.startsWith("/reset-password") ||
    /^\/dashboard\/events\/[^/]+\/preview\/?$/.test(pathname)
  );
}

/** Pageviews are recorded everywhere the dashboard is, except the bare gallery preview shown in an iframe. */
export function pageviewBlockedOn(pathname: string): boolean {
  return /^\/dashboard\/events\/[^/]+\/preview\/?$/.test(pathname);
}

/** Every event's URL fields lose their query string and fragment before they leave the browser. */
export const URL_PROPERTIES = ["$current_url", "$referrer", "$initial_current_url", "$initial_referrer", "$session_entry_url"] as const;

export function cleanEventUrls<T extends { properties?: Record<string, unknown> | null }>(event: T | null): T | null {
  if (!event?.properties) return event;
  for (const key of URL_PROPERTIES) if (key in event.properties) event.properties[key] = stripUrl(event.properties[key]);
  return event;
}

/** What session replay hides: every input, all text, every image, video and canvas. */
export const MASK_TEXT_SELECTOR = "*";
export const BLOCK_SELECTOR = "img, picture, video, canvas, svg image, [style*='background-image']";

export function posthogInitOptions(host: string, optedOutByDefault: boolean) {
  return {
    // Events go to our own domain; PostHog's own host is only used to build links in its toolbar.
    api_host: INGEST_PATH,
    ui_host: host,
    // A person profile exists only after identify() with the company id.
    person_profiles: "identified_only" as const,
    capture_pageview: false, // sent by hand on each route change, with the path only
    capture_pageleave: false,
    autocapture: false, // no clicks, no element text
    capture_dead_clicks: false,
    capture_heatmaps: false,
    capture_performance: false, // no network timings: their URLs can hold tokens
    disable_surveys: true,
    rageclick: false,
    persistence: "localStorage" as const,
    opt_out_capturing_by_default: optedOutByDefault,
    before_send: cleanEventUrls,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: MASK_TEXT_SELECTOR,
      blockSelector: BLOCK_SELECTOR,
      recordHeaders: false,
      recordBody: false,
    },
  };
}
