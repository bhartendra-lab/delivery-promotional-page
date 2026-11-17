import { buildGalleryHit, galleryPageTemplate } from "@/lib/gallery-analytics";

/**
 * POST /api/gallery-view — the server half of the guest-gallery page counter.
 * See lib/gallery-analytics.ts for the privacy design.
 *
 * The browser sends only a pathname. This route reduces it to a template
 * (never trusting the client to have done so), and forwards one anonymous
 * page_view to Google Analytics' Measurement Protocol with a fresh random
 * client id. The guest's IP address, user agent and cookies are never
 * forwarded, because Google is called from here, not from the guest's browser.
 *
 * Always answers 204, including when analytics is not configured or Google is
 * unreachable: a beacon has nobody waiting on it.
 */
const MAX_BODY_CHARS = 512;

export async function POST(request: Request) {
  const measurementId = process.env.NEXT_PUBLIC_GALLERY_GA_ID;
  const apiSecret = process.env.GALLERY_GA_API_SECRET;
  if (!measurementId || !apiSecret) return new Response(null, { status: 204 });

  try {
    const body = (await request.text()).slice(0, MAX_BODY_CHARS);
    const template = galleryPageTemplate(body);
    const hit = buildGalleryHit(template, crypto.randomUUID());
    const url =
      "https://www.google-analytics.com/mp/collect" +
      `?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(hit),
    });
  } catch {
    // Nothing to report to a beacon.
  }
  return new Response(null, { status: 204 });
}
