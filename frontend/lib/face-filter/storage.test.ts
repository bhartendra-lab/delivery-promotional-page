import test from "node:test";
import assert from "node:assert/strict";
import { clearFaceFilterCache, readFaceChips, readFaceSelection, writeFaceChips, writeFaceSelection } from "./storage.ts";
import type { FaceChips } from "./types.ts";

/** A sessionStorage stand-in; `throwing` makes every call throw, like Safari
 *  private mode on setItem or blocked site data on everything. */
function installStorage({ throwing = false } = {}) {
  const data = new Map<string, string>();
  const fail = () => {
    throw new Error("SecurityError");
  };
  (globalThis as { sessionStorage?: unknown }).sessionStorage = {
    getItem: (k: string) => (throwing ? fail() : data.get(k) ?? null),
    setItem: (k: string, v: string) => (throwing ? fail() : void data.set(k, v)),
    removeItem: (k: string) => (throwing ? fail() : void data.delete(k)),
  };
  return data;
}

const chips: FaceChips = {
  key: "k1",
  scope: "mine",
  state: "ready",
  faces: [{ id: "a", thumb_url: "https://m/a.webp", count: 3 }],
};

test("chips and selection round-trip per gallery and scope", () => {
  const data = installStorage();
  writeFaceChips("g1", "mine", chips);
  writeFaceSelection("g1", "mine", ["a"]);
  assert.deepEqual(readFaceChips("g1", "mine"), chips);
  assert.deepEqual(readFaceSelection("g1", "mine"), ["a"]);
  assert.equal(readFaceChips("g1", "all"), null);
  assert.equal(readFaceChips("g2", "mine"), null);
  assert.ok([...data.keys()].every((k) => k.startsWith("faces:v1:")));
});

test("an entry for the other scope, or junk, is a miss", () => {
  const data = installStorage();
  data.set("faces:v1:g1:all:chips", JSON.stringify(chips)); // says scope "mine"
  assert.equal(readFaceChips("g1", "all"), null);
  data.set("faces:v1:g1:mine:chips", "{not json");
  assert.equal(readFaceChips("g1", "mine"), null);
  data.set("faces:v1:g1:mine:sel", JSON.stringify(["a", 4, null, "b"]));
  assert.deepEqual(readFaceSelection("g1", "mine"), ["a", "b"]);
});

test("an empty selection or no chips removes the entry", () => {
  const data = installStorage();
  writeFaceChips("g1", "mine", chips);
  writeFaceSelection("g1", "mine", ["a"]);
  writeFaceChips("g1", "mine", null);
  writeFaceSelection("g1", "mine", []);
  assert.equal(data.size, 0);
});

test("sign-out clears both scopes of this gallery only", () => {
  const data = installStorage();
  writeFaceChips("g1", "mine", chips);
  writeFaceSelection("g1", "all", ["a"]);
  writeFaceChips("g2", "mine", chips);
  clearFaceFilterCache("g1");
  assert.deepEqual([...data.keys()], ["faces:v1:g2:mine:chips"]);
});

test("storage that throws never breaks anything", () => {
  installStorage({ throwing: true });
  assert.doesNotThrow(() => writeFaceChips("g1", "mine", chips));
  assert.doesNotThrow(() => writeFaceSelection("g1", "mine", ["a"]));
  assert.doesNotThrow(() => clearFaceFilterCache("g1"));
  assert.equal(readFaceChips("g1", "mine"), null);
  assert.deepEqual(readFaceSelection("g1", "mine"), []);
});

test("no storage at all is a miss", () => {
  delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
  assert.equal(readFaceChips("g1", "mine"), null);
  assert.doesNotThrow(() => writeFaceChips("g1", "mine", chips));
});
