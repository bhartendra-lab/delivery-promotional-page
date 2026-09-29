/**
 * Every guest-facing string in "Find my people", in one place.
 *
 * The consent notice is load-bearing, not decoration: the words below are the
 * same words the backend records as `ff-v1.2` in `consent_logs`
 * (`FRIEND_FINDER_NOTICE_TEXT` in `src/utils/friend-finder.utils.js`). That row
 * exists so an old consent can be tied back to exactly what was on screen, so
 * the two copies must never drift — if this text changes it is a NEW version in
 * both places, never an edit in one.
 *
 * No em dashes anywhere, deliberately: the backend's notice string has none,
 * and a stray one here would make the two texts differ.
 */

/** Bump together with the backend's FRIEND_FINDER_POLICY_VERSION. */
export const FRIEND_FINDER_POLICY_VERSION = "ff-v1.2";

/**
 * Longest name the backend will keep (`GUEST_NAME_MAX`). The lounge's intake
 * sheet caps its name field at this, so a Guest cannot type a name the server
 * will then refuse.
 */
export const GUEST_NAME_MAX = 40;

/**
 * The placeholder a Guest carries when they never gave a name. The directory
 * aggregation drops these rows, so a Guest called "Guest" is invisible to
 * everyone else at the event — which is why the lounge's intake sheet asks
 * every such Guest for a real one before anything else.
 */
export const PLACEHOLDER_NAME = "Guest";

/**
 * The preference sheet, asked on the My People tab (ff-v1.2).
 *
 * Minimal on purpose: a title, two bare options and ONE line. That line is not
 * decoration either — it is the disclosure that makes the answer a valid
 * consent (what other guests see), and, with the old "to stop sharing" line
 * gone, the only notice that the answer can be withdrawn. Shared by the
 * settings sheet, which asks the same question.
 */
export const FRIENDS_SHEET_COPY = {
  title: "Who can search common photos with you",
  smallPrint: "Your name and face picture are visible to guests at this wedding. You can change this anytime.",
  continueLabel: "Continue",
} as const;

/**
 * The two sharing choices, in the order they are shown. Labels only: the
 * per-option explanations went with ff-v1.1.
 *
 * There is no third one and no decline button. A guest who does not want this
 * closes the sheet, which records NOTHING — no choice and no consent row — and
 * that is a truer statement of "they did not answer" than storing a refusal
 * would be. Withdrawing after answering is choosing "Only people I choose" and
 * removing everyone, which "You can change this anytime" leaves them free to do.
 */
export const FRIENDS_CHOICES = [
  { value: "everyone", label: "Everyone at this wedding" },
  { value: "selected", label: "Only people I choose" },
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
