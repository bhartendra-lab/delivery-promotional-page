import { test } from "node:test";
import assert from "node:assert/strict";
import { pickSampleSet, watermarkPixelBox } from "./watermark-samples.ts";
import { watermarkAlpha, watermarkPlacement, watermarkSize } from "./r2-upload/geometry.ts";

test("the preview box is exactly the engine's math, at any frame size", () => {
  for (const [W, H] of [[960, 640], [2560, 1707], [640, 960], [500, 500]]) {
    for (const position of ["top-left", "center", "bottom-right", "middle-left"] as const) {
      const box = watermarkPixelBox({ position, size: 22, opacity: 60, W, H, markW: 400, markH: 150 });
      const { width, height } = watermarkSize(W, H, 22, 400, 150);
      const { x, y } = watermarkPlacement(position, W, H, width, height);
      assert.deepEqual(box, { left: x, top: y, width, height, opacity: watermarkAlpha(60) });
    }
  }
});

test("a landscape and a portrait of the same camera get the same mark (size is a share of the shorter edge)", () => {
  const land = watermarkPixelBox({ position: "bottom-right", size: 20, opacity: 80, W: 2560, H: 1707, markW: 300, markH: 100 });
  const port = watermarkPixelBox({ position: "bottom-right", size: 20, opacity: 80, W: 1707, H: 2560, markW: 300, markH: 100 });
  assert.ok(Math.abs(land.width - port.width) < 1e-6);
  assert.ok(Math.abs(land.height - port.height) < 1e-6);
});

test("scaling the frame scales the box: what the studio judges is what is delivered", () => {
  const small = watermarkPixelBox({ position: "bottom-right", size: 20, opacity: 80, W: 640, H: 427, markW: 300, markH: 100 });
  const big = watermarkPixelBox({ position: "bottom-right", size: 20, opacity: 80, W: 2560, H: 1708, markW: 300, markH: 100 });
  const k = 2560 / 640;
  assert.ok(Math.abs(big.left - small.left * k) < 1e-6);
  assert.ok(Math.abs(big.top - small.top * k) < 1.0);
  assert.ok(Math.abs(big.width - small.width * k) < 1e-6);
  assert.equal(big.opacity, small.opacity);
});

test("a portrait photo keeps the inset on the shorter edge, as the engine does", () => {
  const box = watermarkPixelBox({ position: "top-left", size: 20, opacity: 100, W: 600, H: 900, markW: 100, markH: 100 });
  assert.equal(box.left, box.top, "the same pixel gap on both axes");
});

test("picks the lightest, the darkest and the busiest photo, each once", () => {
  const stats = [
    { luma: 120, busy: 5 },
    { luma: 230, busy: 4 },
    { luma: 30, busy: 6 },
    { luma: 110, busy: 40 },
  ];
  assert.deepEqual(pickSampleSet(stats), [
    { index: 1, label: "Light" },
    { index: 2, label: "Dark" },
    { index: 3, label: "Busy" },
  ]);
});

test("fewer photos than three still give a usable set, and none gives none", () => {
  assert.deepEqual(pickSampleSet([]), []);
  const one = pickSampleSet([{ luma: 100, busy: 1 }]);
  assert.deepEqual(one, [{ index: 0, label: "Light" }]);
  const two = pickSampleSet([{ luma: 100, busy: 1 }, { luma: 90, busy: 9 }]);
  assert.equal(two.length, 2);
  assert.equal(new Set(two.map((p) => p.index)).size, 2);
  const same = pickSampleSet(Array.from({ length: 5 }, () => ({ luma: 100, busy: 10 })));
  assert.equal(same.length, 3);
  assert.equal(new Set(same.map((p) => p.index)).size, 3);
});
