/**
 * Records whose bytes are no longer in storage.
 *
 * A record is "uploaded" when its files are on R2 (and B2) but create-media has
 * not confirmed its gallery row yet. It can stay that way in IndexedDB long
 * after the run that wrote it: an interrupted run, a reload mid-save. If the
 * studio then deletes those photos from the gallery, deleting them removes the
 * objects too, and the leftover record now points at files that are gone.
 * create-media refuses such a row (422 MEDIA_OBJECT_MISSING, naming each one
 * in `missing_media_ids`). Without handling, the engine re-sent the same
 * refused chunk on every run and every mount, never uploading the bytes again,
 * so a re-upload of the same files "finished" with an empty folder (prod,
 * 2026-11-27).
 *
 * Handling: each named record goes back to `pending` with every trace of its
 * old upload dropped, so the next pass compresses and uploads it from the
 * source file like a new one.
 *
 * Pure, so it is unit-testable without IndexedDB or the network.
 */
import type { UploadRecord } from "./types.ts";

export const MEDIA_OBJECT_MISSING = "MEDIA_OBJECT_MISSING";

/** What `lastError` says on a record sent back for a fresh upload. */
export const MISSING_OBJECT_NOTE = "Its uploaded file was no longer in storage; uploading it again";

/**
 * The media ids a MEDIA_OBJECT_MISSING refusal names, from the error's JSON
 * body. Null for any other body, and for one that names none: a refusal that
 * says nothing actionable is handled as an ordinary save failure, so the
 * engine can never loop on it.
 */
export function missingMediaIdsFrom(body: unknown): string[] | null {
  if (!body || typeof body !== "object") return null;
  const b = body as { code?: unknown; missing_media_ids?: unknown };
  if (b.code !== MEDIA_OBJECT_MISSING || !Array.isArray(b.missing_media_ids)) return null;
  const ids = b.missing_media_ids.filter((id): id is string => typeof id === "string" && id.length > 0);
  return ids.length > 0 ? ids : null;
}

/**
 * The record as a file that has never been uploaded: same identity, folder and
 * watermark choice, nothing from the upload that lost its objects (URLs, keys,
 * sizes, multipart state, upload session, capture fields — all re-derived when
 * the file is compressed again).
 */
export function requeuedForUpload(record: UploadRecord, now: number): UploadRecord {
  return {
    id: record.id,
    bookingId: record.bookingId,
    fingerprint: record.fingerprint,
    customFolderId: record.customFolderId,
    folderName: record.folderName,
    filename: record.filename,
    fileSize: record.fileSize,
    fileLastModified: record.fileLastModified,
    ...(typeof record.watermark === "boolean" ? { watermark: record.watermark } : {}),
    status: "pending",
    attempts: 0,
    lastError: MISSING_OBJECT_NOTE,
    updatedAt: now,
  };
}
