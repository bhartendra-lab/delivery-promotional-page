import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_PHOTO_CAP_BLOCKS,
  photoCapOverBy,
  minPhotoCapBlocks,
  clampPhotoCapBlocks,
  photoCapHasGrown,
  photoCapNearlyFull,
  photoCapGstInclusive,
  photoCapListedTotal,
  photoCapChargedTotal,
  uploadUnitsForSelection,
  photoCapWeight4k,
} from "./photo-cap.ts";
import type { PhotoCap } from "./billing-types.ts";

const cap = (used: number, over: Partial<PhotoCap> = {}): PhotoCap => ({
  cap: 20000,
  used,
  remaining: Math.max(0, 20000 - used),
  addon_size: 5000,
  addon_price: 50,
  ...over,
});

test("photoCapOverBy: exactly at the cap fits, one more does not", () => {
  assert.equal(photoCapOverBy(cap(19900), 100), 0);
  assert.equal(photoCapOverBy(cap(19900), 101), 1);
  // 19,950 in the event, 100 picked, 60 already in the gallery: 40 incoming.
  assert.equal(photoCapOverBy(cap(19950), 40), -10);
});

test("minPhotoCapBlocks: the fewest blocks that make the selection fit", () => {
  assert.equal(minPhotoCapBlocks(cap(19900), 101), 1);
  assert.equal(minPhotoCapBlocks(cap(19900), 5100), 1);
  assert.equal(minPhotoCapBlocks(cap(19900), 5101), 2);
  // An event that predates the cap: 31,000 in it, 500 more selected.
  assert.equal(minPhotoCapBlocks(cap(31000), 500), 3);
  // Nothing over (the "add capacity" button): still one block, never zero.
  assert.equal(minPhotoCapBlocks(cap(18500), 0), 1);
});

test("minPhotoCapBlocks: can ask for more than one purchase allows", () => {
  assert.equal(minPhotoCapBlocks(cap(20000), 100001), 21);
});

test("clampPhotoCapBlocks: never below the minimum, never above the per-purchase maximum", () => {
  assert.equal(clampPhotoCapBlocks(1, 3), 3);
  assert.equal(clampPhotoCapBlocks(5, 3), 5);
  assert.equal(clampPhotoCapBlocks(99, 3), MAX_PHOTO_CAP_BLOCKS);
  assert.equal(clampPhotoCapBlocks(Number.NaN, 2), 2);
  // A minimum above the maximum is capped: one purchase adds what it can.
  assert.equal(clampPhotoCapBlocks(1, 25), MAX_PHOTO_CAP_BLOCKS);
});

test("photoCapHasGrown: only once the cap reflects the purchase", () => {
  const before = cap(19900);
  assert.equal(photoCapHasGrown(before, cap(19900), 10000), false);
  assert.equal(photoCapHasGrown(before, cap(19900, { cap: 25000 }), 10000), false);
  assert.equal(photoCapHasGrown(before, cap(19900, { cap: 30000 }), 10000), true);
  assert.equal(photoCapHasGrown(before, null, 10000), false);
});

test("photoCapNearlyFull: from 90% of the uploads used, deleted photos included", () => {
  assert.equal(photoCapNearlyFull(cap(17999)), false);
  assert.equal(photoCapNearlyFull(cap(18000)), true);
  // Only 2,000 photos in the event, but 16,000 uploads were deleted: nearly full.
  assert.equal(photoCapNearlyFull(cap(18000, { in_event: 2000, deleted_units: 16000 })), true);
  assert.equal(photoCapNearlyFull(null), false);
  assert.equal(photoCapNearlyFull(cap(0, { cap: 0 })), false);
});

test("uploadUnitsForSelection: a 4K photo uses the weight, any other tier 1", () => {
  assert.equal(uploadUnitsForSelection(10, "4096", 4), 40);
  assert.equal(uploadUnitsForSelection(10, "4096", 3), 30);
  assert.equal(uploadUnitsForSelection(10, "2560", 4), 10);
  assert.equal(uploadUnitsForSelection(0, "4096", 4), 0);
});

test("photoCapWeight4k: the event's own weight, else 4", () => {
  assert.equal(photoCapWeight4k(cap(0, { weight_4k: 6 })), 6);
  assert.equal(photoCapWeight4k(cap(0)), 4);
  assert.equal(photoCapWeight4k(null), 4);
});

test("photoCapOverBy: a 4K selection that fits by count can still be over by units", () => {
  // 19,990 used, 5 new photos: 5 HD fit, 5 at 4K (20 units) do not.
  assert.equal(photoCapOverBy(cap(19990), uploadUnitsForSelection(5, "2560", 4)), -5);
  assert.equal(photoCapOverBy(cap(19990), uploadUnitsForSelection(5, "4096", 4)), 10);
  assert.equal(minPhotoCapBlocks(cap(19990), uploadUnitsForSelection(5, "4096", 4)), 1);
});

test("what a purchase costs: listed and charged are the same while the price includes GST", () => {
  // An API from before the GST switch sends neither field.
  assert.equal(photoCapGstInclusive(cap(0)), true);
  assert.equal(photoCapListedTotal(cap(0), 3), 150);
  assert.equal(photoCapChargedTotal(cap(0), 3), 150);
  const inclusive = cap(0, { gst_inclusive: true, addon_price_with_gst: 50 });
  assert.equal(photoCapGstInclusive(inclusive), true);
  assert.equal(photoCapChargedTotal(inclusive, 3), 150);
});

test("what a purchase costs: a block listed before GST is shown at 50 and paid at 59", () => {
  const exclusive = cap(0, { gst_inclusive: false, addon_price_with_gst: 59 });
  assert.equal(photoCapGstInclusive(exclusive), false);
  assert.equal(photoCapListedTotal(exclusive, 3), 150);
  assert.equal(photoCapChargedTotal(exclusive, 3), 177);
  // Paise survive the multiplication.
  assert.equal(photoCapChargedTotal(cap(0, { addon_price: 49.99, gst_inclusive: false, addon_price_with_gst: 58.99 }), 7), 412.93);
});
