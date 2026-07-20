/**
 * Pre-upload storage estimation for storage-based plans (Monthly / Yearly).
 *
 * Compressing every selected file just to measure it would duplicate the work
 * the engine does on start and freeze the UI. Instead we compress a small,
 * evenly-spread sample through the real pipeline (`compressWithExif` — the same
 * downscale-to-2560px + JPEG q0.80 path the engine uses) and extrapolate the
 * mean compressed size across the whole selection. This tracks real output size
 * far better than any fixed KB/photo constant, since sizes vary hugely by source
 * resolution and content.
 */

import { compressWithExif } from "./compressor";

const BYTES_PER_GB = 1024 ** 3;
/** Max files to actually compress for the estimate — a second or two of work. */
export const ESTIMATE_SAMPLE_SIZE = 12;

/**
 * Human-friendly size label for a GB figure. Small selections that would round
 * to "0.0 GB" are shown in MB instead (one decimal under 10 MB, else whole MB),
 * so the estimate never reads as zero for a real, non-empty upload.
 */
export function formatSizeFromGB(gb: number): string {
  if (gb >= 0.1) return `${gb.toFixed(1)} GB`;
  const mb = gb * 1024;
  return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
}

/**
 * Pick up to `sampleSize` files evenly spread across the selection (not the
 * first N — early files in a sorted folder may be unrepresentative).
 */
export function pickSample<T>(items: T[], sampleSize = ESTIMATE_SAMPLE_SIZE): T[] {
  if (items.length <= sampleSize) return items.slice();
  const step = Math.max(1, Math.floor(items.length / sampleSize));
  const out: T[] = [];
  for (let i = 0; i < items.length && out.length < sampleSize; i += step) {
    out.push(items[i]);
  }
  return out;
}

/**
 * Estimate the total compressed upload size (in GB) for `files`. Compresses an
 * even sample, averages the output blob sizes, and scales by the file count.
 * Returns 0 for an empty selection. Rejects only if every sampled compression
 * throws (extremely unlikely — the pipeline is failure-tolerant per file).
 */
export async function estimateCompressedGB(files: File[]): Promise<number> {
  if (files.length === 0) return 0;
  const sample = pickSample(files);
  const sizes: number[] = [];
  for (const file of sample) {
    try {
      const { blob } = await compressWithExif(file, null);
      sizes.push(blob.size);
    } catch {
      // A single un-compressible file shouldn't skew or break the estimate;
      // fall back to its original size so the total isn't understated.
      sizes.push(file.size);
    }
  }
  if (sizes.length === 0) return 0;
  const avg = sizes.reduce((s, n) => s + n, 0) / sizes.length;
  return (avg * files.length) / BYTES_PER_GB;
}
