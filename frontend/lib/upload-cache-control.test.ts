import { test } from "node:test";
import assert from "node:assert/strict";
import { UPLOAD_CACHE_CONTROL, uploadCacheControlFor } from "./upload-cache-control.ts";

test("the default is the immutable header every upload has always sent", () => {
  assert.equal(UPLOAD_CACHE_CONTROL, "public, max-age=31536000, immutable");
  assert.equal(uploadCacheControlFor({}), UPLOAD_CACHE_CONTROL);
  assert.equal(uploadCacheControlFor(undefined), UPLOAD_CACHE_CONTROL);
  assert.equal(uploadCacheControlFor(null), UPLOAD_CACHE_CONTROL);
});

test("a presign answer that names a header is sent as named", () => {
  assert.equal(uploadCacheControlFor({ cache_control: "private, no-store, max-age=0" }), "private, no-store, max-age=0");
});

test("a blank or malformed cache_control falls back to the default", () => {
  for (const cache_control of ["", "   ", 42, null, { a: 1 }]) {
    assert.equal(uploadCacheControlFor({ cache_control }), UPLOAD_CACHE_CONTROL, JSON.stringify(cache_control));
  }
});
