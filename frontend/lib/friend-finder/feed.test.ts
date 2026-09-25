import test from "node:test";
import assert from "node:assert/strict";
import { bucketLabel, buildFeedBuckets, waitingSentence } from "./feed.ts";
import type { FriendPerson } from "./types.ts";

const person = (id: string, rel: FriendPerson["rel"], shared: number[]): FriendPerson => ({
  guest_id: id,
  name: id,
  avatar_url: null,
  rel,
  shared,
});

test("buckets by how many members share each photo, biggest first", () => {
  const buckets = buildFeedBuckets({
    mediaIds: ["a", "b", "c", "d"],
    members: [
      person("p1", "in_group", [0, 1]),
      person("p2", "in_group", [1, 2]),
      person("p3", "in_group", [1]),
    ],
  });
  assert.deepEqual(buckets, [
    { count: 3, ids: ["b"] },
    { count: 1, ids: ["a", "c"] },
  ]);
});

test("a photo no member appears in is not in the feed at all", () => {
  const buckets = buildFeedBuckets({
    mediaIds: ["a", "b"],
    members: [person("p1", "in_group", [0])],
  });
  assert.deepEqual(buckets.flatMap((b) => b.ids), ["a"]);
});

test("only members count — a person who merely allows you contributes nothing", () => {
  // The caller passes members only, which is the contract; this pins the
  // consequence of that contract so a future caller passing every person is
  // caught by a failing test rather than by a guest seeing strangers' photos.
  const buckets = buildFeedBuckets({
    mediaIds: ["a", "b"],
    members: [person("friend", "in_group", [0])],
  });
  assert.deepEqual(buckets, [{ count: 1, ids: ["a"] }]);
});

test("bucket ids keep media_ids order, so paging over them is stable", () => {
  const buckets = buildFeedBuckets({
    mediaIds: ["a", "b", "c", "d", "e"],
    members: [person("p1", "in_group", [4, 0, 2])],
  });
  assert.deepEqual(buckets, [{ count: 1, ids: ["a", "c", "e"] }]);
});

test("an out-of-range index cannot invent a photo", () => {
  const buckets = buildFeedBuckets({
    mediaIds: ["a"],
    members: [person("p1", "in_group", [0, 5, -1])],
  });
  assert.deepEqual(buckets, [{ count: 1, ids: ["a"] }]);
});

test("no members means no feed", () => {
  assert.deepEqual(buildFeedBuckets({ mediaIds: ["a", "b"], members: [] }), []);
});

test("bucketLabel stays silent below two members", () => {
  assert.equal(bucketLabel(1, 1), "");
  assert.equal(bucketLabel(1, 0), "");
});

test("bucketLabel names the whole group, then counts down, then singular", () => {
  assert.equal(bucketLabel(3, 3), "With everyone");
  assert.equal(bucketLabel(2, 3), "With 2 of your people");
  assert.equal(bucketLabel(1, 3), "With one of your people");
  assert.equal(bucketLabel(1, 2), "With one of your people");
  assert.equal(bucketLabel(2, 2), "With everyone");
});

test("waitingSentence reads as a sentence at every length", () => {
  assert.equal(waitingSentence([]), "Waiting for your people to say yes.");
  assert.equal(waitingSentence(["Priya"]), "Waiting for Priya to say yes.");
  assert.equal(waitingSentence(["Priya", "Rahul"]), "Waiting for Priya and Rahul to say yes.");
  assert.equal(
    waitingSentence(["Priya", "Rahul", "Anita", "Sam"]),
    "Waiting for Priya, Rahul and 2 more to say yes.",
  );
});

test("no copy here uses an em dash or an en dash", () => {
  const lines = [
    bucketLabel(3, 3),
    bucketLabel(2, 3),
    bucketLabel(1, 3),
    waitingSentence([]),
    waitingSentence(["A"]),
    waitingSentence(["A", "B"]),
    waitingSentence(["A", "B", "C"]),
  ];
  for (const line of lines) {
    assert.ok(!line.includes("—") && !line.includes("–"), line);
  }
});

/* ── the pager ──────────────────────────────────────────────────────────── */

import { buildGroupFeed, FEED_PAGE } from "./feed.ts";
import type { GuestMediaItem } from "../types.ts";

/** A stub gallery: hands back `n` media documents for whatever ids it is given. */
const stubMedia = (ids: string[]): GuestMediaItem[] =>
  ids.map((id) => ({
    _id: id,
    media_id: id,
    url: `https://example.test/${id}.jpg`,
    type: "image" as const,
    custom_folder_ids: [],
    createdAt: "2026-01-01T00:00:00.000Z",
  }));

/** Pages a bucket exactly as `get-media` would. Records every call. */
function recordingFetcher(calls: { ids: string[]; skip: number }[]) {
  return async (ids: string[], skip: number, limit: number) => {
    calls.push({ ids, skip });
    return stubMedia(ids.slice(skip, skip + limit));
  };
}

test("the pager walks buckets in order, biggest group first", async () => {
  const calls: { ids: string[]; skip: number }[] = [];
  const feed = buildGroupFeed({
    mediaIds: ["a", "b", "c"],
    members: [person("p1", "in_group", [0, 1]), person("p2", "in_group", [1, 2])],
    fetchPage: recordingFetcher(calls),
  });

  assert.equal(feed.total, 3);
  assert.deepEqual(feed.allIds, ["b", "a", "c"]);
  assert.deepEqual(feed.labels, ["With everyone", "With one of your people"]);

  const first = await feed.loadPage(null);
  assert.deepEqual(first.items.map((m) => m.media_id), ["b"]);
  assert.equal(first.bucket, 0);
  assert.deepEqual(first.nextCursor, { bucket: 1, skip: 0 });

  const second = await feed.loadPage(first.nextCursor);
  assert.deepEqual(second.items.map((m) => m.media_id), ["a", "c"]);
  assert.equal(second.bucket, 1);
  assert.equal(second.nextCursor, null);
});

test("a full page keeps the cursor inside the same bucket", async () => {
  const ids = Array.from({ length: FEED_PAGE + 5 }, (_, i) => `m${i}`);
  const feed = buildGroupFeed({
    mediaIds: ids,
    members: [person("p1", "in_group", ids.map((_, i) => i))],
    fetchPage: recordingFetcher([]),
  });
  const first = await feed.loadPage(null);
  assert.equal(first.items.length, FEED_PAGE);
  assert.deepEqual(first.nextCursor, { bucket: 0, skip: FEED_PAGE });

  const second = await feed.loadPage(first.nextCursor);
  assert.equal(second.items.length, 5);
  assert.equal(second.nextCursor, null);
});

test("a bucket whose photos have all been deleted is skipped, not treated as the end", async () => {
  const feed = buildGroupFeed({
    mediaIds: ["gone", "here"],
    members: [person("p1", "in_group", [0, 1]), person("p2", "in_group", [0])],
    // "gone" resolves to nothing, as a deleted photo would.
    fetchPage: async (ids, skip, limit) =>
      stubMedia(ids.filter((id) => id !== "gone").slice(skip, skip + limit)),
  });
  const page = await feed.loadPage(null);
  assert.deepEqual(page.items.map((m) => m.media_id), ["here"]);
  assert.equal(page.nextCursor, null);
});

test("an exhausted feed reports no next cursor rather than looping", async () => {
  const feed = buildGroupFeed({
    mediaIds: ["a"],
    members: [person("p1", "in_group", [0])],
    fetchPage: recordingFetcher([]),
  });
  const first = await feed.loadPage(null);
  assert.equal(first.nextCursor, null);
  const past = await feed.loadPage({ bucket: 9, skip: 0 });
  assert.deepEqual(past.items, []);
  assert.equal(past.nextCursor, null);
});

test("the feed key ignores changes that do not change the feed", async () => {
  const members = [person("p1", "in_group", [0]), person("p2", "in_group", [1])];
  const a = buildGroupFeed({ mediaIds: ["x", "y"], members, fetchPage: recordingFetcher([]) });
  // Same people, same shares, listed the other way round.
  const b = buildGroupFeed({
    mediaIds: ["x", "y"],
    members: [members[1], members[0]],
    fetchPage: recordingFetcher([]),
  });
  assert.equal(a.key, b.key);

  const c = buildGroupFeed({
    mediaIds: ["x", "y"],
    members: [members[0]],
    fetchPage: recordingFetcher([]),
  });
  assert.notEqual(a.key, c.key);
});

test("no members means an empty feed that asks the server for nothing", async () => {
  const calls: { ids: string[]; skip: number }[] = [];
  const feed = buildGroupFeed({ mediaIds: ["a"], members: [], fetchPage: recordingFetcher(calls) });
  assert.equal(feed.total, 0);
  const page = await feed.loadPage(null);
  assert.deepEqual(page.items, []);
  assert.equal(page.nextCursor, null);
  assert.equal(calls.length, 0);
});
