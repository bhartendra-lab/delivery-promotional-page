import type { Company } from "./types";

/**
 * Where a studio's guest-facing gallery links live.
 *
 * Client-side mirror of the backend's `galleryBaseUrlFor` / `hasLiveCustomDomain`
 * (backend: src/utils/domain.utils.js). The backend uses it to mint links into
 * emails and the printed-QR redirect; this is what the DASHBOARD uses so the
 * link a studio reads on Access & Sharing, and the one the Copy button puts on
 * their clipboard, is the same URL their guests will actually receive.
 *
 * Before this existed the dashboard always built links from
 * NEXT_PUBLIC_BASE_URL, so a studio with a live custom domain would see
 * deliver.vyavasth.in on screen while the gallery email said
 * gallery.theirstudio.com — the same gallery, two different links, and the one
 * they were most likely to hand out by hand was the wrong one.
 *
 * If you change the rule here, change it there in the same commit.
 */

/**
 * True when this company's custom domain is live enough to put in front of a
 * guest. BOTH conditions matter, exactly as on the backend: `custom_domain` is
 * only ever written on promotion, but a domain that later regressed to
 * `moved`/`failed` keeps its value while the studio fixes DNS — and a link on a
 * hostname that no longer resolves is worse than one on ours.
 */
export function hasLiveCustomDomain(company: Company | null | undefined): boolean {
  return Boolean(company?.custom_domain) && company?.custom_domain_status === "active";
}

/** The Vyavasth domain, trailing slash stripped. The fallback for everything. */
function vyavasthBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
}

/**
 * The base URL this company's gallery links should use — their own domain when
 * one is live, ours otherwise, which is the case for every company today.
 */
export function galleryBaseUrl(company: Company | null | undefined): string {
  return hasLiveCustomDomain(company) ? `https://${company!.custom_domain}` : vyavasthBaseUrl();
}

/**
 * The full public gallery URL for one landing page.
 *
 * Returns null when there is no slug — a booking whose landing page hasn't been
 * created yet has no gallery to link to, and callers must hide the affordance
 * rather than offer a URL that 404s.
 */
export function galleryUrlFor(
  company: Company | null | undefined,
  uniqueIdentifier: string | null | undefined,
): string | null {
  if (!uniqueIdentifier) return null;
  return `${galleryBaseUrl(company)}/event/${uniqueIdentifier}`;
}
