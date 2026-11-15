/**
 * Pure. The deterministic id of an uploaded file: `{booking}__{name}-{size}-{mtime}`.
 * Split out of state.ts (which needs IndexedDB) so the Studio app's Locate
 * Originals recomputes exactly the uploader's `media_id`.
 */

/** The `File` fields a fingerprint is made of — nothing else is read, so pure
 *  logic (and its tests) can work with plain objects instead of real `File`s. */
export type FingerprintableFile = { name: string; size: number; lastModified: number };

/** Compose the deterministic id for a (booking, file) pair. */
export function makeFingerprint(file: FingerprintableFile): string {
  return `${file.name}-${file.size}-${file.lastModified}`;
}
export function makeRecordId(bookingId: string, fingerprint: string): string {
  return `${bookingId}__${fingerprint}`;
}
