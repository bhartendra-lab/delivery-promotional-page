import test from "node:test";
import assert from "node:assert/strict";
import { foldName, matchesQuery } from "./search.ts";

test("foldName strips accents and case", () => {
  assert.equal(foldName("Zoë"), "zoe");
  assert.equal(foldName("JOSÉ"), "jose");
  assert.equal(foldName("  Priya   Sharma "), "priya sharma");
});

test("matchesQuery is accent- and case-insensitive both ways round", () => {
  assert.equal(matchesQuery("Zoë", foldName("zoe")), true);
  assert.equal(matchesQuery("Zoe", foldName("zoë")), true);
  assert.equal(matchesQuery("José Álvarez", foldName("alvarez")), true);
});

test("matchesQuery matches anywhere in the name, not just the start", () => {
  assert.equal(matchesQuery("Priya Sharma", foldName("sharma")), true);
  assert.equal(matchesQuery("Priya Sharma", foldName("iya sha")), true);
});

test("an empty query matches everything, so an empty search box hides nobody", () => {
  assert.equal(matchesQuery("anyone at all", ""), true);
});

test("a non-match is a non-match", () => {
  assert.equal(matchesQuery("Priya", foldName("rahul")), false);
});

test("scripts the normaliser cannot decompose are left intact and still match", () => {
  assert.equal(matchesQuery("प्रिया", foldName("प्रिया")), true);
  assert.equal(matchesQuery("प्रिया", foldName("रahul")), false);
});
