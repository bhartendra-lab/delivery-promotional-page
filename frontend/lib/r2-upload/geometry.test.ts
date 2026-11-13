import { test } from "node:test";
import assert from "node:assert/strict";
import {
  archiveDims,
  sizeGuardQualities,
  thumbDims,
  viewDims,
  viewFromArchiveDims,
  watermarkAlpha,
  watermarkPlacement,
  watermarkSize,
} from "./geometry.ts";

/* ── viewDims: browser-image-compression's handleMaxWidthOrHeight ──── */

test("viewDims: exact results for common camera sizes", () => {
  assert.deepEqual(viewDims(4000, 3000), { width: 2560, height: 1920 });
  assert.deepEqual(viewDims(5120, 2880), { width: 2560, height: 1440 });
  assert.deepEqual(viewDims(6000, 4000), { width: 2560, height: 1706 });
  assert.deepEqual(viewDims(8256, 5504), { width: 2560, height: 1706 });
});

test("viewDims: truncates, never rounds, a product just below an integer", () => {
  // (1709 / 2563) * 2560 = 1706.99960983… -> 1706, where Math.round would say 1707.
  assert.deepEqual(viewDims(2563, 1709), { width: 2560, height: 1706 });
  // (1282 / 2562) * 2560 = 1280.99921… -> 1280.
  assert.deepEqual(viewDims(2562, 1282), { width: 2560, height: 1280 });
});

test("viewDims: portrait sources fix the height", () => {
  assert.deepEqual(viewDims(3000, 4000), { width: 1920, height: 2560 });
  assert.deepEqual(viewDims(4000, 6000), { width: 1706, height: 2560 });
  assert.deepEqual(viewDims(1709, 2563), { width: 1706, height: 2560 });
});

test("viewDims: a square takes the else branch and becomes max x max", () => {
  assert.deepEqual(viewDims(5000, 5000), { width: 2560, height: 2560 });
});

test("viewDims: sources at or under the max are never upscaled", () => {
  assert.deepEqual(viewDims(2560, 1706), { width: 2560, height: 1706 });
  assert.deepEqual(viewDims(2560, 2560), { width: 2560, height: 2560 });
  assert.deepEqual(viewDims(1920, 1080), { width: 1920, height: 1080 });
  assert.deepEqual(viewDims(1, 1), { width: 1, height: 1 });
});

test("viewDims: one edge over the max is enough to resize", () => {
  assert.deepEqual(viewDims(2561, 100), { width: 2560, height: 99 });
  assert.deepEqual(viewDims(100, 2561), { width: 99, height: 2560 });
});

/* ── archiveDims ─────────────────────────────────────────────────── */

test("archiveDims: the same library rule at 4096", () => {
  assert.deepEqual(archiveDims(6000, 4000), { width: 4096, height: 2730 });
  assert.deepEqual(archiveDims(8256, 5504), { width: 4096, height: 2730 });
  assert.deepEqual(archiveDims(4099, 2733), { width: 4096, height: 2730 });
  assert.deepEqual(archiveDims(4000, 6000), { width: 2730, height: 4096 });
  assert.deepEqual(archiveDims(4000, 3000), { width: 4000, height: 3000 });
  assert.deepEqual(archiveDims(4096, 4096), { width: 4096, height: 4096 });
});

/* ── viewFromArchiveDims / thumbDims: Math.round, minimum 1 ──────── */

test("viewFromArchiveDims rounds where the library would truncate", () => {
  // 4096x2730 -> scale 0.625 -> 2560 x 1706.25 -> 1706
  assert.deepEqual(viewFromArchiveDims(4096, 2730), { width: 2560, height: 1706 });
  // 4096x2731 -> 1706.875 -> 1707 (the library rule would give 1706)
  assert.deepEqual(viewFromArchiveDims(4096, 2731), { width: 2560, height: 1707 });
  // an archive under 2560 (small source) is left as is
  assert.deepEqual(viewFromArchiveDims(2000, 1500), { width: 2000, height: 1500 });
  assert.deepEqual(viewFromArchiveDims(2730, 4096), { width: 1706, height: 2560 });
});

test("thumbDims: 480 long edge, rounded, never upscaled, never 0", () => {
  assert.deepEqual(thumbDims(2560, 1706), { width: 480, height: 320 });
  assert.deepEqual(thumbDims(2560, 1707), { width: 480, height: 320 });
  assert.deepEqual(thumbDims(2560, 1709), { width: 480, height: 320 });
  assert.deepEqual(thumbDims(1706, 2560), { width: 320, height: 480 });
  assert.deepEqual(thumbDims(2560, 1440), { width: 480, height: 270 });
  assert.deepEqual(thumbDims(400, 300), { width: 400, height: 300 });
  assert.deepEqual(thumbDims(2560, 1), { width: 480, height: 1 });
});

/* ── sizeGuardQualities ──────────────────────────────────────────── */

test("sizeGuardQualities: initial plus ten repeated multiplications by 0.95", () => {
  const q = sizeGuardQualities(0.8);
  assert.equal(q.length, 11);
  assert.equal(q[0], 0.8);
  assert.equal(q[1], 0.76);
  assert.equal(q[2], 0.722);
  assert.equal(q[3], 0.6859);
  // Repeated multiplication, not 0.8 * 0.95 ** n: the floats differ.
  assert.equal(q[4], 0.6516049999999999);
  assert.equal(q[10], 0.4789895513907029);
  let expected = 0.8;
  for (let i = 1; i < q.length; i++) {
    expected *= 0.95;
    assert.equal(q[i], expected);
  }
});

/* ── watermark geometry ──────────────────────────────────────────── */

test("watermarkSize: width is size% of the photo, height keeps the mark's aspect", () => {
  assert.deepEqual(watermarkSize(2560, 20, 1000, 500), { width: 512, height: 256 });
  assert.deepEqual(watermarkSize(1706, 30, 300, 100), {
    width: (30 / 100) * 1706,
    height: ((30 / 100) * 1706) * (100 / 300),
  });
});

test("watermarkPlacement: inset is 2.5% of the shorter edge on both axes", () => {
  const W = 2560;
  const H = 1706;
  const m = 0.025 * 1706; // 42.65
  const wmW = 512;
  const wmH = 256;
  assert.deepEqual(watermarkPlacement("top-left", W, H, wmW, wmH), { x: m, y: m });
  assert.deepEqual(watermarkPlacement("bottom-right", W, H, wmW, wmH), {
    x: W - wmW - m,
    y: H - wmH - m,
  });
  assert.deepEqual(watermarkPlacement("center", W, H, wmW, wmH), {
    x: (W - wmW) / 2,
    y: (H - wmH) / 2,
  });
  assert.deepEqual(watermarkPlacement("top-center", W, H, wmW, wmH), { x: (W - wmW) / 2, y: m });
  assert.deepEqual(watermarkPlacement("middle-right", W, H, wmW, wmH), {
    x: W - wmW - m,
    y: (H - wmH) / 2,
  });
  assert.deepEqual(watermarkPlacement("bottom-left", W, H, wmW, wmH), { x: m, y: H - wmH - m });
});

test("watermarkPlacement: a full-frame mark is clamped into the frame", () => {
  assert.deepEqual(watermarkPlacement("bottom-right", 1000, 500, 1000, 500), { x: 0, y: 0 });
  assert.deepEqual(watermarkPlacement("top-left", 1000, 500, 990, 495), { x: 10, y: 5 });
  // larger than the frame: pinned to the origin
  assert.deepEqual(watermarkPlacement("center", 1000, 500, 1200, 600), { x: 0, y: 0 });
});

test("watermarkAlpha: percent to 0..1, NaN means fully opaque", () => {
  assert.equal(watermarkAlpha(40), 0.4);
  assert.equal(watermarkAlpha(100), 1);
  assert.equal(watermarkAlpha(150), 1);
  assert.equal(watermarkAlpha(-5), 0);
  assert.equal(watermarkAlpha(Number.NaN), 1);
});
