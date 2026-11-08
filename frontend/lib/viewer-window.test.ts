import { test } from "node:test";
import assert from "node:assert/strict";
import { WINDOW_AHEAD, WINDOW_BEHIND, windowIndices, windowNeedsMore } from "./viewer-window.ts";

test("windowIndices: priority order in the middle of a long list", () => {
  assert.deepEqual(windowIndices(10, 200, { wrap: false }), [10, 11, 9, 12, 13, 8, 14, 15, 7]);
  assert.deepEqual(windowIndices(10, 200, { wrap: true }), [10, 11, 9, 12, 13, 8, 14, 15, 7]);
  assert.equal(WINDOW_AHEAD, 5);
  assert.equal(WINDOW_BEHIND, 3);
});

test("windowIndices: first photo without wrap has nothing behind", () => {
  assert.deepEqual(windowIndices(0, 200, { wrap: false }), [0, 1, 2, 3, 4, 5]);
});

test("windowIndices: first photo with wrap reaches the end of the list", () => {
  assert.deepEqual(windowIndices(0, 200, { wrap: true }), [0, 1, 199, 2, 3, 198, 4, 5, 197]);
});

test("windowIndices: last photo without wrap has nothing ahead", () => {
  assert.deepEqual(windowIndices(199, 200, { wrap: false }), [199, 198, 197, 196]);
});

test("windowIndices: last photo with wrap continues from the start", () => {
  assert.deepEqual(windowIndices(199, 200, { wrap: true }), [199, 0, 198, 1, 2, 197, 3, 4, 196]);
});

test("windowIndices: a window larger than the list never repeats an index", () => {
  assert.deepEqual(windowIndices(1, 4, { wrap: true }), [1, 2, 0, 3]);
  assert.deepEqual(windowIndices(1, 4, { wrap: false }), [1, 2, 0, 3]);
  const all = windowIndices(2, 5, { wrap: true });
  assert.equal(new Set(all).size, all.length);
  assert.ok(all.length <= 5);
});

test("windowIndices: a single photo and an empty list", () => {
  assert.deepEqual(windowIndices(0, 1, { wrap: true }), [0]);
  assert.deepEqual(windowIndices(0, 1, { wrap: false }), [0]);
  assert.deepEqual(windowIndices(0, 0, { wrap: true }), []);
});

test("windowIndices: a smaller window (save-data) keeps the same order", () => {
  assert.deepEqual(windowIndices(10, 100, { wrap: false, ahead: 2, behind: 1 }), [10, 11, 9, 12]);
  assert.deepEqual(windowIndices(10, 100, { wrap: false, ahead: 0, behind: 0 }), [10]);
});

test("windowIndices: an out-of-range index is clamped", () => {
  assert.equal(windowIndices(500, 10, { wrap: false })[0], 9);
  assert.equal(windowIndices(-3, 10, { wrap: false })[0], 0);
});

test("windowNeedsMore: asks once the window reaches the last loaded photo", () => {
  assert.equal(windowNeedsMore(0, 60, true), false);
  assert.equal(windowNeedsMore(53, 60, true), false);
  assert.equal(windowNeedsMore(54, 60, true), true);
  assert.equal(windowNeedsMore(59, 60, true), true);
  assert.equal(windowNeedsMore(59, 60, false), false);
  assert.equal(windowNeedsMore(0, 3, true), true);
  assert.equal(windowNeedsMore(50, 60, true, 2), false);
  assert.equal(windowNeedsMore(57, 60, true, 2), true);
});
