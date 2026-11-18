import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveGoogleReviewUrl, parseGoogleReviewLink } from "./google-review.ts";

const PLACE = "https://search.google.com/local/writereview?placeid=ChIJ123";

test("a place id wins over the legacy GMB link", () => {
  assert.equal(
    resolveGoogleReviewUrl({ placeId: "ChIJ123", gmbLink: "https://g.page/r/abc", enabledGlobally: true, enabledForEvent: true }),
    PLACE,
  );
});

test("a Studio with only the legacy GMB link still gets a review link", () => {
  assert.equal(
    resolveGoogleReviewUrl({ gmbLink: "https://g.page/r/abc", enabledForEvent: true }),
    "https://g.page/r/abc",
  );
});

test("no listing at all means no review link", () => {
  assert.equal(resolveGoogleReviewUrl({ placeId: "", gmbLink: "", enabledForEvent: true }), null);
});

test("a company that predates the switch reads as ON", () => {
  assert.equal(resolveGoogleReviewUrl({ placeId: "ChIJ123", enabledGlobally: undefined, enabledForEvent: true }), PLACE);
  assert.equal(resolveGoogleReviewUrl({ placeId: "ChIJ123", enabledGlobally: null, enabledForEvent: true }), PLACE);
});

test("the company switch off removes the link even where the event has it on", () => {
  assert.equal(resolveGoogleReviewUrl({ placeId: "ChIJ123", enabledGlobally: false, enabledForEvent: true }), null);
});

test("the event switch off removes the link", () => {
  assert.equal(resolveGoogleReviewUrl({ placeId: "ChIJ123", enabledGlobally: true, enabledForEvent: false }), null);
});

test("a non-Google legacy link is never shown to a Guest", () => {
  assert.equal(resolveGoogleReviewUrl({ gmbLink: "https://evil.example/review", enabledForEvent: true }), null);
  assert.equal(resolveGoogleReviewUrl({ gmbLink: "https://g.page.evil.example/r/abc/review", enabledForEvent: true }), null);
});

test("the g.page review link from Business Profile is accepted and normalised", () => {
  assert.deepEqual(parseGoogleReviewLink("  g.page/r/CabcDEF123-_x/review/ "), {
    status: "ok",
    url: "https://g.page/r/CabcDEF123-_x/review",
    placeId: null,
  });
});

test("a writereview link yields its place id", () => {
  const r = parseGoogleReviewLink("https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4&x=1");
  assert.deepEqual(r, {
    status: "ok",
    url: "https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4",
    placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4",
  });
});

test("the listing links Studios paste by mistake are flagged, not accepted", () => {
  for (const u of [
    "https://maps.app.goo.gl/abc123",
    "https://www.google.com/maps/place/Radiant+Studios/@23.2,77.4,17z",
    "https://g.page/radiant-studios",
    "https://g.page/r/CabcDEF123",
  ]) {
    assert.equal(parseGoogleReviewLink(u).status, "listing", u);
  }
});

test("look-alike and non-Google addresses are rejected", () => {
  for (const u of [
    "https://g.page.evil.example/r/abc/review",
    "https://evil.example/?u=g.page/r/abc/review",
    "https://user:pw@g.page/r/abc/review",
    "javascript:alert(1)",
    "my studio on google",
    "",
  ]) {
    assert.equal(parseGoogleReviewLink(u).status, "invalid", u);
  }
});
