import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_ASPECT_RATIO,
  columnsFor,
  createMasonryCache,
  displayAspect,
  gapFor,
  masonryLayout,
  masonryWindow,
  radiusFor,
  revealScrollTop,
  type MasonryLayout,
} from "./masonry.ts";

/**
 * Most of these assert PROPERTIES over many shapes and widths rather than
 * particular numbers, the same way justifyRows.test.ts does: the failures they
 * guard against (a column a pixel too wide, a photo that moves when a page
 * arrives) show up on some widths and not others.
 */

const SHAPES = [
  { width: 3000, height: 2000 }, // 3:2 landscape
  { width: 2000, height: 3000 }, // 2:3 portrait
  { width: 2000, height: 2000 }, // square
  { width: 4000, height: 1333 }, // panorama, clamped to 2:1
  { width: 1080, height: 3240 }, // 1:3 screenshot, clamped to 1:2
  { width: 1919, height: 1081 }, // not a round ratio
  {}, // legacy, no dimensions
];

/** A deterministic mixed list: shapes cycled with a stride so neighbours vary. */
function mixed(n: number) {
  return Array.from({ length: n }, (_, i) => ({ _id: `m${i}`, ...SHAPES[(i * 5 + (i >> 2)) % SHAPES.length] }));
}

const WIDTHS = [1, 7, 120, 320, 343, 358, 359, 390, 559, 560, 728, 899, 900, 1023, 1024, 1116, 1279, 1280, 1376, 1679, 1680, 1920];

test("column counts follow the width bands", () => {
  assert.equal(columnsFor(320), 2);
  assert.equal(columnsFor(559), 2);
  assert.equal(columnsFor(560), 3);
  assert.equal(columnsFor(899), 3);
  assert.equal(columnsFor(900), 4);
  assert.equal(columnsFor(1279), 4);
  assert.equal(columnsFor(1280), 5);
  assert.equal(columnsFor(1679), 5);
  assert.equal(columnsFor(1680), 6);
  assert.equal(columnsFor(2560), 6);
});

test("gaps and radii follow their bands", () => {
  assert.equal(gapFor(358), 6);
  assert.equal(gapFor(560), 8);
  assert.equal(gapFor(1023), 8);
  assert.equal(gapFor(1024), 12);
  assert.equal(radiusFor(559), 12);
  assert.equal(radiusFor(560), 16);
});

test("the layout uses its band's column count once there is room", () => {
  for (const w of [358, 728, 1116, 1376, 1920]) {
    assert.equal(masonryLayout(mixed(10), w).columns, columnsFor(w), `width ${w}`);
  }
});

test("every number is a whole pixel", () => {
  for (const w of WIDTHS) {
    const l = masonryLayout(mixed(80), w + 0.67); // fractional widths are floored
    for (const n of [...l.columnLefts, ...l.columnWidths, ...l.columnHeights, l.height]) {
      assert.ok(Number.isInteger(n), `width ${w}: ${n}`);
    }
    for (const b of l.boxes) {
      for (const n of [b.left, b.top, b.width, b.height]) assert.ok(Number.isInteger(n), `width ${w}: box ${n}`);
    }
  }
});

test("columns and gaps fill the container exactly, never past it", () => {
  for (const w of WIDTHS) {
    const l = masonryLayout(mixed(20), w);
    const used = l.columnWidths.reduce((s, x) => s + x, 0) + l.gap * (l.columns - 1);
    assert.equal(used, w, `width ${w}`);
    for (const b of l.boxes) assert.ok(b.left + b.width <= w, `width ${w}: box runs to ${b.left + b.width}`);
    // Leftover pixels go left: widths never increase left to right, and differ by at most one.
    for (let c = 1; c < l.columns; c++) {
      assert.ok(l.columnWidths[c] <= l.columnWidths[c - 1], `width ${w}`);
      assert.ok(l.columnWidths[0] - l.columnWidths[c] <= 1, `width ${w}`);
    }
  }
});

test("a container too narrow for its columns degrades to one full-width column", () => {
  const l = masonryLayout(mixed(3), 7);
  assert.equal(l.columns, 1);
  assert.deepEqual(l.columnWidths, [7]);
  assert.ok(l.boxes.every((b) => b.left === 0 && b.width === 7));
});

test("each photo goes to the shortest column, ties to the leftmost", () => {
  const squares = Array.from({ length: 4 }, () => ({ width: 100, height: 100 }));
  const l = masonryLayout(squares, 358); // 2 columns of 176, gap 6
  assert.deepEqual(
    l.boxes.map((b) => b.column),
    [0, 1, 0, 1],
  );
  // A tall first photo sends the next two to the right-hand column.
  const l2 = masonryLayout([{ width: 1000, height: 2000 }, { width: 100, height: 100 }, { width: 100, height: 100 }], 358);
  assert.deepEqual(
    l2.boxes.map((b) => b.column),
    [0, 1, 1],
  );
  assert.equal(l2.boxes[2].top, l2.boxes[1].height + l2.gap);
});

test("boxes in a column stack with exactly one gap between them", () => {
  const l = masonryLayout(mixed(60), 1116);
  for (const list of l.columnItems) {
    for (let k = 1; k < list.length; k++) {
      const a = l.boxes[list[k - 1]];
      const b = l.boxes[list[k]];
      assert.equal(b.top, a.top + a.height + l.gap);
    }
  }
  const tallest = Math.max(...l.columnItems.map((list) => {
    const last = l.boxes[list[list.length - 1]];
    return last ? last.top + last.height : 0;
  }));
  assert.equal(l.height, tallest);
});

test("aspect ratio is clamped to 1:2 .. 2:1 and only then", () => {
  assert.deepEqual(displayAspect({ width: 4000, height: 1000 }), { ar: 2, clamped: true });
  assert.deepEqual(displayAspect({ width: 1000, height: 4000 }), { ar: 0.5, clamped: true });
  assert.deepEqual(displayAspect({ width: 3000, height: 2000 }), { ar: 1.5, clamped: false });
  assert.deepEqual(displayAspect({ width: 2000, height: 1000 }), { ar: 2, clamped: false });
  const l = masonryLayout([{ width: 6000, height: 1000 }], 358);
  assert.equal(l.boxes[0].height, Math.round(l.boxes[0].width / 2));
});

test("missing or broken dimensions fall back to 3:2", () => {
  for (const item of [{}, { width: 0, height: 100 }, { width: 100 }, { width: NaN, height: 5 }, { width: -3, height: 2 }]) {
    assert.deepEqual(displayAspect(item), { ar: DEFAULT_ASPECT_RATIO, clamped: false });
  }
  const l = masonryLayout([{}], 358);
  assert.equal(l.boxes[0].height, Math.round(l.boxes[0].width / DEFAULT_ASPECT_RATIO));
});

test("prefix stability: appending items never moves the ones already placed", () => {
  const all = mixed(150);
  for (const w of WIDTHS) {
    const full = masonryLayout(all, w);
    for (const n of [1, 2, 7, 60, 61, 120, 149]) {
      assert.deepEqual(masonryLayout(all.slice(0, n), w).boxes, full.boxes.slice(0, n), `width ${w}, prefix ${n}`);
    }
  }
});

test("continuing from a prefix layout equals laying out from scratch", () => {
  const all = mixed(180);
  for (const w of [358, 728, 1116, 1376]) {
    let acc: MasonryLayout | undefined;
    for (const end of [60, 120, 180]) acc = masonryLayout(all.slice(0, end), w, acc);
    assert.deepEqual(acc, masonryLayout(all, w), `width ${w}`);
  }
});

test("a continuation never mutates the layout it continued from", () => {
  const all = mixed(90);
  const first = masonryLayout(all.slice(0, 30), 728);
  const snapshot = structuredClone(first);
  masonryLayout(all, 728, first);
  assert.deepEqual(first, snapshot);
});

test("a prev for another width, or for more items, is ignored", () => {
  const all = mixed(40);
  const wide = masonryLayout(all, 1376);
  assert.deepEqual(masonryLayout(all, 358, wide), masonryLayout(all, 358));
  assert.deepEqual(masonryLayout(all.slice(0, 10), 1376, wide), masonryLayout(all.slice(0, 10), 1376));
});

test("empty and zero-width inputs give an empty layout", () => {
  for (const [items, w] of [[[], 390], [mixed(5), 0], [mixed(5), -20], [mixed(5), NaN]] as const) {
    const l = masonryLayout(items as { width?: number; height?: number }[], w as number);
    assert.equal(l.boxes.length, 0);
    assert.equal(l.height, 0);
    assert.deepEqual(masonryWindow(l, 0, 1000), []);
  }
});

test("the window returns exactly the boxes that intersect the band", () => {
  const l = masonryLayout(mixed(400), 1116);
  for (const [from, to] of [[0, 800], [1234, 2900], [-500, 100], [l.height - 300, l.height + 500], [5000, 5001]]) {
    const expected = l.boxes
      .map((b, i) => ({ b, i }))
      .filter(({ b }) => b.top < to && b.top + b.height > from)
      .map(({ i }) => i);
    assert.deepEqual(masonryWindow(l, from, to), expected, `band ${from}..${to}`);
  }
  assert.deepEqual(masonryWindow(l, 900, 900), []);
  assert.equal(masonryWindow(l, -Infinity, Infinity).length, 400);
});

test("the cache reuses its last layout only for a same-width prefix", () => {
  const layoutFor = createMasonryCache<{ _id: string; width?: number; height?: number }>();
  const all = mixed(120);
  const a = layoutFor(all.slice(0, 60), 728);
  const b = layoutFor(all, 728);
  assert.deepEqual(b, masonryLayout(all, 728));
  // The first page's boxes are the same objects: they were reused, not redone.
  assert.equal(b.boxes[10], a.boxes[10]);
  // A different first photo (a new tab, a removed photo) lays out from scratch.
  const swapped = [all[1], all[0], ...all.slice(2)];
  const c = layoutFor(swapped, 728);
  assert.deepEqual(c, masonryLayout(swapped, 728));
  assert.notEqual(c.boxes[50], b.boxes[50]);
  // A resize lays out from scratch too.
  assert.deepEqual(layoutFor(swapped, 1116), masonryLayout(swapped, 1116));
});

test("a tile already fully in view is left where it is", () => {
  assert.equal(revealScrollTop({ boxTop: 1200, boxHeight: 200, scrollTop: 1000, viewportHeight: 800 }), null);
  assert.equal(revealScrollTop({ boxTop: 1000, boxHeight: 800, scrollTop: 1000, viewportHeight: 800 }), null);
});

test("a tile out of view, or under a pinned edge, is centred in what is left", () => {
  // Far below: centred in the 800px viewport.
  assert.equal(revealScrollTop({ boxTop: 5000, boxHeight: 200, scrollTop: 0, viewportHeight: 800 }), 4700);
  // Half under the desktop's 60px pinned row: not in view, centred below the row.
  assert.equal(
    revealScrollTop({ boxTop: 1030, boxHeight: 200, scrollTop: 1000, viewportHeight: 800, insetTop: 60 }),
    1030 - 60 - (800 - 60 - 200) / 2,
  );
  // Behind the phone's bottom nav.
  assert.notEqual(revealScrollTop({ boxTop: 1650, boxHeight: 120, scrollTop: 1000, viewportHeight: 800, insetBottom: 96 }), null);
});

test("a tile taller than the room is top-aligned, and the target never goes negative", () => {
  assert.equal(revealScrollTop({ boxTop: 3000, boxHeight: 1200, scrollTop: 0, viewportHeight: 800, insetTop: 60 }), 2940);
  assert.equal(revealScrollTop({ boxTop: 10, boxHeight: 200, scrollTop: 400, viewportHeight: 800 }), 0);
});
