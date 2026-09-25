import test from "node:test";
import assert from "node:assert/strict";
import { justifyRows, targetRowHeightFor, JUSTIFY_GAP } from "./justifyRows.ts";

/**
 * The invariant these exist for: A ROW NEVER OVERFLOWS ITS CONTAINER.
 *
 * It is a layout rule with a visible failure mode. The boxes are laid out in a
 * flex row with `shrink-0` inside a container that clips horizontally, so a row
 * summing even a fraction of a pixel over the available width does not wrap or
 * scroll — it puts the last tile's right edge under the clip. On screen that is
 * a photo very slightly cropped on one side, on some rows and not others, which
 * is exactly the kind of thing nobody can reproduce on demand.
 *
 * So rather than assert particular numbers, these walk a lot of aspect ratios
 * and widths and assert the property directly.
 */

/** Sum of a row's boxes plus the gaps between them — its rendered width. */
const rowWidth = (row: { items: { boxWidth: number }[] }) =>
  row.items.reduce((sum, i) => sum + i.boxWidth, 0) + JUSTIFY_GAP * (row.items.length - 1);

/** Aspect ratios chosen to be awkward: portrait, panorama, square, and several
 *  that do not divide cleanly into any sensible row height. */
const SHAPES = [
  { width: 3000, height: 2000 }, // 3:2 landscape, the common case
  { width: 2000, height: 3000 }, // 2:3 portrait
  { width: 2000, height: 2000 }, // square
  { width: 4000, height: 1333 }, // panorama
  { width: 1919, height: 1081 }, // deliberately not a round ratio
  { width: 2048, height: 1367 },
  { width: 3456, height: 2304 },
];

/** A gallery of `n` photos cycling through those shapes. */
const gallery = (n: number) => Array.from({ length: n }, (_, i) => SHAPES[i % SHAPES.length]);

test("no row ever renders wider than the container", () => {
  // Every phone and tablet width worth caring about, plus the fractional ones a
  // percentage-based container actually produces.
  for (let containerWidth = 280; containerWidth <= 1400; containerWidth++) {
    const rows = justifyRows(gallery(37), containerWidth, targetRowHeightFor(containerWidth), JUSTIFY_GAP);
    for (const row of rows) {
      assert.ok(
        rowWidth(row) <= containerWidth,
        `width ${containerWidth}: a row rendered ${rowWidth(row)}px wide, which would be clipped`,
      );
    }
  }
});

test("a full row fills the container exactly, so there is no ragged right edge", () => {
  // The other half of the same property: never over, and — for the rows that
  // are meant to span the width — never under either. Only the LAST row is
  // allowed to be short, and only when it could not be filled.
  for (let containerWidth = 320; containerWidth <= 1400; containerWidth += 7) {
    const rows = justifyRows(gallery(40), containerWidth, targetRowHeightFor(containerWidth), JUSTIFY_GAP);
    for (const row of rows.slice(0, -1)) {
      assert.equal(
        rowWidth(row),
        containerWidth,
        `width ${containerWidth}: a full row left ${containerWidth - rowWidth(row)}px unused`,
      );
    }
  }
});

test("every box is a whole number of pixels", () => {
  // Fractional box edges are what made the tile borders blend rather than land
  // on a device pixel, and they are what let the rounding drift in the first
  // place.
  const rows = justifyRows(gallery(30), 393, targetRowHeightFor(393), JUSTIFY_GAP);
  for (const row of rows) {
    assert.ok(Number.isInteger(row.height), `row height ${row.height} is fractional`);
    for (const item of row.items) {
      assert.ok(Number.isInteger(item.boxWidth), `box width ${item.boxWidth} is fractional`);
      assert.ok(Number.isInteger(item.boxHeight), `box height ${item.boxHeight} is fractional`);
    }
  }
});

test("a short trailing row keeps its height instead of stretching", () => {
  // One photo on the last row must not become a banner across the whole width.
  const rows = justifyRows(gallery(1), 1200, 240, JUSTIFY_GAP);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].height, 240);
  assert.ok(rowWidth(rows[0]) < 1200, "a lone trailing photo was stretched to fill the row");
});

test("boxes keep the shape of the photo they hold", () => {
  /* Landing on whole pixels moves each box off its exact aspect ratio, and
   * `object-cover` pays for that by cropping half the difference off each side.
   * This pins how far it can go: two pixels on a box 150px tall is under a
   * percent, and half of that is what is actually lost. The number matters —
   * it is the difference between "imperceptible" and the visible crop this
   * whole exercise was about. */
  for (const containerWidth of [320, 375, 393, 430, 768, 1024, 1440]) {
    const height = targetRowHeightFor(containerWidth);
    const rows = justifyRows(gallery(24), containerWidth, height, JUSTIFY_GAP);
    for (const row of rows) {
      for (const item of row.items) {
        const wanted = (item.width / item.height) * row.height;
        assert.ok(
          Math.abs(item.boxWidth - wanted) <= 2,
          `box is ${item.boxWidth}px for a photo that wants ${wanted.toFixed(2)}px`,
        );
      }
    }
  }
});

test("legacy media with no dimensions still lays out", () => {
  // Pre-dimension-capture rows have no width/height at all. They fall back to
  // 3:2 rather than producing NaN boxes, which would collapse the whole row.
  const rows = justifyRows([{}, {}, {}], 1000, 240, JUSTIFY_GAP);
  for (const row of rows) {
    for (const item of row.items) {
      assert.ok(Number.isFinite(item.boxWidth) && item.boxWidth > 0);
    }
  }
});

test("a container with no width yields no rows rather than NaN boxes", () => {
  // The first render before the ResizeObserver has measured anything.
  assert.deepEqual(justifyRows(gallery(5), 0, 240, JUSTIFY_GAP), []);
  assert.deepEqual(justifyRows([], 1000, 240, JUSTIFY_GAP), []);
});
