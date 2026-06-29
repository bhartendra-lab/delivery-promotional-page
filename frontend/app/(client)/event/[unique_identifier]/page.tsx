import type { Metadata } from "next";
import { getDeliveryLandingPageByUniqueIdentifier } from "@/lib/api";
import { EventExperience } from "./EventExperience";

/** Public site origin — used to resolve relative OG asset URLs to absolute. */
const SITE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://deliver.vyavasth.in";

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
      metadataBase: new URL(SITE_URL),
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
