import { test } from "node:test";
import assert from "node:assert/strict";
import { formatPhoneForDisplay, tidyName } from "./guest-display.ts";

test("an Indian mobile reads as +91 98273 88808 however it was stored", () => {
  for (const stored of ["919827388808", "+919827388808", "9827388808", "+91 98273 88808", "91-9827388808", " 919827388808 "]) {
    assert.equal(formatPhoneForDisplay(stored), "+91 98273 88808", stored);
  }
});

test("a number that is not a plain Indian mobile is shown as stored, never guessed at or masked", () => {
  assert.equal(formatPhoneForDisplay("+14155550123"), "+14155550123");
  assert.equal(formatPhoneForDisplay("12345"), "12345");
  assert.equal(formatPhoneForDisplay("5827388808"), "5827388808", "does not start 6 to 9");
  assert.equal(formatPhoneForDisplay(""), "");
  assert.equal(formatPhoneForDisplay(null), "");
});

test("a name is only trimmed and its whitespace collapsed", () => {
  assert.equal(tidyName("  Priya   Sharma \n"), "Priya Sharma");
  assert.equal(tidyName("priya SHARMA"), "priya SHARMA", "case untouched");
  assert.equal(tidyName(undefined), "");
});
