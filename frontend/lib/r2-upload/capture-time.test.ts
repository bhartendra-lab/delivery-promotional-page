import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseExifDateTime,
  captureTimeFromExif,
  captureFieldsForRecord,
  captureFieldsForMetadata,
  IST_OFFSET_MS,
} from "./capture-time.ts";

/**
 * TWIN FILE: backend/src/utils/capture-time.utils.test.js runs these same
 * cases against the backend copy. A case added here belongs there too.
 */

/** 2026-02-14T13:00:00Z, i.e. 18:30 IST — a fixed "now" so the future-date
 *  rules are tested against a known clock rather than the machine's. */
const NOW = Date.UTC(2026, 1, 14, 13, 0, 0);

/** piexif 1.0.6 ExifIFD tag ids. */
const DATE_TIME_ORIGINAL = 36867;
const SUB_SEC_TIME_ORIGINAL = 37521;
const DATE_TIME_DIGITIZED = 36868;
const SUB_SEC_TIME_DIGITIZED = 37522;

function iso(ms: number | null): string | null {
  return ms == null ? null : new Date(ms).toISOString();
}

test("parseExifDateTime: a normal camera date", () => {
  assert.equal(
    iso(parseExifDateTime("2026:02:14 18:30:00", undefined, NOW)),
    "2026-02-14T13:00:00.000Z",
  );
});

test("parseExifDateTime: the wall clock is read as IST, not as the machine's zone", () => {
  const ms = parseExifDateTime("2026:02:14 18:30:00", undefined, NOW);
  assert.equal(ms, Date.UTC(2026, 1, 14, 18, 30, 0) - IST_OFFSET_MS);
  assert.equal(iso(ms), "2026-02-14T13:00:00.000Z");
});

test("parseExifDateTime: sub-seconds are a decimal fraction, so \"5\" is 500 ms", () => {
  const base = parseExifDateTime("2026:02:14 18:30:00", undefined, NOW) as number;
  assert.equal(parseExifDateTime("2026:02:14 18:30:00", "5", NOW), base + 500);
});

test("parseExifDateTime: \"05\" is 50 ms, not 5", () => {
  const base = parseExifDateTime("2026:02:14 18:30:00", undefined, NOW) as number;
  assert.equal(parseExifDateTime("2026:02:14 18:30:00", "05", NOW), base + 50);
});

test("parseExifDateTime: \"123456\" keeps only the millisecond digits (123)", () => {
  const base = parseExifDateTime("2026:02:14 18:30:00", undefined, NOW) as number;
  assert.equal(parseExifDateTime("2026:02:14 18:30:00", "123456", NOW), base + 123);
});

test("parseExifDateTime: a non-digit sub-second costs precision, never the date", () => {
  const base = parseExifDateTime("2026:02:14 18:30:00", undefined, NOW) as number;
  assert.equal(parseExifDateTime("2026:02:14 18:30:00", "12a", NOW), base);
  assert.equal(parseExifDateTime("2026:02:14 18:30:00", null, NOW), base);
});

test("parseExifDateTime: a zeroed placeholder date is rejected", () => {
  assert.equal(parseExifDateTime("0000:00:00 00:00:00", undefined, NOW), null);
});

test("parseExifDateTime: a year before 1990 is rejected (dead clock battery)", () => {
  assert.equal(parseExifDateTime("1980:06:01 12:00:00", undefined, NOW), null);
});

test("parseExifDateTime: a date two days in the future is rejected", () => {
  assert.equal(parseExifDateTime("2026:02:16 18:30:00", undefined, NOW), null);
});

test("parseExifDateTime: a date inside the one-day future window is kept", () => {
  assert.equal(
    iso(parseExifDateTime("2026:02:15 12:00:00", undefined, NOW)),
    "2026-02-15T06:30:00.000Z",
  );
});

test("parseExifDateTime: \"-\", \"/\" and \"T\" separators are tolerated", () => {
  const expected = "2026-02-14T13:00:00.000Z";
  assert.equal(iso(parseExifDateTime("2026-02-14 18:30:00", undefined, NOW)), expected);
  assert.equal(iso(parseExifDateTime("2026/02/14 18:30:00", undefined, NOW)), expected);
  assert.equal(iso(parseExifDateTime("2026:02:14T18:30:00", undefined, NOW)), expected);
});

test("parseExifDateTime: impossible dates and times are rejected", () => {
  assert.equal(parseExifDateTime("2026:13:01 10:00:00", undefined, NOW), null); // month 13
  assert.equal(parseExifDateTime("2026:01:32 10:00:00", undefined, NOW), null); // day 32
  assert.equal(parseExifDateTime("2026:02:30 10:00:00", undefined, NOW), null); // Feb 30
  assert.equal(parseExifDateTime("2026:02:14 25:00:00", undefined, NOW), null); // hour 25
});

test("parseExifDateTime: garbage, empty strings and non-strings are rejected", () => {
  assert.equal(parseExifDateTime("", undefined, NOW), null);
  assert.equal(parseExifDateTime("   ", undefined, NOW), null);
  assert.equal(parseExifDateTime("not a date", undefined, NOW), null);
  assert.equal(parseExifDateTime("2026:02:14", undefined, NOW), null);
  assert.equal(parseExifDateTime(1700000000000, undefined, NOW), null);
  assert.equal(parseExifDateTime(undefined, undefined, NOW), null);
});

test("captureTimeFromExif: DateTimeOriginal wins over DateTimeDigitized", () => {
  const dict = {
    Exif: {
      [DATE_TIME_ORIGINAL]: "2026:02:14 18:30:00",
      [DATE_TIME_DIGITIZED]: "2026:02:14 20:00:00",
    },
  };
  assert.equal(iso(captureTimeFromExif(dict, NOW)), "2026-02-14T13:00:00.000Z");
});

test("captureTimeFromExif: falls back to DateTimeDigitized and its sub-second tag", () => {
  const dict = {
    Exif: {
      [DATE_TIME_DIGITIZED]: "2026:02:14 18:30:00",
      [SUB_SEC_TIME_DIGITIZED]: "25",
    },
  };
  assert.equal(iso(captureTimeFromExif(dict, NOW)), "2026-02-14T13:00:00.250Z");
});

test("captureTimeFromExif: falls back when DateTimeOriginal is present but unusable", () => {
  const dict = {
    Exif: {
      [DATE_TIME_ORIGINAL]: "0000:00:00 00:00:00",
      [DATE_TIME_DIGITIZED]: "2026:02:14 18:30:00",
    },
  };
  assert.equal(iso(captureTimeFromExif(dict, NOW)), "2026-02-14T13:00:00.000Z");
});

test("captureTimeFromExif: the original's sub-second tag is read with it", () => {
  const dict = {
    Exif: {
      [DATE_TIME_ORIGINAL]: "2026:02:14 18:30:00",
      [SUB_SEC_TIME_ORIGINAL]: "5",
    },
  };
  assert.equal(iso(captureTimeFromExif(dict, NOW)), "2026-02-14T13:00:00.500Z");
});

test("captureTimeFromExif: a dict with no EXIF segment yields null", () => {
  assert.equal(captureTimeFromExif({}, NOW), null);
  assert.equal(captureTimeFromExif({ Exif: {} }, NOW), null);
  assert.equal(captureTimeFromExif(null, NOW), null);
  assert.equal(captureTimeFromExif(undefined, NOW), null);
});

/* ── uploader glue (frontend only; no backend twin) ─────────────────────── */

test("captureFieldsForRecord: an EXIF date wins and is marked as such", () => {
  assert.deepEqual(captureFieldsForRecord(NOW, 1_700_000_000_000), {
    capturedAt: NOW,
    capturedAtSource: "exif",
  });
});

test("captureFieldsForRecord: no EXIF date falls back to the file's timestamp", () => {
  assert.deepEqual(captureFieldsForRecord(undefined, 1_700_000_000_000), {
    capturedAt: 1_700_000_000_000,
    capturedAtSource: "file_time",
  });
});

test("captureFieldsForRecord: an unknown file timestamp (0 / NaN) yields nothing at all", () => {
  assert.deepEqual(captureFieldsForRecord(undefined, 0), {});
  assert.deepEqual(captureFieldsForRecord(undefined, Number.NaN), {});
});

test("captureFieldsForMetadata: a record's own capture time is sent as ISO with its source", () => {
  assert.deepEqual(
    captureFieldsForMetadata({
      capturedAt: NOW,
      capturedAtSource: "exif",
      fileLastModified: 1_700_000_000_000,
    }),
    { captured_at: "2026-02-14T13:00:00.000Z", captured_at_source: "exif" },
  );
});

test("captureFieldsForMetadata: a record from before this change falls back to its file timestamp", () => {
  assert.deepEqual(captureFieldsForMetadata({ fileLastModified: 1_700_000_000_000 }), {
    captured_at: "2023-11-14T22:13:20.000Z",
    captured_at_source: "file_time",
  });
});

test("captureFieldsForMetadata: a record with neither sends neither key", () => {
  assert.deepEqual(captureFieldsForMetadata({}), {});
  assert.deepEqual(captureFieldsForMetadata({ fileLastModified: 0 }), {});
});
