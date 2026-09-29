/**
 * My People's feed: which photos it shows, and in what order.
 *
 * WHICH: every photo in the guest's OWN set that contains at least one of the
 * people being looked at — every connected member, or only the faces picked in
 * the filter bar. Nothing else, ever. A photo the guest is not in is NEVER
 * shown here, not even to a guest holding the passcode who can see it under
 * All Photos: the passcode widens All Photos only, never what can be searched
 * together with other people. That is guaranteed server-side, not here — each
 * person's `shared` is `$setIntersection` of the requester's own matched set
 * with theirs, and `media_ids` is built only from those — and this module has
 * no notion of access at all, so there is nothing for it to widen.
 *
 * ORDER, one list with no dividers:
 *   1. most liked first (`like_counts`, every Guest's likes at the event);
 *   2. then more of the looked-at people in the photo;
 *   3. then fewer;
 *   4. then the gallery's own order, which is `media_ids` order — the server
 *      sorts it by `captured_at` — so the list, and paging over it, is stable.
 * The "With 2 of your people" dividers went with this: they only read right
 * when the list is grouped by people count, and likes now outrank that.
 *
 * All of it is computed on the client from one payload the guest already
 * holds. Filtering is a subset of that same data run back through this module,
 * so it costs no requests and cannot reveal anything new. Do not add an
 * endpoint for it.
 */

import type { GuestMediaItem } from "../types";
import type { FriendPerson } from "./types";

/** Photos per request while paging the feed. Matches the gallery's own page
 *  size, so a My People page costs what a My Photos page costs. */
export const FEED_PAGE = 60;

/**
 * The feed's media ids, in order.
 *
 * Only the `members` passed in count. That matters: `media_ids` also carries
 * photos shared with people who merely ALLOW this guest (`open`), because the
 * server computes an intersection for anyone whose permission reaches them.
 * Those photos score zero here and are left out entirely, which is the
 * difference between "photos with my people" and "photos with people who would
 * let me see them". The caller passes the connected members, or the filtered
 * subset of them.
 */
export function rankFeedIds({
  mediaIds,
  likeCounts,
  members,
}: {
  mediaIds: string[];
  /** Parallel to `mediaIds`. Absent or short reads as zero. */
  likeCounts?: number[];
  members: FriendPerson[];
}): string[] {
  const perPhoto = new Map<number, number>();
  for (const member of members) {
    for (const index of member.shared) {
      // A malformed index cannot be allowed to invent a photo.
      if (!Number.isInteger(index) || index < 0 || index >= mediaIds.length) continue;
      perPhoto.set(index, (perPhoto.get(index) ?? 0) + 1);
    }
  }
  const likesAt = (index: number) => Math.max(0, Number(likeCounts?.[index]) || 0);
  return [...perPhoto.keys()]
    .sort(
      (a, b) =>
        likesAt(b) - likesAt(a) ||
        (perPhoto.get(b) ?? 0) - (perPhoto.get(a) ?? 0) ||
        // Gallery order: the server hands `media_ids` over sorted by it.
        a - b,
    )
    .map((index) => mediaIds[index]);
}

/**
 * Put one page back into the order its ids were asked for.
 *
 * The feed pages by slicing its ranked id list and asking `get-media` for each
 * slice, but `get-media` answers a slice in ITS sort order (capture time), not
 * the order the ids were sent in. Without this the likes ordering would be
 * scrambled within every page of 60. Anything the server returned that was not
 * asked for is dropped rather than trusted.
 */
export function orderPageLike(slice: string[], items: GuestMediaItem[]): GuestMediaItem[] {
  const position = new Map(slice.map((id, i) => [id, i]));
  return items
    .filter((item) => position.has(item.media_id))
    .sort((a, b) => (position.get(a.media_id) ?? 0) - (position.get(b.media_id) ?? 0));
}

/* ── the pager the gallery drives ────────────────────────────────────────── */

/** How far into the feed the gallery has got. `bucket` is always 0 now — the
 *  feed is one list — and stays in the shape so the gallery's paging needs no
 *  second kind of cursor. */
export type GroupCursor = { bucket: number; skip: number };

/** One page of the feed. `bucket` is always 0 (see GroupCursor); the gallery
 *  still tags items with it, which now yields a single run with no divider. */
export type GroupPage = {
  items: GuestMediaItem[];
  bucket: number;
  /** Null when the feed is exhausted. */
  nextCursor: GroupCursor | null;
};

/**
 * Everything the gallery needs to render My People, and nothing about how any
 * of it was worked out.
 *
 * This is the seam. `LoungeGallery` imports only the TYPE (erased at compile
 * time), receives an instance from the lazily-loaded friends surface, and
 * pages it with the same machinery it uses for every other tab. The ranking,
 * the filter and the requests all live on this side of the line.
 */
export type GroupFeed = {
  /**
   * Identity of the CONTENTS, not the object.
   *
   * The gallery keys its loader on this rather than on the feed itself, so an
   * optimistic row change in the people screen that resolves to the same feed
   * does not reload the grid under the guest's finger. It changes when the
   * people looked at change (the filter included) or the like counts do.
   */
  key: string;
  /** Photos in the whole feed. Known exactly up front, because it is an
   *  intersection the client already holds — and it follows the filter, so
   *  "Download all (N)" and Select all describe what is on screen. */
  total: number;
  /** Every media id in feed order — what a download of "my people" covers. */
  allIds: string[];
  memberCount: number;
  /** Always empty now: one list, no dividers. Kept so the gallery's grid needs
   *  no second code path. */
  labels: string[];
  /** The face filter is narrowing this feed. Drives the download's name. */
  filtered: boolean;
  loadPage: (cursor: GroupCursor | null) => Promise<GroupPage>;
};

/** FNV-1a over the like counts: short, cheap, and different when any count
 *  moves, which is all a cache key needs. */
function likesSignature(likeCounts: number[] | undefined): string {
  if (!likeCounts?.length) return "0";
  let hash = 0x811c9dc5;
  for (const n of likeCounts) {
    hash ^= Math.max(0, Number(n) || 0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${likeCounts.length}:${hash.toString(36)}`;
}

/** Signature of the inputs that actually change the feed. See `GroupFeed.key`. */
export function feedKey(
  mediaIds: string[],
  members: FriendPerson[],
  likeCounts?: number[],
  filtered = false,
): string {
  const who = members
    .map((m) => `${m.guest_id}#${m.shared.length}`)
    .sort()
    .join(",");
  return `${mediaIds.length}|${who}|${likesSignature(likeCounts)}|${filtered ? "f" : "a"}`;
}

/**
 * Build the pager.
 *
 * `fetchPage` is injected rather than imported so this module stays free of the
 * API layer and can be exercised directly. It is handed one slice of ids and
 * must return whichever of them still exist; the paging rules below (a slice
 * that comes back short still advances by its full length, an all-deleted slice
 * is skipped rather than ending the feed, every page is put back in feed order)
 * are the kind of thing much easier to get wrong than to test.
 */
export function buildGroupFeed({
  mediaIds,
  likeCounts,
  members,
  filtered = false,
  fetchPage,
}: {
  mediaIds: string[];
  likeCounts?: number[];
  /** The people being looked at: every connected member, or the filter's pick. */
  members: FriendPerson[];
  filtered?: boolean;
  /** Ask for the photos behind one slice of ids. Bound to `get-media`. */
  fetchPage: (ids: string[]) => Promise<GuestMediaItem[]>;
}): GroupFeed {
  const ordered = rankFeedIds({ mediaIds, likeCounts, members });

  const loadPage = async (cursor: GroupCursor | null): Promise<GroupPage> => {
    let skip = cursor?.skip ?? 0;
    while (skip < ordered.length) {
      const slice = ordered.slice(skip, skip + FEED_PAGE);
      const items = orderPageLike(slice, await fetchPage(slice));
      // Advance by the SLICE, not by what came back: a photo deleted since the
      // guest's last scan simply returns nothing, and the next slice starts
      // where this one ended rather than re-asking for it forever.
      skip += slice.length;
      if (items.length === 0) continue;
      return {
        items,
        bucket: 0,
        nextCursor: skip < ordered.length ? { bucket: 0, skip } : null,
      };
    }
    return { items: [], bucket: 0, nextCursor: null };
  };

  return {
    key: feedKey(mediaIds, members, likeCounts, filtered),
    total: ordered.length,
    allIds: ordered,
    memberCount: members.length,
    labels: [],
    filtered,
    loadPage,
  };
}
