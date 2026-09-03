import { test } from "node:test";
import assert from "node:assert/strict";
import { offeredTierForPhoto, type SinglePhotoSource } from "./single.ts";

const photo = (over: Partial<SinglePhotoSource> = {}): SinglePhotoSource => ({
  mediaId: "m1",
  url: "https://media.example/m1.jpg",
  ...over,
});

const offer = (
  source: SinglePhotoSource,
  { archiveAccess = true, canResolve = true } = {},
) => offeredTierForPhoto(source, { archiveAccess, canResolve });

test("a photo with an archive copy offers that tier", () => {
  assert.equal(offer(photo({ archiveVariant: "4096" })), "4096");
  assert.equal(offer(photo({ archiveVariant: "original" })), "original");
});

test("no archive copy means no choice — the download stays one tap", () => {
  // A QHD booking, and a photo whose archive step failed, are the same case
  // here: there is nothing to choose between.
  assert.equal(offer(photo()), null);
  assert.equal(offer(photo({ archiveVariant: null })), null);
});

test("a viewer without archive access is never offered the choice", () => {
  // `archiveAccess` is the server's answer, folding in the studio's
  // allow_download and archive_download_access. A guest of an event that keeps
  // originals to the family sees a plain download button, not a disabled or
  // failing option.
  assert.equal(offer(photo({ archiveVariant: "original" }), { archiveAccess: false }), null);
  assert.equal(offer(photo({ archiveVariant: "4096" }), { archiveAccess: false }), null);
});

test("no resolver means no choice — nothing could mint the URL anyway", () => {
  assert.equal(offer(photo({ archiveVariant: "original" }), { canResolve: false }), null);
});

test("both conditions are required, not either", () => {
  for (const archiveAccess of [true, false]) {
    for (const canResolve of [true, false]) {
      for (const variant of [null, "4096"] as (null | "4096")[]) {
        const expected =
          archiveAccess && canResolve && variant !== null ? variant : null;
        assert.equal(
          offer(photo({ archiveVariant: variant }), { archiveAccess, canResolve }),
          expected,
          `access=${archiveAccess} resolve=${canResolve} variant=${variant}`,
        );
      }
    }
  }
});

test("an unrecognised archive_variant is treated as no archive copy", () => {
  // A newer server (or a half-written document) must not produce a tier this
  // client cannot name or request.
  assert.equal(offer(photo({ archiveVariant: "8k" as never })), null);
});
