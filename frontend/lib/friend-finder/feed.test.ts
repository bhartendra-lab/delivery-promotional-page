import test from "node:test";
import assert from "node:assert/strict";
import { buildGroupFeed, FEED_PAGE, feedKey, orderPageLike, rankFeedIds } from "./feed.ts";
import type { FriendPerson } from "./types.ts";
import type { GuestMediaItem } from "../types.ts";

const person = (id: string, rel: FriendPerson["rel"], shared: number[]): FriendPerson => ({
  guest_id: id,
  name: id,
  avatar_url: null,
  rel,
  shared,
});

/* ── which photos, in what order ─────────────────────────────────────────── */

test("most liked first, then more of your people, then fewer, then gallery order", () => {
  // media_ids arrive in gallery order (the server sorts them by capture time).
  const ids = rankFeedIds({
    mediaIds: ["a", "b", "c", "d", "e"],
    likeCounts: [0, 5, 0, 5, 2],
    members: [
      person("p1", "in_group", [0, 1, 2, 3, 4]),
      person("p2", "in_group", [0, 3]),
      person("p3", "in_group", [0]),
    ],
  });
  // d and b tie on likes (5); d has two people, b one. Then e (2 likes). Then
  // the zero-like photos by people count: a (3 people) before c (1).
  assert.deepEqual(ids, ["d", "b", "e", "a", "c"]);
});

test("with every like count at zero (a fresh gallery) it is people count, then gallery order", () => {
  const ids = rankFeedIds({
    mediaIds: ["a", "b", "c", "d"],
    likeCounts: [0, 0, 0, 0],
    members: [person("p1", "in_group", [0, 1, 2, 3]), person("p2", "in_group", [2])],
  });
  assert.deepEqual(ids, ["c", "a", "b", "d"]);
});

test("absent like counts read as zero rather than breaking the order", () => {
  const ids = rankFeedIds({
    mediaIds: ["a", "b"],
    members: [person("p1", "in_group", [1, 0])],
  });
  assert.deepEqual(ids, ["a", "b"]);
});

test("a photo the guest is not in is never shown, whatever else is on the payload", () => {
  // The guest's own photos are the only ones `media_ids` can hold (the server
  // intersects every person's set with the requester's). A photo that reached
  // the payload only through someone who merely ALLOWS the guest (`open`) is
  // not a photo with the guest's people, and there is no input here — no
  // passcode, no access level — that could widen the feed past the members'
  // own `shared`. Holding the passcode widens All Photos, never this tab.
  const ids = rankFeedIds({
    mediaIds: ["with-friend", "with-stranger"],
    likeCounts: [0, 99],
    members: [person("friend", "in_group", [0])],
  });
  assert.deepEqual(ids, ["with-friend"]);
});

test("the filter: only the selected faces count, for both membership and the people rank", () => {
  const mediaIds = ["a", "b", "c"];
  const priya = person("priya", "in_group", [0, 1]);
  const rahul = person("rahul", "in_group", [1, 2]);
  assert.deepEqual(rankFeedIds({ mediaIds, likeCounts: [0, 0, 0], members: [priya, rahul] }), ["b", "a", "c"]);
  // Priya alone: c (Rahul only) leaves, and a/b now tie on people count.
  assert.deepEqual(rankFeedIds({ mediaIds, likeCounts: [0, 0, 0], members: [priya] }), ["a", "b"]);
});

test("an out-of-range index cannot invent a photo", () => {
  const ids = rankFeedIds({
    mediaIds: ["a"],
    members: [person("p1", "in_group", [0, 5, -1, 0.5])],
  });
  assert.deepEqual(ids, ["a"]);
});

test("no members means no feed", () => {
  assert.deepEqual(rankFeedIds({ mediaIds: ["a", "b"], likeCounts: [3, 3], members: [] }), []);
});

/* ── the pager ──────────────────────────────────────────────────────────── */

/** A stub gallery: media documents for whatever ids it is given. */
const stubMedia = (ids: string[]): GuestMediaItem[] =>
  ids.map((id) => ({
    _id: id,
    media_id: id,
    url: `https://example.test/${id}.jpg`,
    type: "image" as const,
    custom_folder_ids: [],
    createdAt: "2026-01-01T00:00:00.000Z",
  }));

/** Answers like `get-media`: in ITS order (here, alphabetical), not the order
 *  the ids were sent in. Records every slice it was asked for. */
function galleryOrderFetcher(calls: string[][], deleted: Set<string> = new Set()) {
  return async (ids: string[]) => {
    calls.push(ids);
    return stubMedia([...ids].filter((id) => !deleted.has(id)).sort());
  };
}

test("orderPageLike: a page comes back in the order its slice asked for", () => {
  const page = orderPageLike(["c", "a", "b"], stubMedia(["a", "b", "c"]));
  assert.deepEqual(page.map((m) => m.media_id), ["c", "a", "b"]);
});

test("orderPageLike: drops anything the server returned that was not asked for", () => {
  const page = orderPageLike(["a"], stubMedia(["a", "z"]));
  assert.deepEqual(page.map((m) => m.media_id), ["a"]);
});

test("paging keeps the likes order, even though get-media answers in its own order", async () => {
  const calls: string[][] = [];
  const feed = buildGroupFeed({
    mediaIds: ["a", "b", "c"],
    likeCounts: [1, 9, 4],
    members: [person("p1", "in_group", [0, 1, 2])],
    fetchPage: galleryOrderFetcher(calls),
  });
  assert.deepEqual(feed.allIds, ["b", "c", "a"]);
  const page = await feed.loadPage(null);
  assert.deepEqual(page.items.map((m) => m.media_id), ["b", "c", "a"]);
  assert.deepEqual(calls, [["b", "c", "a"]], "one slice, sent in feed order");
});

test("the feed is ONE list: a single bucket and no divider labels", () => {
  const feed = buildGroupFeed({
    mediaIds: ["a", "b", "c"],
    likeCounts: [0, 0, 0],
    members: [person("p1", "in_group", [0, 1]), person("p2", "in_group", [1, 2])],
    fetchPage: galleryOrderFetcher([]),
  });
  assert.deepEqual(feed.labels, []);
  assert.equal(feed.total, 3);
});

test("pages are slices of FEED_PAGE, and the cursor walks the list", async () => {
  const ids = Array.from({ length: FEED_PAGE + 5 }, (_, i) => `m${String(i).padStart(3, "0")}`);
  const calls: string[][] = [];
  const feed = buildGroupFeed({
    mediaIds: ids,
    members: [person("p1", "in_group", ids.map((_, i) => i))],
    fetchPage: galleryOrderFetcher(calls),
  });
  const first = await feed.loadPage(null);
  assert.equal(first.items.length, FEED_PAGE);
  assert.deepEqual(first.nextCursor, { bucket: 0, skip: FEED_PAGE });

  const second = await feed.loadPage(first.nextCursor);
  assert.equal(second.items.length, 5);
  assert.equal(second.nextCursor, null);
  assert.deepEqual(calls.map((c) => c.length), [FEED_PAGE, 5]);
});

test("a deleted photo inside a slice makes the page short, and the next slice starts after it", async () => {
  const ids = Array.from({ length: FEED_PAGE + 2 }, (_, i) => `m${String(i).padStart(3, "0")}`);
  const calls: string[][] = [];
  const feed = buildGroupFeed({
    mediaIds: ids,
    members: [person("p1", "in_group", ids.map((_, i) => i))],
    fetchPage: galleryOrderFetcher(calls, new Set(["m005"])),
  });
  const first = await feed.loadPage(null);
  assert.equal(first.items.length, FEED_PAGE - 1);
  assert.deepEqual(first.nextCursor, { bucket: 0, skip: FEED_PAGE });
  const second = await feed.loadPage(first.nextCursor);
  assert.deepEqual(second.items.map((m) => m.media_id), [`m0${FEED_PAGE}`, `m0${FEED_PAGE + 1}`]);
});

test("a slice whose photos have all been deleted is skipped, not treated as the end", async () => {
  const ids = Array.from({ length: FEED_PAGE + 1 }, (_, i) => `m${String(i).padStart(3, "0")}`);
  const gone = new Set(ids.slice(0, FEED_PAGE));
  const feed = buildGroupFeed({
    mediaIds: ids,
    members: [person("p1", "in_group", ids.map((_, i) => i))],
    fetchPage: galleryOrderFetcher([], gone),
  });
  const page = await feed.loadPage(null);
  assert.deepEqual(page.items.map((m) => m.media_id), [ids[FEED_PAGE]]);
  assert.equal(page.nextCursor, null);
});

test("an exhausted feed reports no next cursor rather than looping", async () => {
  const feed = buildGroupFeed({
    mediaIds: ["a"],
    members: [person("p1", "in_group", [0])],
    fetchPage: galleryOrderFetcher([]),
  });
  const first = await feed.loadPage(null);
  assert.equal(first.nextCursor, null);
  const past = await feed.loadPage({ bucket: 0, skip: 9 });
  assert.deepEqual(past.items, []);
  assert.equal(past.nextCursor, null);
});

test("no members means an empty feed that asks the server for nothing", async () => {
  const calls: string[][] = [];
  const feed = buildGroupFeed({ mediaIds: ["a"], members: [], fetchPage: galleryOrderFetcher(calls) });
  assert.equal(feed.total, 0);
  const page = await feed.loadPage(null);
  assert.deepEqual(page.items, []);
  assert.equal(page.nextCursor, null);
  assert.equal(calls.length, 0);
});

/* ── the key the gallery reloads on ─────────────────────────────────────── */

test("the feed key ignores changes that do not change the feed", () => {
  const members = [person("p1", "in_group", [0]), person("p2", "in_group", [1])];
  // Same people, same shares, listed the other way round.
  assert.equal(feedKey(["x", "y"], members, [1, 2]), feedKey(["x", "y"], [members[1], members[0]], [1, 2]));
});

test("the feed key moves with the people looked at, the filter, and the like counts", () => {
  const members = [person("p1", "in_group", [0]), person("p2", "in_group", [1])];
  const base = feedKey(["x", "y"], members, [1, 2]);
  assert.notEqual(base, feedKey(["x", "y"], [members[0]], [1, 2]), "a face dropped");
  assert.notEqual(base, feedKey(["x", "y"], members, [1, 2], true), "the filter switched on");
  assert.notEqual(base, feedKey(["x", "y"], members, [1, 3]), "a like count moved");
});

test("a filtered feed says so, for the download's name", () => {
  const feed = buildGroupFeed({
    mediaIds: ["a"],
    members: [person("p1", "in_group", [0])],
    filtered: true,
    fetchPage: galleryOrderFetcher([]),
  });
  assert.equal(feed.filtered, true);
});
