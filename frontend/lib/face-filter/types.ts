/**
 * The face filter: the wire shapes.
 *
 * Mirrors the backend exactly: `buildFaceFilterSession` in
 * `src/services/faceIdentity.service.js`, served on `get-guest-session` with
 * `include=face_filter`. Two steps:
 *   1. the chips (`face_filter`): every person in the viewer's scope, faces
 *      only, never names, never the viewer;
 *   2. one selection's photos (`face_filter_media`), only when `faces=` is
 *      sent.
 *
 * Types only, so `lib/guest-api.ts` can widen its response type with
 * `import type` at no cost to the lounge's bundle.
 */

/** Whose photos a chip bar narrows. A Guest is always "mine"; a host (every
 *  Client is one) asks for "all" on All Photos and "mine" on My Photos. */
export type FaceFilterScope = "mine" | "all";

/** `preparing`: the event has no identities yet. `needs_selfie`: "mine" for a
 *  viewer who has not scanned. Neither shows a bar or a message. */
export type FaceFilterState = "ready" | "preparing" | "needs_selfie";

/** One chip. `count` is the number of photos with this person in the scope. */
export type FaceChip = { id: string; thumb_url: string; count: number };

/** The `face_filter` block, as the server sends it. */
export type FaceFilterBlock =
  | { enabled: false }
  | { enabled: true; state: FaceFilterState; key: string; scope: FaceFilterScope; faces: FaceChip[] }
  /** The `if_key` that was sent still matches: keep the chips already held. */
  | { unchanged: true; key: string };

/** The chips a scope currently holds, after any `unchanged` answer is applied. */
export type FaceChips = {
  /** Opaque. Sent back as `if_key`. */
  key: string;
  scope: FaceFilterScope;
  state: FaceFilterState;
  faces: FaceChip[];
};

/** `face_filter_media`: the photos for one selection. Only when `faces=` was sent. */
export type FaceFilterMedia = {
  /** The chip key this answer belongs to. */
  key: string;
  scope: FaceFilterScope;
  /** The selected ids the server accepted (unknown ones and the viewer's own are dropped). */
  faces: string[];
  /** Photos in scope with at least one selected person, in the tab's normal order. */
  media_ids: string[];
  /** Parallel to `media_ids`: how many of the selected people are in each photo. */
  hits: number[];
  /** Parallel to `media_ids`: every guest's likes at the event. */
  like_counts: number[];
};
