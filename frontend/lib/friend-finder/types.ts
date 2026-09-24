/**
 * "Find your friends group" — the wire shapes.
 *
 * Mirrors the backend exactly; see `src/services/friendFinder.service.js`
 * (`buildFriendFinderSession` / `buildFriendFinderDirectory`) and
 * `src/utils/friend-finder.utils.js` for the authoritative definitions.
 *
 * Types only, so importing this module costs nothing at runtime — which is why
 * `lib/guest-api.ts` may reference it with `import type` without dragging any
 * of the feature into the lounge's eager bundle.
 */

/** The three answers to the friends consent question. */
export type FriendChoice = "everyone" | "selected" | "none";

/**
 * Where this guest stands with one other guest. The backend evaluates the same
 * ladder twice (once in JS, once in the aggregation) — see `relationshipOf`.
 * Exactly one button is derived from this, never a combination.
 */
export type FriendRel =
  /** Both of us allow each other: we see our photos together. */
  | "in_group"
  /** I added them; they have not added me back yet. */
  | "requested"
  /** They named me personally and I have not answered. */
  | "added_you"
  /** They already allow me, so adding them connects us instantly. */
  | "open"
  /** They do not allow me yet, so adding them sends a request. */
  | "ask"
  /** They withdrew from the feature. Nothing can be done with this row. */
  | "not_sharing";

/** Whether the guest's own photo set is ready to intersect against. */
export type FriendFinderState = "needs_selfie" | "preparing" | "ready";

/** Where in the gallery the guest was standing when they consented. Recorded on
 *  the consent row — "they agreed HERE, having been shown this". */
export type FriendConsentMethod =
  | "sheet_after_scan"
  | "sheet_lounge_visit"
  | "lounge_card"
  | "settings";

/**
 * The block on `get-guest-session`.
 *
 * ABSENT (not null, not `{ enabled: false }`) while the backend's global
 * `FRIEND_FINDER_ENABLED` switch is off, so that response stays byte-for-byte
 * what it was before this feature existed. Present with `enabled: false` when
 * the global switch is on but this studio has turned the feature off for the
 * event. Nothing in the UI renders unless `enabled` is true.
 */
export type FriendFinderBlock = {
  enabled: boolean;
  choice: FriendChoice | null;
  stopped: boolean;
  display_name: string | null;
  /** The 256px crop, and only while this guest's own notice covered showing
   *  it. Never the selfie. */
  avatar_url: string | null;
  face_visible: boolean;
  /** Set on the first add ever and never cleared until they stop sharing —
   *  which is exactly the lifetime of the My Group tab. */
  has_group: boolean;
  pending_count: number;
  /** This guest has muted request messages (WhatsApp / email). */
  requests_muted: boolean;
  group_updated_at: number | null;
  /** Bumps whenever anything about OTHER guests at this event changes. Paired
   *  with `group_updated_at` to make the directory request conditional. */
  rev: number;
};

/** One of this guest's own face crops, offered by the Change photo picker. */
export type FriendAvatarCandidate = {
  media_id: string;
  face_index: number;
  /** [x, y, w, h] of the face within the photo, for the circular crop. */
  bbox: number[];
  score: number;
};

/** One other guest at the event, as this guest may see them. */
export type FriendPerson = {
  guest_id: string;
  name: string;
  avatar_url: string | null;
  rel: FriendRel;
  /**
   * INDICES into the payload's `media_ids`, not ids. A wedding party sharing
   * the same hundred photos would otherwise repeat those ids in every row.
   */
  shared: number[];
};

/** The directory, when the server had something new to say. */
export type FriendFinderPeople = {
  state: FriendFinderState;
  rev: number;
  group_updated_at: number;
  media_ids: string[];
  people: FriendPerson[];
  me: {
    avatar_source: string | null;
    avatar_candidates: FriendAvatarCandidate[];
  };
};

/** …and when both conditional tokens matched, so the client's cache still holds. */
export type FriendFinderUnchanged = {
  unchanged: true;
  rev: number;
  group_updated_at: number;
};

export type FriendFinderPeopleResponse = FriendFinderPeople | FriendFinderUnchanged;

export function isUnchanged(res: FriendFinderPeopleResponse): res is FriendFinderUnchanged {
  return (res as FriendFinderUnchanged).unchanged === true;
}

/** Every write this feature makes, all through one endpoint. */
export type FriendFinderAction =
  | { action: "choose"; choice: FriendChoice; display_name?: string; consent_method: FriendConsentMethod }
  | { action: "add"; guest_id: string }
  | { action: "remove"; guest_id: string }
  | { action: "decline"; guest_id: string }
  | { action: "profile"; display_name?: string; avatar?: "auto" | { media_id: string; face_index: number } }
  | { action: "mute"; muted: boolean }
  | { action: "stop" };

/* ── what each action answers with ──────────────────────────────────────── */

export type ChooseResult = {
  choice: FriendChoice;
  participant: boolean;
  face_visible: boolean;
  display_name: string | null;
};
export type AddResult = { guest_id: string; rel: FriendRel; connected: boolean };
export type RemoveResult = { guest_id: string; rel: FriendRel };
export type DeclineResult = { guest_id: string; rel: FriendRel };
export type ProfileResult = { display_name: string | null; avatar_pending: boolean };
export type MuteResult = { requests_muted: boolean };
export type StopResult = { stopped: true };
