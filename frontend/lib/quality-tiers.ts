/**
 * What every quality tier is CALLED, for each audience. One module, because
 * these names appear on eight surfaces across two apps and a tier called one
 * thing while uploading and another while downloading reads as two products.
 *
 * TWO AUDIENCES, DELIBERATELY DIFFERENT:
 *
 *  - The STUDIO chose the tier at upload time and needs the exact one back:
 *    "HD (2560px)", "4K (4096px)", "Original file". They are making a storage
 *    and quality decision and the difference between a 4096px re-encode and
 *    the file they selected is the whole point.
 *
 *  - A GUEST never chose anything and has no use for the distinction. Both
 *    unwatermarked tiers are simply "High Resolution", and a gallery that has
 *    none of them shows no quality choice at all — not a disabled one. A guest
 *    should never be able to tell that something exists which they are not
 *    being given.
 *
 * WHAT "Original file" IS NOT: a RAW negative. The uploader accepts only
 * image/jpeg, png, webp and heic/heif — `.CR3`, `.NEF` and friends are not
 * selectable, cannot be decoded to build the delivery copy, and are rejected by
 * the presign validator. "Original file" means the exact file the studio picked
 * (typically the camera's JPEG), byte for byte. Copy anywhere in this codebase
 * must not imply negatives.
 */

/** The archive (unwatermarked) tiers a photo can carry. */
export type ArchiveTier = "4096" | "original";

/** Who is reading the label. */
export type TierAudience = "studio" | "guest";

/** Heading-length studio name, e.g. for a settings row title. */
export const ARCHIVE_TIER_SHORT: Record<ArchiveTier, string> = {
  "4096": "4K",
  original: "Original file",
};

/** Full studio name, including the pixel dimension where it clarifies. */
export const ARCHIVE_TIER_FULL: Record<ArchiveTier, string> = {
  "4096": "4K (4096px)",
  original: "Original file",
};

/** How each tier reads INSIDE a sentence, as a plural noun phrase. Separate
 *  from the labels because interpolating a heading into prose produces "the
 *  Original file files". */
export const ARCHIVE_TIER_FILES: Record<ArchiveTier, string> = {
  "4096": "4K (4096px) files",
  original: "original files",
};

/** The watermarked delivery copy every photo has. */
export const DELIVERY_TIER_LABEL: Record<TierAudience, string> = {
  studio: "HD (2560px)",
  // Guests have never seen "HD" used for this and read "Web" as "the one for
  // sharing", which is what it is.
  guest: "Web (2560px)",
};

/** What a guest is offered when anything in their selection is unwatermarked —
 *  one name covering both tiers, since they cannot choose between them and the
 *  download gives each photo the best copy it has. */
export const GUEST_ARCHIVE_LABEL = "High Resolution";

/**
 * The name for a set of archive tiers.
 *
 * A guest always sees the one generic name. A studio sees the exact tier when
 * the set holds one, and the generic "Full resolution" only when an event's
 * upload runs genuinely mixed them — at which point no single tier name is true.
 */
export function archiveLabelFor(tiers: ArchiveTier[], audience: TierAudience): string {
  if (audience === "guest") return GUEST_ARCHIVE_LABEL;
  if (tiers.length === 1) return ARCHIVE_TIER_FULL[tiers[0]];
  return "Full resolution";
}

/** How a set of tiers reads inside a studio-facing sentence. */
export function archiveFilesPhrase(tiers: ArchiveTier[]): string {
  if (tiers.length === 1) return ARCHIVE_TIER_FILES[tiers[0]];
  if (tiers.length === 0) return "full-resolution files";
  return "4K and original files";
}

/** The tier one photo carries, named for the studio. Drives the info panel. */
export function photoQualityLabel(archiveVariant: ArchiveTier | null | undefined): string {
  if (archiveVariant === "4096" || archiveVariant === "original") {
    return ARCHIVE_TIER_FULL[archiveVariant];
  }
  return DELIVERY_TIER_LABEL.studio;
}
