/**
 * Single-photo downloads — the path that deliberately does NOT go through the
 * bulk pre-flight.
 *
 * No modal-with-a-plan, no picker, no ZIP: a direct download that works on every
 * browser including iOS, at any tier the viewer is entitled to. One 50 MB
 * original is never "too large for the device", so the size rule that governs
 * bulk downloads has nothing to decide here.
 *
 * What a single photo DOES share with a bulk download is the quality choice, and
 * that is what this module exists to keep in one place: the same entitlement
 * rule, the same fallback when the server declines, and the same tier names, at
 * every surface that can download one photo — a grid tile, a lightbox, a
 * one-item selection.
 *
 * Archive objects already carry `Content-Disposition: attachment`, set at upload
 * time, so a plain save lands correctly in Files on iOS and in Downloads on
 * Android with no special handling.
 *
 * No aliased imports — this module is unit-tested under `node --test`.
 */

import { downloadImage } from "../media-actions.ts";

export type ArchiveTier = "4096" | "original";
export type SinglePhotoTier = "2560" | ArchiveTier;

/** One photo, as any of the download surfaces knows it. */
export type SinglePhotoSource = {
  /** `Media.media_id` — the fingerprint the archive endpoint keys on. */
  mediaId: string;
  /** The 2560px delivery URL. Always present, and the fallback for everything. */
  url: string;
  /** Preferred save name for the delivery copy. Absent falls back to the URL. */
  name?: string;
  /** The archive tier this photo carries, if any. */
  archiveVariant?: ArchiveTier | null;
};

/** Mints one photo's archive URL. Null when the server declines, or when the
 *  photo turns out to have no archive object. */
export type SingleArchiveUrlResolver = (
  mediaId: string,
) => Promise<{ url: string; filename: string } | null>;

/**
 * The archive tier to OFFER for this photo, or null for no choice at all.
 *
 * Both conditions have to hold, and neither is a UI detail:
 *  - `archiveAccess` is the server's answer for this viewer. For a guest it
 *    folds in `allow_download` and the studio's `archive_download_access`; for a
 *    studio member on their own dashboard it is simply true. The
 *    archive-download-urls endpoint re-derives it on every call, so this only
 *    decides whether a choice is worth showing.
 *  - the photo must actually have an archive object. A booking uploaded at QHD
 *    has none, and neither does a photo whose archive step failed.
 *
 * Returning null means the download affordance stays a single tap, exactly as
 * it behaved before tiers existed.
 */
export function offeredTierForPhoto(
  photo: SinglePhotoSource,
  { archiveAccess, canResolve }: { archiveAccess: boolean; canResolve: boolean },
): ArchiveTier | null {
  if (!archiveAccess || !canResolve) return null;
  return photo.archiveVariant === "4096" || photo.archiveVariant === "original"
    ? photo.archiveVariant
    : null;
}

/**
 * Save one photo at the requested tier.
 *
 * A declined or missing archive falls back to the delivery copy rather than
 * failing: the guest asked for this photo, and handing them the watermarked
 * version is a better answer than handing them nothing. This is the same
 * fallback the bulk engines apply per item as `degraded`.
 */
export async function downloadSinglePhoto(
  photo: SinglePhotoSource,
  tier: SinglePhotoTier,
  resolveArchiveUrl?: SingleArchiveUrlResolver,
): Promise<void> {
  if (tier !== "2560" && resolveArchiveUrl) {
    const archive = await resolveArchiveUrl(photo.mediaId);
    if (archive) {
      await downloadImage(archive.url, archive.filename);
      return;
    }
  }
  await downloadImage(photo.url, photo.name);
}
