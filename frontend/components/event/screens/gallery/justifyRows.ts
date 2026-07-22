/**
 * Classic "justified" row-packing layout (Flickr/Google-Photos style): greedily
 * fills each row to the target height, then scales the whole row so it fills
 * the container width exactly. Preserves item order (row-major), unlike CSS
 * multi-column masonry which flows column-major.
 */

/** Fallback aspect ratio (w/h) for legacy media captured before dimension
 *  capture landed — keeps them laying out instead of crashing or reflowing. */
const DEFAULT_ASPECT_RATIO = 3 / 2;

/** Cap on how far a row may be stretched above the target height — guards
 *  against a handful of very narrow (portrait) items blowing up a row. */
const MAX_SCALE = 1.35;

export type JustifiedItem<T> = T & { boxWidth: number; boxHeight: number };
export type JustifiedRow<T> = { height: number; items: JustifiedItem<T>[] };

export function justifyRows<T extends { width?: number; height?: number }>(
  items: T[],
  containerWidth: number,
  targetRowHeight: number,
  gap: number,
): JustifiedRow<T>[] {
  if (containerWidth <= 0 || items.length === 0) return [];

  const rows: JustifiedRow<T>[] = [];
  let bucket: { item: T; ar: number }[] = [];
  let arSum = 0;

  const flush = (isLast: boolean) => {
    if (!bucket.length) return;
    const totalGap = gap * (bucket.length - 1);
    const naturalWidth = arSum * targetRowHeight;
    let scale = (containerWidth - totalGap) / naturalWidth;
    // An incomplete trailing row keeps the target height instead of stretching
    // to fill the last row's remaining width.
    if (isLast && scale > 1) scale = 1;
    if (scale > MAX_SCALE) scale = MAX_SCALE;
    const height = targetRowHeight * scale;
    rows.push({
      height,
      items: bucket.map(({ item, ar }) => ({ ...item, boxWidth: ar * height, boxHeight: height })),
    });
    bucket = [];
    arSum = 0;
  };

  for (const item of items) {
    const ar = item.width && item.height ? item.width / item.height : DEFAULT_ASPECT_RATIO;
    bucket.push({ item, ar });
    arSum += ar;
    const totalGap = gap * (bucket.length - 1);
    if (arSum * targetRowHeight + totalGap >= containerWidth) flush(false);
  }
  flush(true);

  return rows;
}

/** Target row height derived from the measured container width — narrower
 *  containers (mobile, sidebars) get shorter rows so a row still holds a
 *  couple of photos. */
export function targetRowHeightFor(containerWidth: number): number {
  if (containerWidth < 480) return 120;
  if (containerWidth < 768) return 150;
  if (containerWidth < 1200) return 200;
  return 240;
}

export const JUSTIFY_GAP = 8;
