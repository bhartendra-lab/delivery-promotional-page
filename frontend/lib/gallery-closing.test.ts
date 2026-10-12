import { test } from "node:test";
import assert from "node:assert/strict";
import { closingCountdownLabel, closingDaysLeft } from "./gallery-closing.ts";

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

test("closingCountdownLabel: seven days on the day it is archived, counting down a day at a time", () => {
  const archivedAt = Date.parse("2026-10-10T15:00:00+05:30");
  const closesAt = archivedAt + 7 * DAY;
  assert.equal(closingCountdownLabel(closesAt, archivedAt), "7 days to expire");
  assert.equal(closingCountdownLabel(closesAt, archivedAt + HOUR), "7 days to expire");
  assert.equal(closingCountdownLabel(closesAt, archivedAt + DAY), "6 days to expire");
  assert.equal(closingCountdownLabel(closesAt, archivedAt + 5 * DAY + HOUR), "2 days to expire");
  // The last 24 hours are "1 day", singular.
  assert.equal(closingCountdownLabel(closesAt, archivedAt + 6 * DAY), "1 day to expire");
  assert.equal(closingCountdownLabel(closesAt, closesAt - 1), "1 day to expire");
});

test("closingCountdownLabel: once the moment has passed it expires today, never a negative count", () => {
  const closesAt = Date.parse("2026-10-17T15:00:00+05:30");
  assert.equal(closingCountdownLabel(closesAt, closesAt), "Expires today");
  assert.equal(closingCountdownLabel(closesAt, closesAt + 10 * HOUR), "Expires today");
  assert.equal(closingDaysLeft(closesAt, closesAt + 3 * DAY), 0);
});

test("closingCountdownLabel: a gallery that is not closing shows nothing", () => {
  for (const value of [null, undefined, NaN, Infinity]) {
    assert.equal(closingCountdownLabel(value as number | null | undefined), null);
    assert.equal(closingDaysLeft(value as number | null | undefined), null);
  }
});

test("closingCountdownLabel: no em dash or en dash", () => {
  const closesAt = Date.now() + 3 * DAY;
  for (const now of [closesAt - 7 * DAY, closesAt - DAY, closesAt + DAY]) {
    assert.doesNotMatch(String(closingCountdownLabel(closesAt, now)), /[–—]/);
  }
});
