// lib/gallery-analytics.ts — privacy-first page-view counting for GUEST gallery
// pages (app/(client)/…).
//
// This is deliberately NOT the GTM / Meta setup the studio dashboard uses.
// Guests' faces and event photos must never feed an ad network, so galleries
// get one thing only: an aggregate count of page views. To make that a
// structural guarantee rather than a configuration one, the guest's browser
// never talks to Google at all:
//
//   guest browser --beacon--> POST /api/gallery-view (our own server)
//                               --Measurement Protocol--> Google Analytics
//
// What that means in practice:
//   - no Google script loads on the page, and nothing is written to cookies or
//     local/session storage,
//   - Google never sees the guest's IP address, user agent, screen or language,
//   - every hit carries a fresh random client id, so no two hits (or guests) can
//     be linked, and there is no User-ID,
//   - the URL is reduced to a template ("/event/:id") on the SERVER before it is
//     sent, so no event identifier or memory-lane token can reach Google even if
//     the browser were tampered with,
//   - ads personalisation is switched off on every hit.
//
// The galleries use their own GA4 data stream. Nothing happens unless
// NEXT_PUBLIC_GALLERY_GA_ID is set at build time AND GALLERY_GA_API_SECRET is
// set on the server.

export const GALLERY_GA_ID = process.env.NEXT_PUBLIC_GALLERY_GA_ID;

/** Where beacons are sent from a page served on a studio's own domain. */
const GALLERY_ENDPOINT_PATH = "/api/gallery-view";
const VYAVASTH_ORIGIN = "https://deliver.vyavasth.in";

/** What every gallery hit reports as its host, whatever domain it was served on. */
const REPORTED_ORIGIN = VYAVASTH_ORIGIN;

/**
 * Reduces a gallery pathname to a template with every identifier removed.
 * Anything unrecognised collapses to "/other" rather than being sent as-is.
 */
export function galleryPageTemplate(pathname: string): string {
  const parts = String(pathname).split("/").filter(Boolean);
  if (parts[0] === "event") {
    if (parts.length === 1) return "/event";
    const rest = parts.slice(2).join("/");
    if (rest === "") return "/event/:id";
    if (rest === "friends") return "/event/:id/friends";
    if (rest === "auth/callback") return "/event/:id/auth/callback";
    return "/event/:id/other";
  }
  if (parts[0] === "memory-lane") return parts.length > 1 ? "/memory-lane/:token" : "/memory-lane";
  if (parts[0] === "error") {
    return `/error/${parts[1] === "qr-not-assigned" || parts[1] === "qr-not-found" ? parts[1] : "other"}`;
  }
  return "/other";
}

/**
 * The exact body sent to Google's Measurement Protocol. Takes a template (never
 * a raw path) and a fresh client id, and carries nothing else.
 */
export function buildGalleryHit(template: string, clientId: string) {
  return {
    client_id: clientId,
    non_personalized_ads: true,
    events: [
      {
        name: "page_view",
        params: {
          page_location: `${REPORTED_ORIGIN}${template}`,
          page_title: template,
          engagement_time_msec: 100,
        },
      },
    ],
  };
}

/** Where a beacon should go from the current host. */
function endpointFor(hostname: string): string {
  const own = hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".vyavasth.in");
  return own ? GALLERY_ENDPOINT_PATH : `${VYAVASTH_ORIGIN}${GALLERY_ENDPOINT_PATH}`;
}

/**
 * Sends one page-view beacon to our own server. The body is only the pathname
 * (the server re-templates it), as text/plain so no CORS preflight is needed on
 * a studio's own domain. Never throws, so it cannot break a gallery.
 */
export function sendGalleryPageView(pathname: string) {
  try {
    if (!GALLERY_GA_ID || typeof window === "undefined" || !navigator.sendBeacon) return;
    navigator.sendBeacon(endpointFor(window.location.hostname), new Blob([pathname], { type: "text/plain" }));
  } catch {
    // Analytics must never break the gallery.
  }
}
