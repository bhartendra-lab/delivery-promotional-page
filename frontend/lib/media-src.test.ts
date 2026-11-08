import { test } from "node:test";
import assert from "node:assert/strict";
import { coldOf, gridSrcChain } from "./media-src.ts";

const hosts = { hot: "media.vyavasth.in", cold: "cold-media.vyavasth.in" };

test("gridSrcChain: thumbnail, cold thumbnail, delivery copy, cold delivery copy", () => {
  assert.deepEqual(
    gridSrcChain({ url: "https://media.vyavasth.in/a.jpg", thumbnail_url: "https://media.vyavasth.in/a.thumb.jpg" }, hosts),
    [
      "https://media.vyavasth.in/a.thumb.jpg",
      "https://cold-media.vyavasth.in/a.thumb.jpg",
      "https://media.vyavasth.in/a.jpg",
      "https://cold-media.vyavasth.in/a.jpg",
    ],
  );
});

test("gridSrcChain: no thumbnail starts at the delivery copy", () => {
  assert.deepEqual(gridSrcChain({ url: "https://media.vyavasth.in/a.jpg" }, hosts), [
    "https://media.vyavasth.in/a.jpg",
    "https://cold-media.vyavasth.in/a.jpg",
  ]);
  assert.deepEqual(gridSrcChain({ url: "https://media.vyavasth.in/a.jpg", thumbnail_url: null }, hosts).length, 2);
});

test("gridSrcChain: an already-cold URL is not retried as its own fallback", () => {
  assert.deepEqual(gridSrcChain({ url: "https://cold-media.vyavasth.in/a.jpg" }, hosts), ["https://cold-media.vyavasth.in/a.jpg"]);
  assert.deepEqual(
    gridSrcChain({ url: "https://cold-media.vyavasth.in/a.jpg", thumbnail_url: "https://cold-media.vyavasth.in/a.t.jpg" }, hosts),
    ["https://cold-media.vyavasth.in/a.t.jpg", "https://cold-media.vyavasth.in/a.jpg"],
  );
});

test("coldOf leaves other hosts alone", () => {
  assert.equal(coldOf("https://example.com/a.jpg", hosts), "https://example.com/a.jpg");
});
