import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ATTENTION_MAX_ROWS,
  attentionRowOf,
  changeLabel,
  mergeAttention,
  monthTiles,
  viewAllHref,
  type ServerAttentionItem,
  type UploadItem,
} from "./dashboard-home.ts";

const item = (o: Partial<ServerAttentionItem> & { kind: ServerAttentionItem["kind"] }, i = 1): ServerAttentionItem =>
  ({ booking_id: `b${i}`, name: `Event ${i}`, ...o }) as ServerAttentionItem;

test("each kind has one clear action, and a change request is status only", () => {
  const exp = attentionRowOf(item({ kind: "expiring", days_left: 3, ends_at: 1, plan: "pay_per_event" }));
  assert.deepEqual(exp.action, { label: "Extend", href: "/dashboard/events/b1?extend=1" });
  assert.equal(exp.text, "Closes in 3 days");
  const storage = attentionRowOf(item({ kind: "expiring", days_left: 1, ends_at: 1, plan: "storage" }));
  assert.deepEqual(storage.action, { label: "Extend", href: "/dashboard/events/b1" });
  assert.equal(storage.text, "Closes in 1 day");
  assert.equal(attentionRowOf(item({ kind: "expiring", days_left: 0, ends_at: 1, plan: "storage" })).text, "Closes today");
  assert.deepEqual(attentionRowOf(item({ kind: "deactivated" })).action, { label: "Reactivate", reactivate: true });
  assert.deepEqual(attentionRowOf(item({ kind: "missing_number", roles: ["bride", "groom"] })).action, { label: "Add number", href: "/dashboard/events/b1?tab=access" });
  assert.deepEqual(attentionRowOf(item({ kind: "no_photos", created_at: 1 })).action, { label: "Upload photos", href: "/dashboard/events/b1" });
  const cr = attentionRowOf(item({ kind: "change_request", request_type: "event_name" }));
  assert.equal(cr.action, null);
  assert.match(cr.text, /event name/);
});

test("the missing number row names who", () => {
  assert.match(attentionRowOf(item({ kind: "missing_number", roles: ["bride", "groom"] })).text, /Bride and the Groom/);
  assert.match(attentionRowOf(item({ kind: "missing_number", roles: ["groom"] })).text, /the Groom$/);
  assert.match(attentionRowOf(item({ kind: "missing_number", roles: ["bride"] })).text, /the Bride$/);
});

test("uploads come first, then the server's rows, and the list is cut at 6 with the rest counted", () => {
  const uploads: UploadItem[] = [{ booking_id: "u1", name: "Upload event", paused: false, percent: 42.4 }];
  const server = Array.from({ length: 8 }, (_, i) => item({ kind: "deactivated" }, i + 2));
  const { rows, hidden } = mergeAttention(server, uploads);
  assert.equal(rows.length, ATTENTION_MAX_ROWS);
  assert.equal(rows[0].kind, "upload");
  assert.equal(rows[0].text, "Uploading, 42% done");
  assert.deepEqual(rows[0].action, { label: "Open", href: "/dashboard/events/u1" });
  assert.equal(hidden, 3);
});

test("a paused upload says so; the server's total counts rows it did not send", () => {
  const out = mergeAttention([item({ kind: "no_photos", created_at: 1 })], [{ booking_id: "u", name: "N", paused: true, percent: 10 }], 6, 40);
  assert.equal(out.rows[0].text, "Upload paused at 10%");
  assert.equal(out.hidden, 39);
});

test("nothing to do gives no rows", () => {
  assert.deepEqual(mergeAttention([], []), { rows: [], hidden: 0 });
});

test("View all opens the Deactivated filter only when every shown row is a deactivated gallery", () => {
  const rows = (kinds: ServerAttentionItem["kind"][]) => kinds.map((kind, i) => attentionRowOf(item({ kind, days_left: 1, ends_at: 1, plan: "storage", roles: ["bride"], created_at: 1, request_type: "event_name" } as never, i)));
  assert.equal(viewAllHref(rows(["deactivated", "deactivated"])), "/dashboard/events?filter=deactivated");
  assert.equal(viewAllHref(rows(["deactivated", "no_photos"])), "/dashboard/events?filter=active");
  assert.equal(viewAllHref([]), "/dashboard/events?filter=active");
});

test("the change against last month reads in words; no change figure gives no line", () => {
  assert.equal(changeLabel(50), "Up 50% on last month");
  assert.equal(changeLabel(-20), "Down 20% on last month");
  assert.equal(changeLabel(0), "Same as last month");
  assert.equal(changeLabel(null), null);
  assert.equal(changeLabel(undefined), null);
});

test("four tiles in order, Google review taps all time with no change line", () => {
  const s = (value: number, previous: number | null, change: number | null) => ({ value, previous, change });
  const tiles = monthTiles({ month_start: 1, views: s(30, 20, 50), leads: s(12, 12, 0), whatsapp_free: s(40, 0, null), review_taps: s(9, null, null) });
  assert.deepEqual(tiles.map((t) => t.key), ["views", "leads", "whatsapp_free", "review_taps"]);
  assert.equal(tiles[0].change, "Up 50% on last month");
  assert.equal(tiles[0].up, true);
  assert.equal(tiles[1].change, "Same as last month");
  assert.equal(tiles[1].up, null);
  assert.equal(tiles[2].change, null);
  assert.equal(tiles[3].change, null);
  assert.match(tiles[3].hint, /All time/);
});

test("no em dashes in the dashboard copy", () => {
  const src = readFileSync(new URL("./dashboard-home.ts", import.meta.url), "utf8");
  assert.ok(!src.includes(String.fromCharCode(0x2014)));
});

test("each server row can be closed by its own key; a change request per type; an upload row cannot be closed", () => {
  assert.equal(attentionRowOf(item({ kind: "deactivated" })).dismissKey, "deactivated");
  const name = attentionRowOf(item({ kind: "change_request", request_type: "event_name" }));
  const cover = attentionRowOf(item({ kind: "change_request", request_type: "cover_photo" }));
  assert.equal(name.dismissKey, "change_request:event_name");
  assert.notEqual(name.key, cover.key);
  const { rows } = mergeAttention([], [{ booking_id: "u", name: "N", paused: false, percent: 1 }]);
  assert.equal(rows[0].dismissKey, null);
});
