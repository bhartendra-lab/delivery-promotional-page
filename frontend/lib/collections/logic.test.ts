import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyMembershipWrite,
  attributionLine,
  bulkLikeMode,
  capabilities,
  capFirst,
  chunk,
  editorCounter,
  editorNote,
  editorSwitchState,
  folderSummary,
  forgetCollection,
  idsToChange,
  initialsOf,
  joinNames,
  lastUsedFirst,
  levelBadge,
  likedToast,
  lockedMessage,
  matchesPeopleQuery,
  mergeMembership,
  recordChange,
  reviewCardState,
  reviewDefaults,
  rowTapAction,
  saveSummary,
  addedAny,
  sendButtonLabel,
  sendConfirmText,
  sentText,
  sheetRowState,
  shortDate,
  statusLabel,
  studioLabel,
  targetStatus,
  unsortedLabel,
  type ChangeLedger,
} from "./logic.ts";
import type { GuestCollection, GuestControlRow, MembershipRef } from "./types.ts";

const BLOCK = { enabled: true as const, max_editors: 6 };

const coll = (over: Partial<GuestCollection> = {}): GuestCollection => ({
  _id: "c1",
  name: "Priya’s Side",
  system_key: "bride",
  order: 0,
  status: "draft",
  target_count: null,
  count: 0,
  cover_urls: [],
  created_by: { kind: "system", name: null },
  finalized_at: null,
  reopened_at: null,
  ...over,
});
const ref = (collection_id: string, over: Partial<MembershipRef> = {}): MembershipRef => ({
  collection_id,
  added_by_name: "Manish",
  added_by_me: false,
  added_at: 1000,
  ...over,
});
const NO_DASH = /[–—]/;

test("capabilities: both the server switch and the server's verdict on this guest", () => {
  assert.deepEqual(capabilities({ is_client: true, can_edit_collections: true }, BLOCK), { curator: true, canManage: true, canSend: true });
  assert.deepEqual(capabilities({ can_edit_collections: true }, BLOCK), { curator: true, canManage: false, canSend: false });
  // Switch off: no block, whatever the guest is.
  assert.equal(capabilities({ is_client: true, can_edit_collections: true }, null).curator, false);
  // A Client the server does not call a curator (it always does today) is not one here.
  assert.equal(capabilities({ is_client: true }, BLOCK).curator, false);
  assert.equal(capabilities(null, BLOCK).curator, false);
});

test("the studio is named in curator copy, or called the studio", () => {
  assert.equal(studioLabel("  Sharma   Films "), "Sharma Films");
  assert.equal(studioLabel(""), "the studio");
  assert.equal(studioLabel(null), "the studio");
  assert.equal(capFirst("the studio"), "The studio");
  assert.equal(sentText("the studio"), "Sent. The studio has been told.");
  assert.equal(sentText("Sharma Films"), "Sent. Sharma Films has been told.");
});

test("names join the Indian English way, and the editor note uses them", () => {
  assert.equal(joinNames([]), "");
  assert.equal(joinNames(["Priya"]), "Priya");
  assert.equal(joinNames(["Priya", "Rahul"]), "Priya and Rahul");
  assert.equal(joinNames(["Priya", "Rahul", "Ankit"]), "Priya, Rahul and Ankit");
  assert.equal(editorNote(["Priya"], "Sharma Films"), "Priya will send the final selection to Sharma Films.");
  assert.equal(editorNote(["Priya", "Rahul"], "Sharma Films"), "Priya and Rahul will send the final selection to Sharma Films.");
  assert.equal(editorNote([], "Sharma Films"), "The final selection goes to Sharma Films once it’s sent.");
  assert.equal(editorNote(undefined, "the studio"), "The final selection goes to the studio once it’s sent.");
});

test("a sheet row is checked, partly in, or not in, for the photos being saved", () => {
  const m = new Map([
    ["a", [ref("c1")]],
    ["b", [ref("c2")]],
  ]);
  const opts = { studio: "Sharma Films" };
  assert.equal(sheetRowState(coll(), ["a"], m, opts).state, "checked");
  assert.equal(sheetRowState(coll(), ["a", "b"], m, opts).state, "indeterminate");
  assert.equal(sheetRowState(coll(), ["a", "b"], m, opts).inCount, 1);
  assert.equal(sheetRowState(coll(), ["b"], m, opts).state, "unchecked");
  assert.equal(sheetRowState(coll(), ["zz"], m, opts).state, "unchecked");
  assert.equal(sheetRowState(coll(), [], m, opts).state, "unchecked");
  assert.equal(rowTapAction("checked"), "remove");
  assert.equal(rowTapAction("indeterminate"), "add");
  assert.equal(rowTapAction("unchecked"), "add");
});

test("a sheet row's second line: sent first, then who added this photo, then the target", () => {
  const opts = { studio: "Sharma Films" };
  const mine = new Map([["a", [ref("c1", { added_by_me: true })]]]);
  const theirs = new Map([["a", [ref("c1")]]]);
  const none = new Map<string, MembershipRef[]>();
  assert.equal(sheetRowState(coll({ status: "final" }), ["a"], theirs, opts).secondary, "Sent to Sharma Films");
  assert.equal(sheetRowState(coll({ status: "final" }), ["a"], theirs, opts).locked, true);
  assert.equal(sheetRowState(coll(), ["a"], mine, opts).secondary, "Added by you");
  assert.equal(sheetRowState(coll(), ["a"], theirs, opts).secondary, "Added by Manish");
  assert.equal(sheetRowState(coll({ count: 182, target_count: 250 }), ["a"], none, opts).secondary, "182 of 250");
  // Bulk: no single adder to name, so the target shows.
  assert.equal(sheetRowState(coll({ count: 1820, target_count: 2500 }), ["a", "b"], theirs, opts).secondary, "1,820 of 2,500");
  assert.equal(sheetRowState(coll(), ["a", "b"], theirs, opts).secondary, null);
  assert.equal(lockedMessage("Sharma Films"), "Sent to Sharma Films. Ask them to reopen it to make changes.");
});

test("the last collection saved to floats to the top, the rest keep their order", () => {
  const list = [{ _id: "a" }, { _id: "b" }, { _id: "c" }];
  assert.deepEqual(lastUsedFirst(list, "c").map((c) => c._id), ["c", "a", "b"]);
  assert.deepEqual(lastUsedFirst(list, "a").map((c) => c._id), ["a", "b", "c"]);
  assert.deepEqual(lastUsedFirst(list, "gone").map((c) => c._id), ["a", "b", "c"]);
  assert.deepEqual(lastUsedFirst(list, null).map((c) => c._id), ["a", "b", "c"]);
});

test("the ledger keeps only net changes, so Undo never removes a photo that was already in", () => {
  let l: ChangeLedger = new Map();
  l = recordChange(l, "c1", "add", ["a", "b"]);
  l = recordChange(l, "c1", "remove", ["b"]);
  assert.deepEqual([...l.get("c1")!.added], ["a"]);
  assert.equal(l.get("c1")!.removed.size, 0);
  // Removing a photo that was in before the sheet opened is a real removal.
  l = recordChange(l, "c2", "remove", ["x"]);
  assert.deepEqual([...l.get("c2")!.removed], ["x"]);
  // Putting it back cancels out, and the collection drops from the ledger.
  l = recordChange(l, "c2", "add", ["x"]);
  assert.equal(l.has("c2"), false);
});

test("an action moves only the photos that need it", () => {
  const m = new Map([["a", [ref("c1")]]]);
  assert.deepEqual(idsToChange("c1", "add", ["a", "b"], m), ["b"]);
  assert.deepEqual(idsToChange("c1", "remove", ["a", "b"], m), ["a"]);
});

test("the sheet ends with one toast for everything it did", () => {
  const name = (id: string) => ({ c1: "Priya’s Side", c2: "Rahul’s Side" })[id] ?? id;
  const one = recordChange(new Map(), "c1", "add", ["a"]);
  assert.equal(saveSummary(one, name), "Saved to Priya’s Side");
  assert.equal(saveSummary(recordChange(one, "c2", "add", ["a"]), name), "Saved to 2 collections");
  assert.equal(saveSummary(recordChange(new Map(), "c2", "remove", ["a"]), name), "Removed from Rahul’s Side");
  assert.equal(
    saveSummary(recordChange(recordChange(new Map(), "c1", "remove", ["a"]), "c2", "remove", ["a"]), name),
    "Removed from 2 collections",
  );
  assert.equal(saveSummary(recordChange(one, "c2", "remove", ["a"]), name), "Updated 2 collections");
  assert.equal(saveSummary(new Map(), name), null);
});

test("only a session that added photos earns the Review button", () => {
  const one = recordChange(new Map(), "c1", "add", ["a"]);
  assert.equal(addedAny(one), true);
  assert.equal(addedAny(recordChange(new Map(), "c1", "remove", ["a"])), false);
  // Added, then taken out again in the same session: nothing was added.
  assert.equal(addedAny(recordChange(one, "c1", "remove", ["a"])), false);
  assert.equal(addedAny(new Map()), false);
});

test("membership answers replace what was asked, and writes show before the server answers", () => {
  const start = new Map([["a", [ref("c1")]], ["b", [ref("c1")]]]);
  const merged = mergeMembership(start, ["a"], {});
  assert.deepEqual(merged.get("a"), []);
  assert.equal(merged.get("b")!.length, 1);

  const added = applyMembershipWrite(new Map(), "c2", "add", ["a"], 5000);
  assert.deepEqual(added.get("a"), [{ collection_id: "c2", added_by_name: null, added_by_me: true, added_at: 5000 }]);
  // Adding again does not duplicate; it moves to the front as the newest add.
  const twice = applyMembershipWrite(applyMembershipWrite(start, "c2", "add", ["a"], 1), "c2", "add", ["a"], 2);
  assert.deepEqual(twice.get("a")!.map((r) => r.collection_id), ["c2", "c1"]);
  const removed = applyMembershipWrite(start, "c1", "remove", ["a"], 9);
  assert.deepEqual(removed.get("a"), []);
  assert.deepEqual(forgetCollection(start, "c1").get("b"), []);
});

test("the attribution line names the newest add and counts the rest", () => {
  const names = new Map([
    ["c1", { name: "Priya’s Side" }],
    ["c2", { name: "Rahul’s Side" }],
  ]);
  assert.equal(attributionLine([ref("c1", { added_by_me: true })], names), "Added to Priya’s Side by you");
  assert.equal(attributionLine([ref("c1")], names), "Added to Priya’s Side by Manish");
  assert.equal(attributionLine([ref("c1", { added_by_name: "Sharma Films" })], names), "Added to Priya’s Side by Sharma Films");
  assert.equal(attributionLine([ref("c2", { added_by_me: true }), ref("c1")], names), "Added to Rahul’s Side by you · +1 more");
  // A collection the viewer cannot see (deleted since) is not counted.
  assert.equal(attributionLine([ref("gone"), ref("c1")], names), "Added to Priya’s Side by Manish");
  assert.equal(attributionLine([], names), null);
  assert.equal(attributionLine(undefined, names), null);
});

test("targets are soft: a bar while under, a gentle note once over", () => {
  assert.equal(targetStatus(10, null), null);
  assert.equal(targetStatus(10, 0), null);
  const under = targetStatus(182, 250)!;
  assert.equal(under.label, "182 of 250");
  assert.equal(under.note, null);
  assert.ok(Math.abs(under.progress - 0.728) < 1e-9);
  const over = targetStatus(318, 250)!;
  assert.equal(over.progress, 1);
  assert.equal(over.note, "68 over your album size");
});

test("the folder summary keeps the studio's order, names loose photos Other, and stays short", () => {
  const f = (name: string | null, count: number) => ({ folder_id: name, name, count });
  assert.equal(folderSummary([f("Haldi", 24), f("Wedding", 120), f("Reception", 38)]), "Haldi 24 · Wedding 120 · Reception 38");
  assert.equal(folderSummary([f("Haldi", 24), f(null, 3)]), "Haldi 24 · Other 3");
  assert.equal(folderSummary([f("A", 1), f("B", 2), f("C", 3), f("D", 4), f("E", 0)]), "A 1 · B 2 · C 3 · +1 more");
  assert.equal(folderSummary([]), "");
});

test("dates are India's, short, and sent collections say when", () => {
  // 25 Oct 2026 20:00 UTC is 26 Oct 01:30 in India.
  assert.equal(shortDate(Date.UTC(2026, 9, 25, 20, 0)), "26 Oct");
  assert.equal(shortDate(null), null);
  assert.equal(statusLabel({ status: "final", finalized_at: Date.UTC(2026, 9, 26, 6) }), "Sent 26 Oct");
  assert.equal(statusLabel({ status: "draft", finalized_at: null }), "Draft");
});

test("bulk like offers Unlike only when every photo is known to be liked by me", () => {
  const mine = new Set(["a", "b"]);
  assert.equal(bulkLikeMode(["a", "b"], mine, true), "unlike");
  assert.equal(bulkLikeMode(["a", "c"], mine, true), "like");
  assert.equal(bulkLikeMode(["a", "b"], mine, false), "like");
  assert.equal(bulkLikeMode([], mine, true), "like");
  assert.equal(likedToast(1, "like"), "Liked 1 photo");
  assert.equal(likedToast(1200, "unlike"), "Unliked 1,200 photos");
});

test("review defaults to every non-empty draft; sent and empty ones cannot be picked", () => {
  const list = [
    coll({ _id: "a", count: 12 }),
    coll({ _id: "b", count: 0 }),
    coll({ _id: "c", count: 40, status: "final" }),
    coll({ _id: "d", count: 3 }),
  ];
  assert.deepEqual([...reviewDefaults(list)], ["a", "d"]);
  assert.equal(reviewCardState(list[1]), "empty");
  assert.equal(reviewCardState(list[2]), "sent");
  assert.equal(sendButtonLabel(2, "Sharma Films"), "Send 2 collections to Sharma Films");
  assert.equal(sendButtonLabel(1, "the studio"), "Send 1 collection to the studio");
  assert.equal(
    sendConfirmText("Sharma Films"),
    "Sharma Films will start designing with these photos. You can’t change them after sending unless the studio reopens them.",
  );
});

test("the to-sort count", () => {
  assert.equal(unsortedLabel(38), "38 liked photos to sort");
  assert.equal(unsortedLabel(1), "1 liked photo to sort");
});

const row = (over: Partial<GuestControlRow> = {}): GuestControlRow => ({
  _id: "g1",
  name: "Manish Verma",
  guest_sub_type: "Bride’s family",
  level: "guest",
  client_role: null,
  editor_source: null,
  ...over,
});

test("Guest Control switches: none for Clients, disabled at the cap, an editor can always be switched off", () => {
  const room = { used: 3, max: 6 };
  const full = { used: 6, max: 6 };
  assert.equal(editorSwitchState(row({ level: "client" }), room, "Sharma Films").show, false);
  assert.deepEqual(editorSwitchState(row(), room, "Sharma Films"), { show: true, on: false, disabled: false, note: null });
  assert.deepEqual(editorSwitchState(row({ level: "host" }), full, "Sharma Films"), {
    show: true,
    on: false,
    disabled: true,
    note: "You can add up to 6 editors.",
  });
  assert.deepEqual(editorSwitchState(row({ level: "editor", editor_source: "studio" }), full, "Sharma Films"), {
    show: true,
    on: true,
    disabled: false,
    note: "Added by Sharma Films",
  });
  assert.equal(editorSwitchState(row({ level: "editor", editor_source: "client" }), full, "Sharma Films").note, null);
  assert.equal(editorCounter(room), "3 of 6 editors");
  assert.deepEqual(["client", "editor", "host", "guest"].map((l) => levelBadge(l as GuestControlRow["level"])), [
    "Client",
    "Can edit selection",
    "Full access",
    "Guest",
  ]);
});

test("people search matches word starts in the name or team", () => {
  assert.equal(matchesPeopleQuery(row(), "man"), true);
  assert.equal(matchesPeopleQuery(row(), "ver"), true);
  assert.equal(matchesPeopleQuery(row(), "bride"), true);
  assert.equal(matchesPeopleQuery(row(), "anish"), false);
  assert.equal(matchesPeopleQuery(row(), "  "), true);
  assert.equal(initialsOf("Manish Verma"), "MV");
  assert.equal(initialsOf(""), "·");
});

test("chunks respect the server's caps", () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([], 3), []);
});

test("no em or en dash in any string a curator reads", () => {
  const strings = [
    editorNote(["Priya"], "Sharma Films"),
    editorNote([], "Sharma Films"),
    lockedMessage("Sharma Films"),
    sendConfirmText("Sharma Films"),
    sentText("Sharma Films"),
    targetStatus(300, 250)!.note!,
    unsortedLabel(3),
    sendButtonLabel(2, "Sharma Films"),
    editorSwitchState(row({ level: "host" }), { used: 6, max: 6 }, "S").note!,
  ];
  for (const s of strings) assert.doesNotMatch(s, NO_DASH, s);
});

test("the studio's sheet: a sent collection is editable and says when it was sent", () => {
  const m = new Map([["a", [ref("c1")]]]);
  const sent = coll({ status: "final", finalized_at: Date.UTC(2026, 9, 26, 6) });
  const info = sheetRowState(sent, ["a"], m, { studio: "Sharma Films", viewer: "studio" });
  assert.equal(info.locked, false);
  assert.equal(info.secondary, "Sent 26 Oct");
  assert.equal(sheetRowState(sent, ["a"], m, { studio: "Sharma Films" }).locked, true);
});
