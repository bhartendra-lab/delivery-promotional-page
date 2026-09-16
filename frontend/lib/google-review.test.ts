import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveGoogleReviewUrl } from "./google-review.ts";

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
