/**
 * My Group's feed: which photos it shows, and in what order.
 *
 * The rule, in one sentence: every photo in the guest's OWN set that contains
 * at least one connected group member, biggest group photos first.
 *
 * All of it is computed on the client from one payload. The directory sends
 * `media_ids` once and each person's `shared` as indices into it, so the
 * intersections the server already did are reused here rather than asked for
 * again — and the server never has to know which tab is open.
 */

import type { GuestMediaItem } from "../types";
import type { FriendPerson } from "./types";

/** Photos per request while paging a bucket. Matches the gallery's own page
 *  size, so a My Group page costs what a My Photos page costs. */
export const FEED_PAGE = 60;

/** One run of photos that `n` of the guest's group members appear in. */
export type FeedBucket = {
  /** How many connected members are in every photo of this bucket. */
  count: number;
  /** Media ids, in the directory's own order (which is the gallery's order). */
  ids: string[];
};

/**
 * Bucket the feed by how many group members each photo holds.
 *
 * Only `in_group` people count. That matters: `media_ids` also carries photos
 * shared with people who merely ALLOW this guest (`open`), because the server
 * computes an intersection for anyone whose permission reaches them. Those
 * photos score zero here and are left out of the feed entirely, which is the
 * difference between "photos with my friends" and "photos with people who
 * would let me see them".
 */
export function buildFeedBuckets({
  mediaIds,
  members,
}: {
  mediaIds: string[];
  members: FriendPerson[];
}): FeedBucket[] {
  const perPhoto = new Map<number, number>();
  for (const member of members) {
    for (const index of member.shared) {
      // A malformed index cannot be allowed to invent a photo.
      if (index < 0 || index >= mediaIds.length) continue;
      perPhoto.set(index, (perPhoto.get(index) ?? 0) + 1);
    }
  }

  const byCount = new Map<number, string[]>();
  // Walked in `mediaIds` order rather than by iterating the Map, so a bucket's
  // ids come out in the gallery's own order and two runs produce the same
  // buckets — which is what makes `skip`/`limit` paging over them stable.
  for (let index = 0; index < mediaIds.length; index++) {
    const count = perPhoto.get(index) ?? 0;
    if (count < 1) continue;
    const bucket = byCount.get(count);
    if (bucket) bucket.push(mediaIds[index]);
    else byCount.set(count, [mediaIds[index]]);
  }

  return [...byCount.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([count, ids]) => ({ count, ids }));
}

/**
 * The divider above a bucket, or "" when there should not be one.
 *
 * With a single connected member every photo in the feed has exactly one of
 * them in it, so there is only ever one bucket and a divider would be labelling
 * the whole list. Hence the two-member floor.
 */
export function bucketLabel(count: number, memberCount: number): string {
  if (memberCount < 2) return "";
  if (count >= memberCount) return "Your whole group";
  if (count === 1) return "With one of your group";
  return `With ${count} of your group`;
}

/**
 * "Waiting for Priya and Rahul to say yes."
 *
 * Listed rather than counted: a guest who has asked two people wants to know
 * WHICH two are yet to answer, and at three or more the names stop being the
 * useful part.
 */
export function waitingSentence(names: string[]): string {
  if (names.length === 0) return "Waiting for your friends to say yes.";
  if (names.length === 1) return `Waiting for ${names[0]} to say yes.`;
  if (names.length === 2) return `Waiting for ${names[0]} and ${names[1]} to say yes.`;
  return `Waiting for ${names[0]}, ${names[1]} and ${names.length - 2} more to say yes.`;
}

/* ── the pager the gallery drives ────────────────────────────────────────── */

/** Where the feed has got to: which bucket, and how far into it. */
export type GroupCursor = { bucket: number; skip: number };

/** One page of the feed, tagged with the bucket it came from so the gallery
 *  can put a divider between runs without knowing how bucketing works. */
export type GroupPage = {
  items: GuestMediaItem[];
  bucket: number;
  /** Null when the feed is exhausted. */
  nextCursor: GroupCursor | null;
};

/**
 * Everything the gallery needs to render My Group, and nothing about how any
 * of it was worked out.
 *
 * This is the seam. `LoungeGallery` imports only the TYPE (erased at compile
 * time), receives an instance from the lazily-loaded friends surface, and
 * pages it with the same machinery it uses for every other tab. The bucketing,
 * the labels and the requests all live on this side of the line.
 */
export type GroupFeed = {
  /**
   * Identity of the CONTENTS, not the object.
   *
   * The gallery keys its loader on this rather than on the feed itself, so an
   * optimistic row change in the people screen that resolves to the same group
   * does not reload the grid under the guest's finger.
   */
  key: string;
  /** Photos in the whole feed, across every bucket. Known exactly up front,
   *  because it is an intersection the client already holds. */
  total: number;
  /** Every media id in feed order — what a download of "my group" covers. */
  allIds: string[];
  memberCount: number;
  /** Divider text per bucket index; "" for a feed that should have none. */
  labels: string[];
  loadPage: (cursor: GroupCursor | null) => Promise<GroupPage>;
};

/** Signature of the inputs that actually change the feed. See `GroupFeed.key`. */
export function feedKey(mediaIds: string[], members: FriendPerson[]): string {
  const who = members
    .map((m) => `${m.guest_id}#${m.shared.length}`)
    .sort()
    .join(",");
  return `${mediaIds.length}|${who}`;
}

/**
 * Build the pager.
 *
 * `fetchPage` is injected rather than imported so this module stays free of the
 * API layer and can be exercised directly — the paging rules below (a short
 * page ends a bucket, an empty bucket is skipped, the cursor never stalls) are
 * the kind of thing that is much easier to get wrong than to test.
 */
export function buildGroupFeed({
  mediaIds,
  members,
  fetchPage,
}: {
  mediaIds: string[];
  members: FriendPerson[];
  /** Ask for one page of a bucket. The caller binds this to `get-media`. */
  fetchPage: (ids: string[], skip: number, limit: number) => Promise<GuestMediaItem[]>;
}): GroupFeed {
  const buckets = buildFeedBuckets({ mediaIds, members });
  const memberCount = members.length;

  const loadPage = async (cursor: GroupCursor | null): Promise<GroupPage> => {
    let bucket = cursor?.bucket ?? 0;
    let skip = cursor?.skip ?? 0;

    while (bucket < buckets.length) {
      const ids = buckets[bucket].ids;
      if (skip >= ids.length) {
        bucket += 1;
        skip = 0;
        continue;
      }
      const items = await fetchPage(ids, skip, FEED_PAGE);
      // A short page means this bucket is done — the same rule the gallery's
      // own download walk uses, and for the same reason: `total` can be capped
      // server-side but a short page never lies.
      const bucketDone = items.length < FEED_PAGE;
      if (items.length === 0) {
        // Every id in this bucket has since been deleted, or the guest can no
        // longer see them. Move on rather than reporting the feed finished.
        bucket += 1;
        skip = 0;
        continue;
      }
      return {
        items,
        bucket,
        nextCursor: bucketDone
          ? bucket + 1 < buckets.length
            ? { bucket: bucket + 1, skip: 0 }
            : null
          : { bucket, skip: skip + items.length },
      };
    }
    return { items: [], bucket: Math.max(0, buckets.length - 1), nextCursor: null };
  };

  return {
    key: feedKey(mediaIds, members),
    total: buckets.reduce((sum, b) => sum + b.ids.length, 0),
    allIds: buckets.flatMap((b) => b.ids),
    memberCount,
    labels: buckets.map((b) => bucketLabel(b.count, memberCount)),
    loadPage,
  };
}
