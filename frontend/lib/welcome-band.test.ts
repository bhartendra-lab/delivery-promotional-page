import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveWelcomeBand, type WelcomeBandInput } from "./welcome-band.ts";

/** A Guest of a face-search event who has scanned and been matched. Every test
 *  overrides only the fields its row of the copy table is actually about. */
const band = (over: Partial<WelcomeBandInput> = {}) =>
  resolveWelcomeBand({
    faceSearchOn: true,
    hasSelfie: true,
    matchCount: 12,
    unlocked: false,
    hasPublicPhotos: true,
    accessibleCount: 400,
    guestName: "Priya",
    ...over,
  });

/** The whole line as a Guest reads it, highlight included. */
const line = (over: Partial<WelcomeBandInput> = {}) => {
  const b = band(over);
  return `${b.lead}${b.highlight}${b.trail}`;
};

/* ── Face search on ──────────────────────────────────────────────────────── */

test("a search still running says so, and never reports a count it lacks", () => {
  // The bug this row exists for: `mediaIds?.length ?? 0` made a returning Guest
  // read "No matches yet" for the second before their real count arrived.
  assert.equal(line({ matchCount: null }), "Welcome back, Priya. Finding your photos…");
  assert.equal(band({ matchCount: null }).action, "mine");
  assert.doesNotMatch(line({ matchCount: null }), /No matches/);
  assert.doesNotMatch(line({ matchCount: null }), /\d/);
});

test("a matched Guest gets their count, in the highlight", () => {
  const b = band({ matchCount: 12 });
  assert.equal(b.lead, "Welcome back, Priya. You’re in ");
  assert.equal(b.highlight, "12 photos");
  assert.equal(b.action, "mine");
});

test("one match is singular", () => {
  assert.equal(band({ matchCount: 1 }).highlight, "1 photo");
});

test("a large count is grouped en-IN", () => {
  assert.equal(band({ matchCount: 120000 }).highlight, "1,20,000 photos");
});

test("zero matches drops the 'back' and states it plainly", () => {
  assert.equal(line({ matchCount: 0 }), "Welcome, Priya. No matches yet");
  assert.equal(band({ matchCount: 0 }).action, "mine");
});

test("no selfie invites the scan, whatever the match count says", () => {
  // A Guest who skipped has a resolved (empty) match set, so the zero-match row
  // would otherwise claim their selfie found nothing. The selfie is checked
  // first for exactly this reason.
  for (const matchCount of [null, 0]) {
    const b = band({ hasSelfie: false, matchCount });
    assert.equal(b.lead, "Welcome, Priya. ");
    assert.equal(b.highlight, "Find the photos you’re in");
    assert.equal(b.action, "scan");
  }
});

/* ── Face search off ─────────────────────────────────────────────────────── */

const off = (over: Partial<WelcomeBandInput> = {}) => band({ faceSearchOn: false, ...over });
const offLine = (over: Partial<WelcomeBandInput> = {}) => line({ faceSearchOn: false, ...over });

test("full access browses everything, with the count once it is known", () => {
  const b = off({ unlocked: true, accessibleCount: 1204 });
  assert.equal(b.lead, "Welcome, Priya. Browse all ");
  assert.equal(b.highlight, "1,204 photos");
  assert.equal(b.action, "all");
});

test("full access with no count yet says 'all photos', never 'all 0 photos'", () => {
  assert.equal(offLine({ unlocked: true, accessibleCount: null }), "Welcome, Priya. Browse all photos");
  assert.doesNotMatch(offLine({ unlocked: true, accessibleCount: null }), /\d/);
});

test("no full access but public photos points at the highlights", () => {
  const b = off({ unlocked: false, hasPublicPhotos: true });
  assert.equal(b.lead, "Welcome, Priya. Browse the ");
  assert.equal(b.highlight, "highlights");
  assert.equal(b.action, "all");
});

test("no full access and nothing public points at the passcode", () => {
  const b = off({ unlocked: false, hasPublicPhotos: false });
  assert.equal(offLine({ unlocked: false, hasPublicPhotos: false }), "Welcome, Priya. Enter the passcode to see the photos");
  assert.equal(b.highlight, "Enter the passcode");
  assert.equal(b.action, "passcode");
});

test("off never mentions selfies, matches or My Photos, in any state", () => {
  // The switch is off: a Guest must not be told about a feature this gallery
  // does not have. Covers every combination of access and public photos.
  for (const unlocked of [true, false]) {
    for (const hasPublicPhotos of [true, false]) {
      for (const hasSelfie of [true, false]) {
        const text = offLine({ unlocked, hasPublicPhotos, hasSelfie });
        assert.doesNotMatch(text, /selfie|match|scan|face/i, text);
      }
    }
  }
});

test("off ignores a match count left over from before the switch", () => {
  // A Guest who scanned while it was on still has a matched set in memory.
  assert.equal(offLine({ unlocked: true, accessibleCount: 900, matchCount: 40 }), "Welcome, Priya. Browse all 900 photos");
});

/* ── The name ────────────────────────────────────────────────────────────── */

test("a Guest with no name is greeted without one, never as 'Guest'", () => {
  for (const guestName of [undefined, "", "   "]) {
    assert.equal(line({ guestName, matchCount: null }), "Welcome back. Finding your photos…");
    assert.equal(line({ guestName, matchCount: 0 }), "Welcome. No matches yet");
    assert.equal(line({ guestName, hasSelfie: false }), "Welcome. Find the photos you’re in");
    assert.equal(
      offLine({ guestName, unlocked: false, hasPublicPhotos: true }),
      "Welcome. Browse the highlights",
    );
    assert.doesNotMatch(line({ guestName, matchCount: 3 }), /Guest/);
  }
});

test("every state returns one of the four actions, and a non-empty line", () => {
  const actions = new Set<string>();
  for (const faceSearchOn of [true, false]) {
    for (const hasSelfie of [true, false]) {
      for (const matchCount of [null, 0, 5]) {
        for (const unlocked of [true, false]) {
          for (const hasPublicPhotos of [true, false]) {
            const b = band({ faceSearchOn, hasSelfie, matchCount, unlocked, hasPublicPhotos });
            assert.ok(["mine", "all", "scan", "passcode"].includes(b.action));
            assert.ok(`${b.lead}${b.highlight}${b.trail}`.trim().length > 0);
            actions.add(b.action);
          }
        }
      }
    }
  }
  // Every action is reachable — a dead branch here would be a state no Guest
  // could ever act on.
  assert.deepEqual([...actions].sort(), ["all", "mine", "passcode", "scan"]);
});

test("no line uses an em dash or an en dash", () => {
  // House copy rule. The covers used to read "Welcome back, X — you're in N".
  for (const faceSearchOn of [true, false]) {
    for (const hasSelfie of [true, false]) {
      for (const matchCount of [null, 0, 5]) {
        for (const unlocked of [true, false]) {
          for (const hasPublicPhotos of [true, false]) {
            const text = line({ faceSearchOn, hasSelfie, matchCount, unlocked, hasPublicPhotos });
            assert.doesNotMatch(text, /[—–]/, text);
          }
        }
      }
    }
  }
});
