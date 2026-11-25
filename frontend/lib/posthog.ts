// lib/posthog.ts — PostHog in the browser, for the studio dashboard only.
// The decisions live in lib/posthog-config.ts. Everything here is a safe no-op
// when PostHog is not configured, on the server, and before it has loaded, and
// nothing throws: analytics must never break the product.

import type { PostHog } from "posthog-js";
import { mayCapture, pageviewBlockedOn, posthogEnabled, posthogHost, posthogInitOptions, posthogKey, recordingBlockedOn, stripUrl, type Consent } from "./posthog-config.ts";

let client: PostHog | null = null;
let loading: Promise<PostHog | null> | null = null;
let identified: string | null = null;
let pendingConsent: Exclude<Consent, null> | null = null;
let recordingBlocked = false;

const timezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return null;
  }
};

/** Loads PostHog once. `stored` is the visitor's saved cookie choice (or null when they have made none). */
export function initPosthog(stored: Consent): Promise<PostHog | null> {
  if (typeof window === "undefined" || !posthogEnabled()) return Promise.resolve(null);
  if (client) return Promise.resolve(client);
  loading ??= import("posthog-js")
    .then(({ default: posthog }) => {
      const choice = pendingConsent ?? stored;
      posthog.init(posthogKey()!, posthogInitOptions(posthogHost()!, !mayCapture(choice, timezone())));
      client = posthog;
      if (recordingBlocked) posthog.stopSessionRecording();
      return posthog;
    })
    .catch(() => null);
  return loading;
}

/** The visitor chose OK or Opt out in the cookie banner. */
export function applyPosthogConsent(choice: Exclude<Consent, null>): void {
  try {
    pendingConsent = choice;
    if (!client) return; // applied when it loads
    if (choice === "granted") client.opt_in_capturing();
    else client.opt_out_capturing();
  } catch {
    /* never break the page */
  }
}

/** The same event the dataLayer gets, with the same non-personal parameters. */
export function capturePosthog(event: string, params: Record<string, unknown> = {}): void {
  try {
    if (!client) return;
    const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined));
    client.capture(event, clean);
  } catch {
    /* never break the page */
  }
}

/** A pageview with the path only. Skipped on the bare gallery preview. */
export function capturePosthogPageview(pathname: string): void {
  try {
    if (!client || pageviewBlockedOn(pathname)) return;
    client.capture("$pageview", { $current_url: stripUrl(`${window.location.origin}${pathname}`) });
  } catch {
    /* never break the page */
  }
}

/** Starts or stops the replay for this page (it never runs where the URL holds a sign-in token). */
export function setPosthogRecordingFor(pathname: string): void {
  try {
    recordingBlocked = recordingBlockedOn(pathname);
    if (!client) return;
    if (recordingBlocked) client.stopSessionRecording();
    else if (client.has_opted_out_capturing?.() !== true) client.startSessionRecording();
  } catch {
    /* never break the page */
  }
}

/** Knows the person by the company id and nothing else. No name, email or phone is ever sent. */
export function syncPosthogIdentity(companyId: string | null): void {
  try {
    if (!client) return;
    if (companyId && companyId !== identified) {
      client.identify(companyId);
      identified = companyId;
    } else if (!companyId && identified) {
      client.reset();
      identified = null;
    }
  } catch {
    /* never break the page */
  }
}
