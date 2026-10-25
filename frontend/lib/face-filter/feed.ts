/**
 * The face filter's feed: which photos a selection shows, in what order, and
 * the pager the gallery drives.
 *
 * WHICH: whatever the server answered for the selection. It already holds
 * only photos in the viewer's scope with at least one selected person in
 * them: for "mine", inside the viewer's own stored matched set; for a host's
 * "all", inside the booking. Nothing here widens that, and `get-media`
 * re-applies the same scoping to every page.
 *
 * ORDER, one list:
 *   1. more of the selected people in the photo first (`hits`);
 *   2. then the most liked (`like_counts`, every guest's likes at the event);
 *   3. then the tab's normal order, which is `media_ids` order.
 *
 * The order is fixed when an answer arrives. Liking a photo does not reshuffle
 * the grid; fresh like counts come with the next answer.
 *
 * The pager has exactly the shape of My People's (`GroupFeed`, from
 * lib/friend-finder/feed.ts), so the gallery pages, selects, downloads and
 * opens it through the machinery it already has. That module is reused, not
 * changed.
 */

import type { GuestMediaItem } from "../types";
import { FEED_PAGE, orderPageLike, type GroupCursor, type GroupFeed, type GroupPage } from "../friend-finder/feed.ts";
import type { FaceFilterMedia, FaceFilterScope } from "./types";

export { FEED_PAGE };

/**
 * The selection's media ids, in feed order. Malformed or repeated ids are
 * dropped; short or missing `hits` and `likeCounts` read as zero.
 */
export function rankFaceFeed({
  mediaIds,
  hits,
  likeCounts,
}: {
  mediaIds: string[];
  hits?: number[];
  likeCounts?: number[];
}): string[] {
  const at = (list: number[] | undefined, index: number) => Math.max(0, Number(list?.[index]) || 0);
  const seen = new Set<string>();
  const indices: number[] = [];
  mediaIds.forEach((id, index) => {
    if (typeof id !== "string" || !id || seen.has(id)) return;
    seen.add(id);
    indices.push(index);
  });
  return indices
    .sort((a, b) => at(hits, b) - at(hits, a) || at(likeCounts, b) - at(likeCounts, a) || a - b)
    .map((index) => mediaIds[index]);
}

/** FNV-1a over a list of strings and numbers: short, cheap, and different when
 *  anything in it moves, which is all a cache key needs. */
function signature(parts: Array<string | number>): string {
  let hash = 0x811c9dc5;
  for (const part of parts) {
    const text = String(part);
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    hash ^= 0x2c; // a separator, so ["ab","c"] and ["a","bc"] differ
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/**
 * Identity of a feed's CONTENTS. The gallery reloads its first page when this
 * changes and only then, so an answer identical to the one on screen (a
 * re-request after a refresh, say) does not reload the grid.
 */
export function faceFeedKey(scope: FaceFilterScope, selected: readonly string[], ordered: string[]): string {
  return `face|${scope}|${[...selected].sort().join(",")}|${ordered.length}|${signature(ordered)}`;
}

/**
 * Build the pager for one answer.
 *
 * `fetchPage` is injected so this module stays free of the API layer. It is
 * handed one slice of ids and returns whichever of them still exist. The
 * paging rules are My People's: a short slice still advances by its full
 * length, an all-deleted slice is skipped rather than ending the feed, and
 * every page is put back in feed order.
 */
export function buildFaceFeed({
  scope,
  selected,
  answer,
  fetchPage,
}: {
  scope: FaceFilterScope;
  /** The chips this answer was asked for. */
  selected: readonly string[];
  answer: Pick<FaceFilterMedia, "media_ids" | "hits" | "like_counts">;
  fetchPage: (ids: string[]) => Promise<GuestMediaItem[]>;
}): GroupFeed {
  const ordered = rankFaceFeed({ mediaIds: answer.media_ids, hits: answer.hits, likeCounts: answer.like_counts });

  const loadPage = async (cursor: GroupCursor | null): Promise<GroupPage> => {
    let skip = cursor?.skip ?? 0;
    while (skip < ordered.length) {
      const slice = ordered.slice(skip, skip + FEED_PAGE);
      const items = orderPageLike(slice, await fetchPage(slice));
      skip += slice.length;
      if (items.length === 0) continue;
      return { items, bucket: 0, nextCursor: skip < ordered.length ? { bucket: 0, skip } : null };
    }
    return { items: [], bucket: 0, nextCursor: null };
  };

  return {
    key: faceFeedKey(scope, selected, ordered),
    total: ordered.length,
    allIds: ordered,
    memberCount: selected.length,
    labels: [],
    filtered: true,
    loadPage,
  };
}
