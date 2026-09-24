import test from "node:test";
import assert from "node:assert/strict";
import {
  FRIEND_FINDER_POLICY_VERSION,
  FRIENDS_CHOICES,
  FRIENDS_SHEET_COPY,
} from "./copy.ts";

/**
 * The exact string the backend stores as the `ff-v1.0` notice
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
const BACKEND_NOTICE_FF_V1_0 =
  "Find your friends group. See the photos you are in with your friends, all in one place. " +
  "You and a friend see your photos together once you have both said yes. " +
  "Everyone at this wedding: anyone here can add you straight away. " +
  "Only people I choose: you pick who, and they are asked to add you back. " +
  "Your name and face picture are visible to guests at this wedding. " +
  "You can change this anytime.";

const lowerFirst = (value: string) => value.charAt(0).toLowerCase() + value.slice(1);

/** The sheet's copy, read back in the order a guest reads it on screen. */
function assembledNotice(): string {
  const options = FRIENDS_CHOICES.map((c) => `${c.label}: ${lowerFirst(c.subtitle)}.`).join(" ");
  return `${FRIENDS_SHEET_COPY.title}. ${FRIENDS_SHEET_COPY.body} ${options} ${FRIENDS_SHEET_COPY.smallPrint}`;
}

test("the friends sheet shows exactly the notice the backend records as ff-v1.0", () => {
  assert.equal(FRIEND_FINDER_POLICY_VERSION, "ff-v1.0");
  assert.equal(assembledNotice(), BACKEND_NOTICE_FF_V1_0);
});

test("no em dash or en dash anywhere in the consent copy", () => {
  // The backend's notice has none, so one here would make the two texts differ
  // in a way that is invisible on screen and obvious in a diff.
  const all = [
    FRIENDS_SHEET_COPY.title,
    FRIENDS_SHEET_COPY.body,
    FRIENDS_SHEET_COPY.smallPrint,
    FRIENDS_SHEET_COPY.nameLabel,
    FRIENDS_SHEET_COPY.continueLabel,
    FRIENDS_SHEET_COPY.declineLabel,
    ...FRIENDS_CHOICES.flatMap((c) => [c.label, c.subtitle]),
  ];
  for (const line of all) {
    assert.ok(!line.includes("—") && !line.includes("–"), line);
  }
});

test("neither option is written as a default, so neither can be pre-selected by copy", () => {
  // The choice is never pre-selected; this pins that nothing in the copy
  // nudges one of them as recommended.
  for (const choice of FRIENDS_CHOICES) {
    assert.ok(!/recommend|default|suggested/i.test(`${choice.label} ${choice.subtitle}`));
  }
});
