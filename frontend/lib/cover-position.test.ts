import { test } from "node:test";
import assert from "node:assert/strict";
import { formatPos, parsePosNums } from "./cover-position.ts";

test("the stored focal point round-trips", () => {
  assert.deepEqual(parsePosNums(formatPos(12.34, 87.66)), [12.3, 87.7]);
  assert.equal(formatPos(...parsePosNums("50% 35%")), "50.0% 35.0%");
});

test("out-of-range points clamp, and an unreadable one is the centre", () => {
  assert.equal(formatPos(-5, 140), "0.0% 100.0%");
  assert.deepEqual(parsePosNums("center"), [50, 50]);
});
