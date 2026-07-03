/**
 * Compression "pool" — runs N concurrent compress operations.
 *
 * Each call to browser-image-compression with `useWebWorker: true` spawns a
 * dedicated worker, so concurrency here gives us actual parallelism rather
 * than just queueing on the main thread.
 *
 * Tuning:
 *   - quality 0.85 — visually identical to source for typical wedding photos
 *   - NO maxSizeMB cap — we'd rather keep visible quality than guarantee a size
 *   - downscale only if largest dim > MAX_DIM (so 24MP camera shots get scaled
 *     but already-web-sized images pass through untouched)
 *
 * EXIF preservation:
 *   browser-image-compression bakes EXIF orientation into the pixels and then
 *   strips all metadata. We re-inject the source's EXIF (with orientation
 *   reset to 1 so viewers don't rotate the already-rotated pixels again).
 */

import imageCompression from "browser-image-compression";
import piexif from "piexifjs";
import type { WatermarkRenderer } from "./watermark";

const MAX_DIM = 2560;
const QUALITY = 0.80;
/** EXIF/APP1 sits at the very front of a JPEG; read only this much of the source
 *  to extract it rather than base64-ing the whole (often 15–20 MB) file per
 *  photo on the main thread. 256 KB comfortably covers APP0 + a max-size (64 KB)
 *  APP1 (+ any XMP) with margin. */
const EXIF_HEAD_BYTES = 256 * 1024;

/** Default pool size: leave one core free for the main thread. */
export function defaultPoolSize(): number {
  if (typeof navigator === "undefined") return 4;
  const n = navigator.hardwareConcurrency ?? 4;
  return Math.max(1, n - 1);
}

export class CompressorPool {
  private slots: number;
  private active = 0;
  private waiters: Array<() => void> = [];

  constructor(size = defaultPoolSize()) {
    this.slots = size;
  }

  get size() {
    return this.slots;
  }

  /** Run a compression task, waiting if all slots are busy. */
  async run(file: File, watermark?: WatermarkRenderer | null): Promise<Blob> {
    await this.acquire();
    try {
      return await compressWithExif(file, watermark);
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.slots) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.waiters.push(() => {
        this.active++;
        resolve();
      });
    });
  }

  private release(): void {
    this.active--;
    const next = this.waiters.shift();
    if (next) next();
  }
}

/* ── compression core ─────────────────────────────────────────────── */

export async function compressWithExif(
  file: File,
  watermark?: WatermarkRenderer | null,
): Promise<Blob> {
  // Read source EXIF before compression destroys it. Only meaningful for JPEG
  // sources (PNG/HEIC don't carry EXIF the same way). We read just the header
  // slice — EXIF sits right after the SOI marker — and keep the serialized
  // segment as raw bytes so it can be spliced back in without any base64 or
  // whole-image string round-trip (both were heavy main-thread work per photo).
  const sourceIsJpeg = file.type === "image/jpeg" || /\.jpe?g$/i.test(file.name);
  let exifSegmentBytes: Uint8Array | null = null;

  if (sourceIsJpeg) {
    try {
      const exifDict = await loadSourceExifDict(file);
      // browser-image-compression bakes orientation into pixels; reset to 1 to
      // avoid double-rotation when a viewer applies orientation later.
      if (exifDict["0th"]) {
        exifDict["0th"][piexif.ImageIFD.Orientation] = 1;
      }
      exifSegmentBytes = binaryStringToBytes(piexif.dump(exifDict));
    } catch {
      // Not all JPEGs have EXIF; ignore failures and proceed unmarked.
      exifSegmentBytes = null;
    }
  }

  let compressedBlob: Blob = await imageCompression(file, {
    // No maxSizeMB — preserve visible quality over size targets.
    maxWidthOrHeight: MAX_DIM,
    useWebWorker: true,
    fileType: "image/jpeg",
    initialQuality: QUALITY,
    // alwaysKeepResolution doesn't exist, but skipping downscale for small
    // sources is already the library's default behaviour.
  });

  // Stamp the studio's default watermark before EXIF is re-injected. The mark
  // is composited on the already-downscaled image (orientation baked in by the
  // compressor above), so canvas coordinates map 1:1 to the final pixels.
  // A watermark failure must never fail the upload — ship the unmarked photo.
  if (watermark) {
    try {
      compressedBlob = await watermark.apply(compressedBlob);
    } catch (err) {
      console.error("[upload:watermark] compositing failed; uploading without watermark", err);
    }
  }

  if (!exifSegmentBytes) {
    // No EXIF to re-inject; return as-is.
    return compressedBlob;
  }

  // Splice the EXIF straight into the compressed JPEG's bytes. A failure here
  // must never fail the upload — losing metadata beats losing the photo.
  try {
    const compBytes = new Uint8Array(await compressedBlob.arrayBuffer());
    return spliceExifIntoJpeg(compBytes, exifSegmentBytes) ?? compressedBlob;
  } catch {
    return compressedBlob;
  }
}

/**
 * Load the source JPEG's EXIF reading only the header slice — EXIF sits before
 * the SOS marker, which is virtually always within the first 256 KB. Falls back
 * to the full file for the rare image whose pre-scan segments (e.g. a giant ICC
 * profile) exceed the slice, so we never silently drop EXIF we used to keep.
 */
async function loadSourceExifDict(file: File) {
  try {
    const head = new Uint8Array(await file.slice(0, EXIF_HEAD_BYTES).arrayBuffer());
    return piexif.load(bytesToBinaryString(head));
  } catch {
    const full = new Uint8Array(await file.arrayBuffer());
    return piexif.load(bytesToBinaryString(full));
  }
}

/* ── EXIF byte helpers (piexif speaks latin1 "binary strings") ─────── */

// NB: piexif operates on ISO-8859-1 binary strings (one char per byte, 0–255).
// We convert with String.fromCharCode / charCodeAt — NOT TextDecoder, whose
// "latin1" is really windows-1252 and would corrupt bytes 0x80–0x9F.

/** Raw bytes → latin1 binary string (chunked to stay within arg limits). */
function bytesToBinaryString(u8: Uint8Array): string {
  const CHUNK = 0x8000;
  let s = "";
  for (let i = 0; i < u8.length; i += CHUNK) {
    s += String.fromCharCode(...u8.subarray(i, i + CHUNK));
  }
  return s;
}

/** latin1 binary string (piexif.dump output) → raw bytes. */
function binaryStringToBytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

/**
 * Insert an EXIF payload (piexif.dump output — "Exif\0\0" + TIFF) as an APP1
 * segment immediately after the SOI marker of a compressed JPEG. Returns a new
 * Blob, or null if the input isn't a JPEG we recognise (caller keeps the
 * original). browser-image-compression strips all metadata, so there's no
 * existing APP1 to replace — we just prepend ours.
 */
function spliceExifIntoJpeg(compBytes: Uint8Array, exifPayload: Uint8Array): Blob | null {
  // Must start with SOI (0xFFD8).
  if (compBytes.length < 2 || compBytes[0] !== 0xff || compBytes[1] !== 0xd8) {
    return null;
  }
  // JPEG segment length spans the 2 length bytes + payload, capped at 65535.
  const segLen = exifPayload.length + 2;
  if (segLen > 0xffff) return null;

  const out = new Uint8Array(compBytes.length + 4 + exifPayload.length);
  let o = 0;
  out[o++] = 0xff;
  out[o++] = 0xd8; // SOI
  out[o++] = 0xff;
  out[o++] = 0xe1; // APP1 marker
  out[o++] = (segLen >> 8) & 0xff; // length hi
  out[o++] = segLen & 0xff; // length lo
  out.set(exifPayload, o);
  o += exifPayload.length;
  out.set(compBytes.subarray(2), o); // rest of the compressed JPEG (after SOI)
  return new Blob([out], { type: "image/jpeg" });
}
