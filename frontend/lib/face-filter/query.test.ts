import test from "node:test";
import assert from "node:assert/strict";
import {
  applyChipAnswer,
  draftAction,
  FACE_FILTER_MAX_SELECTED,
  faceFilterQuery,
  isFaceFilterMedia,
  parseFaceChips,
  reconcileSelection,
  selectionFrom,
  selectionKey,
  toggleSelection,
  visibleChips,
} from "./query.ts";
import type { FaceChips } from "./types.ts";

const chips = (ids: string[], over: Partial<FaceChips> = {}): FaceChips => ({
  key: "k1",
  scope: "mine",
  state: "ready",
  faces: ids.map((id) => ({ id, thumb_url: `https://m/face-${id}.webp`, count: 3 })),
  ...over,
});

/* ── the query ───────────────────────────────────────────────────────────── */

test("chips: include and scope, plus if_key when one is held", () => {
  assert.equal(faceFilterQuery({ scope: "mine" }), "?include=face_filter&scope=mine");
  assert.equal(faceFilterQuery({ scope: "all", ifKey: "abc" }), "?include=face_filter&scope=all&if_key=abc");
});

test("a selection sends faces=, and never an empty one", () => {
  assert.equal(faceFilterQuery({ scope: "mine", ifKey: "k", faces: ["p1", "p2"] }), "?include=face_filter&scope=mine&if_key=k&faces=p1%2Cp2");
  assert.equal(faceFilterQuery({ scope: "mine", faces: [] }), "?include=face_filter&scope=mine");
});

test("at most 30 ids are ever sent", () => {
  const many = Array.from({ length: 40 }, (_, i) => `p${i}`);
  const sent = new URLSearchParams(faceFilterQuery({ scope: "all", faces: many }).slice(1)).get("faces")!.split(",");
  assert.equal(sent.length, FACE_FILTER_MAX_SELECTED);
});

/* ── reading an answer ───────────────────────────────────────────────────── */

test("no block means the backend's switch is off: no chips", () => {
  assert.equal(applyChipAnswer(chips(["a"]), undefined), null);
  assert.equal(applyChipAnswer(chips(["a"]), null), null);
});

test("enabled: false means no chips", () => {
  assert.equal(applyChipAnswer(chips(["a"]), { enabled: false }), null);
});

test("unchanged keeps exactly what is held", () => {
  const held = chips(["a"]);
  assert.equal(applyChipAnswer(held, { unchanged: true, key: "k1" }), held);
  assert.equal(applyChipAnswer(null, { unchanged: true, key: "k1" }), null);
});

test("a full block replaces what is held, shape-checked", () => {
  const next = applyChipAnswer(chips(["a"]), {
    enabled: true,
    state: "ready",
    key: "k2",
    scope: "mine",
    faces: [
      { id: "b", thumb_url: "https://m/b.webp", count: 4 },
      { id: "b", thumb_url: "https://m/b.webp", count: 4 },
      { id: "bad id!", thumb_url: "https://m/x.webp", count: 1 },
      { id: "c", thumb_url: "", count: 2 },
      { id: "d", thumb_url: "https://m/d.webp", count: -3 },
    ],
  });
  assert.equal(next?.key, "k2");
  assert.deepEqual(next?.faces.map((f) => f.id), ["b", "d"]);
  assert.equal(next?.faces[1].count, 0);
});

test("a bar shows only for a ready scope with faces", () => {
  assert.equal(visibleChips(null), null);
  assert.equal(visibleChips(chips([])), null);
  assert.equal(visibleChips(chips(["a"], { state: "preparing" })), null);
  assert.equal(visibleChips(chips(["a"], { state: "needs_selfie" })), null);
  assert.deepEqual(visibleChips(chips(["a"]))?.map((f) => f.id), ["a"]);
});

test("cached junk is a miss", () => {
  assert.equal(parseFaceChips(null), null);
  assert.equal(parseFaceChips({ key: "k", scope: "everyone", state: "ready", faces: [] }), null);
  assert.equal(parseFaceChips({ key: "", scope: "mine", state: "ready", faces: [] }), null);
  assert.equal(parseFaceChips({ key: "k", scope: "mine", state: "ready", faces: "no" }), null);
});

test("a media answer needs every field", () => {
  const ok = { key: "k", scope: "mine", faces: ["a"], media_ids: ["m"], hits: [1], like_counts: [0] };
  assert.equal(isFaceFilterMedia(ok), true);
  assert.equal(isFaceFilterMedia({ ...ok, hits: undefined }), false);
  assert.equal(isFaceFilterMedia({ ...ok, scope: "x" }), false);
  assert.equal(isFaceFilterMedia(undefined), false);
});

/* ── the selection ───────────────────────────────────────────────────────── */

test("chips that are gone drop out of the selection silently", () => {
  const selected = ["a", "b", "c"];
  assert.deepEqual(reconcileSelection(selected, chips(["a", "c", "d"])), ["a", "c"]);
  assert.equal(reconcileSelection(selected, chips(["a", "b", "c"])), selected, "unchanged is the same array");
  assert.deepEqual(reconcileSelection(selected, null), []);
  assert.deepEqual(reconcileSelection(selected, chips(["a"], { state: "preparing" })), []);
});

test("a tap toggles one chip, never past 30", () => {
  assert.deepEqual(toggleSelection([], "a"), ["a"]);
  assert.deepEqual(toggleSelection(["a", "b"], "a"), ["b"]);
  const full = Array.from({ length: FACE_FILTER_MAX_SELECTED }, (_, i) => `p${i}`);
  assert.equal(toggleSelection(full, "extra"), full);
  assert.equal(toggleSelection(full, "p3").length, FACE_FILTER_MAX_SELECTED - 1);
});

test("a selection's identity ignores order", () => {
  assert.equal(selectionKey(["b", "a"]), selectionKey(["a", "b"]));
});

/* ── the open box: picks applied by its button ───────────────────────────── */

test("the box's picks apply as a set: each chip once, known chips only, capped", () => {
  assert.deepEqual(selectionFrom(["a", "b", "a"], chips(["a", "b"])), ["a", "b"]);
  assert.deepEqual(selectionFrom(["a", "gone", "b"], chips(["a", "b"])), ["a", "b"]);
  const many = Array.from({ length: 40 }, (_, i) => `p${i}`);
  assert.equal(selectionFrom(many, chips(many)).length, FACE_FILTER_MAX_SELECTED);
  assert.deepEqual(selectionFrom([], chips(["a"])), []);
});

test("the box's button: done when nothing changed, else show or show all", () => {
  assert.equal(draftAction([], []), "done");
  assert.equal(draftAction(["b", "a"], ["a", "b"]), "done", "order does not count as a change");
  assert.equal(draftAction(["a", "c"], ["a"]), "show");
  assert.equal(draftAction(["a"], []), "show");
  assert.equal(draftAction([], ["a"]), "show-all");
});
