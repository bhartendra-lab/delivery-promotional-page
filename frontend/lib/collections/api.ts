/**
 * The collections, Guest Control and bulk-like calls, made with the guest
 * token through `guestFetch` (refresh-and-retry on 401, ApiError otherwise).
 *
 * The server answers 404 on every one of these while COLLECTIONS_ENABLED is
 * off. The gallery never calls them then (it renders nothing curator-shaped
 * without the session's `collections` block), so a 404 here means a booking
 * or collection that is gone, and callers treat it as such.
 */
import { guestFetch } from "../guest-api";
import type {
  CollectionList,
  CuratorFeedPage,
  CuratorFeedQuery,
  EditorCount,
  GuestCollection,
  GuestControl,
  GuestControlRow,
  Liker,
  MembershipRef,
  ReviewCollection,
  WriteResult,
} from "./types";

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const b = (bookingId: string) => encodeURIComponent(bookingId);

export function listCollections(uid: string, bookingId: string) {
  return guestFetch<CollectionList>(uid, `/collections/${b(bookingId)}`);
}

export function createCollection(uid: string, bookingId: string, name: string) {
  return guestFetch<{ collection: GuestCollection }>(uid, `/collections/${b(bookingId)}`, json({ name }));
}

export function renameCollection(uid: string, bookingId: string, collectionId: string, name: string) {
  return guestFetch<{ collection: GuestCollection }>(uid, `/collections/${b(bookingId)}/${encodeURIComponent(collectionId)}`, {
    ...json({ name }),
    method: "PATCH",
  });
}

export function deleteCollection(uid: string, bookingId: string, collectionId: string) {
  return guestFetch<{ deleted: boolean; removed_items: number }>(
    uid,
    `/collections/${b(bookingId)}/${encodeURIComponent(collectionId)}`,
    { method: "DELETE" },
  );
}

/** Add or remove Media `_id`s (at most 1,000 per call; chunk above that). */
export function writeItems(uid: string, bookingId: string, collectionId: string, action: "add" | "remove", mediaIds: string[]) {
  return guestFetch<WriteResult>(
    uid,
    `/collections/${b(bookingId)}/items`,
    json({ action, collection_id: collectionId, media_ids: mediaIds }),
  );
}

/** Which collections each photo is in (at most 200 ids per call). */
export function getMembership(uid: string, bookingId: string, mediaIds: string[]) {
  return guestFetch<{ membership: Record<string, MembershipRef[]> }>(
    uid,
    `/collections/${b(bookingId)}/membership`,
    json({ media_ids: mediaIds }),
  );
}

function feedParams(q: CuratorFeedQuery, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams();
  p.set("view", q.view);
  if (q.collectionId) p.set("collection_id", q.collectionId);
  if (q.inCollection) p.set("in_collection", q.inCollection);
  if (q.likedBy?.length) p.set("liked_by", q.likedBy.join(","));
  if (q.folderId) p.set("folder_id", q.folderId);
  if (q.sort) p.set("sort", q.sort);
  if (q.skip != null) p.set("skip", String(q.skip));
  if (q.limit != null) p.set("limit", String(q.limit));
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  return p.toString();
}

export function getCuratorFeed(uid: string, bookingId: string, q: CuratorFeedQuery, signal?: AbortSignal) {
  return guestFetch<CuratorFeedPage>(uid, `/collections/${b(bookingId)}/media?${feedParams(q)}`, signal ? { signal } : {});
}

/** Every id in a feed's scope, in feed order: select-all's bulk actions. */
export function getCuratorFeedIds(uid: string, bookingId: string, q: CuratorFeedQuery, signal?: AbortSignal) {
  return guestFetch<{ ids: string[]; total: number }>(
    uid,
    `/collections/${b(bookingId)}/media?${feedParams({ ...q, skip: undefined, limit: undefined }, { ids_only: "true" })}`,
    signal ? { signal } : {},
  );
}

export function listLikers(uid: string, bookingId: string) {
  return guestFetch<{ likers: Liker[] }>(uid, `/collections/${b(bookingId)}/likers`);
}

export function reviewCollections(uid: string, bookingId: string) {
  return guestFetch<{ collections: ReviewCollection[] }>(uid, `/collections/${b(bookingId)}/review`);
}

export function sendSelection(uid: string, bookingId: string, collectionIds: string[]) {
  return guestFetch<{ sent: string[]; already_sent: string[] }>(
    uid,
    `/collections/${b(bookingId)}/send`,
    json({ collection_ids: collectionIds }),
  );
}

/** Like or unlike many photos by Media `_id` (at most 500 per call). Curators only. */
export function likePhotos(uid: string, mediaIds: string[], liked: boolean) {
  return guestFetch<{ message: string; changed: number }>(uid, "/deliverables/like-photos", json({ media_ids: mediaIds, liked }));
}

/* ── Guest Control (Clients only) ──────────────────────────────────────── */

export function getGuestControl(uid: string, bookingId: string) {
  return guestFetch<GuestControl>(uid, `/guest-control/${b(bookingId)}`);
}

export function setCollectionEditor(uid: string, bookingId: string, guestId: string, enabled: boolean) {
  return guestFetch<{ guest: GuestControlRow; editors: EditorCount }>(
    uid,
    `/guest-control/${b(bookingId)}/editor`,
    json({ guest_id: guestId, enabled }),
  );
}

export function regeneratePasscode(uid: string, bookingId: string) {
  return guestFetch<{ passcode: string }>(uid, `/guest-control/${b(bookingId)}/regenerate-passcode`, json({}));
}
