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
  // The legacy link is Studio-typed text, so it is checked on the way out as
  // well as on the way in: only a Google address is ever shown to a Guest.
  // A listing link (not the review box itself) still passes, so a Studio that
  // saved one before this check existed keeps its button.
  const checked = parseGoogleReviewLink(gmbLink);
  if (checked.status === "ok") return checked.url;
  if (checked.status === "listing") return checked.url;
  return null;
}

export type GoogleReviewLinkCheck =
  /** Opens the review box directly. `url` is the normalised form to store. */
  | { status: "ok"; url: string; placeId: string | null }
  /** A real Google link, but it opens the business listing, not the review box. */
  | { status: "listing"; url: string }
  | { status: "invalid"; reason: "empty" | "not-a-link" | "not-google" };

const REVIEW_PATH = /^\/r\/[A-Za-z0-9_-]+\/review\/?$/;
const PLACE_ID = /^[A-Za-z0-9_-]{10,300}$/;
// Google addresses a Studio is likely to paste by mistake. Anything else is
// rejected outright rather than shown to Guests.
const LISTING_HOSTS = new Set([
  "g.page",
  "g.co",
  "maps.app.goo.gl",
  "goo.gl",
  "share.google",
  "maps.google.com",
  "business.google.com",
  "google.com",
  "google.co.in",
]);

/**
 * Classifies whatever a Studio pastes as its Google review link.
 *
 * Accepts the two forms that open the review box directly (the
 * `g.page/r/<id>/review` link from Business Profile → Ask for reviews, and
 * `search.google.com/local/writereview?placeid=`), recognises the common wrong
 * answers (the Maps listing or profile link) so the UI can explain the
 * difference, and rejects every non-Google address. Dependency-free so the
 * same rules are testable under `node --test`; the backend keeps a mirror in
 * `google-review-link.utils.js`, so change both together.
 */
export function parseGoogleReviewLink(input?: string | null): GoogleReviewLinkCheck {
  const raw = (input ?? "").trim();
  if (!raw) return { status: "invalid", reason: "empty" };
  if (/\s/.test(raw)) return { status: "invalid", reason: "not-a-link" };

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return { status: "invalid", reason: "not-a-link" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { status: "invalid", reason: "not-a-link" };
  if (url.username || url.password || url.port) return { status: "invalid", reason: "not-google" };

  const host = url.hostname.toLowerCase().replace(/^www\./, "");

  if (host === "g.page" && REVIEW_PATH.test(url.pathname)) {
    return { status: "ok", url: `https://g.page${url.pathname.replace(/\/$/, "")}`, placeId: null };
  }
  if (host === "search.google.com" && url.pathname === "/local/writereview") {
    const id = url.searchParams.get("placeid") ?? "";
    if (PLACE_ID.test(id)) {
      return { status: "ok", url: `https://search.google.com/local/writereview?placeid=${id}`, placeId: id };
    }
  }
  if (LISTING_HOSTS.has(host)) return { status: "listing", url: url.toString() };
  return { status: "invalid", reason: "not-google" };
}

/**
 * The sentence that tells a Studio why a pasted review link will not do, or
 * null when it is fine (or still empty). One wording for Settings and the
 * onboarding step, so the two can never explain the same mistake differently.
 */
export function googleReviewLinkMessage(check: GoogleReviewLinkCheck): string | null {
  if (check.status === "ok") return null;
  if (check.status === "listing") {
    return "This opens your Google listing, not the review box. Use the link from Business Profile > Ask for reviews.";
  }
  if (check.reason === "empty") return null;
  if (check.reason === "not-a-link") return "That doesn't look like a link. Paste the whole review link.";
  return "That isn't a Google link. Paste the review link from your Google Business Profile.";
}
