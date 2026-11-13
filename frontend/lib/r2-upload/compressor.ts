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
import { captureTimeFromExif } from "./capture-time";
import { cameraFromExif, type CameraIdentity } from "./camera-identity";
import { dumpExifForSplice, exifScanNeedsFullFile, readJpegOrientation } from "./exif-bytes.ts";
import type { WatermarkRenderer } from "./watermark";
import { thumbDims, viewFromArchiveDims } from "./geometry.ts";
import { UPLOAD_SPEC } from "./spec.ts";

// Every number below lives in spec.ts, with the reason it exists. The pixel
// rules for the two canvas draws this file does itself (downscaleToView,
// drawThumbnail) live in geometry.ts; the library resizes the view and the 4K
// archive by its own rule, which geometry.ts reproduces as viewDims/archiveDims.
const MAX_DIM = UPLOAD_SPEC.image.viewMaxDim;
const QUALITY = UPLOAD_SPEC.image.viewQuality;
const ARCHIVE_DIM = UPLOAD_SPEC.image.archiveMaxDim;
const ARCHIVE_QUALITY = UPLOAD_SPEC.image.archiveQuality;
const THUMB_QUALITY = UPLOAD_SPEC.image.thumbQuality;
const EXIF_HEAD_BYTES = UPLOAD_SPEC.image.exifHeadBytes;
const OUTPUT_TYPE = UPLOAD_SPEC.image.outputType;

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
  async run(
    file: File,
    watermark?: WatermarkRenderer | null,
    variant: UploadVariant = "2560",
  ): Promise<CompressResult> {
    await this.acquire();
    try {
      return await compressWithExif(file, watermark, variant);
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
export type CompressResult = {
  /** The 2560px watermarked delivery view. Produced in EVERY variant — a
   *  quality tier adds an archive object, it never replaces the delivery pair.
   *  The gallery, the lightbox and the embedding pump all read this. */
  blob: Blob;
  /** 480px grid thumbnail, derived from the watermarked view. Every variant. */
  thumbBlob?: Blob;
  /** 4096px archive copy — only for variant "4096", and watermarked like the
   *  delivery view whenever the run has a watermark. The "original" variant has
   *  none: the engine streams the raw File to B2 itself and this function never
   *  touches those bytes, so an original is the one archive that is never
   *  watermarked. */
  archiveBlob?: Blob;
  width?: number;
  height?: number;
  /** When the photo was TAKEN, epoch ms, read from the source JPEG's EXIF.
   *  Undefined whenever there was nothing to read: a non-JPEG source, a JPEG
   *  with no EXIF, or a date that wasn't a plausible capture time. Callers
   *  fall back to the file's own `lastModified` rather than treating a missing
   *  value as an error — a photo must never fail to upload over its date. */
  capturedAt?: number;
  /** SES-01: the camera that took the photo (EXIF Make, Model,
   *  BodySerialNumber), read from the SOURCE alongside `capturedAt`.
   *  Undefined when the source had none (non-JPEG, no EXIF, no make/model). */
  camera?: CameraIdentity;
};

/**
 * The studio's per-run quality choice.
 *  - "2560"     web delivery only (the default, and what every run did before)
 *  - "4096"     plus a lossy high-res JPEG archived on B2
 *  - "original" plus the source file itself, byte for byte, archived on B2
 */
export type UploadVariant = "2560" | "4096" | "original";

/**
 * @param variant Only "4096" changes what this function produces. "2560" and
 *   "original" both run the byte-for-byte original path below: an original's
 *   archive copy is the source File, which the engine streams straight to B2
 *   without decoding it, so the compressor must never see or re-encode it.
 */
export async function compressWithExif(
  file: File,
  watermark?: WatermarkRenderer | null,
  variant: UploadVariant = "2560",
): Promise<CompressResult> {
  // Read source EXIF before compression destroys it. Only meaningful for JPEG
  // sources (PNG/HEIC don't carry EXIF the same way). We read just the header
  // slice — EXIF sits among the APPn segments before the scan data, after a
  // JFIF APP0 in editor exports — and keep the serialized segment as raw bytes
  // so it can be spliced back in without any base64 or whole-image string
  // round-trip (both were heavy main-thread work per photo).
  const sourceIsJpeg = file.type === "image/jpeg" || /\.jpe?g$/i.test(file.name);
  let exifSegmentBytes: Uint8Array | null = null;
  let capturedAt: number | undefined;
  let camera: CameraIdentity | undefined;

  const head = new Uint8Array(await file.slice(0, EXIF_HEAD_BYTES).arrayBuffer());
  // Handed to browser-image-compression so it skips its own EXIF reader, which
  // throws inside a FileReader callback on a broken IFD offset and then never
  // settles: the upload hung on that photo (QA-01 F4). Same codes it uses.
  const exifOrientation = readJpegOrientation(head);

  if (sourceIsJpeg) {
    try {
      const exifDict = loadSourceExifDict(head, file.size) ?? (await loadFullFileExifDict(file));
      // When the photo was TAKEN — read here because this is the only moment
      // the SOURCE's EXIF is in hand, and read BEFORE the orientation reset
      // below mutates the dict. Assigned outside the dump, so a dump failure
      // costs the delivery copy its metadata without also costing us the date.
      capturedAt = captureTimeFromExif(exifDict) ?? undefined;
      // Which camera took it (SES-01), from the same dict, for the same reason.
      camera = cameraFromExif(exifDict);
      // browser-image-compression bakes orientation into pixels; reset to 1 to
      // avoid double-rotation when a viewer applies orientation later.
      if (exifDict["0th"]) {
        exifDict["0th"][piexif.ImageIFD.Orientation] = 1;
      }
      // Null when nothing usable fits one APP1; see dumpExifForSplice.
      exifSegmentBytes = dumpExifForSplice(exifDict);
    } catch {
      // Not all JPEGs have EXIF, and some carry EXIF nobody can read; ignore
      // failures and proceed without it.
      exifSegmentBytes = null;
    }
  }

  if (variant === "4096") {
    return {
      ...(await compressHighRes(file, watermark, exifSegmentBytes, capturedAt, exifOrientation)),
      camera,
    };
  }

  let compressedBlob: Blob = await imageCompression(file, {
    exifOrientation,
    // No maxSizeMB — preserve visible quality over size targets.
    maxWidthOrHeight: MAX_DIM,
    useWebWorker: true,
    fileType: OUTPUT_TYPE,
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
    return { blob: compressedBlob, thumbBlob, width, height, capturedAt, camera };
  }

  // Splice the EXIF straight into the compressed JPEG's bytes. A failure here
  // must never fail the upload — losing metadata beats losing the photo.
  // Deliberately NOT applied to thumbBlob: the grid derivative carries no
  // metadata at all (see drawThumbnail).
  try {
    const compBytes = new Uint8Array(await compressedBlob.arrayBuffer());
    const blob = spliceExifIntoJpeg(compBytes, exifSegmentBytes) ?? compressedBlob;
    return { blob, thumbBlob, width, height, capturedAt, camera };
  } catch {
    return { blob: compressedBlob, thumbBlob, width, height, capturedAt, camera };
  }
}

/**
 * The "4096" variant: one source decode produces BOTH the archive copy and the
 * delivery view, and the delivery pair comes out identical in kind to what the
 * 2560 path produces — same 2560px long edge, same q0.80, same watermark, same
 * thumbnail derived from the watermarked view.
 *
 * The 4K archive carries the watermark too. Only the "original" variant is
 * ever unwatermarked, because that one is the studio's file byte for byte and
 * never passes through here.
 *
 * The order here is load-bearing:
 *
 *   1. downscale the source to 4096 -> this IS the archive blob
 *   2. watermark the archive (never fails the upload)
 *   3. splice the source EXIF into it (the watermark re-encode drops it)
 *   4. decode it once and draw a 2560px canvas from that bitmap -> the view
 *   5. watermark the view, unless step 4 inherited the archive's mark
 *   6. thumbnail from the WATERMARKED view
 *   7. splice the source EXIF into the view
 *
 * Step 4 costs one extra decode against the 2560 path (~190 ms, entirely hidden
 * behind the 4096 object's own upload time). The view is drawn FROM the
 * watermarked archive, so the mark is composited once and scaled down with the
 * picture; stamping the view again would put it on twice. It is only stamped
 * separately when it did NOT inherit one: the archive's own watermark failed,
 * or the view had to be rebuilt from the source.
 *
 * The archive never gets a thumbnail of its own. It is the studio's copy, not
 * a delivery object.
 */
async function compressHighRes(
  file: File,
  watermark: WatermarkRenderer | null | undefined,
  exifSegmentBytes: Uint8Array | null,
  /** Already read from the source dict by the caller — the archive and the
   *  view are both derived from that same source, so they share its date. */
  capturedAt: number | undefined,
  /** Read by the caller; see compressWithExif. */
  exifOrientation: number,
): Promise<CompressResult> {
  // 1. The archive copy.
  let archiveBlob: Blob = await imageCompression(file, {
    exifOrientation,
    maxWidthOrHeight: ARCHIVE_DIM,
    useWebWorker: true,
    fileType: OUTPUT_TYPE,
    initialQuality: ARCHIVE_QUALITY,
  });

  // 2. Watermark the archive. The same never-fail-the-upload contract as the
  //    delivery view: if compositing throws, the photo ships unmarked and the
  //    view below gets its own attempt.
  let archiveMarked = false;
  if (watermark) {
    try {
      archiveBlob = await watermark.apply(archiveBlob);
      archiveMarked = true;
    } catch (err) {
      console.error("[upload:watermark] compositing the 4K archive failed; uploading it without watermark", err);
    }
  }

  // 3. Re-inject the source metadata, exactly as the 2560 path does, and with
  //    the same tolerance: losing metadata beats losing the photo. After the
  //    watermark, which re-encodes through a canvas and drops it.
  if (exifSegmentBytes) {
    try {
      const bytes = new Uint8Array(await archiveBlob.arrayBuffer());
      archiveBlob = spliceExifIntoJpeg(bytes, exifSegmentBytes) ?? archiveBlob;
    } catch {
      /* keep the un-spliced archive blob */
    }
  }

  // 4. The delivery view, drawn from the 4096 bitmap rather than re-decoding
  //    the (much larger) source a second time. It inherits the archive's mark.
  let viewBlob = await downscaleToView(archiveBlob);
  let viewMarked = archiveMarked;
  if (!viewBlob) {
    // The 4096 blob wouldn't decode. Rather than fail the photo, fall back to
    // compressing the source straight to 2560 — the delivery pair is never
    // optional, and this run still has a usable archive copy to upload.
    console.error("[upload:compress] 4096 blob would not decode; deriving the view from the source instead");
    viewBlob = await imageCompression(file, {
      exifOrientation,
      maxWidthOrHeight: MAX_DIM,
      useWebWorker: true,
      fileType: OUTPUT_TYPE,
      initialQuality: QUALITY,
    });
    // Built from the unmarked source, so nothing was inherited.
    viewMarked = false;
  }

  // 5. Watermark the view when it did not inherit a mark. Same
  //    never-fail-the-upload contract as 2560.
  if (watermark && !viewMarked) {
    try {
      viewBlob = await watermark.apply(viewBlob);
    } catch (err) {
      console.error("[upload:watermark] compositing failed; uploading without watermark", err);
    }
  }

  // 6. Dimensions + thumbnail from the watermarked view, unchanged.
  const { width, height, thumbBlob } = await measureAndThumbnail(viewBlob);

  // 7. Source EXIF into the view, last, exactly as the 2560 path does.
  if (exifSegmentBytes) {
    try {
      const bytes = new Uint8Array(await viewBlob.arrayBuffer());
      viewBlob = spliceExifIntoJpeg(bytes, exifSegmentBytes) ?? viewBlob;
    } catch {
      /* keep the un-spliced view */
    }
  }

  return { blob: viewBlob, thumbBlob, archiveBlob, width, height, capturedAt };
}

/**
 * Draw `blob` down to a MAX_DIM long edge and re-encode at QUALITY. Returns
 * undefined if the blob couldn't be decoded, so the caller can fall back rather
 * than lose the photo. Never upscales.
 */
async function downscaleToView(blob: Blob): Promise<Blob | undefined> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(blob);
  } catch {
    return undefined;
  }
  try {
    const { width: w, height: h } = viewFromArchiveDims(bmp.width, bmp.height);
    return await drawToJpeg(bmp, w, h, QUALITY);
  } finally {
    bmp.close();
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
 * Draw `bmp` scaled to fit inside the thumbnail max (never upscaled — a source
 * already under it is drawn at its own size) and encode it as JPEG. Canvas
 * output carries no EXIF by construction, which is exactly what we want: the
 * grid derivative needs no metadata and spliceExifIntoJpeg is never called for
 * it.
 */
async function drawThumbnail(bmp: ImageBitmap): Promise<Blob | undefined> {
  // fit: inside, never upscale — a source already under the thumbnail max is
  // drawn at its own size and used as-is (thumbDims in geometry.ts).
  const { width: w, height: h } = thumbDims(bmp.width, bmp.height);
  return drawToJpeg(bmp, w, h, THUMB_QUALITY);
}

/**
 * Draw a bitmap at w×h and encode it as JPEG at `quality`.
 *
 * OffscreenCanvas where available (keeps the draw off the DOM), same shape as
 * watermark.ts's makeContext/canvasToJpeg — kept local rather than shared
 * because those bake in the watermark re-encode quality. Canvas output carries
 * no EXIF by construction, which is what the thumbnail wants; the 4096 path's
 * view re-injects the source EXIF itself afterwards.
 */
async function drawToJpeg(
  bmp: ImageBitmap,
  w: number,
  h: number,
  quality: number,
): Promise<Blob | undefined> {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.drawImage(bmp, 0, 0, w, h);
    return canvas.convertToBlob({ type: OUTPUT_TYPE, quality });
  }

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;
  ctx.drawImage(bmp, 0, 0, w, h);

  return new Promise<Blob | undefined>((resolve) => {
    canvas.toBlob((b) => resolve(b ?? undefined), OUTPUT_TYPE, quality);
  });
}

/**
 * Load the source JPEG's EXIF from the header slice — EXIF sits before the SOS
 * marker, which is virtually always within the first 256 KB. Returns null when
 * the slice ended mid-segment (e.g. a giant ICC profile), so the caller re-reads
 * the full file and we never silently drop EXIF we used to keep. Throws when the
 * EXIF itself is unreadable: re-reading the whole file cannot fix that.
 */
function loadSourceExifDict(head: Uint8Array, fileSize: number) {
  try {
    return piexif.load(bytesToBinaryString(head));
  } catch (err) {
    if (exifScanNeedsFullFile(head, fileSize)) return null;
    throw err;
  }
}

async function loadFullFileExifDict(file: File) {
  const full = new Uint8Array(await file.arrayBuffer());
  return piexif.load(bytesToBinaryString(full));
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
