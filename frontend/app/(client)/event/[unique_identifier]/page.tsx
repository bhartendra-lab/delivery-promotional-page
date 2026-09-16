import type { Metadata } from "next";
import { headers } from "next/headers";
import { getDeliveryLandingPageByUniqueIdentifier } from "@/lib/api";
import { EventExperience } from "./EventExperience";

/** Fallback origin when the request host can't be read. */
const FALLBACK_SITE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://deliver.vyavasth.in";

/**
 * The origin this gallery was actually opened on — the studio's custom domain
 * when that is how the guest arrived, ours otherwise.
 *
 * `metadataBase` resolves the relative `openGraph.url` below, so a fixed
 * NEXT_PUBLIC_BASE_URL meant every link preview of a studio-branded gallery
 * advertised `deliver.vyavasth.in` in its og:url — on WhatsApp, iMessage,
 * Slack, exactly where the studio's own domain matters most. Reading the host
 * makes the preview match the link that was shared.
 *
 * This route is already dynamic, so `headers()` costs no static rendering.
 */
async function requestOrigin(): Promise<string> {
  try {
    const host = (await headers()).get("host");
    if (!host) return FALLBACK_SITE_URL;
    // Cloudflare terminates TLS for every custom hostname it serves, so
    // anything that is not local dev is https.
    const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host);
    return `${isLocal ? "http" : "https"}://${host}`;
  } catch {
    return FALLBACK_SITE_URL;
  }
}

/** Shared link-preview blurb — explains the face-scan gallery flow. */
const LINK_PREVIEW_DESCRIPTION =
  "Upload your selfie and our AI will find all your photos from this event.";

/**
 * Server-rendered link-preview metadata for shared gallery URLs.
 *
 * Non-JS crawlers (WhatsApp, iMessage, Slack, etc.) read these tags from the
 * initial HTML, so the event is fetched here via the public endpoint. Studio
 * branding fields only surface when the studio enabled `include_company_branding`.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ unique_identifier: string }>;
}): Promise<Metadata> {
  let { unique_identifier } = await params;
  unique_identifier = decodeURIComponent(unique_identifier);

  const siteUrl = await requestOrigin();

  try {
    const { deliveryLandingPage: event } = await getDeliveryLandingPageByUniqueIdentifier(unique_identifier);

    const branded = event.include_company_branding === true;
    const studio = branded ? event.company_name?.trim() || "" : "";
    const eventName = event.event_name?.trim() || "Your Gallery";

    const title = studio ? `${eventName} · ${studio}` : eventName;
    const description = LINK_PREVIEW_DESCRIPTION;

    const imageUrl = event.background_image || (branded ? event.company_logo : undefined) || undefined;
    const ogImages = imageUrl ? [{ url: imageUrl, alt: title }] : undefined;

    return {
      title,
      description,
      metadataBase: new URL(siteUrl),
      // Chrome must not offer/auto-apply translation here — translating the page
      // re-parents text nodes and crashes React's next structural commit. See
      // the `translate="no"` note in app/(client)/layout.tsx.
      other: { google: "notranslate" },
      openGraph: {
        type: "website",
        title,
        description,
        siteName: studio || "Vyavasth",
        url: `/event/${encodeURIComponent(unique_identifier)}`,
        images: ogImages,
      },
      twitter: {
        card: imageUrl ? "summary_large_image" : "summary",
        title,
        description,
        images: imageUrl ? [imageUrl] : undefined,
      },
    };
  } catch {
    // Bad slug or backend hiccup — fall back to neutral, non-leaky defaults.
    return {
      title: "Your Gallery",
      description: LINK_PREVIEW_DESCRIPTION,
      other: { google: "notranslate" },
    };
  }
}

/**
 * Guest-facing client gallery — `/event/<unique_identifier>`.
 *
 * The live, authenticated gallery experience: animated loader → Google sign-in →
 * face scan → themed lounge + gallery. Event data is fetched client-side so the
 * brand loader can animate while it resolves; a bad slug renders not-found.
 */
export default async function EventPage({
  params,
}: {
  params: Promise<{ unique_identifier: string }>;
}) {
  let { unique_identifier } = await params;
  unique_identifier = decodeURIComponent(unique_identifier);
  return <EventExperience uniqueIdentifier={unique_identifier} />;
}
