import { test } from "node:test";
import assert from "node:assert/strict";
import { deletionDoneMessage, deletionScopeForRole, purgeDateLabel, STUDIO_DELETION_COPY, STUDIO_DELETION_TITLE } from "./studio-account-deletion.ts";

test("scope follows the server's rule: admin deletes the studio, anyone else themselves", () => {
  assert.equal(deletionScopeForRole("admin"), "studio");
  for (const r of ["manager", "employee", "freelancer", undefined, null]) assert.equal(deletionScopeForRole(r), "user");
  assert.equal(STUDIO_DELETION_TITLE.studio, "Delete studio account");
  assert.equal(STUDIO_DELETION_TITLE.user, "Delete my account");
});

test("the purge date reads in IST, and the done message carries it", () => {
  // 18:45 UTC on 11 Dec is already 12 Dec in India.
  assert.equal(purgeDateLabel(Date.UTC(2026, 11, 11, 18, 45)), "12 Dec 2026");
  assert.deepEqual(deletionDoneMessage("studio", Date.UTC(2026, 11, 11, 18, 45)), {
    title: "Your studio account is being deleted.",
    body: "Everything listed is deleted on 12 Dec 2026. To change your mind before then, contact support.",
  });
  assert.match(deletionDoneMessage("user", null).body, /after 30 days/);
});

test("every scope says what is deleted, what is kept and how long", () => {
  for (const scope of ["studio", "user"] as const) {
    const c = STUDIO_DELETION_COPY[scope];
    assert.ok(c.deletes && c.keeps && c.howLong);
    assert.match(c.howLong, /30 days/);
  }
});
