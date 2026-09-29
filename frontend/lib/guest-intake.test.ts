import { test } from "node:test";
import assert from "node:assert/strict";
import { intakeNeeds } from "./guest-intake.ts";

/**
 * One rule for both places the intake sheet rises (over the selfie step, and
 * over the Lounge), so a Guest can never be asked in one and skipped in the
 * other.
 */

test("a new WhatsApp Guest is asked their name; a Google Guest is not", () => {
  assert.deepEqual(intakeNeeds({ name: "Guest", guest_sub_type: null }, []), {
    needsName: true,
    needsTeam: false,
    show: true,
  });
  assert.equal(intakeNeeds({ name: undefined, guest_sub_type: null }, []).needsName, true);
  assert.deepEqual(intakeNeeds({ name: "Priya Sharma", guest_sub_type: null }, []), {
    needsName: false,
    needsTeam: false,
    show: false,
  });
});

test("the team is asked only at an event split into teams, and only once", () => {
  const teams = ["Bride's side", "Groom's side"];
  assert.equal(intakeNeeds({ name: "Priya Sharma", guest_sub_type: null }, teams).needsTeam, true);
  assert.equal(intakeNeeds({ name: "Priya Sharma", guest_sub_type: null }, teams).show, true);
  assert.equal(intakeNeeds({ name: "Priya Sharma", guest_sub_type: "Bride's side" }, teams).show, false);
});
