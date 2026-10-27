import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHROME_SPACE,
  COLLAPSE_AFTER,
  COLLAPSE_LOCK_MS,
  INITIAL_MACHINE,
  stepCollapse,
  type ScrollMachine,
} from "./collapseOnScroll.ts";

const MAX = 5000;

/** Feed scroll positions in order, 16ms apart, starting after any lock. */
function run(tops: number[], start: { machine?: ScrollMachine; collapsed?: boolean; max?: number; t0?: number } = {}) {
  let machine = start.machine ?? INITIAL_MACHINE;
  let collapsed = start.collapsed ?? false;
  let now = start.t0 ?? 10_000;
  const seen: boolean[] = [];
  for (const top of tops) {
    now += 16;
    ({ machine, collapsed } = stepCollapse(machine, collapsed, { top, max: start.max ?? MAX, now }));
    seen.push(collapsed);
  }
  return { machine, collapsed, seen, now };
}

test("folds after a short run down, past the top band", () => {
  assert.equal(run([0, 20, 40, 60]).collapsed, false, "still within the first view");
  assert.equal(run([0, 40, 80, 100]).collapsed, true);
});

test("a few pixels of jitter do not fold it", () => {
  assert.equal(run([204, 200, 205, 201, 206], { machine: { lastTop: 200, travel: 0, lockUntil: 0 } }).collapsed, false);
});

test("the first scroll up unfolds it", () => {
  const down = run([0, 100, 300, 600]);
  assert.equal(down.collapsed, true);
  const up = run([600, 596], { machine: { ...down.machine, lockUntil: 0 }, collapsed: true });
  assert.equal(up.collapsed, false);
});

test("near the top it is always open", () => {
  const r = run([10], { machine: { lastTop: 10, travel: 0, lockUntil: 0 }, collapsed: true });
  assert.equal(r.collapsed, false);
});

test("the position pulled back after folding is ignored while the fold settles", () => {
  const down = run([0, 100, 300, 600]);
  assert.equal(down.collapsed, true);
  // The scroller grew: the browser clamps the position 150px up, inside the lock.
  const r = stepCollapse(down.machine, true, { top: 450, max: 450, now: down.now + 50 });
  assert.equal(r.collapsed, true);
  // After the lock, a still scroller stays folded.
  const later = stepCollapse(r.machine, true, { top: 450, max: 450, now: down.now + COLLAPSE_LOCK_MS + 20 });
  assert.equal(later.collapsed, true);
});

test("the rubber-band past the bottom does not unfold it", () => {
  const atBottom: ScrollMachine = { lastTop: MAX, travel: 0, lockUntil: 0 };
  const r = run([MAX + 40, MAX + 20, MAX], { machine: atBottom, collapsed: true });
  assert.deepEqual(r.seen, [true, true, true]);
});

test("a gallery that cannot scroll far never folds", () => {
  const short = 2 * CHROME_SPACE - 1;
  assert.equal(run([0, 100, 200, 300], { max: short }).collapsed, false);
  assert.equal(run([0, COLLAPSE_AFTER + 20, 200, 300], { max: 2 * CHROME_SPACE }).collapsed, true);
});

test("with a start point, nothing folds above it and the rules count from it", () => {
  const start = 900;
  const over = run([0, 200, 400, 600, 800, 900 + COLLAPSE_AFTER], { max: MAX });
  assert.equal(over.collapsed, true, "without a start, the cover itself would fold it");
  let machine = INITIAL_MACHINE;
  let collapsed = false;
  let now = 10_000;
  for (const top of [0, 200, 400, 600, 800, start + COLLAPSE_AFTER]) {
    now += 16;
    ({ machine, collapsed } = stepCollapse(machine, collapsed, { top, max: MAX, now, start }));
  }
  assert.equal(collapsed, false, "the cover and the first band of the grid never fold it");
  now += 16;
  ({ machine, collapsed } = stepCollapse(machine, collapsed, { top: start + COLLAPSE_AFTER + 40, max: MAX, now, start }));
  assert.equal(collapsed, true);
  // Back up into the grid's first band: open again.
  now += COLLAPSE_LOCK_MS + 16;
  ({ collapsed } = stepCollapse(machine, collapsed, { top: start + 10, max: MAX, now, start }));
  assert.equal(collapsed, false);
});

test("the room to scroll is counted from the start point too", () => {
  const start = 900;
  let machine = INITIAL_MACHINE;
  let collapsed = false;
  let now = 10_000;
  for (const top of [start, start + 100, start + 200, start + 300]) {
    now += 16;
    ({ machine, collapsed } = stepCollapse(machine, collapsed, { top, max: start + 2 * CHROME_SPACE - 1, now, start }));
  }
  assert.equal(collapsed, false);
});
