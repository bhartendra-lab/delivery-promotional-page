import type { Metadata } from "next";
import { getDeliveryLandingPageByUniqueIdentifier } from "@/lib/api";
import { EventExperience } from "./EventExperience";

/** Public site origin — used to resolve relative OG asset URLs to absolute. */
const SITE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://deliver.vyavasth.in";

/** Collapse whitespace and cap length so link previews stay tidy. */
function clamp(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

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
    const description = event.custom_message?.trim()
      ? clamp(event.custom_message, 200)
      : studio
        ? `Your photos from ${eventName}, delivered by ${studio}.`
        : `View and download your photos from ${eventName}.`;

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
      description: "View and download your event photos.",
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
