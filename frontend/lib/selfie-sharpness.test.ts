import { test } from "node:test";
import assert from "node:assert/strict";
import { laplacianVariance, lumaFromRgba, sharpnessRegion } from "./selfie-sharpness.ts";

test("a flat image has no sharpness", () => {
  assert.equal(laplacianVariance(new Array(25).fill(120), 5, 5), 0);
});

test("the Laplacian variance matches a hand computation", () => {
  // 3x3: only the centre pixel is interior. Laplacian = 4*10 - 4*20 = -40, variance of one value = 0
  assert.equal(laplacianVariance([10, 10, 10, 10, 20, 10, 10, 10, 10], 3, 3), 0);
  // 4x3: interior pixels 20 (neighbours 10,10,10,0 -> 30-80 = -50) and 0
  // (neighbours 10,10,20,10 -> 50-0 = 50): mean 0, variance 2500
  const g = [10, 10, 10, 10, 10, 20, 0, 10, 10, 10, 10, 10];
  assert.equal(laplacianVariance(g, 4, 3), 2500);
});

test("a crisp edge scores higher than the same edge blurred", () => {
  const size = 32;
  const crisp: number[] = [];
  const soft: number[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      crisp.push(x < size / 2 ? 30 : 220);
      soft.push(30 + (190 * Math.min(Math.max(x - size / 2 + 6, 0), 12)) / 12);
    }
  }
  assert.ok(laplacianVariance(crisp, size, size) > 10 * laplacianVariance(soft, size, size));
});

test("luma uses the same weights as OpenCV's BGR2GRAY", () => {
  const g = lumaFromRgba([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255], 3);
  assert.deepEqual(Array.from(g, (v) => Math.round(v * 1000) / 1000), [76.245, 149.685, 29.07]);
});

test("the scored region is the centre of the frame", () => {
  assert.deepEqual(sharpnessRegion(1000, 1000), { x: 250, y: 200, w: 500, h: 500 });
});
