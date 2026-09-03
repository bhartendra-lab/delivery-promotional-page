/**
 * Pre-upload storage estimation for storage-based plans (Monthly / Yearly).
 *
 * Compressing every selected file just to measure it would duplicate the work
 * the engine does on start and freeze the UI. Instead we compress a small,
 * evenly-spread sample through the real pipeline (`compressWithExif` — the same
 * downscale-to-2560px + JPEG q0.80 path the engine uses, which also emits the
 * 480px grid thumbnail that gets uploaded alongside it) and extrapolate the
 * mean per-photo size across the whole selection. This tracks real output size
 * far better than any fixed KB/photo constant, since sizes vary hugely by source
 * resolution and content.
 *
 * On an archive tier the estimate must cover the archive object too — it is by
 * far the largest thing the run stores. For "original" that term needs no
 * sampling at all, since every file's exact size is already in hand.
 */

import { compressWithExif } from "./compressor";
import type { UploadVariant } from "./compressor";

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
 * Estimate the TOTAL upload size (in GB) for `files` at a given quality tier —
 * every object the run will store, not just the delivery copy.
 *
 * Per tier:
 *  - "2560"     sample the delivery pair and extrapolate (unchanged behaviour)
 *  - "4096"     sample through the 4096 path, so the archive term is a real
 *               measured 4096px blob rather than a guess
 *  - "original" sample the derivatives as usual, but take the archive term as
 *               `sum(file.size)` EXACTLY — no sampling, because an original's
 *               size is already known precisely for every file. Extrapolating a
 *               12-file mean across a mixed selection would be strictly worse
 *               than arithmetic we can just do.
 *
 * This figure feeds the plan-limit gate, which is why the archive term is not
 * optional: an originals run left on the old estimate would under-report by
 * roughly 30x and sail through a check it should have failed.
 *
 * Returns 0 for an empty selection.
 */
export async function estimateCompressedGB(
  files: File[],
  variant: UploadVariant = "2560",
): Promise<number> {
  if (files.length === 0) return 0;
  const sample = pickSample(files);
  // Derivative bytes per photo (delivery copy + grid thumbnail), and — for
  // "4096" only — the archive blob, which really is sampled because its size
  // depends on the source in a way we cannot compute.
  const derivativeSizes: number[] = [];
  const archiveSizes: number[] = [];
  for (const file of sample) {
    try {
      const { blob, thumbBlob, archiveBlob } = await compressWithExif(file, null, variant);
      derivativeSizes.push(blob.size + (thumbBlob?.size ?? 0));
      if (archiveBlob) archiveSizes.push(archiveBlob.size);
    } catch {
      // A single un-compressible file shouldn't skew or break the estimate;
      // fall back to its original size so the total isn't understated.
      derivativeSizes.push(file.size);
    }
  }
  if (derivativeSizes.length === 0) return 0;

  const mean = (xs: number[]) => xs.reduce((s, n) => s + n, 0) / xs.length;
  let totalBytes = mean(derivativeSizes) * files.length;

  if (variant === "4096" && archiveSizes.length > 0) {
    totalBytes += mean(archiveSizes) * files.length;
  } else if (variant === "original") {
    // Exact, not sampled.
    totalBytes += files.reduce((sum, f) => sum + f.size, 0);
  }

  return totalBytes / BYTES_PER_GB;
}
