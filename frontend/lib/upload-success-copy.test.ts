import { test } from "node:test";
import assert from "node:assert/strict";
import { NOTIFY_FIRST_LINE, NOTIFY_LATER_LINE, reachableLine, uploadSuccessHeadline } from "./upload-success-copy.ts";

test("the headline counts photos in Indian grouping, singular and plural", () => {
  assert.equal(uploadSuccessHeadline(1), "1 photo uploaded");
  assert.equal(uploadSuccessHeadline(1250), "1,250 photos uploaded");
  assert.equal(uploadSuccessHeadline(125000), "1,25,000 photos uploaded");
});

test("the notification lines state the real schedule and never claim a message was sent", () => {
  assert.match(NOTIFY_FIRST_LINE, /finish processing/);
  assert.match(NOTIFY_FIRST_LINE, /one message/);
  assert.match(NOTIFY_LATER_LINE, /at most once a day/);
  assert.match(NOTIFY_LATER_LINE, /9 AM, 3 PM or 9 PM India time/);
  for (const line of [NOTIFY_FIRST_LINE, NOTIFY_LATER_LINE]) {
    assert.doesNotMatch(line, /\b(was|were|has been|have been|already) sent\b|\bwe sent\b|\bsent to\b/i);
    assert.doesNotMatch(line, /[–—]/);
  }
});

test("only people with a phone or an email count, Clients are named, and an unknown list says nothing", () => {
  assert.equal(reachableLine(null), null);
  assert.match(reachableLine([])!, /No guests or Clients have signed in/);
  assert.match(reachableLine([{ email: null, phone: null }])!, /No guests or Clients have signed in/);
  assert.equal(reachableLine([{ phone: "9198" }, { email: "a@b.in" }, { email: null, phone: null }])!, "2 people can be messaged right now.");
  assert.equal(reachableLine([{ phone: "9198", is_client: true }, { email: "a@b.in" }])!, "2 people can be messaged right now, 1 of them a Client.");
  assert.equal(reachableLine([{ phone: "1", is_client: true }, { phone: "2", is_client: true }])!, "2 people can be messaged right now, 2 of them Clients.");
  assert.equal(reachableLine([{ phone: "1" }])!, "1 person can be messaged right now.");
  assert.doesNotMatch(reachableLine([{ phone: "1" }])!, /[–—]/);
});
