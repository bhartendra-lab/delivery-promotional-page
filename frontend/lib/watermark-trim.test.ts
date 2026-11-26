import { test } from "node:test";
import assert from "node:assert/strict";
import { borderBox } from "./watermark-trim.ts";

function rgba(w: number, h: number, bg: number[], block?: { x: number; y: number; w: number; h: number; c: number[] }) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const inBlock = block && x >= block.x && x < block.x + block.w && y >= block.y && y < block.y + block.h;
      d.set(inBlock ? block!.c : bg, (y * w + x) * 4);
    }
  return d;
}

test("borderBox: a transparent border around an opaque logo", () => {
  const d = rgba(20, 10, [0, 0, 0, 0], { x: 4, y: 2, w: 10, h: 5, c: [255, 255, 255, 255] });
  assert.deepEqual(borderBox(d, 20, 10), { left: 4, top: 2, width: 10, height: 5 });
});

test("borderBox: colour under full transparency is ignored", () => {
  const d = rgba(6, 6, [0, 0, 0, 0], { x: 1, y: 1, w: 2, h: 2, c: [255, 0, 0, 0] });
  assert.equal(borderBox(d, 6, 6), null);
});

test("borderBox: a flat white border around a dark logo", () => {
  const d = rgba(10, 10, [255, 255, 255, 255], { x: 3, y: 3, w: 4, h: 2, c: [20, 20, 20, 255] });
  assert.deepEqual(borderBox(d, 10, 10), { left: 3, top: 3, width: 4, height: 2 });
});

test("borderBox: an image that is all border has nothing to keep", () => {
  assert.equal(borderBox(rgba(5, 5, [9, 9, 9, 255]), 5, 5), null);
});
