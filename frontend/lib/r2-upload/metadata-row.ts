/**
 * One create-media row, built from a persisted upload record.
 *
 * Extracted from engine.ts `flushOneMetadataChunk` so the web and the Vyavasth
 * Studio app send identical JSON: same fields, same omit-when-absent rules,
 * same key order. Pure (type-only imports, which are erased at runtime).
 *
 * Every field is read off the RECORD, never off a live run: a flush can happen
 * on a later mount with no active run, when the record is all that's left of
 * the upload (see the persistence notes on UploadRecord).
 */

import { archiveMetadataFor } from "./archive.ts";
import { captureFieldsForMetadata } from "./capture-time.ts";
import { cameraForMetadata } from "./camera-identity.ts";

/** The row shape (`MediaMetadataItem` in lib/api.ts, kept structural so this
 *  module stays import-free). */
export type MediaMetadataRow = {
  url: string;
  type: "image";
  custom_folder_id: string;
  media_id: string;
  filename: string;
  width?: number;
  height?: number;
  size?: number;
  captured_at?: string;
  captured_at_source?: "exif" | "file_time";
  thumbnail_url?: string;
  thumbnail_size?: number;
  archive_url?: string;
  archive_variant?: "4096" | "original";
  archive_size?: number;
  archive_checksum?: string;
  /** SES-01: the upload session this photo belongs to (one run on the web). */
  upload_session_id?: string;
  /** SES-01: the camera that took it, from its EXIF. The backend turns this
   *  into the studio's device; a client never sends a device id. */
  camera?: { make: string; model: string; serial?: string };
};

/** The record fields a row is built from (a structural subset of
 *  `UploadRecord` in types.ts, which this module does not import because that
 *  file carries DOM types). */
export type MetadataRowRecord = {
  /** `${bookingId}__${fingerprint}`, sent as `media_id`. */
  id: string;
  customFolderId: string;
  filename: string;
  fileLastModified: number;
  publicUrl?: string;
  width?: number;
  height?: number;
  capturedAt?: number;
  capturedAtSource?: "exif" | "file_time";
  thumbnailUrl?: string;
  archiveVariant?: "4096" | "original";
  archiveUrl?: string;
  archiveSize?: number;
  archiveChecksum?: string;
  uploadSessionId?: string;
  cameraMake?: string;
  cameraModel?: string;
  cameraSerial?: string;
};

/**
 * @param record An `uploaded` record with a `publicUrl` (the caller filters).
 * @param sizes  Byte sizes the engine measured: `size` of the delivery view,
 *   `thumbnailSize` of the grid thumbnail. Either may be unknown.
 */
export function buildMediaMetadataRow(
  record: MetadataRowRecord,
  sizes: { size?: number; thumbnailSize?: number },
): MediaMetadataRow {
  const r = record;
  return {
    url: r.publicUrl as string,
    type: "image" as const,
    custom_folder_id: r.customFolderId,
    media_id: r.id,
    filename: r.filename,
    ...(r.width != null ? { width: r.width } : {}),
    ...(r.height != null ? { height: r.height } : {}),
    ...(sizes.size != null ? { size: sizes.size } : {}),
    // When the photo was TAKEN — what the guest gallery orders by. Read off
    // the RECORD, never off the compressor, for the same reason the archive
    // fields below are. A record compressed before this shipped carries no
    // capture time, so its file timestamp is sent instead.
    ...captureFieldsForMetadata(r),
    // The 480px grid derivative. Omitted wholesale when its PUT failed —
    // uploadOne clears the record's thumbnailUrl and its size in that case,
    // so the backend records no thumbnail and readers fall back to `url`.
    ...(r.thumbnailUrl ? { thumbnail_url: r.thumbnailUrl } : {}),
    ...(r.thumbnailUrl && sizes.thumbnailSize != null ? { thumbnail_size: sizes.thumbnailSize } : {}),
    // The archive copy. Omitted WHOLESALE unless its upload succeeded —
    // uploadOne clears archiveUrl and the size/checksum on failure, so the
    // backend records no archive rather than a URL for an object that isn't
    // there. `archive_variant` rides with the URL because the two are only
    // ever meaningful together.
    ...archiveMetadataFor({
      variant: r.archiveVariant,
      archiveUrl: r.archiveUrl,
      archiveSize: r.archiveSize,
      archiveChecksum: r.archiveChecksum,
    }),
    // Where the photo came from (SES-01), both omitted when absent so a row
    // from a record written before SES-01 is byte-identical to before. Read
    // off the RECORD like everything above: the session id is stamped and
    // persisted before the first attempt, so every retry and every later
    // mount sends the same one.
    ...(r.uploadSessionId ? { upload_session_id: r.uploadSessionId } : {}),
    ...cameraForMetadata(r),
  };
}
