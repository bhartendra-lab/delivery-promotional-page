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

const MAX_DIM = 4096;
const QUALITY = 0.85;

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
  async run(file: File): Promise<Blob> {
    await this.acquire();
    try {
      return await compressWithExif(file);
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

export async function compressWithExif(file: File): Promise<Blob> {
  // Read source EXIF before compression destroys it.
  // Only meaningful for JPEG sources (PNG/HEIC don't have EXIF in the same way).
  const sourceIsJpeg = file.type === "image/jpeg" || /\.jpe?g$/i.test(file.name);
  let preservedExifBytes: string | null = null;

  if (sourceIsJpeg) {
    try {
      const sourceDataUrl = await fileToDataUrl(file);
      const exifDict = piexif.load(sourceDataUrl);
      // browser-image-compression bakes orientation into pixels; reset to 1 to
      // avoid double-rotation when a viewer applies orientation later.
      if (exifDict["0th"]) {
        exifDict["0th"][piexif.ImageIFD.Orientation] = 1;
      }
      preservedExifBytes = piexif.dump(exifDict);
    } catch {
      // Not all JPEGs have EXIF; ignore failures and proceed.
      preservedExifBytes = null;
    }
  }

  const compressedBlob = await imageCompression(file, {
    // No maxSizeMB — preserve visible quality over size targets.
    maxWidthOrHeight: MAX_DIM,
    useWebWorker: true,
    fileType: "image/jpeg",
    initialQuality: QUALITY,
    // alwaysKeepResolution doesn't exist, but skipping downscale for small
    // sources is already the library's default behaviour.
  });

  if (!preservedExifBytes) {
    // No EXIF to re-inject; return as-is.
    return compressedBlob;
  }

  // Re-inject EXIF. piexif works on data URLs, so we round-trip via base64.
  try {
    const compressedDataUrl = await blobToDataUrl(compressedBlob);
    const merged = piexif.insert(preservedExifBytes, compressedDataUrl);
    return dataUrlToBlob(merged);
  } catch {
    // If re-injection fails for any reason, return the compressed blob anyway —
    // losing metadata is better than failing the upload entirely.
    return compressedBlob;
  }
}

/* ── data URL <-> Blob helpers (small, hand-rolled) ───────────────── */

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(fr.error ?? new Error("FileReader failed"));
    fr.readAsDataURL(file);
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(fr.error ?? new Error("FileReader failed"));
    fr.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, b64] = dataUrl.split(",");
  const m = /data:([^;]+)/.exec(meta);
  const mime = m?.[1] ?? "image/jpeg";
  const binary = atob(b64);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
