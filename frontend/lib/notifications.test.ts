import { test } from "node:test";
import assert from "node:assert/strict";
import { noticeHref, smartDeepLink, timeAgo, unreadBadge, withoutDeepLink } from "./notifications.ts";

test("the badge: nothing, a dot, a number, then 9+", () => {
  assert.deepEqual(unreadBadge(0), { dot: false, label: null });
  assert.deepEqual(unreadBadge(-1), { dot: false, label: null });
  assert.deepEqual(unreadBadge(1), { dot: true, label: null });
  assert.deepEqual(unreadBadge(2), { dot: true, label: "2" });
  assert.deepEqual(unreadBadge(9), { dot: true, label: "9" });
  assert.deepEqual(unreadBadge(10), { dot: true, label: "9+" });
});

test("times read the way people say them, by India's calendar", () => {
  const now = Date.UTC(2026, 9, 26, 10, 0); // 26 Oct 15:30 IST
  assert.equal(timeAgo(now - 20_000, now), "Just now");
  assert.equal(timeAgo(now - 5 * 60_000, now), "5m ago");
  assert.equal(timeAgo(now - 2 * 3600_000, now), "2h ago");
  // 25 Oct 23:00 IST is yesterday in India even though under 24 hours ago.
  assert.equal(timeAgo(Date.UTC(2026, 9, 25, 17, 30), now), "Yesterday");
  assert.equal(timeAgo(now - 3 * 86_400_000, now), "3d ago");
  assert.equal(timeAgo(Date.UTC(2026, 9, 1, 6), now), "1 Oct");
  assert.equal(timeAgo(new Date(now - 90_000).toISOString(), now), "1m ago");
  assert.equal(timeAgo(null, now), "");
});

test("a notice opens its event's Smart Selects on the first collection", () => {
  const n = { booking_id: "b1", data: { collection_ids: ["6aca63cd6b91447c7145e6c0", "x"], collection_names: [], client_name: null, photo_count: 1 } };
  assert.equal(noticeHref(n), "/dashboard/events/b1?tab=smart&collection=6aca63cd6b91447c7145e6c0");
  assert.equal(noticeHref({ ...n, data: { ...n.data, collection_ids: [] } }), "/dashboard/events/b1?tab=smart");
});

test("the deep link is read once and stripped, leaving everything else", () => {
  assert.deepEqual(smartDeepLink("?tab=smart&collection=6aca63cd6b91447c7145e6c0"), { collectionId: "6aca63cd6b91447c7145e6c0" });
  assert.deepEqual(smartDeepLink("?tab=smart"), { collectionId: null });
  assert.deepEqual(smartDeepLink("?tab=smart&collection=not-an-id"), { collectionId: null });
  assert.equal(smartDeepLink("?extend=1"), null);
  assert.equal(withoutDeepLink("https://x.in/dashboard/events/b1?tab=smart&collection=c&extend=1#top"), "/dashboard/events/b1?extend=1#top");
  assert.equal(withoutDeepLink("https://x.in/dashboard/events/b1?tab=smart"), "/dashboard/events/b1");
});
