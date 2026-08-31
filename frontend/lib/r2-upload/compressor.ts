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
/** Long edge of the gallery-grid derivative. The grid never renders larger than
 *  this, so the 2560px delivery copy is reserved for the lightbox, downloads
 *  and the ZIP. Must stay in sync with the backend's
 *  backfill-media-thumbnails.js, which generates the same derivative for media
 *  that predates this. */
const THUMB_MAX_DIM = 480;
const THUMB_QUALITY = 0.72;
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
  async run(file: File, watermark?: WatermarkRenderer | null): Promise<CompressResult> {
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

/** Compressed output plus its decoded pixel dimensions (undefined if the
 *  browser couldn't decode them — callers must treat that as "unknown").
 *
 *  `thumbBlob` is the 480px gallery-grid derivative. Undefined whenever the
 *  thumbnail step failed — callers must upload the photo anyway and simply omit
 *  `thumbnail_url`, exactly as they do for a failed watermark. */
export type CompressResult = { blob: Blob; thumbBlob?: Blob; width?: number; height?: number };

export async function compressWithExif(
  file: File,
  watermark?: WatermarkRenderer | null,
): Promise<CompressResult> {
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

  // Decode the final (post-downscale, post-watermark) blob ONCE and use that
  // single bitmap for both the dimension capture and the thumbnail draw — cheap,
  // since it's already ≤MAX_DIM on its long edge. Decoding the 15–25 MB source a
  // second time to build the thumbnail would be the expensive mistake here; this
  // way the thumbnail costs one canvas draw plus one small JPEG encode (~5–10 ms
  // per photo) and ZERO additional decodes. A failure in either step must never
  // fail the upload; callers treat missing dimensions as "unknown" and a missing
  // thumbnail as "grid falls back to the delivery copy".
  const { width, height, thumbBlob } = await measureAndThumbnail(compressedBlob);

  if (!exifSegmentBytes) {
    // No EXIF to re-inject; return as-is.
    return { blob: compressedBlob, thumbBlob, width, height };
  }

  // Splice the EXIF straight into the compressed JPEG's bytes. A failure here
  // must never fail the upload — losing metadata beats losing the photo.
  // Deliberately NOT applied to thumbBlob: the grid derivative carries no
  // metadata at all (see drawThumbnail).
  try {
    const compBytes = new Uint8Array(await compressedBlob.arrayBuffer());
    const blob = spliceExifIntoJpeg(compBytes, exifSegmentBytes) ?? compressedBlob;
    return { blob, thumbBlob, width, height };
  } catch {
    return { blob: compressedBlob, thumbBlob, width, height };
  }
}

/**
 * Decode the compressed blob once, read its dimensions, and draw the 480px
 * grid thumbnail from the SAME bitmap before closing it. The thumbnail source
 * is the post-watermark blob, so the thumbnail carries the watermark — correct
 * and intended for the grid.
 */
async function measureAndThumbnail(
  blob: Blob,
): Promise<{ width?: number; height?: number; thumbBlob?: Blob }> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(blob);
  } catch {
    return {};
  }
  const { width, height } = bmp;
  let thumbBlob: Blob | undefined;
  // Mirrors the watermark failure handling above: log and ship the photo
  // without the derivative rather than failing the upload over it.
  try {
    thumbBlob = await drawThumbnail(bmp);
  } catch (err) {
    console.error("[upload:thumbnail] generation failed; uploading without a grid thumbnail", err);
  } finally {
    bmp.close();
  }
  return { width, height, thumbBlob };
}

/**
 * Draw `bmp` scaled to fit inside THUMB_MAX_DIM (never upscaled — a source
 * already under it is drawn at its own size) and encode it as JPEG. Canvas
 * output carries no EXIF by construction, which is exactly what we want: the
 * grid derivative needs no metadata and spliceExifIntoJpeg is never called for
 * it.
 */
async function drawThumbnail(bmp: ImageBitmap): Promise<Blob | undefined> {
  // fit: inside, never upscale — a source already under THUMB_MAX_DIM is drawn
  // at its own size and used as-is.
  const scale = Math.min(1, THUMB_MAX_DIM / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));

  // OffscreenCanvas where available (keeps the draw off the DOM), same shape as
  // watermark.ts's makeContext/canvasToJpeg — kept local rather than shared
  // because those bake in the watermark re-encode quality, not THUMB_QUALITY.
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.drawImage(bmp, 0, 0, w, h);
    return canvas.convertToBlob({ type: "image/jpeg", quality: THUMB_QUALITY });
  }

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;
  ctx.drawImage(bmp, 0, 0, w, h);

  return new Promise<Blob | undefined>((resolve) => {
    canvas.toBlob((b) => resolve(b ?? undefined), "image/jpeg", THUMB_QUALITY);
  });
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
