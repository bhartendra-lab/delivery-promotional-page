/**
 * Which photos the upload dialog's "Check before uploading" strip renders.
 * Pure, so the rule is tested: only the first few, in selection order, and only
 * ones the browser can be asked to show (images, not videos).
 */

/** How many photos are previewed. A choice of this pass, listed in the report. */
export const PREVIEW_COUNT = 5;

type FileLike = { name: string; size: number; lastModified: number; type?: string };

/** The first PREVIEW_COUNT image files of the selection, in the order picked. */
export function firstPreviewFiles<T extends FileLike>(files: readonly T[], count = PREVIEW_COUNT): T[] {
  const out: T[] = [];
  for (const file of files) {
    if (out.length >= count) break;
    if (file.type && file.type.startsWith("video/")) continue;
    out.push(file);
  }
  return out;
}

/** A stable identity for a picked file, so a preview survives unrelated re-renders. */
export function previewKeyOf(file: FileLike): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}
