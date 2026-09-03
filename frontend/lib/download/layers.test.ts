import { test } from "node:test";
import assert from "node:assert/strict";
import { Z_DOWNLOAD_CONFIRM, Z_DOWNLOAD_MODAL, Z_QUALITY_SHEET } from "./layers.ts";

/**
 * The two photo viewers a download can be started from. Mirrored here as
 * literals ON PURPOSE: if someone raises either one, these tests fail and say
 * so, which is the failure the constants exist to prevent. Keep in sync with
 * `components/event/screens/lounge/PhotoViewer.tsx` (guest) and
 * `app/(dashboard)/dashboard/events/[booking_id]/Lightbox.tsx` (studio).
 */
const GUEST_PHOTO_VIEWER_Z = 70;
const STUDIO_LIGHTBOX_Z = 210;

test("every download surface clears BOTH photo viewers", () => {
  // The bug this guards: 90 cleared the guest viewer and rendered behind the
  // studio's, so the quality sheet was invisible until the preview was closed.
  for (const z of [Z_DOWNLOAD_MODAL, Z_DOWNLOAD_CONFIRM, Z_QUALITY_SHEET]) {
    assert.ok(z > GUEST_PHOTO_VIEWER_Z, `${z} must clear the guest viewer`);
    assert.ok(z > STUDIO_LIGHTBOX_Z, `${z} must clear the studio lightbox`);
  }
});

test("the download surfaces are ordered among themselves", () => {
  // The confirm dialog is asked from inside the modal; the quality sheet is
  // opened from a viewer and can sit above everything else.
  assert.ok(Z_DOWNLOAD_CONFIRM > Z_DOWNLOAD_MODAL);
  assert.ok(Z_QUALITY_SHEET > Z_DOWNLOAD_CONFIRM);
});

test("no two download surfaces share a level", () => {
  // Equal z-index would leave the winner to DOM order and to whichever
  // ancestor happens to create a stacking context — the thing these constants
  // exist to stop being load-bearing.
  const levels = [Z_DOWNLOAD_MODAL, Z_DOWNLOAD_CONFIRM, Z_QUALITY_SHEET];
  assert.equal(new Set(levels).size, levels.length);
});
