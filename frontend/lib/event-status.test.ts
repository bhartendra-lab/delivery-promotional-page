import { test } from "node:test";
import assert from "node:assert/strict";
import { eventDisplayStatus, EVENT_STATUS_DOT, EVENT_STATUS_LABEL, filterOf, isLiveEvent } from "./event-status.ts";

test("a published event is live, and deactivated once the studio switches it off", () => {
  assert.equal(eventDisplayStatus({ gallery_publish_status: "published", is_active: true }), "live");
  assert.equal(eventDisplayStatus({ gallery_publish_status: "published", is_active: false }), "deactivated");
});

test("an event with no is_active, or no status, is live (older events)", () => {
  assert.equal(eventDisplayStatus({ gallery_publish_status: "published" }), "live");
  assert.equal(eventDisplayStatus({ gallery_publish_status: "published", is_active: null }), "live");
  assert.equal(eventDisplayStatus({}), "live");
});

test("archived and expired win over the switch: an archived event that was deactivated is archived", () => {
  assert.equal(eventDisplayStatus({ gallery_publish_status: "archived", is_active: false }), "archived");
  assert.equal(eventDisplayStatus({ gallery_publish_status: "expired", is_active: false }), "expired");
  assert.equal(eventDisplayStatus({ gallery_publish_status: "archived", is_active: true }), "archived");
});

test("an unpublished event is a draft, never live or deactivated", () => {
  assert.equal(eventDisplayStatus({ gallery_publish_status: "unpublished", is_active: false }), "draft");
  assert.equal(eventDisplayStatus({ gallery_publish_status: "unpublished" }), "draft");
});

test("only a live event counts as live", () => {
  assert.equal(isLiveEvent({ gallery_publish_status: "published", is_active: true }), true);
  for (const row of [
    { gallery_publish_status: "published", is_active: false },
    { gallery_publish_status: "archived" },
    { gallery_publish_status: "expired" },
    { gallery_publish_status: "unpublished" },
  ]) assert.equal(isLiveEvent(row), false);
});

test("the four filters: live is active, deactivated is deactivated, archived and expired are archived", () => {
  assert.equal(filterOf({ gallery_publish_status: "published" }), "active");
  assert.equal(filterOf({ gallery_publish_status: "published", is_active: false }), "deactivated");
  assert.equal(filterOf({ gallery_publish_status: "archived" }), "archived");
  assert.equal(filterOf({ gallery_publish_status: "expired" }), "archived");
  assert.equal(filterOf({ gallery_publish_status: "unpublished" }), null);
});

test("the Deactivated pill is labelled Deactivated with a neutral grey dot, not the warning colour", () => {
  assert.equal(EVENT_STATUS_LABEL.deactivated, "Deactivated");
  assert.equal(EVENT_STATUS_DOT.deactivated, "var(--color-brand-muted)");
  assert.notEqual(EVENT_STATUS_DOT.deactivated, EVENT_STATUS_DOT.live);
  assert.notEqual(EVENT_STATUS_DOT.deactivated, "var(--color-brand-warning)");
});
