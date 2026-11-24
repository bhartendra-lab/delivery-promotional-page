import { test } from "node:test";
import assert from "node:assert/strict";
import { isGalleryPreviewPath } from "./preview-route.ts";

test("only the event preview route is bare; the event page and everything else keep the dashboard chrome", () => {
  assert.equal(isGalleryPreviewPath("/dashboard/events/abc123/preview"), true);
  assert.equal(isGalleryPreviewPath("/dashboard/events/abc123/preview/"), true);
  assert.equal(isGalleryPreviewPath("/dashboard/events/abc123"), false);
  assert.equal(isGalleryPreviewPath("/dashboard/events"), false);
  assert.equal(isGalleryPreviewPath("/dashboard/events/abc123/preview/extra"), false);
  assert.equal(isGalleryPreviewPath("/dashboard/settings/preview"), false);
});
