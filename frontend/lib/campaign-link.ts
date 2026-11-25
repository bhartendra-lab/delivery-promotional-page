// lib/campaign-link.ts — pure helpers for the campaign tracking link
// (app/w/[token]/route.ts). Kept pure so node tests can cover them.

/** First-party cookie holding the campaign recipient id that brought this browser. */
export const ACQ_COOKIE = "vy_acq";
/** 30 days: long enough for a studio that taps today and signs up next week. */
export const ACQ_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

/** A CRM recipient id: a ULID, 26 Crockford base32 characters. */
export function isRecipientToken(v: unknown): v is string {
  return typeof v === "string" && /^[0-9A-HJKMNP-TV-Z]{26}$/.test(v);
}

/** Where a tap lands: sign-in, tagged for GA4. The slug comes from the CRM campaign name. */
export function campaignLanding(campaignSlug: string | null | undefined): string {
  const slug = campaignSlug && /^[a-z0-9-]{1,60}$/.test(campaignSlug) ? campaignSlug : "whatsapp-campaign";
  const q = new URLSearchParams({ utm_source: "whatsapp", utm_medium: "campaign", utm_campaign: slug });
  return `/login?${q.toString()}`;
}
