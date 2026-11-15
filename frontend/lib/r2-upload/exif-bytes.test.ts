import { test } from "node:test";
import assert from "node:assert/strict";
import piexif from "piexifjs";
import {
  MAX_APP1_PAYLOAD,
  dumpExifForSplice,
  exifScanNeedsFullFile,
  readJpegOrientation,
} from "./exif-bytes.ts";

const MAKE = 271;
const MODEL = 272;
const ORIENTATION = 274;
const DATE_TIME_ORIGINAL = 36867;
const MAKER_NOTE = 37500;

function latin1(s: string): number[] {
  return Array.from(s, (c) => c.charCodeAt(0) & 0xff);
}

function segment(marker: number, payload: number[]): number[] {
  const len = payload.length + 2;
  return [0xff, marker, (len >> 8) & 0xff, len & 0xff, ...payload];
}

const APP0_JFIF = segment(0xe0, latin1("JFIF\0\x01\x01\0\0\x01\0\x01\0\0"));
const DQT = segment(0xdb, new Array(65).fill(1));
/** SOS header and a few bytes of "scan data", then EOI. */
const SCAN = [...segment(0xda, [1, 1, 0, 0, 0x3f, 0]), 0x12, 0x34, 0xff, 0xd9];

function jpeg(...segments: number[][]): Uint8Array {
  return new Uint8Array([0xff, 0xd8, ...segments.flat(), ...SCAN]);
}

function exifApp1(dict: object): number[] {
  return segment(0xe1, latin1(piexif.dump(dict as never)));
}

const ORIENTED_6 = exifApp1({ "0th": { [MAKE]: "SONY", [ORIENTATION]: 6 } });

test("orientation: Exif APP1 straight after SOI", () => {
  assert.equal(readJpegOrientation(jpeg(ORIENTED_6, DQT)), 6);
});

test("orientation: Exif APP1 after a JFIF APP0 (editor exports)", () => {
  assert.equal(readJpegOrientation(jpeg(APP0_JFIF, ORIENTED_6, DQT)), 6);
});

test("orientation: a broken TIFF IFD offset is -1, never a throw", () => {
  // The QA-01 qa-brokenexif.jpg shape: "Exif\0\0" + "II*\0" + offset 0x7fffffff.
  const broken = segment(0xe1, [...latin1("Exif\0\0II*\0"), 0xff, 0xff, 0xff, 0x7f, ...new Array(64).fill(0)]);
  assert.equal(readJpegOrientation(jpeg(broken, APP0_JFIF, DQT)), -1);
  // An IFD offset that lands inside the segment but whose entries run past it.
  const shortIfd = segment(0xe1, [...latin1("Exif\0\0II*\0"), 8, 0, 0, 0, 0xff, 0x7f]);
  assert.equal(readJpegOrientation(jpeg(shortIfd)), -1);
});

test("orientation: no EXIF is -1, not a JPEG is -2, truncated input is -1", () => {
  assert.equal(readJpegOrientation(jpeg(APP0_JFIF, DQT)), -1);
  assert.equal(readJpegOrientation(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), -2);
  assert.equal(readJpegOrientation(new Uint8Array([])), -2);
  const full = jpeg(APP0_JFIF, ORIENTED_6);
  assert.equal(readJpegOrientation(full.subarray(0, APP0_JFIF.length + 12)), -1);
});

test("full-file fallback only when the slice ends mid-segment", () => {
  const full = jpeg(APP0_JFIF, ORIENTED_6, DQT);
  const big = 10_000_000;
  // The slice reaches SOS: everything EXIF could be in is already in hand.
  assert.equal(exifScanNeedsFullFile(full, big), false);
  // The slice stops inside the Exif APP1.
  const cut = full.subarray(0, 2 + APP0_JFIF.length + 10);
  assert.equal(exifScanNeedsFullFile(cut, big), true);
  // ... unless the slice is the whole file.
  assert.equal(exifScanNeedsFullFile(cut, cut.length), false);
  // Not walkable: a non-marker byte where a segment should start, or not a JPEG.
  assert.equal(exifScanNeedsFullFile(new Uint8Array([0xff, 0xd8, 0x00, 0x00, 0x00, 0x00]), big), false);
  assert.equal(exifScanNeedsFullFile(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), big), false);
});

function sourceWithByteMakerNote(makerNoteLength: number): Uint8Array {
  // A MakerNote stored as BYTE (type 1), as Pillow writes it, rather than the
  // UNDEFINED (7) cameras use. Built by hand: piexif cannot write type 1 here.
  const note = Array.from({ length: makerNoteLength }, (_, i) => (i * 7) & 0xff);
  const le16 = (n: number) => [n & 0xff, (n >> 8) & 0xff];
  const le32 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
  const make = latin1("SONY\0");
  const date = latin1("2026:02:14 18:30:00\0");
  // Layout: header(8) | IFD0 (2 entries) | Exif IFD (2 entries) | make | date | note
  const ifd0At = 8;
  const exifAt = ifd0At + 2 + 2 * 12 + 4;
  const makeAt = exifAt + 2 + 2 * 12 + 4;
  const dateAt = makeAt + make.length;
  const noteAt = dateAt + date.length;
  const tiff = [
    ...latin1("II*\0"), ...le32(ifd0At),
    ...le16(2),
    ...le16(MAKE), ...le16(2), ...le32(make.length), ...le32(makeAt),
    ...le16(34665), ...le16(4), ...le32(1), ...le32(exifAt),
    ...le32(0),
    ...le16(2),
    ...le16(DATE_TIME_ORIGINAL), ...le16(2), ...le32(date.length), ...le32(dateAt),
    ...le16(MAKER_NOTE), ...le16(1), ...le32(note.length), ...le32(noteAt),
    ...le32(0),
    ...make, ...date, ...note,
  ];
  return jpeg(APP0_JFIF, segment(0xe1, [...latin1("Exif\0\0"), ...tiff]), DQT);
}

function load(bytes: Uint8Array) {
  return piexif.load(String.fromCharCode(...bytes));
}

test("dump: a BYTE-typed MakerNote round-trips at its own size, EXIF intact", () => {
  const dict = load(sourceWithByteMakerNote(30_000));
  // The piexif behaviour this guards against: a number array, dumped as text.
  assert.ok(Array.isArray(dict.Exif?.[MAKER_NOTE]));
  const out = dumpExifForSplice(dict);
  assert.ok(out);
  assert.ok(out.length <= MAX_APP1_PAYLOAD);
  assert.ok(out.length < 31_000, `payload ${out.length} bytes`);
  const back = piexif.load(String.fromCharCode(...out));
  assert.equal(back["0th"]?.[MAKE], "SONY");
  assert.equal(back.Exif?.[DATE_TIME_ORIGINAL], "2026:02:14 18:30:00");
  assert.equal((back.Exif?.[MAKER_NOTE] as string).length, 30_000);
});

test("dump: over one APP1, the MakerNote and thumbnail go and the rest stays", () => {
  const dict = {
    "0th": { [MAKE]: "SONY", [MODEL]: "ILCE-7M4" },
    Exif: { [DATE_TIME_ORIGINAL]: "2026:02:14 18:30:00", [MAKER_NOTE]: "x".repeat(70_000) },
  };
  const out = dumpExifForSplice(dict);
  assert.ok(out);
  const back = piexif.load(String.fromCharCode(...out));
  assert.equal(back["0th"]?.[MODEL], "ILCE-7M4");
  assert.equal(back.Exif?.[DATE_TIME_ORIGINAL], "2026:02:14 18:30:00");
  assert.equal(back.Exif?.[MAKER_NOTE], undefined);
});

test("dump: a tag piexif cannot write is dropped, not the whole EXIF", () => {
  const dict = {
    "0th": { [MAKE]: "SONY", [ORIENTATION]: { bad: true } },
    Exif: { [DATE_TIME_ORIGINAL]: "2026:02:14 18:30:00" },
  };
  const out = dumpExifForSplice(dict as never);
  assert.ok(out);
  const back = piexif.load(String.fromCharCode(...out));
  assert.equal(back["0th"]?.[MAKE], "SONY");
  assert.equal(back.Exif?.[DATE_TIME_ORIGINAL], "2026:02:14 18:30:00");
});
