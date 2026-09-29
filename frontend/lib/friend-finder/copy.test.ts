import test from "node:test";
import assert from "node:assert/strict";
import {
  FRIEND_FINDER_POLICY_VERSION,
  FRIENDS_CHOICES,
  FRIENDS_SHEET_COPY,
} from "./copy.ts";

/**
 * The exact string the backend stores as the `ff-v1.2` notice
 * (`FRIEND_FINDER_NOTICE_TEXT` in src/utils/friend-finder.utils.js).
 *
 * Copied here on purpose rather than imported: the two live in different
 * repositories, and the whole point of a versioned consent record is that the
 * words a guest agreed to can be recovered later. This test is what makes an
 * edit on this side fail loudly instead of silently recording a guest's consent
 * against wording they were never shown.
 *
 * If the copy genuinely changes it is a NEW version in both places — bump
 * FRIEND_FINDER_POLICY_VERSION here and the backend's constant together, and
 * update this literal in the same commit.
 */
const BACKEND_NOTICE_FF_V1_2 =
  "Who can search common photos with you. Everyone at this wedding. Only people I choose. " +
  "Your name and face picture are visible to guests at this wedding. You can change this anytime.";

/** The sheet's copy, read back in the order a guest reads it on screen. */
function assembledNotice(): string {
  const options = FRIENDS_CHOICES.map((c) => `${c.label}.`).join(" ");
  return `${FRIENDS_SHEET_COPY.title}. ${options} ${FRIENDS_SHEET_COPY.smallPrint}`;
}

test("the consent sheet shows exactly the notice the backend records as ff-v1.2", () => {
  assert.equal(FRIEND_FINDER_POLICY_VERSION, "ff-v1.2");
  assert.equal(assembledNotice(), BACKEND_NOTICE_FF_V1_2);
});

test("no em dash or en dash anywhere in the consent copy", () => {
  // The backend's notice has none, so one here would make the two texts differ
  // in a way that is invisible on screen and obvious in a diff.
  const all = [
    FRIENDS_SHEET_COPY.title,
    FRIENDS_SHEET_COPY.smallPrint,
    FRIENDS_SHEET_COPY.continueLabel,
    ...FRIENDS_CHOICES.map((c) => c.label),
  ];
  for (const line of all) {
    assert.ok(!line.includes("\u2014") && !line.includes("\u2013"), line);
  }
});

test("there are exactly two choices, and no stored way to refuse", () => {
  // Dismissing the sheet records nothing at all. A third "no thanks" option
  // would write a refusal, which is both a worse record of what happened and a
  // state the settings sheet then has to keep expressing.
  assert.equal(FRIENDS_CHOICES.length, 2);
  assert.deepEqual(
    FRIENDS_CHOICES.map((c) => c.value),
    ["everyone", "selected"],
  );
});

test("the one line left carries both the disclosure and the withdrawal notice", () => {
  // The sheet is minimal, and these are the two things minimal cannot drop:
  // what other guests will see, and that the answer can be changed. With the
  // old "to stop sharing" line gone, the second is the only withdrawal notice.
  assert.match(FRIENDS_SHEET_COPY.smallPrint, /name and face picture are visible/i);
  assert.match(FRIENDS_SHEET_COPY.smallPrint, /change this anytime/i);
});

test("neither option is written as a default, so neither can be pre-selected by copy", () => {
  // The choice is never pre-selected; this pins that nothing in the copy
  // nudges one of them as recommended.
  for (const choice of FRIENDS_CHOICES) {
    assert.ok(!/recommend|default|suggested/i.test(choice.label));
  }
});
