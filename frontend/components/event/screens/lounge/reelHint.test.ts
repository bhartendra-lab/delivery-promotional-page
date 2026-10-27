import { test } from "node:test";
import assert from "node:assert/strict";
import { REEL_HINT_MAX, hintDone, markHintDone, wantsNudge } from "./reelHint.ts";

function memoryStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

const base = { done: false, nudges: 0, canNext: true, zoomed: false, reducedMotion: false };

test("nudges until the cap for one opening", () => {
  assert.equal(wantsNudge(base), true);
  assert.equal(wantsNudge({ ...base, nudges: REEL_HINT_MAX - 1 }), true);
  assert.equal(wantsNudge({ ...base, nudges: REEL_HINT_MAX }), false);
});

test("never after the first swipe, on the last photo, while zoomed, or with reduced motion", () => {
  assert.equal(wantsNudge({ ...base, done: true }), false);
  assert.equal(wantsNudge({ ...base, canNext: false }), false);
  assert.equal(wantsNudge({ ...base, zoomed: true }), false);
  assert.equal(wantsNudge({ ...base, reducedMotion: true }), false);
});

test("the first swipe is remembered for the session", () => {
  const store = memoryStore();
  assert.equal(hintDone(store), false);
  markHintDone(store);
  assert.equal(hintDone(store), true);
});

test("storage that is missing or throws reads as not done and never throws", () => {
  const broken = {
    getItem: () => {
      throw new Error("SecurityError");
    },
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
  };
  assert.equal(hintDone(broken), false);
  assert.doesNotThrow(() => markHintDone(broken));
  assert.equal(hintDone(null), false);
  assert.doesNotThrow(() => markHintDone(undefined));
});
