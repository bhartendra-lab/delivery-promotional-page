import test from "node:test";
import assert from "node:assert/strict";
import { AVATAR_CROP_PADDING, avatarCropRect, cropStyle } from "./avatar.ts";

const image = { width: 2560, height: 1707 };

test("the crop is square, padded, and centred on the face box", () => {
  // A 100x200 face box centred at (500, 600).
  const rect = avatarCropRect([450, 500, 550, 700], image);
  assert.ok(rect);
  // side = max(100, 200) * 1.4
  assert.equal(rect.side, Math.floor(200 * AVATAR_CROP_PADDING));
  assert.equal(rect.left, Math.round(500 - rect.side / 2));
  assert.equal(rect.top, Math.round(600 - rect.side / 2));
});

test("a box near an edge is clamped inside the image, never negative", () => {
  const rect = avatarCropRect([0, 0, 40, 40], image);
  assert.ok(rect);
  assert.equal(rect.left, 0);
  assert.equal(rect.top, 0);
});

test("a box near the far edge is clamped so the crop still fits", () => {
  const rect = avatarCropRect([2500, 1650, 2560, 1707], image);
  assert.ok(rect);
  assert.ok(rect.left + rect.side <= image.width);
  assert.ok(rect.top + rect.side <= image.height);
});

test("the crop never exceeds the shorter side of the image", () => {
  const rect = avatarCropRect([0, 0, 5000, 5000], image);
  assert.ok(rect);
  assert.equal(rect.side, Math.min(image.width, image.height));
});

test("an unusable bbox or image reads as no crop rather than throwing", () => {
  assert.equal(avatarCropRect(undefined, image), null);
  assert.equal(avatarCropRect([1, 2, 3], image), null);
  assert.equal(avatarCropRect([0, 0, Number.NaN, 10], image), null);
  // A zero-area box, and a zero-sized image.
  assert.equal(avatarCropRect([10, 10, 10, 10], image), null);
  assert.equal(avatarCropRect([0, 0, 10, 10], { width: 0, height: 0 }), null);
});

test("cropStyle scales the crop to exactly fill the circle", () => {
  const rect = { left: 400, top: 500, side: 280 };
  const style = cropStyle(rect, image, 56);
  const scale = 56 / 280;
  assert.equal(style.width, image.width * scale);
  assert.equal(style.height, image.height * scale);
  // The crop's top-left corner lands on the container's origin.
  assert.equal(style.marginLeft, -400 * scale);
  assert.equal(style.marginTop, -500 * scale);
});
