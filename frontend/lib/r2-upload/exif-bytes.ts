/**
 * Byte-level EXIF helpers for the upload compressor that must never throw,
 * never loop and never hang on a malformed source (QA-01 F4, F5).
 *
 *  - readJpegOrientation: the orientation browser-image-compression would read,
 *    computed here with bounds checks so we can hand it to the library as
 *    `exifOrientation` and skip the library's own reader. That reader throws a
 *    RangeError inside a FileReader callback on a bad IFD offset, which leaves
 *    its promise unsettled forever: the upload hung on that photo.
 *  - exifScanNeedsFullFile: whether a header slice ended mid-segment, i.e.
 *    re-reading the whole file could find EXIF the slice could not.
 *  - dumpExifForSplice: piexif.dump with the dict first coerced to the types
 *    piexif writes. piexif loads a tag by its STORED type but dumps it by its
 *    SPEC type, so a MakerNote stored as BYTE (as Pillow and some editors write
 *    it) comes back as a number array and is dumped as "83,79,78,…" text: three
 *    times the size, past the 64 KB APP1 limit, so the view lost all its EXIF.
 */

import piexif, { type ExifDict, type ExifSegment } from "piexifjs";

/** Largest EXIF payload one APP1 segment can carry (its length field counts
 *  itself, and is 16-bit). */
export const MAX_APP1_PAYLOAD = 0xffff - 2;

const SOI = 0xffd8;
const SOS = 0xffda;
const APP1 = 0xffe1;
const EXIF_SIG = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif\0\0"
const TAG_ORIENTATION = 0x0112;
const TAG_MAKER_NOTE = 37500;

function isExifApp1(b: Uint8Array, segStart: number): boolean {
  for (let i = 0; i < EXIF_SIG.length; i++) {
    if (b[segStart + 4 + i] !== EXIF_SIG[i]) return false;
  }
  return true;
}

/**
 * Orientation 1–8 from the first Exif APP1 among the segments before SOS,
 * wherever it sits (after a JFIF APP0 too). The same codes
 * browser-image-compression uses: -2 when the bytes aren't a JPEG, -1 when
 * there is no orientation or the EXIF can't be read. Never throws.
 */
export function readJpegOrientation(bytes: Uint8Array): number {
  try {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.length < 2 || v.getUint16(0) !== SOI) return -2;
    let o = 2;
    while (o + 4 <= bytes.length) {
      const marker = v.getUint16(o);
      if ((marker & 0xff00) !== 0xff00 || marker === SOS) return -1;
      const len = v.getUint16(o + 2);
      if (len < 2) return -1;
      if (marker === APP1 && isExifApp1(bytes, o)) {
        const tiff = o + 10;
        const segEnd = Math.min(o + 2 + len, bytes.length);
        const bo = v.getUint16(tiff);
        if (bo !== 0x4949 && bo !== 0x4d4d) return -1;
        const le = bo === 0x4949;
        const ifd0 = tiff + v.getUint32(tiff + 4, le);
        if (ifd0 + 2 > segEnd) return -1;
        const count = v.getUint16(ifd0, le);
        for (let i = 0; i < count; i++) {
          const e = ifd0 + 2 + 12 * i;
          if (e + 12 > segEnd) return -1;
          if (v.getUint16(e, le) === TAG_ORIENTATION) {
            const value = v.getUint16(e + 8, le);
            return value >= 1 && value <= 8 ? value : -1;
          }
        }
        return -1;
      }
      o += 2 + len;
    }
    return -1;
  } catch {
    return -1;
  }
}

/**
 * True when `head` (the first bytes of a `fileSize`-byte JPEG) ends inside a
 * pre-SOS segment, so the whole file could hold EXIF the slice cut off. False
 * once the walk reaches SOS within the slice, when the slice already is the
 * whole file, or when the bytes aren't a walkable JPEG: re-reading the whole
 * file cannot help then, and costs a full-file string conversion.
 */
export function exifScanNeedsFullFile(head: Uint8Array, fileSize: number): boolean {
  if (head.length >= fileSize) return false;
  if (head.length < 4 || head[0] !== 0xff || head[1] !== 0xd8) return false;
  let o = 2;
  while (o + 4 <= head.length) {
    if (head[o] !== 0xff) return false;
    const marker = (head[o] << 8) | head[o + 1];
    if (marker === SOS) return false;
    const len = (head[o + 2] << 8) | head[o + 3];
    if (len < 2) return false;
    o += 2 + len;
  }
  return true;
}

type TagSpec = { name: string; type: string };
const TAGS = (piexif as unknown as { TAGS: Record<string, Record<number, TagSpec>> }).TAGS;
const IFDS = ["0th", "Exif", "GPS", "Interop", "1st"] as const;

function isByteArray(v: unknown): v is number[] {
  return Array.isArray(v) && v.every((n) => typeof n === "number");
}

function bytesToLatin1(a: number[]): string {
  let s = "";
  for (const n of a) s += String.fromCharCode(n & 0xff);
  return s;
}

/** Coerce every value to the shape piexif.dump writes for its tag's spec type.
 *  Mutates `dict`. */
function normalizeForDump(dict: ExifDict): void {
  for (const ifd of IFDS) {
    const seg = dict[ifd] as ExifSegment | undefined;
    const specs = TAGS[ifd];
    if (!seg || !specs) continue;
    for (const key of Object.keys(seg)) {
      const tag = Number(key);
      const spec = specs[tag];
      if (!spec) continue;
      const v = seg[tag];
      if (spec.type === "Undefined") {
        if (typeof v === "number") seg[tag] = String.fromCharCode(v & 0xff);
        else if (isByteArray(v)) seg[tag] = bytesToLatin1(v);
      } else if (spec.type === "Ascii") {
        if (isByteArray(v)) seg[tag] = bytesToLatin1(v).replace(/\0+$/, "");
      } else if (spec.type === "Byte") {
        if (typeof v === "string") seg[tag] = Array.from(v, (c) => c.charCodeAt(0) & 0xff);
      }
    }
  }
}

function tryDump(dict: ExifDict): string | null {
  try {
    return piexif.dump(dict);
  } catch {
    return null;
  }
}

/** Drop the tags piexif cannot dump on their own; keeps every other field. */
function pruneUndumpableTags(dict: ExifDict): void {
  for (const ifd of IFDS) {
    if (ifd === "1st") continue; // thumbnail IFD; dropped wholesale below if needed
    const seg = dict[ifd] as ExifSegment | undefined;
    if (!seg) continue;
    for (const key of Object.keys(seg)) {
      const tag = Number(key);
      // IFD pointers are rewritten by dump itself.
      if (ifd === "0th" && (tag === 34665 || tag === 34853)) continue;
      if (ifd === "Exif" && tag === 40965) continue;
      if (tryDump({ [ifd]: { [tag]: seg[tag] } } as ExifDict) === null) delete seg[tag];
    }
  }
}

/** latin1 binary string (piexif.dump output) → raw bytes. */
function binaryStringToBytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

/**
 * Serialise a loaded EXIF dict ("Exif\0\0" + TIFF) for splicing into the
 * compressed JPEG as one APP1, or null when nothing usable fits. Mutates
 * `dict`. In order, until the payload dumps and fits one APP1:
 *   1. as loaded, with values coerced to piexif's types;
 *   2. without the tags that cannot be dumped (each tested alone);
 *   3. without the MakerNote and the embedded thumbnail, the two big blobs
 *      nobody reads from a delivery copy, keeping date, camera and the rest.
 */
export function dumpExifForSplice(dict: ExifDict): Uint8Array | null {
  normalizeForDump(dict);
  let out = tryDump(dict);
  if (out === null) {
    pruneUndumpableTags(dict);
    out = tryDump(dict);
  }
  if (out === null || out.length > MAX_APP1_PAYLOAD) {
    if (dict.Exif) delete dict.Exif[TAG_MAKER_NOTE];
    dict["1st"] = {};
    dict.thumbnail = null;
    out = tryDump(dict);
  }
  if (out === null || out.length > MAX_APP1_PAYLOAD) return null;
  return binaryStringToBytes(out);
}
