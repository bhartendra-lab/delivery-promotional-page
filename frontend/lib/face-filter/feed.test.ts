import test from "node:test";
import assert from "node:assert/strict";
import { buildFaceFeed, FEED_PAGE, faceFeedKey, rankFaceFeed } from "./feed.ts";
import type { GuestMediaItem } from "../types.ts";

/* ── the order ───────────────────────────────────────────────────────────── */

test("more of the selected people first", () => {
  assert.deepEqual(rankFaceFeed({ mediaIds: ["a", "b", "c"], hits: [1, 3, 2], likeCounts: [0, 0, 0] }), ["b", "c", "a"]);
});

test("then the most liked, among photos with the same people count", () => {
  assert.deepEqual(rankFaceFeed({ mediaIds: ["a", "b", "c", "d"], hits: [2, 2, 1, 2], likeCounts: [1, 5, 9, 3] }), ["b", "d", "a", "c"]);
});

test("then the tab's normal order, which is media_ids order", () => {
  assert.deepEqual(rankFaceFeed({ mediaIds: ["a", "b", "c", "d"], hits: [1, 2, 1, 2], likeCounts: [4, 0, 4, 0] }), ["b", "d", "a", "c"]);
});

test("all three levels at once", () => {
  // hits decide first (x, y have 2); likes split x and y; z and w tie on hits
  // and likes, so gallery order (z before w) decides.
  const ids = rankFaceFeed({
    mediaIds: ["z", "x", "w", "y"],
    hits: [1, 2, 1, 2],
    likeCounts: [0, 1, 0, 7],
  });
  assert.deepEqual(ids, ["y", "x", "z", "w"]);
});

test("short or missing arrays read as zero, and junk numbers too", () => {
  assert.deepEqual(rankFaceFeed({ mediaIds: ["a", "b", "c"], hits: [1] }), ["a", "b", "c"]);
  assert.deepEqual(rankFaceFeed({ mediaIds: ["a", "b", "c"], likeCounts: [Number.NaN, -4, 2] }), ["c", "a", "b"]);
  assert.deepEqual(rankFaceFeed({ mediaIds: ["a", "b"] }), ["a", "b"]);
});

test("a repeated or malformed id cannot invent or double a photo", () => {
  const ids = rankFaceFeed({ mediaIds: ["a", "", "a", 7 as unknown as string, "b"], hits: [1, 9, 9, 9, 2] });
  assert.deepEqual(ids, ["b", "a"]);
});

/* ── the pager ───────────────────────────────────────────────────────────── */

const item = (id: string): GuestMediaItem => ({ _id: `_${id}`, media_id: id, url: `https://m/${id}.jpg` }) as GuestMediaItem;

test("pages come back in feed order, whatever order get-media answers in", async () => {
  const asked: string[][] = [];
  const feed = buildFaceFeed({
    scope: "mine",
    selected: ["p1"],
    answer: { media_ids: ["a", "b", "c"], hits: [1, 1, 1], like_counts: [0, 5, 2] },
    fetchPage: async (ids) => {
      asked.push(ids);
      return [...ids].reverse().map(item);
    },
  });
  assert.deepEqual(feed.allIds, ["b", "c", "a"]);
  assert.equal(feed.total, 3);
  assert.equal(feed.filtered, true);
  assert.deepEqual(feed.labels, []);
  const page = await feed.loadPage(null);
  assert.deepEqual(page.items.map((m) => m.media_id), ["b", "c", "a"]);
  assert.equal(page.nextCursor, null);
  assert.deepEqual(asked, [["b", "c", "a"]]);
});

test("slices of FEED_PAGE; a fully deleted slice is skipped, not the end", async () => {
  const ids = Array.from({ length: FEED_PAGE * 2 + 5 }, (_, i) => `m${i}`);
  const deleted = new Set(ids.slice(0, FEED_PAGE)); // the whole first slice is gone
  const feed = buildFaceFeed({
    scope: "all",
    selected: ["p1", "p2"],
    answer: { media_ids: ids, hits: [], like_counts: [] },
    fetchPage: async (slice) => slice.filter((id) => !deleted.has(id)).map(item),
  });
  const first = await feed.loadPage(null);
  assert.equal(first.items[0].media_id, `m${FEED_PAGE}`);
  assert.deepEqual(first.nextCursor, { bucket: 0, skip: FEED_PAGE * 2 });
  const second = await feed.loadPage(first.nextCursor);
  assert.equal(second.items.length, 5);
  assert.equal(second.nextCursor, null);
});

test("an empty answer pages to nothing without a request", async () => {
  let calls = 0;
  const feed = buildFaceFeed({
    scope: "mine",
    selected: ["p1"],
    answer: { media_ids: [], hits: [], like_counts: [] },
    fetchPage: async () => {
      calls += 1;
      return [];
    },
  });
  assert.deepEqual(await feed.loadPage(null), { items: [], bucket: 0, nextCursor: null });
  assert.equal(calls, 0);
});

test("the key follows the contents: same answer same key, any change a new one", () => {
  const base = faceFeedKey("mine", ["p2", "p1"], ["a", "b"]);
  assert.equal(base, faceFeedKey("mine", ["p1", "p2"], ["a", "b"]), "selection order does not matter");
  assert.notEqual(base, faceFeedKey("all", ["p1", "p2"], ["a", "b"]));
  assert.notEqual(base, faceFeedKey("mine", ["p1"], ["a", "b"]));
  assert.notEqual(base, faceFeedKey("mine", ["p1", "p2"], ["b", "a"]), "a new order is a new feed");
  assert.notEqual(faceFeedKey("mine", ["p"], ["ab", "c"]), faceFeedKey("mine", ["p"], ["a", "bc"]));
});
