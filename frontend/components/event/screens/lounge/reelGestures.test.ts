import test from "node:test";
import assert from "node:assert/strict";
import {
  DOUBLE_TAP_MS,
  REEL_DISTANCE_RATIO,
  REEL_VELOCITY,
  classifyTaps,
  isTap,
  reelStep,
  releaseVelocity,
  rubberBand,
} from "./reelGestures.ts";

const VH = 800;
const both = { viewportHeight: VH, canPrev: true, canNext: true };

test("a slow release moves on only past 18% of the screen", () => {
  const edge = REEL_DISTANCE_RATIO * VH; // 144px
  assert.equal(reelStep({ ...both, dy: -(edge - 1), velocity: 0 }), 0);
  assert.equal(reelStep({ ...both, dy: -(edge + 1), velocity: 0 }), 1);
  assert.equal(reelStep({ ...both, dy: edge + 1, velocity: 0 }), -1);
  assert.equal(reelStep({ ...both, dy: edge - 1, velocity: 0.1 }), 0);
});

test("a fast flick moves on however short the drag", () => {
  assert.equal(reelStep({ ...both, dy: -20, velocity: -(REEL_VELOCITY + 0.01) }), 1);
  assert.equal(reelStep({ ...both, dy: 20, velocity: REEL_VELOCITY + 0.01 }), -1);
  assert.equal(reelStep({ ...both, dy: -20, velocity: -REEL_VELOCITY }), 0); // threshold is exclusive
});

test("a flick against the drag cancels instead of reversing", () => {
  assert.equal(reelStep({ ...both, dy: -300, velocity: 0.9 }), 0);
  assert.equal(reelStep({ ...both, dy: 300, velocity: -0.9 }), 0);
});

test("never steps past either end", () => {
  assert.equal(reelStep({ viewportHeight: VH, canPrev: true, canNext: false, dy: -400, velocity: -1 }), 0);
  assert.equal(reelStep({ viewportHeight: VH, canPrev: false, canNext: true, dy: 400, velocity: 1 }), 0);
  assert.equal(reelStep({ viewportHeight: VH, canPrev: false, canNext: true, dy: -400, velocity: 0 }), 1);
});

test("the slide follows the finger freely where there is somewhere to go", () => {
  assert.equal(rubberBand(-250, VH, true, true), -250);
  assert.equal(rubberBand(250, VH, true, false), 250);
});

test("past an end the slide resists, grows with the drag, and never reaches a screen", () => {
  const a = rubberBand(-100, VH, true, false);
  const b = rubberBand(-300, VH, true, false);
  const c = rubberBand(-5000, VH, true, false);
  assert.ok(a < 0 && Math.abs(a) < 100);
  assert.ok(Math.abs(b) > Math.abs(a) && Math.abs(b) < 300);
  assert.ok(Math.abs(c) < VH);
  // Enough of a pull to show the "That's every photo" note under the last slide.
  assert.ok(Math.abs(b) > 100);
  assert.ok(rubberBand(300, VH, false, true) > 0);
  assert.equal(rubberBand(0, VH, false, false), 0);
});

test("velocity is measured over the last 80ms only", () => {
  // Slow for a long time, then fast at the end: the end is what counts.
  const samples = [
    { t: 0, y: 0 },
    { t: 200, y: -20 },
    { t: 400, y: -40 },
    { t: 440, y: -80 },
    { t: 480, y: -120 },
  ];
  assert.equal(releaseVelocity(samples), -1);
  // A drag that stopped before release reads as stopped.
  assert.equal(releaseVelocity([{ t: 0, y: 0 }, { t: 100, y: -200 }, { t: 300, y: -200 }]), 0);
  assert.equal(releaseVelocity([{ t: 5, y: 9 }]), 0);
  assert.equal(releaseVelocity([]), 0);
});

test("a tap is short and still", () => {
  const down = { t: 0, x: 100, y: 100 };
  assert.equal(isTap(down, { t: 120, x: 104, y: 103 }), true);
  assert.equal(isTap(down, { t: 120, x: 100, y: 130 }), false); // moved: a drag
  assert.equal(isTap(down, { t: 600, x: 100, y: 100 }), false); // held
});

test("two quick taps close together are a double", () => {
  const first = { t: 1000, x: 200, y: 400 };
  assert.equal(classifyTaps(first, { t: 1000 + DOUBLE_TAP_MS - 10, x: 210, y: 395 }, 1240), "double");
  // Too slow, or too far apart, is not.
  assert.notEqual(classifyTaps(first, { t: 1000 + DOUBLE_TAP_MS + 30, x: 200, y: 400 }, 1280), "double");
  assert.notEqual(classifyTaps(first, { t: 1100, x: 320, y: 400 }, 1100), "double");
});

test("a lone tap becomes a single only once the double-tap window has passed", () => {
  const tap = { t: 5000, x: 50, y: 50 };
  assert.equal(classifyTaps(null, tap, 5000), "none");
  assert.equal(classifyTaps(null, tap, 5000 + DOUBLE_TAP_MS - 1), "none");
  assert.equal(classifyTaps(null, tap, 5000 + DOUBLE_TAP_MS), "single");
  assert.equal(classifyTaps(null, null, 9999), "none");
});
