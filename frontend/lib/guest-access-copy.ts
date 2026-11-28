/**
 * Pure. The Guests list's confirm and toast copy (AccessSharingTab): how a
 * Guest is addressed, and the sentence and button for each access change.
 * Split out of the tab so the Studio app shares it through its core sync.
 */
import type { GuestAccessAction, GuestAccessLevel } from "./guest-access.ts";

/**
 * How to address a Guest in the confirm and toast copy: their first name, or
 * "this Guest" when there is nothing usable. "Guest" is the backend's default
 * name for someone who signed in with a phone number and never told us who they
 * are, so it reads as a placeholder rather than a name and is treated as one.
 */
export function addressOf(name: string): { label: string; possessive: string; isNamed: boolean } {
  const first = name.trim().split(/\s+/)[0] ?? "";
  const isNamed = first.length > 0 && first.toLowerCase() !== "guest";
  return {
    label: isNamed ? first : "this Guest",
    possessive: isNamed ? `${first}'s` : "this Guest's",
    isNamed,
  };
}

/** "this Guest is now a Client" opens a toast, so it takes a capital. */
export const sentenceStart = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export const CLIENT_ROLE_LABEL: Record<string, string> = { bride: "Bride", groom: "Groom" };

/**
 * The confirm shown under a row for the change that was picked from its menu:
 * the sentence, its tone and the button's name. Giving is not a destructive
 * act, so it gets the neutral surface; anything that takes the full gallery
 * away keeps the warning one.
 */
export function confirmCopyFor(
  action: GuestAccessAction,
  from: GuestAccessLevel,
  who: ReturnType<typeof addressOf>,
  givenByStudio: boolean,
): { tone: "warning" | "neutral"; sentence: string; confirmLabel: string } {
  if (action.to === "client") {
    return {
      tone: "neutral",
      sentence: `Mark ${who.label} as a Client? Clients always have the full gallery and keep it when the passcode changes.`,
      confirmLabel: "Mark as Client",
    };
  }
  if (action.to === "host") {
    return from === "client"
      ? {
          tone: "neutral",
          sentence: `Remove ${who.label} as a Client? They keep full access to the gallery.`,
          confirmLabel: "Remove Client",
        }
      : {
          tone: "neutral",
          sentence: `Give ${who.label} the full gallery? They will see every photo, the same as with the passcode.`,
          confirmLabel: "Give access",
        };
  }
  // To "guest". The sentence depends on what is being lost, and (for a Host)
  // on whether the passcode can undo it behind the Studio's back.
  if (from === "client") {
    return {
      tone: "warning",
      sentence: `Remove ${who.possessive} full access? They will also stop being a Client and go back to their own photos and public folders.`,
      confirmLabel: "Remove access",
    };
  }
  return {
    tone: "warning",
    sentence: givenByStudio
      ? `Remove ${who.possessive} full access? They will go back to their own photos and public folders.`
      : `Remove ${who.possessive} full access? They can unlock it again with the passcode. Change the passcode on the Share tab to keep them out.`,
    confirmLabel: "Remove access",
  };
}

/* ── what a Guest of this event can see, said once ──────────────────────── */

/**
 * The four situations a gallery can be in. They follow what the backend does
 * for a Guest who has not entered the passcode (get-media: their own face
 * matches only with face search on, plus the public folders; nothing else), so
 * the words below are a description of the code, never a promise the code does
 * not keep.
 */
export type GuestAccessCase =
  /** Every photo sits in a public folder: everyone already sees everything. */
  | "all_public"
  /** Face search on, some photos private: their own matches, plus public folders. */
  | "face_search"
  /** Face search off, some public folders: the public folders only. */
  | "public_only"
  /** Face search off, nothing public: nothing, until the passcode. */
  | "passcode_only";

export type GuestAccessDescription = {
  case: GuestAccessCase;
  /** The one line under the link: what a Guest meets at the other end. */
  summary: string;
  /** The longer sentence behind the info icon on the link card's title. */
  tooltip: string;
  /** What the passcode card says the passcode does. */
  passcode: string;
  /** The quiet note on the Guests panel. Always present, never contradicts the rest. */
  guestsNote: string;
};

/**
 * One source of truth for the four places the Access & Sharing tab describes
 * who sees what: the link card's summary and tooltip, the passcode card, and
 * the Guests panel's note. They all come from here, so the page cannot say two
 * things at once.
 *
 * Inputs are the ones the tab already holds:
 *  - `faceSearchOn`: the event's selfie search switch;
 *  - `hasPublicPhotos`: a public folder holds at least one photo;
 *  - `everyPhotoPublic`: every photo sits in a public folder (allMediaIsPublic);
 *  - `fullAccessRedundant`: fullAccessIsRedundant, which is `everyPhotoPublic`
 *    and no family-only full-resolution download left to gain. When
 *    `everyPhotoPublic` is true and this is false, the passcode still decides
 *    who may download the full-resolution files.
 *
 * The passcode shows everything in every case. Clients, and Guests the studio
 * marked with full access, see everything without it.
 */
export function describeGuestAccess({
  faceSearchOn,
  hasPublicPhotos,
  everyPhotoPublic,
  fullAccessRedundant,
}: {
  faceSearchOn: boolean;
  hasPublicPhotos: boolean;
  everyPhotoPublic: boolean;
  fullAccessRedundant: boolean;
}): GuestAccessDescription {
  const hasFullAccessNote = "Clients and anyone with full access see every photo.";

  if (everyPhotoPublic) {
    const selfie = faceSearchOn ? " They can also take a selfie to find their own." : "";
    return {
      case: "all_public",
      summary: fullAccessRedundant
        ? "Every photo is in a public folder, so every guest already sees all photos."
        : "Every guest already sees all photos. The passcode only matters for full-resolution downloads.",
      tooltip: `One link for everyone. Guests sign in and see all photos, because every photo is in a public folder.${selfie}${
        fullAccessRedundant ? "" : " The family passcode still decides who can download the full-resolution files."
      }`,
      passcode: fullAccessRedundant
        ? "Not needed to view photos, because every photo is already public."
        : "Every photo is already public, so the passcode now only lets family download the full-resolution files.",
      guestsNote: fullAccessRedundant
        ? "Every photo is in a public folder, so every guest already sees the full gallery. Full access options are hidden."
        : "Every photo is in a public folder, so every guest already sees the full gallery. Clients and anyone with full access can also download the full-resolution files.",
    };
  }

  if (faceSearchOn) {
    return {
      case: "face_search",
      summary: hasPublicPhotos
        ? "Each guest sees the photos they appear in and your public folders. The passcode shows every photo."
        : "Each guest sees the photos they appear in. The passcode shows every photo.",
      tooltip: hasPublicPhotos
        ? "One link for everyone. Guests sign in and can take a selfie to find their own photos, and they always see your public folders. The family passcode unlocks every photo."
        : "One link for everyone. Guests sign in and take a selfie to find their own photos. The family passcode unlocks every photo.",
      passcode: hasPublicPhotos
        ? "Share it separately with family. It unlocks every photo, not just their own and the public folders."
        : "Share it separately with family. It unlocks every photo, not just their own.",
      guestsNote: `${hasFullAccessNote} Other guests see ${hasPublicPhotos ? "the photos they appear in and your public folders" : "the photos they appear in"}.`,
    };
  }

  if (hasPublicPhotos) {
    return {
      case: "public_only",
      summary: "Guests see your public folders. The passcode shows every photo.",
      tooltip: "One link for everyone. Guests sign in and see your public folders. The family passcode unlocks every photo.",
      passcode: "Share it separately with family. It unlocks every photo, not just the public folders.",
      guestsNote: `${hasFullAccessNote} Other guests see your public folders.`,
    };
  }

  return {
    case: "passcode_only",
    summary: "Guests need the passcode to see any photos.",
    tooltip: "One link for everyone. Guests sign in, but see nothing until they enter the family passcode. Make a folder public to show something without it.",
    passcode: "Guests cannot see any photos without it, so share it with everyone who should see the gallery.",
    guestsNote: `Guests see nothing until they enter the passcode. ${hasFullAccessNote}`,
  };
}

/**
 * The confirm text for making a new passcode. It says what really happens
 * (see regenerate-family-passcode): the old code stops working, Guests who
 * got in with it lose that access, and anyone the studio gave full access to,
 * or a Client, keeps it.
 */
export const REGENERATE_PASSCODE_CONFIRM =
  "The current passcode stops working. Guests who got full access with it lose that access until they enter the new one. Clients, and anyone you gave full access yourself, keep theirs.";
