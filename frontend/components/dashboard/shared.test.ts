import { test } from "node:test";
import assert from "node:assert/strict";
import { getExpiryWarning } from "./shared.ts";

const DAY = 24 * 60 * 60 * 1000;

test("a pay per event event with nothing uploaded shows a neutral 'not started' strip, never a countdown", () => {
  const warning = getExpiryWarning({
    service_type: "Event-based",
    gallery_publish_status: "published",
    createdAt: new Date(Date.now() - 100 * DAY).toISOString(),
    validity_ends_at: null,
    validity_pending: true,
    validity_starts_by: Date.now() + 80 * DAY,
    validity_window_days: 90,
  });
  assert.equal(warning?.tone, "info");
  assert.equal(warning?.label, "Validity starts on first upload");
  assert.match(warning?.detail ?? "", /90 days start the day you upload/);
});

test("once started, the countdown is unchanged", () => {
  const warning = getExpiryWarning({
    service_type: "Event-based",
    gallery_publish_status: "published",
    validity_ends_at: Date.now() + 10 * DAY,
    validity_pending: false,
  });
  assert.equal(warning?.tone, undefined);
  assert.match(warning?.label ?? "", /^Expires in \d+ days$/);
});
