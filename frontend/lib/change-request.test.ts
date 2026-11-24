import { test } from "node:test";
import assert from "node:assert/strict";
import { decisionLine, lastDecidedOf, pendingRequestOf, requestChip, requestFormError } from "./change-request.ts";
import type { ChangeRequest } from "./api";

const req = (over: Partial<ChangeRequest>): ChangeRequest => ({
  _id: "r",
  booking_id: "b",
  type: "event_name",
  current_value: "Old",
  requested_value: "New",
  reason: "",
  status: "pending",
  note: null,
  decided_at: null,
  createdAt: "2026-11-25T10:00:00Z",
  ...over,
});

test("an open request of a type turns the button into 'Change requested', other types still ask", () => {
  const list = [req({ type: "event_name" })];
  assert.equal(pendingRequestOf(list, "event_name")?._id, "r");
  assert.equal(pendingRequestOf(list, "cover_photo"), null);
  assert.deepEqual(requestChip(list, "cover_photo"), { kind: "ask" });
  const waiting = requestChip(list, "event_name");
  assert.equal(waiting.kind, "waiting");
  assert.equal(waiting.kind === "waiting" && waiting.label, "Change requested");
});

test("a decided request no longer blocks asking again", () => {
  assert.deepEqual(requestChip([req({ status: "approved" }), req({ _id: "q", status: "rejected" })], "event_name"), { kind: "ask" });
});

test("the decision line tells the outcome and the team's note, only once nothing is waiting", () => {
  assert.equal(decisionLine([], "event_name"), null);
  assert.equal(decisionLine([req({ status: "approved", decided_at: "2026-11-26T00:00:00Z" })], "event_name"), "Your event name change was approved.");
  assert.equal(
    decisionLine([req({ type: "cover_photo", status: "rejected", note: "Please use a sharper photo", decided_at: "2026-11-26T00:00:00Z" })], "cover_photo"),
    "Your cover photo change was not approved. Please use a sharper photo",
  );
  assert.equal(decisionLine([req({ status: "pending" })], "event_name"), null);
  // The latest decision wins.
  const older = req({ _id: "1", status: "rejected", decided_at: "2026-11-20T00:00:00Z" });
  const newer = req({ _id: "2", status: "approved", decided_at: "2026-11-25T00:00:00Z" });
  assert.equal(lastDecidedOf([older, newer], "event_name")?._id, "2");
});

test("no copy claims a change happened before it is decided, and none uses a dash", () => {
  const waiting = requestChip([req({})], "event_name");
  assert.ok(waiting.kind === "waiting");
  if (waiting.kind === "waiting") {
    assert.doesNotMatch(waiting.title, /approved|changed to/i);
    assert.doesNotMatch(waiting.title + waiting.label, /[–—]/);
  }
});

test("the form refuses nothing chosen, an empty or unchanged name, and a missing cover", () => {
  assert.match(requestFormError({ type: null, name: "", coverChosen: false, currentName: "A" })!, /Choose what/);
  assert.match(requestFormError({ type: "event_name", name: "  ", coverChosen: false, currentName: "A" })!, /Enter the new event name/);
  assert.match(requestFormError({ type: "event_name", name: " A  ", coverChosen: false, currentName: "A" })!, /already the event name/);
  assert.equal(requestFormError({ type: "event_name", name: "B", coverChosen: false, currentName: "A" }), null);
  assert.match(requestFormError({ type: "cover_photo", name: "", coverChosen: false, currentName: "A" })!, /Choose a cover photo/);
  assert.equal(requestFormError({ type: "cover_photo", name: "", coverChosen: true, currentName: "A" }), null);
});
