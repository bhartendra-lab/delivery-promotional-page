import test from "node:test";
import assert from "node:assert/strict";
import {
  FRIEND_FINDER_POLICY_VERSION,
  FRIENDS_CHOICES,
  FRIENDS_SHEET_COPY,
} from "./copy.ts";

/**
 * The exact string the backend stores as the `ff-v1.1` notice
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
const BACKEND_NOTICE_FF_V1_1 =
  "Find my people. See the photos you are in with your people, all in one place. " +
  "You and another guest see your photos together once you have both said yes. " +
  "Everyone at this wedding: anyone here can add you straight away. " +
  "Only people I choose: you pick who, and they are asked to add you back. " +
  "Your name and face picture are visible to guests at this wedding. " +
  "You can change your answer at any time, and to stop sharing altogether, " +
  "choose Only people I choose and remove everyone from your list.";

const lowerFirst = (value: string) => value.charAt(0).toLowerCase() + value.slice(1);

/** The sheet's copy, read back in the order a guest reads it on screen. */
function assembledNotice(): string {
  const options = FRIENDS_CHOICES.map((c) => `${c.label}: ${lowerFirst(c.subtitle)}.`).join(" ");
  return `${FRIENDS_SHEET_COPY.title}. ${FRIENDS_SHEET_COPY.body} ${options} ${FRIENDS_SHEET_COPY.smallPrint}`;
}

test("the consent sheet shows exactly the notice the backend records as ff-v1.1", () => {
  assert.equal(FRIEND_FINDER_POLICY_VERSION, "ff-v1.1");
  assert.equal(assembledNotice(), BACKEND_NOTICE_FF_V1_1);
});

test("no em dash or en dash anywhere in the consent copy", () => {
  // The backend's notice has none, so one here would make the two texts differ
  // in a way that is invisible on screen and obvious in a diff.
  const all = [
    FRIENDS_SHEET_COPY.title,
    FRIENDS_SHEET_COPY.body,
    FRIENDS_SHEET_COPY.smallPrint,
    FRIENDS_SHEET_COPY.continueLabel,
    ...FRIENDS_CHOICES.flatMap((c) => [c.label, c.subtitle]),
  ];
  for (const line of all) {
    assert.ok(!line.includes("—") && !line.includes("–"), line);
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

test("the notice names the way to stop, because it is the only one there is", () => {
  // With no "Stop sharing" button, a guest who cannot infer the two-step path
  // has no way out at all — so the notice they consent under has to say it.
  assert.match(FRIENDS_SHEET_COPY.smallPrint, /stop sharing altogether/i);
  assert.match(FRIENDS_SHEET_COPY.smallPrint, /remove everyone from your list/i);
});

test("neither option is written as a default, so neither can be pre-selected by copy", () => {
  // The choice is never pre-selected; this pins that nothing in the copy
  // nudges one of them as recommended.
  for (const choice of FRIENDS_CHOICES) {
    assert.ok(!/recommend|default|suggested/i.test(`${choice.label} ${choice.subtitle}`));
  }
});
