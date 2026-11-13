/**
 * Browser sharing for the messages in `share-message.ts` (moved out of it so
 * that module stays pure and the studio app shares it; the app uses React
 * Native's Share and expo-clipboard instead).
 */

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
