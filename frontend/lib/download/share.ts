/**
 * Saving through the native share sheet — the iPhone / iPad save path.
 *
 * On every other platform a download is an `<a download>` click and the browser
 * does the rest. On iOS that same click does not save a photo anywhere a Guest
 * will find it: real Safari files it under Downloads in the Files app, and the
 * browser the Control Centre code scanner opens (and most in-app browsers)
 * NAVIGATES the whole gallery away to a bare "JPEG image · Open in Preview"
 * page, from which coming back reloads the gallery from scratch. Guests read
 * that as "download failed", and they are right.
 *
 * The share sheet is the one route that behaves the same in all of them: it
 * opens over the gallery, offers "Save Image" (→ Photos), and returns the Guest
 * to exactly where they were.
 *
 * It needs a user gesture. Safari honours the tap for a short while afterwards,
 * so a share fired once a small photo has been fetched usually goes through —
 * and when it doesn't (`"blocked"`), the caller holds the fetched files and asks
 * for one more tap, on which the share is fired synchronously.
 *
 * No aliased imports — unit-tested under `node --test`.
 */

import { coldFallback, fetchPhoto, nameFromUrl } from "../media-actions.ts";

export type ShareOutcome =
  /** The Guest picked something in the sheet — almost always "Save Image". */
  | "shared"
  /** The Guest closed the sheet. An outcome, not a failure. */
  | "dismissed"
  /** The browser refused because the tap was too long ago. Ask for another. */
  | "blocked";

type ShareNavigator = {
  share?: (data: { files: File[] }) => Promise<void>;
  canShare?: (data: { files: File[] }) => boolean;
};

const shareNavigator = (): ShareNavigator | null =>
  typeof navigator === "undefined" ? null : (navigator as unknown as ShareNavigator);

/** Whether this browser will take these exact files in its share sheet. */
export function canShareThese(files: File[]): boolean {
  const nav = shareNavigator();
  if (typeof nav?.share !== "function" || typeof nav.canShare !== "function") return false;
  try {
    return nav.canShare({ files });
  } catch {
    return false;
  }
}

/** Whether this browser can share image files at all. The probe file is never
 *  shared; it only has to be the kind of thing a gallery hands over. */
export function canShareFiles(): boolean {
  if (typeof File === "undefined") return false;
  return canShareThese([new File([new Uint8Array(1)], "photo.jpg", { type: "image/jpeg" })]);
}

/**
 * Open the share sheet. MUST be reached without an `await` between it and the
 * tap when called from a "Save" button — see the module comment.
 */
export async function shareFiles(files: File[]): Promise<ShareOutcome> {
  const nav = shareNavigator();
  if (typeof nav?.share !== "function") throw new Error("Share sheet unavailable");
  try {
    await nav.share({ files });
    return "shared";
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return "dismissed";
    // A second tap while the sheet is still opening. The first share is the
    // one that counts; this one has nothing to report.
    if (err instanceof DOMException && err.name === "InvalidStateError") return "dismissed";
    if (err instanceof DOMException && err.name === "NotAllowedError") return "blocked";
    throw err;
  }
}

const IMAGE_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  gif: "image/gif",
};

/**
 * Pure. The MIME type to share a photo under. iOS only offers "Save Image" for
 * a file it recognises as an image, and a storage host that answers
 * `application/octet-stream` would otherwise lose the Guest that button.
 */
export function imageTypeFor(name: string, responseType: string): string {
  if (/^image\//i.test(responseType)) return responseType;
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? "";
  return IMAGE_TYPES[ext] ?? "image/jpeg";
}

/** Wrap fetched bytes as a shareable file. */
export function toShareFile(blob: Blob, name: string): File {
  return new File([blob], name, { type: imageTypeFor(name, blob.type) });
}

/**
 * Fetch one photo as a shareable file. Retries once against the cold-storage
 * host, exactly as `downloadImage` does. Throws when it cannot be fetched.
 */
export async function fetchImageFile(url: string, filename?: string): Promise<File> {
  const name = filename ?? nameFromUrl(url);
  let res = await fetchPhoto(url);
  if (!res.ok) {
    const fallback = coldFallback(url);
    if (fallback !== url) res = await fetch(fallback, { cache: "no-store" });
  }
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return toShareFile(await res.blob(), name);
}
