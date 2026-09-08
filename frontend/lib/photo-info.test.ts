import { test } from "node:test";
import assert from "node:assert/strict";
import { photoQualityLabel } from "./quality-tiers.ts";

// `formatPhotoSize` / `formatUploadedAt` live beside the component that uses
// them; re-implemented imports would drift, so they are exercised through the
// component's module in the app tree. What IS pure and shared is the quality
// label, which the info panel and the download surfaces must agree on.

test("photoQualityLabel names the tier a studio chose at upload", () => {
  assert.equal(photoQualityLabel("4096"), "4K (4096px)");
  assert.equal(photoQualityLabel("original"), "Original file");
});

test("photoQualityLabel falls back to the delivery tier for a photo with no archive", () => {
  assert.equal(photoQualityLabel(null), "HD (2560px)");
  assert.equal(photoQualityLabel(undefined), "HD (2560px)");
});

test("photoQualityLabel never invents a tier for an unrecognised value", () => {
  // A newer server, or a half-written document, must not produce a label this
  // client cannot explain.
  assert.equal(photoQualityLabel("8k" as never), "HD (2560px)");
});
