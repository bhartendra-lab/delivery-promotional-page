import test from "node:test";
import assert from "node:assert/strict";
import { tileMenuActions } from "./tileMenuActions.ts";

test("the menu lists Download, Add to collection, Share in that order", () => {
  assert.deepEqual(tileMenuActions({ canDownload: true, canCollect: true, canShare: true }), ["download", "collect", "share"]);
});

test("each item appears only when allowed", () => {
  assert.deepEqual(tileMenuActions({ canDownload: false, canCollect: false, canShare: true }), ["share"]);
  assert.deepEqual(tileMenuActions({ canDownload: true, canCollect: false, canShare: false }), ["download"]);
  assert.deepEqual(tileMenuActions({ canDownload: false, canCollect: true, canShare: false }), ["collect"]);
});

test("a laptop with downloads off and no collections has an empty menu, so no 3-dot button", () => {
  assert.deepEqual(tileMenuActions({ canDownload: false, canCollect: false, canShare: false }), []);
});

test("on a phone, Like comes first", () => {
  assert.deepEqual(tileMenuActions({ canLike: true, canDownload: true, canCollect: true, canShare: true }), ["like", "download", "collect", "share"]);
  // Downloads off and not a curator: Like and Share are still there.
  assert.deepEqual(tileMenuActions({ canLike: true, canDownload: false, canCollect: false, canShare: true }), ["like", "share"]);
});
