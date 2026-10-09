import { test } from "node:test";
import assert from "node:assert/strict";
import {
  accessActionsFor,
  allMediaIsPublic,
  compareGuestsForList,
  fullAccessIsRedundant,
  levelOf,
  sortGuestsForList,
} from "./guest-access.ts";

/**
 * `levelOf` and the list order mirror the backend's deliverables.utils.test.js
 * deliberately: the Guest list arrives sorted by the server and is re-sorted
 * here after every local change, so the two must agree or a row jumps when the
 * list reloads. A failure here after a backend change means the mirror is
 * stale.
 */

/* ── levels ─────────────────────────────────────────────────────────────── */

test("levelOf: client beats host, because a Client is stored as a Host", () => {
  assert.equal(levelOf({ guest_type: "host", is_client: true }), "client");
  assert.equal(levelOf({ guest_type: "host" }), "host");
  assert.equal(levelOf({ guest_type: "guest" }), "guest");
});

test("levelOf: is_client is read === true — absent and false are both 'not a Client'", () => {
  assert.equal(levelOf({ guest_type: "host", is_client: false }), "host");
  assert.equal(levelOf({ guest_type: "host", is_client: undefined }), "host");
  assert.equal(levelOf(null), "guest");
  assert.equal(levelOf(undefined), "guest");
});

/* ── order ──────────────────────────────────────────────────────────────── */

type Row = Parameters<typeof compareGuestsForList>[0];
const names = (rows: Row[]) => sortGuestsForList(rows).map((g) => g.name);

test("compareGuestsForList: every Client sits above every Host and Guest, whatever their like counts", () => {
  const rows: Row[] = [
    { _id: "1", name: "Keen Cousin", likes_count: 400 },
    { _id: "2", name: "Host Uncle", likes_count: 90 },
    { _id: "3", name: "Planner", is_client: true, client_role: "client", likes_count: 0, createdAt: "2026-10-01T10:00:00Z" },
  ];
  assert.deepEqual(names(rows), ["Planner", "Keen Cousin", "Host Uncle"]);
});

test("compareGuestsForList: among Clients it is bride, then groom, then the rest in the order they were added", () => {
  const client = (name: string, client_role: Row["client_role"], createdAt: string, likes_count = 0): Row => ({
    _id: name, name, is_client: true, client_role, createdAt, likes_count,
  });
  const rows = [
    client("Later Client", "client", "2026-10-05T10:00:00Z", 50),
    client("Groom", "groom", "2026-10-01T10:00:00Z"),
    client("Earlier Client", "client", "2026-10-02T10:00:00Z"),
    client("Bride", "bride", "2026-10-01T10:00:00Z", 1),
  ];
  assert.deepEqual(names(rows), ["Bride", "Groom", "Earlier Client", "Later Client"]);
});

test("compareGuestsForList: Clients created in the same instant keep a stable order, by _id", () => {
  const at = "2026-10-01T10:00:00Z";
  const rows: Row[] = [
    { _id: "665f00000000000000000003", name: "Third", is_client: true, client_role: "client", createdAt: at },
    { _id: "665f00000000000000000001", name: "First", is_client: true, client_role: "client", createdAt: at },
    { _id: "665f00000000000000000002", name: "Second", is_client: true, client_role: "client", createdAt: at },
  ];
  assert.deepEqual(names(rows), ["First", "Second", "Third"]);
});

test("compareGuestsForList: everyone else keeps the order the list has always had — most likes first, then by name", () => {
  const rows: Row[] = [
    { _id: "1", name: "Zoya", likes_count: 3 },
    { _id: "2", name: "Aman", likes_count: 3 },
    { _id: "3", name: "Meera", likes_count: 12 },
    { _id: "4", name: "Kabir" },
  ];
  assert.deepEqual(names(rows), ["Meera", "Aman", "Zoya", "Kabir"]);
});

test("sortGuestsForList: marking a Guest as Client lifts the row to the Client block at once, and removing it drops it back", () => {
  const rows: Row[] = [
    { _id: "1", name: "Bride", is_client: true, client_role: "bride", createdAt: "2026-10-01T10:00:00Z" },
    { _id: "2", name: "Meera", likes_count: 12 },
    { _id: "3", name: "Kabir", likes_count: 1, createdAt: "2026-10-03T10:00:00Z" },
  ];
  const marked = rows.map((g) => (g._id === "3" ? { ...g, is_client: true, client_role: "client" as const } : g));
  assert.deepEqual(names(marked), ["Bride", "Kabir", "Meera"]);
  const removed = marked.map((g) => (g._id === "3" ? { ...g, is_client: false, client_role: null } : g));
  assert.deepEqual(names(removed), ["Bride", "Meera", "Kabir"]);
});

test("sortGuestsForList: returns a copy and leaves its input alone", () => {
  const rows: Row[] = [{ _id: "1", name: "B", likes_count: 1 }, { _id: "2", name: "A", likes_count: 5 }];
  const sorted = sortGuestsForList(rows);
  assert.notEqual(sorted, rows);
  assert.deepEqual(rows.map((g) => g.name), ["B", "A"]);
});

/* ── the menu ───────────────────────────────────────────────────────────── */

const keys = (level: Parameters<typeof accessActionsFor>[0], redundant = false) =>
  accessActionsFor(level, { fullAccessRedundant: redundant }).map((a) => a.key);

test("accessActionsFor: the items each level is offered, in order", () => {
  assert.deepEqual(keys("guest"), ["give_full", "mark_client"]);
  assert.deepEqual(keys("host"), ["mark_client", "remove_full"]);
  assert.deepEqual(keys("client"), ["remove_client", "remove_full"]);
});

test("accessActionsFor: each item moves the Guest to the level its label promises", () => {
  const to = (level: Parameters<typeof accessActionsFor>[0]) =>
    Object.fromEntries(accessActionsFor(level).map((a) => [a.key, a.to]));
  assert.deepEqual(to("guest"), { give_full: "host", mark_client: "client" });
  assert.deepEqual(to("host"), { mark_client: "client", remove_full: "guest" });
  // Remove Client keeps full access; Remove full access takes both in one step.
  assert.deepEqual(to("client"), { remove_client: "host", remove_full: "guest" });
});

test("accessActionsFor: only 'Remove full access' is destructive, and it is always last", () => {
  for (const level of ["guest", "host", "client"] as const) {
    const actions = accessActionsFor(level);
    const destructive = actions.filter((a) => a.destructive);
    assert.ok(destructive.every((a) => a.key === "remove_full"), level);
    if (destructive.length > 0) assert.equal(actions[actions.length - 1].key, "remove_full", level);
  }
});

test("accessActionsFor: removing full access from a Client says it ends being a Client too", () => {
  const remove = accessActionsFor("client").find((a) => a.key === "remove_full");
  assert.equal(remove?.description, "Also stops them being a Client");
});

test("accessActionsFor: when full access is redundant the two full-access items go, and the Client items stay", () => {
  assert.deepEqual(keys("guest", true), ["mark_client"]);
  assert.deepEqual(keys("host", true), ["mark_client"]);
  assert.deepEqual(keys("client", true), ["remove_client"]);
});

test("accessActionsFor: every level always has at least one item, so the menu is never empty", () => {
  for (const level of ["guest", "host", "client"] as const) {
    for (const redundant of [false, true]) assert.ok(keys(level, redundant).length >= 1, `${level} ${redundant}`);
  }
});

test("no menu copy carries an em dash or an en dash", () => {
  for (const level of ["guest", "host", "client"] as const) {
    for (const action of accessActionsFor(level)) {
      assert.doesNotMatch(`${action.label} ${action.description}`, /[–—]/);
    }
  }
});

/* ── when full access changes nothing ───────────────────────────────────── */

const folder = (_id: string, visibility?: "public" | "private") => ({ _id, visibility });

test("allMediaIsPublic: true when every folder that holds photos is public", () => {
  assert.equal(allMediaIsPublic([folder("a", "public"), folder("b", "public")], { a: 10, b: 4 }), true);
});

test("allMediaIsPublic: one private folder with photos in it is enough to say no", () => {
  assert.equal(allMediaIsPublic([folder("a", "public"), folder("b", "private")], { a: 10, b: 1 }), false);
  // A folder with no visibility at all is private: that is the default.
  assert.equal(allMediaIsPublic([folder("a", "public"), folder("b")], { a: 10, b: 1 }), false);
});

test("allMediaIsPublic: an EMPTY private folder does not count against it — there is nothing in it to reveal", () => {
  assert.equal(allMediaIsPublic([folder("a", "public"), folder("b", "private")], { a: 10, b: 0 }), true);
  assert.equal(allMediaIsPublic([folder("a", "public"), folder("b", "private")], { a: 10 }), true);
});

test("allMediaIsPublic: an event with no photos at all is not 'all public'", () => {
  assert.equal(allMediaIsPublic([], {}), false);
  assert.equal(allMediaIsPublic([folder("a", "public")], {}), false);
  assert.equal(allMediaIsPublic([folder("a", "public")], { a: 0 }), false);
});

const publicEvent = { folders: [folder("a", "public")], folderCounts: { a: 10 } };

test("fullAccessIsRedundant: every photo public and nothing Host-only to download means full access changes nothing", () => {
  // No original-quality files exist for this event.
  assert.equal(
    fullAccessIsRedundant({ ...publicEvent, allowDownload: true, archiveDownloadAccess: "host_only", archiveTierCount: 0 }),
    true,
  );
  // They exist, but every Guest may download them, or nobody may.
  for (const archiveDownloadAccess of ["all_guests", "none"]) {
    assert.equal(
      fullAccessIsRedundant({ ...publicEvent, allowDownload: true, archiveDownloadAccess, archiveTierCount: 2 }),
      true,
      archiveDownloadAccess,
    );
  }
  // Downloads are off altogether, which overrides the Host-only setting.
  assert.equal(
    fullAccessIsRedundant({ ...publicEvent, allowDownload: false, archiveDownloadAccess: "host_only", archiveTierCount: 2 }),
    true,
  );
});

test("fullAccessIsRedundant: with Host-only original downloads in play, full access still decides something, so it is NOT redundant", () => {
  assert.equal(
    fullAccessIsRedundant({ ...publicEvent, allowDownload: true, archiveDownloadAccess: "host_only", archiveTierCount: 1 }),
    false,
  );
});

test("fullAccessIsRedundant: never when a private folder holds photos, whatever the download settings", () => {
  const mixed = { folders: [folder("a", "public"), folder("b", "private")], folderCounts: { a: 10, b: 3 } };
  assert.equal(
    fullAccessIsRedundant({ ...mixed, allowDownload: false, archiveDownloadAccess: "none", archiveTierCount: 0 }),
    false,
  );
});
