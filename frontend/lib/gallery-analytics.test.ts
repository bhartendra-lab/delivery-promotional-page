import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGalleryHit, galleryPageTemplate } from "./gallery-analytics.ts";

// These guard a privacy promise: no gallery identifier may reach Google.

test("event gallery pages are reduced to a template", () => {
  assert.equal(galleryPageTemplate("/event/abc123XYZ"), "/event/:id");
  assert.equal(galleryPageTemplate("/event/abc123XYZ/"), "/event/:id");
  assert.equal(galleryPageTemplate("/event/abc123XYZ/friends"), "/event/:id/friends");
  assert.equal(galleryPageTemplate("/event/abc123XYZ/auth/callback"), "/event/:id/auth/callback");
});

test("memory lane tokens never survive", () => {
  assert.equal(galleryPageTemplate("/memory-lane/secret-token-1"), "/memory-lane/:token");
});

test("unknown paths collapse instead of being sent as-is", () => {
  assert.equal(galleryPageTemplate("/event/abc123XYZ/some/new/screen"), "/event/:id/other");
  assert.equal(galleryPageTemplate("/error/qr-not-found"), "/error/qr-not-found");
  assert.equal(galleryPageTemplate("/error/whatever-123"), "/error/other");
  assert.equal(galleryPageTemplate("/anything/with/an/id-42"), "/other");
});

test("hostile or malformed input still yields a safe template", () => {
  assert.equal(galleryPageTemplate(""), "/other");
  assert.equal(galleryPageTemplate("https://evil.example/event/SECRET"), "/other");
  assert.equal(galleryPageTemplate("/event/SECRET?token=abc#frag"), "/event/:id");
});

test("no template ever contains the identifier it came from", () => {
  for (const p of ["/event/SECRETID/friends", "/memory-lane/SECRETTOKEN", "/event/SECRETID/x/y"]) {
    assert.ok(!galleryPageTemplate(p).includes("SECRET"), p);
  }
});

test("the hit carries only the template, a random id, and no personalisation", () => {
  const hit = buildGalleryHit("/event/:id", "11111111-1111-1111-1111-111111111111");
  assert.equal(hit.non_personalized_ads, true);
  assert.equal(hit.events.length, 1);
  assert.equal(hit.events[0].name, "page_view");
  assert.equal(hit.events[0].params.page_location, "https://deliver.vyavasth.in/event/:id");
  assert.deepEqual(Object.keys(hit).sort(), ["client_id", "events", "non_personalized_ads"]);
  assert.equal("user_id" in hit, false);
});
