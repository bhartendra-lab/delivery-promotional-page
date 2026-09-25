/**
 * Every guest-facing string in "Find my people", in one place.
 *
 * The consent notice is load-bearing, not decoration: the words below are the
 * same words the backend records as `ff-v1.1` in `consent_logs`
 * (`FRIEND_FINDER_NOTICE_TEXT` in `src/utils/friend-finder.utils.js`). That row
 * exists so an old consent can be tied back to exactly what was on screen, so
 * the two copies must never drift — if this text changes it is a NEW version in
 * both places, never an edit in one.
 *
 * No em dashes anywhere, deliberately: the backend's notice string has none,
 * and a stray one here would make the two texts differ.
 */

/** Bump together with the backend's FRIEND_FINDER_POLICY_VERSION. */
export const FRIEND_FINDER_POLICY_VERSION = "ff-v1.1";

/**
 * Longest name the backend will keep (`GUEST_NAME_MAX`). The sign-in field caps
 * at this, so a Guest cannot type a name the server will then refuse.
 */
export const GUEST_NAME_MAX = 40;

/**
 * The placeholder a Guest carries when they never gave a name. The directory
 * aggregation drops these rows, so a Guest called "Guest" is invisible to
 * everyone else at the event — which is why sign-in now insists on a real one.
 */
export const PLACEHOLDER_NAME = "Guest";

export const FRIENDS_SHEET_COPY = {
  title: "Find my people",
  body: "See the photos you are in with your people, all in one place. You and another guest see your photos together once you have both said yes.",
  smallPrint:
    "Your name and face picture are visible to guests at this wedding. You can change your answer at any time, and to stop sharing altogether, choose Only people I choose and remove everyone from your list.",
  continueLabel: "Continue",
} as const;

/**
 * The two sharing choices, in the order they are shown.
 *
 * There is no third one and no decline button. A guest who does not want this
 * closes the sheet, which records NOTHING — no choice and no consent row — and
 * that is a truer statement of "they did not answer" than storing a refusal
 * would be. Withdrawing after answering is choosing "Only people I choose" and
 * removing everyone, which is what the small print above points at.
 */
export const FRIENDS_CHOICES = [
  {
    value: "everyone",
    label: "Everyone at this wedding",
    subtitle: "Anyone here can add you straight away",
  },
  {
    value: "selected",
    label: "Only people I choose",
    subtitle: "You pick who, and they are asked to add you back",
  },
] as const;

/** The lounge card, one entry per state. `has_group` is built at the call site
 *  because it interpolates a live count. */
export const FRIENDS_CARD_COPY = {
  noSelfie: {
    title: "Add your selfie to find my people",
    subtitle: "See every photo you are in with your people",
  },
  undecided: {
    title: "Find my people",
    subtitle: "See every photo you are in with your people",
  },
  chosenNoGroup: {
    title: "Find my people",
    subtitle: "See every photo you are in with your people",
  },
} as const;

/** The backend's daily cap on requests refused the add (HTTP 429). */
export const REQUEST_LIMIT_TOAST =
  "You have sent a lot of requests today. Try again tomorrow.";

/** Anything else the network did. Deliberately one line and recoverable. */
export const ACTION_FAILED_TOAST = "Couldn't save that. Please try again.";
