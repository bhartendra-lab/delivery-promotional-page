import { test } from "node:test";
import assert from "node:assert/strict";
import { firstPreviewFiles, previewKeyOf, PREVIEW_COUNT } from "./upload-preview.ts";

const f = (name: string, type = "image/jpeg") => ({ name, size: 1, lastModified: 1, type });

test("only the first five photos, in the order they were picked, however many are selected", () => {
  const many = Array.from({ length: 2000 }, (_, i) => f(`IMG_${i}.jpg`));
  const first = firstPreviewFiles(many);
  assert.equal(first.length, PREVIEW_COUNT);
  assert.deepEqual(first.map((x) => x.name), ["IMG_0.jpg", "IMG_1.jpg", "IMG_2.jpg", "IMG_3.jpg", "IMG_4.jpg"]);
});

test("fewer than five is fine, and videos are skipped without eating a slot", () => {
  assert.equal(firstPreviewFiles([f("a.jpg"), f("b.jpg")]).length, 2);
  assert.deepEqual(firstPreviewFiles([f("clip.mp4", "video/mp4"), f("a.jpg")]).map((x) => x.name), ["a.jpg"]);
  assert.deepEqual(firstPreviewFiles([]), []);
});

test("a file's key is stable and tells two files apart", () => {
  assert.equal(previewKeyOf(f("a.jpg")), previewKeyOf(f("a.jpg")));
  assert.notEqual(previewKeyOf(f("a.jpg")), previewKeyOf({ ...f("a.jpg"), size: 2 }));
});
