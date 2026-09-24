/**
 * Every guest-facing string in "Find your friends group", in one place.
 *
 * The consent notice is load-bearing, not decoration: the words below are the
 * same words the backend records as `ff-v1.0` in `consent_logs`
 * (`FRIEND_FINDER_NOTICE_TEXT` in `src/utils/friend-finder.utils.js`). That row
 * exists so an old consent can be tied back to exactly what was on screen, so
 * the two copies must never drift — if this text changes it is a NEW version in
 * both places, never an edit in one.
 *
 * No em dashes anywhere, deliberately: the backend's notice string has none,
 * and a stray one here would make the two texts differ.
 */

/** Bump together with the backend's FRIEND_FINDER_POLICY_VERSION. */
export const FRIEND_FINDER_POLICY_VERSION = "ff-v1.0";

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
  title: "Find your friends group",
  body: "See the photos you are in with your friends, all in one place. You and a friend see your photos together once you have both said yes.",
  smallPrint: "Your name and face picture are visible to guests at this wedding. You can change this anytime.",
  continueLabel: "Continue",
  declineLabel: "No thanks",
} as const;

/** The two sharing choices, in the order they are shown. "No thanks" is the
 *  text button beside Continue, not a third card, so it is not listed here. */
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
    title: "Add your selfie to find your friends group",
    subtitle: "See every photo you are in with your people",
  },
  undecided: {
    title: "Find your friends group",
    subtitle: "See every photo you are in with your people",
  },
  chosenNoGroup: {
    title: "Find your friends",
    subtitle: "See every photo you are in with your people",
  },
} as const;

/** Shown above the people list to a guest who answered "No thanks". */
export const DECLINED_BANNER =
  "You chose No thanks. You can still ask people, or change this in settings.";

/** The backend's daily cap on requests refused the add (HTTP 429). */
export const REQUEST_LIMIT_TOAST =
  "You have sent a lot of requests today. Try again tomorrow.";

/** Anything else the network did. Deliberately one line and recoverable. */
export const ACTION_FAILED_TOAST = "Couldn't save that. Please try again.";
