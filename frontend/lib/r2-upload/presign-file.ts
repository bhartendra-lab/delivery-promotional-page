/**
 * One entry of a presign request's `files` array
 * (`POST /deliverables/presign-uploads/:bookingId`).
 *
 * Extracted from engine.ts (`requestPresignBatch` and `refreshPresign` built
 * the same object inline) so the web and the Vyavasth Studio app sign uploads
 * with identical JSON, key order included. Pure.
 */

import { UPLOAD_SPEC, type SpecVariant } from "./spec.ts";

/** `PresignRequest` in lib/api.ts, kept structural so this module stays import-free. */
export type PresignFile = {
  filename: string;
  content_type: "image/jpeg";
  custom_folder_id: string;
  with_thumbnail: boolean;
  variant: SpecVariant;
};

/**
 * @param record   The record being signed (its filename and folder).
 * @param variant  The run's quality tier. Sent on EVERY request, including
 *   "2560" and "original" (which gets no archive URL back): it is what makes
 *   the plan gate fire at the first batch, rather than at the first multipart
 *   create, so a studio without a storage plan, or uploading Original into a
 *   pay per event event, finds out before any bytes move.
 * @param hasThumb Whether a thumbnail exists to PUT. Always sent as a boolean:
 *   a file whose thumbnail step failed signs one URL, not two.
 */
export function buildPresignFile(
  record: { filename: string; customFolderId: string },
  variant: SpecVariant,
  hasThumb: boolean,
): PresignFile {
  return {
    filename: record.filename,
    content_type: UPLOAD_SPEC.image.outputType,
    custom_folder_id: record.customFolderId,
    with_thumbnail: hasThumb,
    variant,
  };
}
