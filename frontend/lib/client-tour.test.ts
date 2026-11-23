import { test } from "node:test";
import assert from "node:assert/strict";
import { SKIP_HINT, TOURS, TOUR_ORDER, nextTourToStart, stepCopy, stepInteractive, stepTargets, tourLang, type TourTarget } from "./client-tour.ts";

test("every step has English and Hindi words", () => {
  for (const id of TOUR_ORDER) {
    for (const step of TOURS[id]) {
      for (const lang of ["en", "hi"] as const) {
        assert.ok(step.copy[lang].title.trim(), `${id}/${step.key} ${lang} title`);
        assert.ok(step.copy[lang].body.trim(), `${id}/${step.key} ${lang} body`);
      }
    }
  }
  assert.ok(SKIP_HINT.copy.hi.body);
});

test("step keys are unique within a part", () => {
  for (const id of TOUR_ORDER) {
    const keys = TOURS[id].map((s) => s.key);
    assert.equal(new Set(keys).size, keys.length, id);
  }
});

test("tourLang: Hindi only when asked", () => {
  assert.equal(tourLang("hi"), "hi");
  assert.equal(tourLang("en"), "en");
  assert.equal(tourLang(null), "en");
  assert.equal(tourLang("fr"), "en");
});

test("stepCopy fills the studio and falls back to Next", () => {
  const send = TOURS.selection.find((s) => s.key === "send")!;
  assert.match(stepCopy(send, "en", "Sharma Films").title, /Sharma Films/);
  assert.doesNotMatch(stepCopy(send, "hi", "Sharma Films").body, /\{studio\}/);
  const tap = TOURS["guest-control"].find((s) => s.key === "open-profile")!;
  assert.equal(stepCopy(tap, "hi", "x").cta, "आगे");
});

test("the send step is told, never pressed", () => {
  const send = TOURS.selection.find((s) => s.key === "send")!;
  assert.equal(send.advance, "next");
  assert.equal(stepInteractive(send), false);
  assert.deepEqual(stepTargets(send), ["review-send"]);
});

test("nextTourToStart: guest control first, then faces, then selection", () => {
  const on = (...ids: TourTarget[]) => (t: TourTarget) => ids.includes(t);
  assert.equal(nextTourToStart({ seen: {}, onScreen: on("profile", "face-bar"), faceBarMissingMs: 0 }), "guest-control");
  assert.equal(nextTourToStart({ seen: {}, onScreen: on("face-bar"), faceBarMissingMs: 0 }), null);
  const gc = { "guest-control": true };
  assert.equal(nextTourToStart({ seen: gc, onScreen: on("profile"), faceBarMissingMs: 0 }), null);
  assert.equal(nextTourToStart({ seen: gc, onScreen: on("face-bar", "photo-menu"), faceBarMissingMs: 0 }), "face-filter");
  // No face bar yet: selection waits a moment for one to appear.
  assert.equal(nextTourToStart({ seen: gc, onScreen: on("photo-menu"), faceBarMissingMs: 1000 }), null);
  assert.equal(nextTourToStart({ seen: gc, onScreen: on("photo-menu"), faceBarMissingMs: 4000 }), "selection");
  const all = { "guest-control": true, "face-filter": true, selection: true };
  assert.equal(nextTourToStart({ seen: all, onScreen: () => true, faceBarMissingMs: 9999 }), null);
});
