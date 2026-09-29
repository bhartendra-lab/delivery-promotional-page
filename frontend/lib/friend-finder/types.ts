/**
 * "Find my people" — the wire shapes.
 *
 * Mirrors the backend exactly; see `src/services/friendFinder.service.js`
 * (`buildFriendFinderSession` / `buildFriendFinderDirectory`) and
 * `src/utils/friend-finder.utils.js` for the authoritative definitions.
 *
 * Types only, so importing this module costs nothing at runtime — which is why
 * `lib/guest-api.ts` may reference it with `import type` without dragging any
 * of the feature into the lounge's eager bundle.
 */

/**
 * The two answers to the consent question.
 *
 * There is no third "none". Dismissing the sheet records nothing at all, which
 * the block reports as `choice: null` — so "has not answered" and "answered no"
 * are the same state, because they are the same fact.
 */
export type FriendChoice = "everyone" | "selected";

/**
 * Where this guest stands with one other guest. The backend evaluates the same
 * ladder twice (once in JS, once in the aggregation) — see `relationshipOf`.
 * Exactly one button is derived from this, never a combination.
 */
export type FriendRel =
  /** Both of us allow each other: we see our photos together. */
  | "in_group"
  /** I added them and nobody has answered yet. */
  | "requested"
  /** I added them and they said no. They can be asked once more. */
  | "declined"
  /** They named me personally and I have not answered. */
  | "added_you"
  /** They already allow me, so adding them connects us instantly. */
  | "open"
  /** They do not allow me yet, so adding them sends a request. */
  | "ask";

/** Whether the guest's own photo set is ready to intersect against. */
export type FriendFinderState = "needs_selfie" | "preparing" | "ready";

/** Where in the gallery the guest was standing when they consented. Recorded on
 *  the consent row — "they agreed HERE, having been shown this".
 *
 *  Mirrors the backend's FRIEND_FINDER_CONSENT_METHODS. `people_tab` is where
 *  the preference is asked now; the two `sheet_*` values are no longer sent
 *  (their automatic sheets are gone) but stay valid for existing rows; and
 *  `auto_everyone` is written only by the server, when an "Everyone" answer
 *  accepts a request on the Guest's behalf. */
export type FriendConsentMethod =
  | "sheet_after_scan"
  | "sheet_lounge_visit"
  | "lounge_card"
  | "settings"
  | "people_tab"
  | "auto_everyone";

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
  /** Null while they have not answered — which includes having dismissed the
   *  sheet, since that writes nothing. */
  choice: FriendChoice | null;
  /** The 256px crop, and only while this guest's own notice covered showing
   *  it. Never the selfie. */
  avatar_url: string | null;
  face_visible: boolean;
  /** Set on the first add ever and never cleared. Note the My People tab does
   *  NOT hang off this any more — it is offered whenever the feature is live
   *  for this Guest, answered or not, because that tab is where the question
   *  is asked. */
  has_group: boolean;
  /** People waiting on this guest's answer. On a phone it is the badge on the
   *  overflow-menu button and on "Manage my people"; on a laptop, on the My
   *  People tab and the Manage pill. */
  pending_count: number;
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
  /**
   * The requester's OWN photos that at least one other guest's `shared` points
   * at, in the gallery's own order (`captured_at`, then `_id` — settled
   * server-side, since the client cannot know it for photos it has not
   * fetched). A photo that has since been deleted is not here.
   */
  media_ids: string[];
  /**
   * Parallel to `media_ids`: every Guest's likes on each photo at this event.
   * Counts only, never who. What My People sorts by first.
   *
   * Optional because a payload cached before this field existed, or one sent
   * while the count read failed, has none — read absent as all zeros.
   */
  like_counts?: number[];
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
  /**
   * Fresh like counts for the cached payload, keyed by media id, above zero
   * only. Likes do not move `rev` (a heart must not invalidate every Guest's
   * cache at the wedding), so this is how the cached `like_counts` catch up.
   *
   * A map rather than a parallel array because the server answers this branch
   * without building `media_ids`, so it has no order to be parallel to; the
   * client maps it onto the `media_ids` it already holds. Absent when the read
   * failed, and then the cached counts stand.
   */
  like_counts_by_id?: Record<string, number>;
};

export type FriendFinderPeopleResponse = FriendFinderPeople | FriendFinderUnchanged;

export function isUnchanged(res: FriendFinderPeopleResponse): res is FriendFinderUnchanged {
  return (res as FriendFinderUnchanged).unchanged === true;
}

/** Every write this feature makes, all through one endpoint. */
export type FriendFinderAction =
  | { action: "choose"; choice: FriendChoice; consent_method: FriendConsentMethod }
  | { action: "add"; guest_id: string }
  | { action: "remove"; guest_id: string }
  | { action: "decline"; guest_id: string }
  /** The picture only. A Guest's name is the one they gave at sign-in and is
   *  not settable here — there is no second, feature-local name. */
  | { action: "profile"; avatar: "auto" | { media_id: string; face_index: number } };

/* ── what each action answers with ──────────────────────────────────────── */

export type ChooseResult = {
  choice: FriendChoice;
  participant: boolean;
  face_visible: boolean;
  /** Requests "Everyone" just accepted on this guest's behalf. Absent from a
   *  backend that predates the auto-accept. */
  accepted_count?: number;
  /** Present only after "everyone", where it is known to be zero. After
   *  "selected" the waiting requests still wait, and the count stands. */
  pending_count?: number;
  has_group?: boolean;
};
export type AddResult = { guest_id: string; rel: FriendRel; connected: boolean };
export type RemoveResult = { guest_id: string; rel: FriendRel };
export type DeclineResult = { guest_id: string; rel: FriendRel };
export type ProfileResult = { avatar_pending: boolean };
