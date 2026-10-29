/**
 * Column masonry (Pinterest style): fixed-width columns, each photo dropped
 * into whichever column is currently shortest, ties to the leftmost. Columns
 * within `LEVEL_SHARE` of a column's width of the shortest count as tied (see
 * there for why).
 *
 * WHY THIS AND NOT THE JUSTIFIED ROWS (justifyRows.ts) IT REPLACES AS THE
 * DEFAULT. Two properties the rows could not have:
 *
 *   1. A placed photo never moves. Justified rows re-pack the trailing row
 *      every time a page arrives, so the last few photos on screen jump as the
 *      guest scrolls into them. Here a box depends only on the boxes before it,
 *      so appending a page adds boxes and touches nothing above. That is tested
 *      as a property ("prefix stability"), and it is what lets `prev` below
 *      continue from an earlier layout instead of starting over.
 *   2. Every box has an absolute position known up front, so the grid can
 *      render only what is near the viewport (`masonryWindow`). A 5,000 photo
 *      gallery is then a few dozen DOM nodes, which is what keeps it smooth on
 *      a mid-range Android phone.
 *
 * And why not CSS `columns`: it flows column-major (photo 2 lands under photo 1
 * instead of beside it) and re-flows every column when items are appended.
 *
 * EVERY NUMBER IT RETURNS IS A WHOLE PIXEL, for the reason justifyRows.ts
 * gives at length: fractional boxes that sum a hair over the container put the
 * right-hand tiles under the scroll container's clip, which shows as photos
 * very slightly cropped on one edge. Column widths are floored and the leftover
 * pixels handed to the leftmost columns, so columns plus gaps sum to the
 * container width exactly, never more.
 *
 * No aliased imports: unit-tested under `node --test`.
 */

/** Fallback aspect ratio (w/h) for legacy media captured before dimension
 *  capture landed. Same 3:2 justifyRows uses, so nothing changes shape. */
export const DEFAULT_ASPECT_RATIO = 3 / 2;
/**
 * Display clamp on aspect ratio. Without it a 1:3 phone screenshot becomes a
 * tile three columns tall, and a 3:1 panorama a sliver nobody can tap. Inside
 * the clamp a tile is exactly its photo's shape (no crop); outside it the tile
 * stops at the clamp and the image, drawn `object-cover`, crops centrally.
 */
export const MIN_ASPECT_RATIO = 0.5;
export const MAX_ASPECT_RATIO = 2;

/**
 * Columns this close to the shortest (as a share of the column width) count as
 * level, and the next photo goes to the leftmost of them. Without it a row of
 * landscapes that differ by 2 or 3 pixels (one camera's 3:2 beside another's
 * 3:2-ish crop) sent the next photos to whichever columns happened to be a
 * pixel short, often the right-hand ones, leaving the left side of the grid
 * empty under a full first row. With it the grid fills left to right, the way
 * it reads. The cost is that the bottom edge can end up to this much more
 * ragged, which nobody sees. About 28px on a laptop column, 21px on a phone.
 */
export const LEVEL_SHARE = 0.12;

export type MasonryBox = {
  left: number;
  top: number;
  width: number;
  /** The whole tile: the photo plus the layout's `footer`. */
  height: number;
  /** Which column the box was placed in. */
  column: number;
};

export type MasonryLayout = {
  /** The width this was solved for. A layout is only reusable at this width. */
  containerWidth: number;
  columns: number;
  /** The narrowest column's width. Columns differ by at most one pixel (the
   *  leftover pixels go to the leftmost ones), so read `columnWidths` for a
   *  particular column. */
  columnWidth: number;
  gap: number;
  columnLefts: number[];
  columnWidths: number[];
  /** Where the next box in each column would start: the column's filled height
   *  plus one trailing gap (0 for an empty column). This is the whole state a
   *  continuation needs, which is why it is kept. */
  columnHeights: number[];
  /** Item indices per column, in placement order. Placement order is also
   *  `top` order within a column, which is what makes the binary search in
   *  `masonryWindow` valid. */
  columnItems: number[][];
  /** One box per item, parallel to the items passed in. */
  boxes: MasonryBox[];
  /** Total height: the tallest column, without its trailing gap. */
  height: number;
  /** Fixed height under every photo (the phone's like-and-menu line), part of
   *  each box. A layout is only reusable for the same footer. */
  footer: number;
};

type Sized = { width?: number; height?: number };

/** Column count per container width. A phone holds two; the bands above are
 *  sized so a column never drops much below ~170px, which is where a portrait
 *  stops reading as a photo and starts reading as a stripe. */
export function columnsFor(width: number): number {
  if (width < 560) return 2;
  if (width < 900) return 3;
  if (width < 1280) return 4;
  if (width < 1680) return 5;
  return 6;
}

/** Gutter between tiles, both directions. Tight on phones, where every pixel
 *  of photo counts; roomier where there is room. */
export function gapFor(width: number): number {
  if (width < 560) return 6;
  if (width < 1024) return 8;
  return 12;
}

/** Tile corner radius. Generous, per the guest-side design rules, but a 16px
 *  corner on a 170px phone tile reads as a pill, so phones get 12. */
export function radiusFor(width: number): number {
  return width < 560 ? 12 : 16;
}

/**
 * The aspect ratio a tile is drawn at, and whether the clamp changed it. A
 * missing, zero or non-finite dimension falls back to 3:2, which is never
 * clamped, so a legacy photo lays out exactly as its fallback says.
 */
export function displayAspect(item: Sized): { ar: number; clamped: boolean } {
  const w = item.width;
  const h = item.height;
  if (!w || !h || !Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return { ar: DEFAULT_ASPECT_RATIO, clamped: false };
  }
  const raw = w / h;
  const ar = Math.min(MAX_ASPECT_RATIO, Math.max(MIN_ASPECT_RATIO, raw));
  return { ar, clamped: ar !== raw };
}

function emptyLayout(containerWidth: number, footer: number): MasonryLayout {
  return {
    containerWidth,
    columns: 0,
    columnWidth: 0,
    gap: 0,
    columnLefts: [],
    columnWidths: [],
    columnHeights: [],
    columnItems: [],
    boxes: [],
    height: 0,
    footer,
  };
}

/** Columns for a width: whole-pixel widths and lefts summing to `width`. */
function solveColumns(width: number): { columns: number; gap: number; widths: number[]; lefts: number[] } {
  let columns = columnsFor(width);
  const gap = gapFor(width);
  // A container too narrow for its band's columns (only reachable in a test or
  // a squeezed sidebar) degrades to one full-width column rather than to
  // zero-pixel ones.
  if (Math.floor((width - gap * (columns - 1)) / columns) < 1) columns = 1;
  const available = width - gap * (columns - 1);
  const base = Math.floor(available / columns);
  const leftover = available - base * columns;
  const widths: number[] = [];
  const lefts: number[] = [];
  let x = 0;
  for (let c = 0; c < columns; c++) {
    const w = base + (c < leftover ? 1 : 0);
    widths.push(w);
    lefts.push(x);
    x += w + gap;
  }
  return { columns, gap, widths, lefts };
}

/**
 * Lay `items` out for a container `containerWidth` pixels wide. `footer` is a
 * fixed strip under every photo (0 for none): each box is the photo's own
 * height plus it, so a line of controls under the photo never overlaps the
 * next tile.
 *
 * `prev`, when given, must be the layout of a PREFIX of these same items at
 * this same width (the caller owns that check: see `createMasonryCache`). The
 * new items are then placed after it and the prefix is reused as it is, which
 * by prefix stability is exactly what a full recompute would produce. A `prev`
 * for another width, or for more items than these, is ignored.
 *
 * Never mutates `prev`.
 */
export function masonryLayout<T extends Sized>(items: T[], containerWidth: number, prev?: MasonryLayout, footer = 0): MasonryLayout {
  const width = Math.floor(containerWidth);
  if (!(width > 0) || items.length === 0) return emptyLayout(width > 0 ? width : 0, footer);

  const reuse =
    prev && prev.containerWidth === width && prev.footer === footer && prev.columns > 0 && prev.boxes.length <= items.length
      ? prev
      : null;

  let columns: number;
  let gap: number;
  let widths: number[];
  let lefts: number[];
  let heights: number[];
  let colItems: number[][];
  let boxes: MasonryBox[];
  if (reuse) {
    ({ columns, gap } = reuse);
    widths = reuse.columnWidths;
    lefts = reuse.columnLefts;
    heights = reuse.columnHeights.slice();
    colItems = reuse.columnItems.map((list) => list.slice());
    boxes = reuse.boxes.slice();
  } else {
    ({ columns, gap, widths, lefts } = solveColumns(width));
    heights = new Array(columns).fill(0);
    colItems = Array.from({ length: columns }, () => []);
    boxes = [];
  }

  // Fixed per width, so a continuation uses the same margin as a full layout.
  const level = Math.round(Math.min(...widths) * LEVEL_SHARE);
  for (let i = boxes.length; i < items.length; i++) {
    // The leftmost column within `level` of the shortest.
    const shortest = Math.min(...heights);
    let col = 0;
    while (heights[col] > shortest + level) col++;
    const w = widths[col];
    const h = Math.max(1, Math.round(w / displayAspect(items[i]).ar)) + footer;
    boxes.push({ left: lefts[col], top: heights[col], width: w, height: h, column: col });
    colItems[col].push(i);
    heights[col] += h + gap;
  }

  let height = 0;
  for (let c = 0; c < columns; c++) {
    if (colItems[c].length > 0) height = Math.max(height, heights[c] - gap);
  }

  return {
    containerWidth: width,
    columns,
    columnWidth: Math.min(...widths),
    gap,
    columnLefts: lefts,
    columnWidths: widths,
    columnHeights: heights,
    columnItems: colItems,
    boxes,
    height,
    footer,
  };
}

/**
 * The item indices whose boxes intersect the vertical band `[fromY, toY)`,
 * ascending. `fromY`/`toY` are in the grid's own coordinates (0 = the top of
 * the first row). One binary search per column for the first box that ends
 * below `fromY`, then a walk until a box starts at or past `toY`.
 */
export function masonryWindow(layout: MasonryLayout, fromY: number, toY: number): number[] {
  if (!(toY > fromY)) return [];
  const out: number[] = [];
  for (const list of layout.columnItems) {
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const b = layout.boxes[list[mid]];
      if (b.top + b.height <= fromY) lo = mid + 1;
      else hi = mid;
    }
    for (let k = lo; k < list.length; k++) {
      const i = list[k];
      if (layout.boxes[i].top >= toY) break;
      out.push(i);
    }
  }
  return out.sort((a, b) => a - b);
}

/**
 * A memo that remembers its last layout, so appending a page lays out only
 * the new page. Reuses the previous layout when the width is the same and the
 * previous items are a prefix of these (compared by `_id`: a photo's
 * dimensions never change, so the same id means the same box). Anything else
 * (a new tab, a removed photo, a resize) lays out from scratch.
 *
 * A closure rather than a ref so the grid can hold it in `useState` and call it
 * inside `useMemo` without reading a ref during render.
 */
export function createMasonryCache<T extends Sized & { _id: string }>(): (items: T[], containerWidth: number, footer?: number) => MasonryLayout {
  let last: { layout: MasonryLayout; ids: string[] } | null = null;
  return (items, containerWidth, footer = 0) => {
    const width = Math.floor(containerWidth);
    let prev: MasonryLayout | undefined;
    if (last && last.layout.containerWidth === width && last.layout.footer === footer && last.ids.length <= items.length) {
      const ids = last.ids;
      let same = true;
      for (let i = 0; i < ids.length; i++) {
        if (items[i]._id !== ids[i]) {
          same = false;
          break;
        }
      }
      if (same) prev = last.layout;
    }
    const layout = masonryLayout(items, width, prev, footer);
    last = { layout, ids: items.map((m) => m._id) };
    return layout;
  };
}

/**
 * Where to scroll so a tile is in view, or null when it already is. For the
 * return from the viewer: the reel can travel hundreds of photos from where it
 * was opened, and closing it should land the guest on the photo they were
 * last looking at rather than where they started.
 *
 * `boxTop` is the tile's top in the scroll container's CONTENT coordinates.
 * The insets are what covers the container's edges without scrolling with it
 * (the desktop's pinned control row at the top, the phone's bottom nav at the
 * bottom); a tile under them is not "in view". An out-of-view tile is centred
 * in what is left, or top-aligned under the inset when it is taller than that.
 */
export function revealScrollTop({
  boxTop,
  boxHeight,
  scrollTop,
  viewportHeight,
  insetTop = 0,
  insetBottom = 0,
}: {
  boxTop: number;
  boxHeight: number;
  scrollTop: number;
  viewportHeight: number;
  insetTop?: number;
  insetBottom?: number;
}): number | null {
  const visibleTop = scrollTop + insetTop;
  const visibleBottom = scrollTop + viewportHeight - insetBottom;
  if (boxTop >= visibleTop && boxTop + boxHeight <= visibleBottom) return null;
  const room = viewportHeight - insetTop - insetBottom;
  const target = boxTop - insetTop - Math.max(0, (room - boxHeight) / 2);
  return Math.max(0, Math.round(target));
}
