import { test } from "node:test";
import assert from "node:assert/strict";
import { imageTypeFor, toShareFile } from "./share.ts";
import { resolveSaveCapability } from "./capability.ts";

test("a photo is shared under an image type even when storage says otherwise", () => {
  // iOS only offers "Save Image" for something it recognises as an image.
  assert.equal(imageTypeFor("IMG_5233.JPG", "image/jpeg"), "image/jpeg");
  assert.equal(imageTypeFor("IMG_5233.JPG", "application/octet-stream"), "image/jpeg");
  assert.equal(imageTypeFor("IMG_5233.HEIC", ""), "image/heic");
  assert.equal(imageTypeFor("scan.png", "binary/octet-stream"), "image/png");
  assert.equal(imageTypeFor("no-extension", ""), "image/jpeg");
});

test("toShareFile keeps the name and the bytes", () => {
  const file = toShareFile(new Blob(["abc"], { type: "application/octet-stream" }), "a.jpg");
  assert.equal(file.name, "a.jpg");
  assert.equal(file.size, 3);
  assert.equal(file.type, "image/jpeg");
});

test("the share sheet is the save only on an iOS device that can share files", () => {
  const picker = { showDirectoryPicker: () => {} };
  assert.equal(resolveSaveCapability({}, { ios: true, sharesFiles: true }), "share");
  // An old iOS, or a web view with no share sheet: back to building a ZIP.
  assert.equal(resolveSaveCapability({}, { ios: true, sharesFiles: false }), "memoryZip");
  // Android and desktop can share too, but their download already works.
  assert.equal(resolveSaveCapability({}, { ios: false, sharesFiles: true }), "memoryZip");
  assert.equal(resolveSaveCapability(picker, { ios: false, sharesFiles: true }), "directory");
});

test("cacheKeyed gives a download its own cache entry, and leaves signed URLs alone", async () => {
  const { cacheKeyed } = await import("../media-actions.ts");
  assert.equal(
    cacheKeyed("https://media.example/a/b.jpg", "deliver.example"),
    "https://media.example/a/b.jpg?o=deliver.example",
  );
  // Already has a query: possibly signed, so never touched.
  const signed = "https://media.example/a/b.jpg?X-Amz-Signature=abc";
  assert.equal(cacheKeyed(signed, "deliver.example"), signed);
  assert.equal(cacheKeyed("not a url", "deliver.example"), "not a url");
  assert.equal(cacheKeyed("https://media.example/a/b.jpg", ""), "https://media.example/a/b.jpg");
});
