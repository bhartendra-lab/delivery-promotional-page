/**
 * The Google review link a gallery may show, or null when it shows none.
 *
 * One resolution for every consumer. In the Guest gallery a single `reviewUrl`
 * feeds every review affordance (the pop-up, both top bars, the outro), so a
 * null here removes all of them at once; the dashboard's gallery design preview
 * reads the same function, so it can never preview a review ask the real
 * gallery will not make.
 *
 * Deliberately dependency-free so it runs under `node --test`.
 */
export function resolveGoogleReviewUrl({
  placeId,
  gmbLink,
  enabledGlobally,
  enabledForEvent,
}: {
  placeId?: string | null;
  gmbLink?: string | null;
  /** The company's `google_review_enabled`. */
  enabledGlobally?: boolean | null;
  /** The event's resolved `show_google_review` preference. */
  enabledForEvent: boolean;
}): string | null {
  // `!== false` rather than a truthiness check is deliberate: the company field
  // is absent on a company cached before it shipped, and absent must read as ON.
  if (enabledGlobally === false || !enabledForEvent) return null;
  if (placeId) return `https://search.google.com/local/writereview?placeid=${placeId}`;
  return gmbLink || null;
}
