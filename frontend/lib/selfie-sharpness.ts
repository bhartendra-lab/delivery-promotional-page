/**
 * Picking the sharpest of a few camera frames for the guest selfie.
 *
 * A single grabbed video frame is often motion-blurred: 14–29% of web selfies
 * every week were rejected as IMAGE_TOO_BLURRY (Sept–Nov 2026). The scanner now
 * looks at several frames over about half a second and keeps the sharpest.
 *
 * The score is the one the face-search worker gates on: the variance of the
 * 4-neighbour Laplacian of a 192×192 grayscale crop (cv2.Laplacian, ksize 1).
 * Here the crop is the middle of the frame, where the guide oval puts the face.
 */

export const SHARPNESS_SIZE = 192;

/** Rec. 601 luma, as cv2.COLOR_BGR2GRAY computes it, from RGBA pixels. */
export function lumaFromRgba(rgba: ArrayLike<number>, pixels: number): Float32Array {
  const out = new Float32Array(pixels);
  for (let i = 0, j = 0; i < pixels; i++, j += 4) {
    out[i] = 0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2];
  }
  return out;
}

/** Variance of the 4-neighbour Laplacian over the interior pixels. */
export function laplacianVariance(gray: ArrayLike<number>, width: number, height: number): number {
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const v = gray[i - width] + gray[i + width] + gray[i - 1] + gray[i + 1] - 4 * gray[i];
      sum += v;
      sumSq += v * v;
      n++;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

/** The part of a frame scored for sharpness: centred, where the oval sits. */
export function sharpnessRegion(width: number, height: number) {
  const w = Math.round(width * 0.5);
  const h = Math.round(height * 0.5);
  return { x: Math.round((width - w) / 2), y: Math.round(height * 0.2), w, h };
}
