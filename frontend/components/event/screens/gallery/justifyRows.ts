/**
 * Classic "justified" row-packing layout (Flickr/Google-Photos style): greedily
 * fills each row to the target height, then scales the whole row so it fills
 * the container width exactly. Preserves item order (row-major), unlike CSS
 * multi-column masonry which flows column-major.
 *
 * EVERY BOX IT RETURNS IS A WHOLE NUMBER OF PIXELS, and a full row's widths sum
 * to exactly the space available. That is not tidiness, it is the fix for a
 * visible bug: the boxes used to be the raw `ar * height` floats, and a row
 * whose parts summed even a fraction of a pixel over the container pushed its
 * last tile past the edge, where the scroll container clipped it. It showed up
 * as photos very slightly cropped on the right, on some rows and not others —
 * "some" being the rows whose aspect ratios happened to round the wrong way.
 * Sub-pixel widths also made every tile edge land on a fractional boundary,
 * which the browser resolves by blending.
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
    const available = containerWidth - totalGap;
    const naturalWidth = arSum * targetRowHeight;
    let scale = available / naturalWidth;
    /* Does this row span the full width? Only one that does gets its rounding
     * remainder handed back below — a row that is deliberately short must stay
     * short, or the trailing row would silently stretch to fill after all. */
    const fills = !(isLast && scale > 1) && scale <= MAX_SCALE;
    // An incomplete trailing row keeps the target height instead of stretching
    // to fill the last row's remaining width.
    if (isLast && scale > 1) scale = 1;
    if (scale > MAX_SCALE) scale = MAX_SCALE;

    /* From here it is all about landing on whole pixels without the row ever
     * exceeding the width it has.
     *
     * `height` is rounded rather than floored so a box's shape stays as close
     * to its photo's as it can. The widths are then derived from that ROUNDED
     * height, not from the exact one, so each box's aspect matches the box it
     * is actually drawn in — which is what keeps `object-cover` from cropping.
     * The cost is that the widths no longer sum to `available` on their own,
     * in either direction, so both corrections below are real cases rather
     * than defensive padding. */
    const height = Math.max(1, Math.round(targetRowHeight * scale));
    const exact = bucket.map(({ ar }) => ar * height);
    const widths = exact.map((w) => Math.max(1, Math.floor(w)));
    let used = widths.reduce((sum, w) => sum + w, 0);

    /* Largest-remainder apportionment, in whichever direction the row needs.
     *
     * Both directions are real. Flooring every width leaves the row SHORT by up
     * to a pixel per tile, which is the ragged right edge; rounding the height
     * up overshoots every width by `ar` times the rounding, which sums to a row
     * that is LONG and gets its last tile clipped — the bug all of this is for.
     *
     * Pixels go to the boxes with the largest fractional part and come off the
     * ones with the smallest, wrapping when there are more to place than there
     * are boxes. Wrapping matters: the first version walked the list once and
     * left rows a pixel short. Taking them off the WIDEST box instead of by
     * fraction also seemed reasonable and was not — a panorama beside four
     * portraits absorbed the whole correction on its own and ended up 2px
     * narrower than its own shape, which is a visible crop on that tile and
     * nothing on the others. Spread, everything stays inside a pixel. */
    const byFraction = exact
      .map((w, i) => ({ i, fraction: w - Math.floor(w) }))
      .sort((a, b) => b.fraction - a.fraction);

    if (fills) {
      for (let k = 0; used < available; k++, used++) {
        widths[byFraction[k % byFraction.length].i] += 1;
      }
    }
    for (let k = byFraction.length - 1; used > available; k--) {
      const at = byFraction[((k % byFraction.length) + byFraction.length) % byFraction.length].i;
      if (widths[at] <= 1) break;
      widths[at] -= 1;
      used -= 1;
    }

    rows.push({
      height,
      items: bucket.map(({ item }, i) => ({ ...item, boxWidth: widths[i], boxHeight: height })),
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
