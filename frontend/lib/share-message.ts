/**
 * The words a gallery link is sent with: the studio's invite on Access &
 * Sharing, and the Client's own copies of it in Guest Control.
 *
 * One function for the invite, used by both screens, so a bride forwarding the
 * link from her phone sends exactly what the studio sends (and a fix to one is
 * a fix to both). The studio's text is pinned byte for byte by the test: it
 * moved here unchanged from AccessSharingTab.
 */

/** The invite that goes with the gallery link. */
export function galleryInviteMessage({
  eventName,
  url,
  faceSearchOn,
}: {
  eventName: string;
  url: string;
  faceSearchOn: boolean;
}): string {
  // Guests sign in with WhatsApp, not Google — the old message said Google, and
  // rewriting it for the switch is the moment to fix that too.
  return `Namaste! The photos from ${eventName} are ready. 🎉

${
    faceSearchOn
      ? "Open the gallery and sign in. Take a quick selfie to see every photo you're in:"
      : "Open the gallery and sign in to see them:"
  }
${url}`;
}

/**
 * The family passcode, for the Client to send to family. Uses the event name
 * as the studio typed it ("Priya & Rahul’s Wedding"): the guest page does not
 * get the couple's names separately.
 */
export function passcodeShareMessage({ passcode, eventName, url }: { passcode: string; eventName: string; url: string | null }): string {
  const what = eventName.trim() ? ` from ${eventName.trim()}` : "";
  return url ? `Use passcode ${passcode} to see all photos${what}: ${url}` : `Use passcode ${passcode} to see all photos${what}.`;
}

export type TextShareResult = "shared" | "copied" | "cancelled" | "failed";

/**
 * Share text through the native sheet, falling back to the clipboard. The
 * WhatsApp and Instagram in-app browsers often have no Web Share at all, so
 * every Share button in Guest Control ends up as Copy there, with its toast.
 */
export async function shareTextOrCopy(text: string, title?: string): Promise<TextShareResult> {
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  if (nav?.share) {
    try {
      await nav.share({ text, title });
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
      // Anything else (NotAllowedError in an in-app browser): copy instead.
    }
  }
  return copyText(text);
}

export async function copyText(text: string): Promise<"copied" | "failed"> {
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}
