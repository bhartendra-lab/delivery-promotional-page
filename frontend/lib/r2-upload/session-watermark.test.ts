import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionWatermarkOf } from "./session-watermark.ts";

test("sessionWatermarkOf: no records means no session, so no remembered choice", () => {
  assert.equal(sessionWatermarkOf([]), null);
});

test("sessionWatermarkOf: a session begun without the mark is remembered as off", () => {
  const records = [
    { watermark: false, updatedAt: 10 },
    { watermark: false, updatedAt: 20 },
  ];
  assert.equal(sessionWatermarkOf(records), false);
});

test("sessionWatermarkOf: a session begun with the mark is remembered as on", () => {
  assert.equal(sessionWatermarkOf([{ watermark: true, updatedAt: 10 }]), true);
});

test("sessionWatermarkOf: records from before the field existed say nothing", () => {
  assert.equal(sessionWatermarkOf([{ updatedAt: 10 }, { updatedAt: 20 }]), null);
});

test("sessionWatermarkOf: records without a choice are ignored, not read as off", () => {
  // `undefined` must never be coerced to false: that would switch the mark off
  // for a studio who never chose to.
  const records = [{ updatedAt: 50 }, { watermark: true, updatedAt: 10 }];
  assert.equal(sessionWatermarkOf(records), true);
});

test("sessionWatermarkOf: when runs disagree, the newest record's choice wins", () => {
  const older = { watermark: true, updatedAt: 10 };
  const newer = { watermark: false, updatedAt: 99 };
  assert.equal(sessionWatermarkOf([older, newer]), false);
  assert.equal(sessionWatermarkOf([newer, older]), false);
});
