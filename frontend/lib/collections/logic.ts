/**
 * The pure rules behind the guest gallery's collections UI: who sees what,
 * what each row of the Save sheet shows, the attribution line, the toasts'
 * wording, targets, the review screen's defaults and Guest Control's switches.
 * Every string a curator reads that depends on data is built here, so the
 * wording is tested once and the components only lay it out.
 *
 * Copy rules (spec §10): no em dashes, curly apostrophes, short and warm.
 */
import type {
  CollectionsBlock,
  EditorCount,
  FolderBreakdown,
  GuestCollection,
  GuestControlRow,
  Membership,
  MembershipRef,
} from "./types.ts";

/* ── who is a curator ─────────────────────────────────────────────────── */

export type CuratorCaps = {
  /** Sees collections, adds and removes photos, gets the Selection workspace. */
  curator: boolean;
  /** Creates, renames and deletes collections (a Client). */
  canManage: boolean;
  /** Sends to the studio and opens Guest Control (a Client). */
  canSend: boolean;
};

const NONE: CuratorCaps = Object.freeze({ curator: false, canManage: false, canSend: false });

/**
 * What this guest may do with collections, from the session alone. BOTH the
 * server's switch (the `collections` block) and the server's own verdict on
 * this guest (`can_edit_collections`) must say yes; nothing is inferred from
 * `guest_type` or `is_client` on their own. The list response's `can_manage`
 * and `can_send` are the authority once it has loaded.
 */
export function capabilities(
  session: { is_client?: boolean; can_edit_collections?: boolean } | null | undefined,
  block: CollectionsBlock | null | undefined,
): CuratorCaps {
  if (!block?.enabled || session?.can_edit_collections !== true) return NONE;
  const client = session.is_client === true;
  return { curator: true, canManage: client, canSend: client };
}

/* ── the studio, as the copy names it ─────────────────────────────────── */

/**
 * The studio's name for curator copy ("Send to Sharma Films"). Used whatever
 * the gallery's branding switch says: curators are the people who booked the
 * studio, and the backend already attributes studio adds by this name. Falls
 * back to "the studio" when the event has no name on file.
 */
export function studioLabel(companyName: string | null | undefined): string {
  const name = (companyName ?? "").replace(/\s+/g, " ").trim();
  return name || "the studio";
}

/** "the studio has been told" → "The studio has been told" at a sentence start. */
export const capFirst = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** "Priya", "Priya and Rahul", "Priya, Rahul and Ankit". */
export function joinNames(names: string[]): string {
  const list = names.filter(Boolean);
  if (list.length <= 1) return list[0] ?? "";
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

/** An editor's quiet line where a Client sees the send button. */
export function editorNote(clientNames: string[] | undefined, studio: string): string {
  const who = joinNames(clientNames ?? []);
  return who ? `${who} will send the final selection to ${studio}.` : `The final selection goes to ${studio} once it’s sent.`;
}

/* ── the Save sheet ───────────────────────────────────────────────────── */

export type RowState = "checked" | "unchecked" | "indeterminate";

export type SheetRowInfo = {
  state: RowState;
  /** Sent, so a guest cannot change it until the studio reopens it. */
  locked: boolean;
  /** How many of the selected photos are in it. */
  inCount: number;
  /** The row's second line, or null. */
  secondary: string | null;
};

const refIn = (refs: MembershipRef[] | undefined, collectionId: string) =>
  refs?.find((r) => r.collection_id === collectionId);

/**
 * One row of the Save sheet for the photos being saved. Checked when every
 * one is in the collection, indeterminate when some are, unchecked when none.
 * The second line says the most useful thing, in this order: that it is sent
 * (and so locked), who added this one photo, then progress towards a target.
 */
export function sheetRowState(
  collection: GuestCollection,
  selectedIds: readonly string[],
  membership: Membership,
  { studio, viewer = "guest" }: { studio: string; viewer?: "guest" | "studio" },
): SheetRowInfo {
  let inCount = 0;
  for (const id of selectedIds) if (refIn(membership.get(id), collection._id)) inCount++;
  const state: RowState =
    selectedIds.length > 0 && inCount === selectedIds.length ? "checked" : inCount > 0 ? "indeterminate" : "unchecked";
  // The studio may change a sent collection without reopening it; it just
  // sees that it is sent.
  const sent = collection.status === "final";
  const locked = sent && viewer === "guest";

  let secondary: string | null = null;
  if (locked) secondary = `Sent to ${studio}`;
  else if (sent) secondary = statusLabel(collection);
  else if (selectedIds.length === 1 && inCount === 1) {
    const ref = refIn(membership.get(selectedIds[0]), collection._id)!;
    secondary = ref.added_by_me ? "Added by you" : ref.added_by_name ? `Added by ${ref.added_by_name}` : null;
  }
  if (!secondary && collection.target_count) secondary = `${collection.count.toLocaleString("en-IN")} of ${collection.target_count.toLocaleString("en-IN")}`;
  return { state, locked, inCount, secondary };
}

/** What tapping a row does: an unchecked or partly-in row adds the rest,
 *  a checked row removes all of the selected photos from it. */
export const rowTapAction = (state: RowState): "add" | "remove" => (state === "checked" ? "remove" : "add");

/** The locked row's explanation (spec §10 "Locked"). */
export const lockedMessage = (studio: string) => `Sent to ${studio}. Ask them to reopen it to make changes.`;

/** The last collection this guest saved to floats to the top, for the session. */
export function lastUsedFirst<T extends { _id: string }>(collections: readonly T[], lastUsedId: string | null): T[] {
  if (!lastUsedId) return collections.slice();
  const i = collections.findIndex((c) => c._id === lastUsedId);
  if (i <= 0) return collections.slice();
  return [collections[i], ...collections.slice(0, i), ...collections.slice(i + 1)];
}

/* ── what changed while the sheet was open ────────────────────────────── */

/**
 * The net effect of one sheet session (or one bulk action), per collection:
 * which photos were actually added and which actually removed. Undo replays
 * exactly the inverse, so a photo that was already in a collection before an
 * "add the rest" is never removed by the Undo.
 */
export type ChangeLedger = ReadonlyMap<string, { added: ReadonlySet<string>; removed: ReadonlySet<string> }>;

export function recordChange(
  ledger: ChangeLedger,
  collectionId: string,
  action: "add" | "remove",
  mediaIds: readonly string[],
): ChangeLedger {
  const prev = ledger.get(collectionId);
  const added = new Set(prev?.added);
  const removed = new Set(prev?.removed);
  for (const id of mediaIds) {
    if (action === "add") {
      if (removed.has(id)) removed.delete(id);
      else added.add(id);
    } else if (added.has(id)) added.delete(id);
    else removed.add(id);
  }
  const next = new Map(ledger);
  if (added.size || removed.size) next.set(collectionId, { added, removed });
  else next.delete(collectionId);
  return next;
}

/** The photos that must move for an action: an add skips ones already in,
 *  a remove skips ones not in. */
export function idsToChange(
  collectionId: string,
  action: "add" | "remove",
  mediaIds: readonly string[],
  membership: Membership,
): string[] {
  return mediaIds.filter((id) => !!refIn(membership.get(id), collectionId) === (action === "remove"));
}

/** Whether a sheet session put any photo into a collection, net: what
 *  earns the toast its Review button. */
export function addedAny(ledger: ChangeLedger): boolean {
  for (const change of ledger.values()) if (change.added.size > 0) return true;
  return false;
}

/** The one toast a sheet session ends with, or null when nothing changed. */
export function saveSummary(ledger: ChangeLedger, nameOf: (collectionId: string) => string): string | null {
  const addedTo = [...ledger].filter(([, c]) => c.added.size > 0).map(([id]) => id);
  const removedFrom = [...ledger].filter(([, c]) => c.removed.size > 0 && c.added.size === 0).map(([id]) => id);
  if (addedTo.length === 1 && removedFrom.length === 0) return `Saved to ${nameOf(addedTo[0])}`;
  if (addedTo.length > 1 && removedFrom.length === 0) return `Saved to ${addedTo.length} collections`;
  if (addedTo.length === 0 && removedFrom.length === 1) return `Removed from ${nameOf(removedFrom[0])}`;
  if (addedTo.length === 0 && removedFrom.length > 1) return `Removed from ${removedFrom.length} collections`;
  if (addedTo.length || removedFrom.length) return `Updated ${addedTo.length + removedFrom.length} collections`;
  return null;
}

/* ── membership, kept current by optimistic writes ────────────────────── */

/** Merge a server answer into the map. Ids asked about but absent from the
 *  answer are in no collection, so they are cleared. */
export function mergeMembership(
  map: Membership,
  asked: readonly string[],
  answer: Record<string, MembershipRef[]>,
): Map<string, MembershipRef[]> {
  const next = new Map(map);
  for (const id of asked) next.set(id, answer[id] ?? []);
  return next;
}

/** The map after a write, before (or without) the server's answer. */
export function applyMembershipWrite(
  map: Membership,
  collectionId: string,
  action: "add" | "remove",
  mediaIds: readonly string[],
  now: number,
): Map<string, MembershipRef[]> {
  const next = new Map(map);
  for (const id of mediaIds) {
    const refs = (next.get(id) ?? []).filter((r) => r.collection_id !== collectionId);
    if (action === "add") refs.unshift({ collection_id: collectionId, added_by_name: null, added_by_me: true, added_at: now });
    next.set(id, refs);
  }
  return next;
}

/** Drop a deleted collection from every photo's refs. */
export function forgetCollection(map: Membership, collectionId: string): Map<string, MembershipRef[]> {
  const next = new Map<string, MembershipRef[]>();
  for (const [id, refs] of map) next.set(id, refs.filter((r) => r.collection_id !== collectionId));
  return next;
}

/* ── the attribution line ─────────────────────────────────────────────── */

/**
 * The viewer's one line for curators: "Added to Priya’s Side by Manish", with
 * "· +1 more" when the photo is in several. The newest add leads. Null when
 * the photo is in no collection the viewer can see.
 */
export function attributionLine(
  refs: readonly MembershipRef[] | undefined,
  collectionsById: ReadonlyMap<string, { name: string }>,
): string | null {
  const live = (refs ?? []).filter((r) => collectionsById.has(r.collection_id));
  if (!live.length) return null;
  const lead = live[0];
  const who = lead.added_by_me ? "you" : lead.added_by_name || "someone";
  const more = live.length > 1 ? ` · +${live.length - 1} more` : "";
  return `Added to ${collectionsById.get(lead.collection_id)!.name} by ${who}${more}`;
}

/* ── targets, folders, dates ──────────────────────────────────────────── */

export type TargetStatus = { label: string; progress: number; overBy: number; note: string | null };

/** "182 of 250" with a bar, and a gentle note once over. Never a block. */
export function targetStatus(count: number, target: number | null | undefined): TargetStatus | null {
  if (!target || target < 1) return null;
  const overBy = Math.max(0, count - target);
  return {
    label: `${count.toLocaleString("en-IN")} of ${target.toLocaleString("en-IN")}`,
    progress: Math.min(1, count / target),
    overBy,
    note: overBy > 0 ? `${overBy.toLocaleString("en-IN")} over your album size` : null,
  };
}

/** "Haldi 24 · Wedding 120 · Reception 38", folders in the studio's order,
 *  photos with no folder last as "Other". */
export function folderSummary(folders: readonly FolderBreakdown[], max = 3): string {
  const parts = folders.filter((f) => f.count > 0).map((f) => `${f.name ?? "Other"} ${f.count.toLocaleString("en-IN")}`);
  if (parts.length <= max) return parts.join(" · ");
  return `${parts.slice(0, max).join(" · ")} · +${parts.length - max} more`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "26 Oct" in India's time, the date a collection was sent. */
export function shortDate(epochMs: number | null | undefined): string | null {
  if (epochMs == null || !Number.isFinite(epochMs)) return null;
  const d = new Date(epochMs + 330 * 60 * 1000);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export const statusLabel = (c: Pick<GuestCollection, "status" | "finalized_at">): string =>
  c.status === "final" ? `Sent ${shortDate(c.finalized_at) ?? ""}`.trim() : "Draft";

/* ── bulk like ────────────────────────────────────────────────────────── */

/**
 * Like, or Unlike when every selected photo is already liked by me. A
 * select-all whose photos are not all loaded is never "every one liked" as far
 * as we know, so it offers Like (which is harmless on photos already liked).
 */
export function bulkLikeMode(selectedIds: readonly string[], likedByMe: ReadonlySet<string>, complete: boolean): "like" | "unlike" {
  if (!complete || selectedIds.length === 0) return "like";
  return selectedIds.every((id) => likedByMe.has(id)) ? "unlike" : "like";
}

export const likedToast = (n: number, mode: "like" | "unlike") =>
  `${mode === "like" ? "Liked" : "Unliked"} ${n.toLocaleString("en-IN")} ${n === 1 ? "photo" : "photos"}`;

/* ── review and send ──────────────────────────────────────────────────── */

export type ReviewCardState = "sendable" | "sent" | "empty";

export const reviewCardState = (c: Pick<GuestCollection, "status" | "count">): ReviewCardState =>
  c.status === "final" ? "sent" : c.count > 0 ? "sendable" : "empty";

/** Checked by default: every non-empty draft. */
export function reviewDefaults(collections: readonly Pick<GuestCollection, "_id" | "status" | "count">[]): Set<string> {
  return new Set(collections.filter((c) => reviewCardState(c) === "sendable").map((c) => c._id));
}

export function sendButtonLabel(n: number, studio: string): string {
  return `Send ${n.toLocaleString("en-IN")} ${n === 1 ? "collection" : "collections"} to ${studio}`;
}

export const sendConfirmText = (studio: string) =>
  `${capFirst(studio)} will start designing with these photos. You can’t change them after sending unless the studio reopens them.`;

export const sentText = (studio: string) => `Sent. ${capFirst(studio)} has been told.`;

/* ── the lounge card ──────────────────────────────────────────────────── */

export type SelectionCardState = "start" | "progress" | "sent";

/**
 * Which card a curator sees on the home view. "sent" once every collection
 * with photos is sent (and at least one has photos); "start" before anyone
 * has liked or saved anything; "progress" otherwise.
 */
export function selectionCardState(
  collections: readonly Pick<GuestCollection, "status" | "count">[],
  likedTotal: number,
): SelectionCardState {
  const filled = collections.filter((c) => c.count > 0);
  if (filled.length > 0 && filled.every((c) => c.status === "final")) return "sent";
  if (filled.length === 0 && likedTotal === 0) return "start";
  return "progress";
}

export const unsortedLabel = (n: number) =>
  `${n.toLocaleString("en-IN")} liked ${n === 1 ? "photo" : "photos"} to sort`;

/** "Tap the heart … then sort them into Priya’s Side and Rahul’s Side." */
export function startCardText(collections: readonly Pick<GuestCollection, "name">[]): string {
  const names = joinNames(collections.slice(0, 2).map((c) => c.name));
  return names
    ? `Pick photos for your albums. Tap the heart on the ones you love, then sort them into ${names}.`
    : "Pick photos for your albums. Tap the heart on the ones you love, then sort them into collections.";
}

/* ── Guest Control ────────────────────────────────────────────────────── */

export function levelBadge(level: GuestControlRow["level"]): string {
  if (level === "client") return "Client";
  if (level === "editor") return "Can edit selection";
  if (level === "host") return "Full access";
  return "Guest";
}

export type EditorSwitch = { show: boolean; on: boolean; disabled: boolean; note: string | null };

/**
 * The "Can edit selection" switch on one row. None on a Client's row (Clients
 * always can). At the cap, the switches that would add an editor are disabled
 * with the reason; an editor's own switch always works, so the cap can be
 * made room under.
 */
export function editorSwitchState(row: GuestControlRow, editors: EditorCount, studio: string): EditorSwitch {
  if (row.level === "client") return { show: false, on: false, disabled: true, note: null };
  if (row.level === "editor") {
    return { show: true, on: true, disabled: false, note: row.editor_source === "studio" ? `Added by ${studio}` : null };
  }
  const full = editors.used >= editors.max;
  return { show: true, on: false, disabled: full, note: full ? `You can add up to ${editors.max} editors.` : null };
}

export const editorCounter = (editors: EditorCount) => `${editors.used} of ${editors.max} editors`;

/** Name search for the People list: every word typed must start a word of the name or team. */
export function matchesPeopleQuery(row: Pick<GuestControlRow, "name" | "guest_sub_type">, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = `${row.name} ${row.guest_sub_type ?? ""}`.toLowerCase().split(/[\s'’-]+/).filter(Boolean);
  return words.every((w) => hay.some((h) => h.startsWith(w)));
}

export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "·";

/* ── plumbing ─────────────────────────────────────────────────────────── */

export function chunk<T>(list: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** The server's per-request caps (collections.utils.js). */
export const MAX_WRITE_IDS = 1000;
export const MAX_MEMBERSHIP_IDS = 200;
export const MAX_LIKE_IDS = 500;
export const COLLECTION_NAME_MAX = 40;
