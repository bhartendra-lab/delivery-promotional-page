/**
 * When a photo was TAKEN, read from its EXIF. Pure, no piexifjs import, so it
 * unit-tests without a JPEG or a DOM.
 *
 * TWIN FILE: backend/src/utils/capture-time.utils.js holds the same two
 * functions with the same rules and the same test cases. The uploader computes
 * a capture time here and create-media re-derives one there for any row that
 * arrives without it, so the two MUST change together — if they disagree, two
 * photos from the same camera can land in a gallery with times computed on
 * different rules and sort against each other wrongly.
 */

/**
 * EXIF date-times carry no time zone: a camera writes its own wall clock and
 * nothing else. The tag that would disambiguate it (OffsetTimeOriginal, 36881)
 * is not in piexifjs 1.0.6's tag table, and piexif DROPS tags it doesn't know
 * while loading, so it cannot be read here at all.
 *
 * So every EXIF wall clock is read as IST. Only the ORDER of photos within one
 * event matters, and an event's cameras are all on one local clock, so a fixed
 * offset orders them correctly whatever zone they were actually in. Choosing a
 * constant over the machine's own zone is what keeps the browser, the backend
 * and their tests in agreement.
 *
 * Twin: IST_OFFSET_MS in backend/src/utils/ist-time.utils.js.
 */
export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * "YYYY:MM:DD HH:MM:SS" is the only form the EXIF spec allows, but editors and
 * phone exports do write "-" or "/" for the date separator and "T" between the
 * date and the time, so all three are tolerated. Anything else is rejected
 * outright rather than guessed at.
 */
const EXIF_DATE_TIME = /^(\d{4})[:\-/](\d{2})[:\-/](\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/;

/**
 * A camera with a dead battery-backup writes 1970 or 2000; a "0000:00:00
 * 00:00:00" placeholder is written by anything that cleared the field. Neither
 * is a capture time, and both would sort to the very front of a gallery. 1990
 * is comfortably before any digital camera this product will ever see.
 */
const MIN_YEAR = 1990;

/** A clock set a few hours ahead is plausible and harmless; a date next year is
 *  a broken clock, and letting it through would pin that photo to the end of
 *  every gallery it lands in. One day of slack covers time-zone confusion. */
const MAX_FUTURE_MS = 24 * 60 * 60 * 1000;

/** The piexifjs 1.0.6 ExifIFD tag ids we read. Spelled as numbers because this
 *  module deliberately does not import piexifjs (see the header). */
const TAG_DATE_TIME_ORIGINAL = 36867;
const TAG_SUB_SEC_TIME_ORIGINAL = 37521;
const TAG_DATE_TIME_DIGITIZED = 36868;
const TAG_SUB_SEC_TIME_DIGITIZED = 37522;

/** The shape this module reads out of a piexif dict, structurally — importing
 *  piexifjs's own `ExifDict` would pull the library in. A real dict is
 *  assignable to this. */
export type ExifDictLike = { Exif?: Record<number, unknown> } | null | undefined;

/**
 * EXIF sub-seconds are a DECIMAL FRACTION of a second, not a count of
 * milliseconds: "5" is 500 ms, "05" is 50 ms, "123456" is 123 ms (the rest is
 * finer than we store). Reading them as an integer would put a burst's frames
 * in an order of their own invention.
 *
 * Non-digits mean the tag is unusable, which costs sub-second precision and
 * nothing else — the date itself still stands, so this returns 0 rather than
 * failing the parse.
 */
function subSecondMs(subsec: unknown): number {
  const raw =
    typeof subsec === "number"
      ? String(subsec)
      : typeof subsec === "string"
      ? subsec.trim()
      : "";
  if (!/^\d+$/.test(raw)) return 0;
  return Number(raw.slice(0, 3).padEnd(3, "0"));
}

/**
 * Parse one EXIF date-time (plus its optional sub-second tag) to epoch ms, or
 * null if it isn't a real, plausible capture time.
 *
 * @param now Injectable only so the "too far in the future" rule can be tested
 *   without depending on the wall clock. Callers pass nothing.
 */
export function parseExifDateTime(
  value: unknown,
  subsec?: unknown,
  now: number = Date.now(),
): number | null {
  if (typeof value !== "string") return null;
  // Cameras pad the fixed-width field with NULs or spaces often enough that
  // trimming is cheaper than a second regex for it.
  const match = EXIF_DATE_TIME.exec(value.replace(/\0+$/, "").trim());
  if (!match) return null;

  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  if (year < MIN_YEAR) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;

  const utc = Date.UTC(year, month - 1, day, hour, minute, second);
  // Date.UTC rolls impossible days over (Feb 30 becomes Mar 2), which would
  // silently invent a capture time. Reading the parts back rejects those.
  const rolled = new Date(utc);
  if (
    rolled.getUTCFullYear() !== year ||
    rolled.getUTCMonth() !== month - 1 ||
    rolled.getUTCDate() !== day
  ) {
    return null;
  }

  // The wall clock is IST (see IST_OFFSET_MS), so the epoch instant is that
  // many ms EARLIER than the same reading interpreted as UTC.
  const ms = utc - IST_OFFSET_MS + subSecondMs(subsec);
  if (ms > now + MAX_FUTURE_MS) return null;
  return ms;
}

/**
 * The capture time of a piexif dict: DateTimeOriginal (when the shutter fired)
 * first, DateTimeDigitized (when the file was written) second. A scan or an
 * import has only the latter; a camera writes both and they agree.
 *
 * Returns null for a dict with neither, which is every PNG, screenshot and
 * metadata-stripped export — callers fall back to the file's own timestamp.
 */
export function captureTimeFromExif(
  exifDict: ExifDictLike,
  now: number = Date.now(),
): number | null {
  const exif = exifDict?.Exif;
  if (!exif) return null;
  return (
    parseExifDateTime(exif[TAG_DATE_TIME_ORIGINAL], exif[TAG_SUB_SEC_TIME_ORIGINAL], now) ??
    parseExifDateTime(exif[TAG_DATE_TIME_DIGITIZED], exif[TAG_SUB_SEC_TIME_DIGITIZED], now)
  );
}

/* ── uploader glue ─────────────────────────────────────────────────────────
 * Below this line is the uploader's own use of the two functions above, and
 * is NOT part of the backend twin — the backend derives its fallbacks from
 * the media_id instead, because it has no File to read.
 */

/** What `capturedAt`/`capturedAtSource` a compressed record should carry. */
export type RecordCaptureFields = {
  capturedAt?: number;
  capturedAtSource?: "exif" | "file_time";
};

/**
 * EXIF where the compressor found a date, the file's own timestamp otherwise.
 *
 * A `lastModified` of 0 or NaN is what a browser reports when it doesn't know
 * (some drag-and-drop and cloud-backed sources), and 0 would read as 1970 and
 * pin the photo to the front of the gallery — so it yields nothing at all and
 * the backend falls back to the upload time.
 */
export function captureFieldsForRecord(
  capturedAtFromExif: number | undefined,
  fileLastModified: number,
): RecordCaptureFields {
  if (capturedAtFromExif != null) {
    return { capturedAt: capturedAtFromExif, capturedAtSource: "exif" };
  }
  if (Number.isFinite(fileLastModified) && fileLastModified > 0) {
    return { capturedAt: fileLastModified, capturedAtSource: "file_time" };
  }
  return {};
}

/**
 * The `captured_at` / `captured_at_source` a create-media row carries, read
 * off the RECORD — a metadata flush can happen on a later mount, where the
 * record is all that's left (see `UploadRecord.capturedAt`).
 *
 * A record written before capture time was recorded has neither field, so its
 * `fileLastModified` stands in: that is exactly the value the compressor would
 * have chosen for a photo with no EXIF date, and it keeps a run that was
 * compressed before this shipped and flushed after it from arriving unordered.
 */
export function captureFieldsForMetadata(record: {
  capturedAt?: number;
  capturedAtSource?: "exif" | "file_time";
  fileLastModified?: number;
}): { captured_at?: string; captured_at_source?: "exif" | "file_time" } {
  const ms = record.capturedAt ?? record.fileLastModified;
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return {};
  return {
    captured_at: new Date(ms).toISOString(),
    // Only a record that carries its own capture time can claim EXIF; the
    // stand-in above is a file timestamp by construction.
    captured_at_source: record.capturedAt != null ? record.capturedAtSource ?? "file_time" : "file_time",
  };
}
