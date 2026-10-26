import type { CustomFolder, Guest } from "./types";

/**
 * A Guest's access level, the order of the Studio's Guest list, and which
 * access changes are worth offering: the pure rules behind the Guest list in
 * Access & Sharing.
 *
 * `levelOf` and `compareGuestsForList` mirror the backend (backend:
 * `guestAccessLevel` and `compareGuestsForList` in
 * src/utils/deliverables.utils.js). The list arrives sorted; this copy exists
 * so the tab can re-sort after a local change, and a Guest marked as Client
 * moves to the top at once instead of after a reload.
 *
 * If you change a rule here, change it there in the same commit.
 *
 * Dependency-free on purpose (type-only imports), so `node --test` can load it
 * directly.
 */

export type GuestAccessLevel = "guest" | "host" | "client";

type LevelFields = Pick<Guest, "guest_type" | "is_client">;

/**
 * One Guest's access level, as one word. Derive it once per row and use it
 * everywhere rather than branching on the raw fields.
 *
 * A Client is stored as a Host with a flag, so "client" is asked first.
 * `is_client` is read `=== true` because it is absent on every row written
 * before the level existed.
 */
export function levelOf(guest: LevelFields | null | undefined): GuestAccessLevel {
  if (guest?.is_client === true) return "client";
  return guest?.guest_type === "host" ? "host" : "guest";
}

/** The couple lead the Client block, Bride first; every other Client follows. */
const CLIENT_ROLE_RANK: Record<string, number> = { bride: 0, groom: 1 };

type ListFields = Pick<Guest, "_id" | "name" | "is_client" | "client_role" | "createdAt" | "likes_count">;

/**
 * The order of the Guest list. Every Client first, whatever their like count;
 * among Clients bride, groom, then the rest in the order they were added.
 * Everyone else keeps the order the list has always had: most likes first,
 * then by name.
 */
export function compareGuestsForList(a: ListFields, b: ListFields): number {
  const aClient = a.is_client === true;
  const bClient = b.is_client === true;
  if (aClient !== bClient) return aClient ? -1 : 1;
  if (aClient) {
    const byRole = (CLIENT_ROLE_RANK[a.client_role ?? ""] ?? 2) - (CLIENT_ROLE_RANK[b.client_role ?? ""] ?? 2);
    if (byRole !== 0) return byRole;
    const byCreated =
      (new Date(a.createdAt ?? "").getTime() || 0) - (new Date(b.createdAt ?? "").getTime() || 0);
    if (byCreated !== 0) return byCreated;
    return String(a._id ?? "").localeCompare(String(b._id ?? ""));
  }
  return (b.likes_count || 0) - (a.likes_count || 0) || (a.name || "").localeCompare(b.name || "");
}

/** A sorted COPY of the list; the input is left alone. */
export function sortGuestsForList<T extends ListFields>(guests: T[]): T[] {
  return [...guests].sort(compareGuestsForList);
}

type SearchFields = Pick<Guest, "name" | "email" | "phone">;

/** Digits and the punctuation people type inside a phone number. */
const PHONE_LIKE = /^[\d\s()+-]+$/;

/**
 * Whether a Guest belongs in the list for what is typed in its search box: a
 * case-insensitive match on name, email or phone. A phone is stored the way
 * the Guest signed in with it ("+91 98765 43210"), so a query that looks like
 * a number is compared by digits alone and "98765 43210" still finds it. An
 * empty query matches everyone.
 *
 * Search narrows the list already loaded for the level filter; it never
 * changes the order, which stays `compareGuestsForList`.
 */
export function guestMatchesQuery(guest: SearchFields, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const phone = guest.phone ?? "";
  if (
    (guest.name ?? "").toLowerCase().includes(needle) ||
    (guest.email ?? "").toLowerCase().includes(needle) ||
    phone.toLowerCase().includes(needle)
  ) {
    return true;
  }
  if (!PHONE_LIKE.test(needle)) return false;
  const digits = needle.replace(/\D/g, "");
  return digits.length > 0 && phone.replace(/\D/g, "").includes(digits);
}

/* ── which changes to offer ─────────────────────────────────────────────── */

export type GuestAccessAction = {
  key: "give_full" | "mark_client" | "remove_client" | "remove_full";
  /** The level this action moves the Guest to. */
  to: GuestAccessLevel;
  label: string;
  /** One line under the label saying what it means for this Guest. */
  description: string;
  /** Takes something away: rendered last, behind a divider, in the danger colour. */
  destructive?: boolean;
};

const GIVE_FULL: GuestAccessAction = {
  key: "give_full",
  to: "host",
  label: "Give full access",
  description: "See every photo, like with the passcode",
};
const MARK_CLIENT: GuestAccessAction = {
  key: "mark_client",
  to: "client",
  label: "Mark as Client",
  description: "Full gallery plus the Client level",
};
const REMOVE_CLIENT: GuestAccessAction = {
  key: "remove_client",
  to: "host",
  label: "Remove Client",
  description: "They keep full access",
};

/**
 * The items in a Guest row's menu, in order, for the level the Guest holds
 * now. There is always at least one.
 *
 * `fullAccessRedundant` drops the two full-access items (give and remove). See
 * `fullAccessIsRedundant`: when every photo is already public, full access
 * changes nothing a Guest can see, and offering it is noise. The Client items
 * stay, because the Client level is more than which photos someone sees.
 */
export function accessActionsFor(
  level: GuestAccessLevel,
  { fullAccessRedundant = false }: { fullAccessRedundant?: boolean } = {},
): GuestAccessAction[] {
  const removeFull = (description: string): GuestAccessAction => ({
    key: "remove_full",
    to: "guest",
    label: "Remove full access",
    description,
    destructive: true,
  });
  const actions: GuestAccessAction[] =
    level === "client"
      ? [REMOVE_CLIENT, removeFull("Also stops them being a Client")]
      : level === "host"
        ? [MARK_CLIENT, removeFull("Back to their own photos and public folders")]
        : [GIVE_FULL, MARK_CLIENT];
  return fullAccessRedundant
    ? actions.filter((action) => action.key !== "give_full" && action.key !== "remove_full")
    : actions;
}

/* ── when full access changes nothing ───────────────────────────────────── */

type FolderFields = Pick<CustomFolder, "_id" | "visibility">;

/**
 * Is every photo in this event already in a public folder?
 *
 * A Guest without full access sees the public folders, and a photo is public
 * when it sits in at least one of them. So the gallery is public end to end
 * when at least one folder holds photos and no folder that holds photos is
 * private. An EMPTY private folder does not count against it: there is nothing
 * in it for full access to reveal.
 *
 * An event with no photos at all is not "all public": nothing is visible yet,
 * and what the Studio uploads next may well go somewhere private.
 */
export function allMediaIsPublic(folders: FolderFields[], folderCounts: Record<string, number>): boolean {
  const holding = folders.filter((folder) => (folderCounts[folder._id] ?? 0) > 0);
  return holding.length > 0 && holding.every((folder) => folder.visibility === "public");
}

/**
 * Would giving or removing full access change anything for a Guest of this
 * event? When it would not, the Guest list stops offering it.
 *
 * Full access unlocks two things: the photos outside the public folders, and
 * (while downloads are on, original-quality files exist, and the Studio keeps
 * them to Hosts) the original-quality downloads. It is redundant only when
 * NEITHER is in play: every photo is public AND there is no Host-only download
 * to gain. With Host-only originals on, full access still decides who may
 * download them, so the options stay.
 */
export function fullAccessIsRedundant({
  folders,
  folderCounts,
  allowDownload,
  archiveDownloadAccess,
  archiveTierCount,
}: {
  folders: FolderFields[];
  folderCounts: Record<string, number>;
  allowDownload: boolean;
  archiveDownloadAccess: string;
  archiveTierCount: number;
}): boolean {
  const hostOnlyDownloads = allowDownload && archiveTierCount > 0 && archiveDownloadAccess === "host_only";
  return allMediaIsPublic(folders, folderCounts) && !hostOnlyDownloads;
}

/* ── collection editing (only while collections are switched on) ─────────── */

/** The per-event editor cap, from get-all-guests (absent while switched off). */
export type EditorCap = { max_editors: number; editors_used: number };

export type EditorAction = {
  key: "allow_editing" | "stop_editing";
  label: string;
  description: string;
  /** At the cap: shown, with the reason, but cannot be picked. */
  disabled?: boolean;
};

type EditorFields = Pick<Guest, "is_client" | "guest_type" | "collection_editor" | "collection_editor_source" | "full_access_source">;

/**
 * The row menu's collection-editing item, or null: none while collections are
 * off, and none for a Client (Clients can always edit). The cap applies to
 * the studio as it does to the Client; an editor can always be stopped, so
 * the cap can be made room under. Mirrors the backend's planEditorChange.
 */
export function editorActionFor(guest: EditorFields, cap: EditorCap | null | undefined): EditorAction | null {
  if (!cap || guest.is_client === true) return null;
  if (guest.collection_editor === true) {
    return {
      key: "stop_editing",
      label: "Stop editing selection",
      description: guest.full_access_source === "client" ? "Also removes the full access the Client gave" : "They keep their full access",
    };
  }
  const full = cap.editors_used >= cap.max_editors;
  return {
    key: "allow_editing",
    label: "Allow editing selection",
    description: full
      ? `You can add up to ${cap.max_editors} editors.`
      : guest.guest_type === "host"
        ? "They can add photos to the Client's collections"
        : "Gives full access too, so they can see every photo",
    ...(full ? { disabled: true } : {}),
  };
}

/** The row's quiet line for an editor: who gave it. */
export function editorLine(guest: EditorFields): string | null {
  if (guest.is_client === true || guest.collection_editor !== true) return null;
  return `Can edit selection · ${guest.collection_editor_source === "studio" ? "given by you" : "given by client"}`;
}

/**
 * The row as it stands after the studio's change, before the next reload:
 * exactly what planEditorChange writes. Granting gives full access recorded
 * as the studio's when the guest had none; stopping takes away only access
 * the Client gave.
 */
export function afterEditorChange<T extends EditorFields>(guest: T, enable: boolean): T {
  if (enable) {
    return {
      ...guest,
      collection_editor: true,
      collection_editor_source: "studio",
      ...(guest.guest_type !== "host" ? { guest_type: "host" as const, full_access_source: "studio" as const } : {}),
    };
  }
  const next: T = { ...guest, collection_editor: false, collection_editor_source: null };
  if (guest.full_access_source === "client") return { ...next, guest_type: "guest" as const, full_access_source: null };
  return next;
}

/** Where a Host's full access came from, as the row's quiet line says it. */
export function fullAccessSourceLabel(source: Guest["full_access_source"]): string {
  if (source === "studio") return "given by you";
  if (source === "client") return "given by client";
  return "passcode";
}
