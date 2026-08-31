import { test } from "node:test";
import assert from "node:assert/strict";
import { coldFallback, gridSrc } from "./media-actions.ts";

test("coldFallback: a hot-host URL is rewritten to the cold host", () => {
  assert.equal(
    coldFallback("https://media.vyavasth.in/companies/c1/event-media/b1/a.jpg"),
    "https://cold.media.vyavasth.in/companies/c1/event-media/b1/a.jpg",
  );
});

test("coldFallback: an already-cold URL is returned unchanged", () => {
  const url = "https://cold.media.vyavasth.in/companies/c1/event-media/b1/a.jpg";
  assert.equal(coldFallback(url), url);
});

test("coldFallback: an unrelated host is returned unchanged", () => {
  const url = "https://example.com/companies/c1/event-media/b1/a.jpg";
  assert.equal(coldFallback(url), url);
});

test("coldFallback: a URL containing the hot host string in its path (not its origin) is not corrupted", () => {
  const url = "https://cdn.example.com/redirect?to=media.vyavasth.in/foo.jpg";
  assert.equal(coldFallback(url), url);
});

test("gridSrc: returns the thumbnail when the item has one", () => {
  assert.equal(
    gridSrc({
      url: "https://media.vyavasth.in/companies/c1/event-media/b1/a.jpg",
      thumbnail_url: "https://media.vyavasth.in/companies/c1/event-media/b1/a.jpg.thumb.jpg",
    }),
    "https://media.vyavasth.in/companies/c1/event-media/b1/a.jpg.thumb.jpg",
  );
});

test("gridSrc: falls back to url when thumbnail_url is undefined (legacy media, videos)", () => {
  const url = "https://media.vyavasth.in/companies/c1/event-media/b1/a.jpg";
  assert.equal(gridSrc({ url }), url);
});

test("gridSrc: falls back to url when thumbnail_url is null (the schema default)", () => {
  const url = "https://media.vyavasth.in/companies/c1/event-media/b1/a.jpg";
  assert.equal(gridSrc({ url, thumbnail_url: null }), url);
});

test("gridSrc: falls back to url on an empty-string thumbnail_url — never renders a src of \"\"", () => {
  const url = "https://media.vyavasth.in/companies/c1/event-media/b1/a.jpg";
  assert.equal(gridSrc({ url, thumbnail_url: "" }), url);
});
