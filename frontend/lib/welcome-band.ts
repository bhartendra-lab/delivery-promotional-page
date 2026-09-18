/**
 * The one sentence on the gallery cover, and what tapping it does.
 *
 * Extracted from the covers themselves because there are TWO of them —
 * `DesktopCover` and `CoverMasthead` — showing the same line at different
 * sizes. They used to carry a copy each of the same ternary, which is exactly
 * the shape that drifts: a fix to one reads as deliberate divergence in the
 * other. Both now render whatever this returns.
 *
 * Pure, so the whole copy table is testable without a DOM (see the test file).
 */

/** What tapping the band does. The caller owns the navigation — this module
 *  knows nothing about tabs, sheets or scroll positions. */
export type WelcomeBandAction = "mine" | "all" | "scan" | "passcode";

export type WelcomeBandInput = {
  /** The event's `face_search_enabled` preference. */
  faceSearchOn: boolean;
  /** This Guest has a validated selfie on their profile. */
  hasSelfie: boolean;
  /**
   * Photos this Guest was matched to, or NULL while the search is still
   * running. The distinction is the whole point: a returning Guest with a cold
   * cache used to read "no matches yet" for the second or two before their real
   * count landed, which is a small lie told at the worst possible moment.
   */
  matchCount: number | null;
  /** The Guest has entered the passcode (or the Studio gave them access). */
  unlocked: boolean;
  /** The event has at least one photo in a public folder. */
  hasPublicPhotos: boolean;
  /** Photos this Guest can actually reach, or null until that is known. */
  accessibleCount: number | null;
  /** Absent for a Guest who has not given a real name — the greeting simply
   *  drops the name rather than greeting "Guest". */
  guestName?: string;
};

export type WelcomeBand = {
  /** Plain text before the highlight. */
  lead: string;
  /** The part painted in the brand colour. Empty when the line has none. */
  highlight: string;
  /** Plain text after the highlight. Usually empty. */
  trail: string;
  action: WelcomeBandAction;
};

/** "Welcome back, Priya" / "Welcome back" — a Guest with no real name is
 *  greeted without one, exactly as the covers have always done. */
function greet(word: "Welcome" | "Welcome back", guestName?: string): string {
  const name = guestName?.trim();
  return name ? `${word}, ${name}` : word;
}

/** "1,204 photos" / "1 photo". House style: en-IN grouping. */
function photos(count: number): string {
  return `${count.toLocaleString("en-IN")} photo${count === 1 ? "" : "s"}`;
}

/**
 * The cover line for one Guest, in one gallery, right now.
 *
 * The branches are ordered by what the Guest can actually DO, not by how the
 * data arrived: face search off removes the whole idea of "my photos", so it is
 * settled first; after that a selfie is what separates a count from an
 * invitation to scan.
 */
export function resolveWelcomeBand(input: WelcomeBandInput): WelcomeBand {
  const { faceSearchOn, hasSelfie, matchCount, unlocked, hasPublicPhotos, accessibleCount, guestName } =
    input;

  if (!faceSearchOn) {
    // Full access: everything in the gallery is theirs to browse. The number
    // is left out until it is known rather than shown as a placeholder zero —
    // "Browse all photos" is true at every moment, "Browse all 0 photos" is not.
    if (unlocked) {
      return {
        lead: `${greet("Welcome", guestName)}. Browse all `,
        highlight: accessibleCount === null ? "photos" : photos(accessibleCount),
        trail: "",
        action: "all",
      };
    }
    // No passcode, but the Studio has made a folder public: there is a real
    // gallery to look at, so the line points at it rather than at the lock.
    if (hasPublicPhotos) {
      return {
        lead: `${greet("Welcome", guestName)}. Browse the `,
        highlight: "highlights",
        trail: "",
        action: "all",
      };
    }
    // Nothing public and no passcode: the passcode IS the gallery. This band
    // sits behind the required passcode sheet, so it is mostly a statement of
    // where they are rather than something they will tap.
    return {
      lead: `${greet("Welcome", guestName)}. `,
      highlight: "Enter the passcode",
      trail: " to see the photos",
      action: "passcode",
    };
  }

  // Face search on, but this Guest skipped it (or has not scanned yet). The
  // line is the invitation, and it is the brand-coloured part because it is the
  // one thing worth doing on this screen.
  if (!hasSelfie) {
    return {
      lead: `${greet("Welcome", guestName)}. `,
      highlight: "Find the photos you’re in",
      trail: "",
      action: "scan",
    };
  }

  // Searching. Says so, instead of reporting a count it does not have yet.
  if (matchCount === null) {
    return {
      lead: `${greet("Welcome back", guestName)}. Finding your photos…`,
      highlight: "",
      trail: "",
      action: "mine",
    };
  }

  if (matchCount > 0) {
    return {
      lead: `${greet("Welcome back", guestName)}. You’re in `,
      highlight: photos(matchCount),
      trail: "",
      action: "mine",
    };
  }

  // Searched, found nothing. "Welcome" rather than "Welcome back": there is no
  // warmth to claim here, and My Photos has its own screen explaining why.
  return {
    lead: `${greet("Welcome", guestName)}. No matches yet`,
    highlight: "",
    trail: "",
    action: "mine",
  };
}
