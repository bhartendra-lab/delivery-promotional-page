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
      confirmLabel: "Confirm",
    };
  }
  return {
    tone: "warning",
    sentence: givenByStudio
      ? `Remove ${who.possessive} full access? They will go back to their own photos and public folders.`
      : `Remove ${who.possessive} full access? They can unlock it again with the passcode. Regenerate the passcode if you need to keep them out.`,
    confirmLabel: "Confirm",
  };
}
