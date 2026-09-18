import { test } from "node:test";
import assert from "node:assert/strict";
import { autoRenews, planPeriodLine, subscriptionBannerContent } from "./subscription-status.ts";
import type { SubscriptionSnapshot } from "./billing-types.ts";

// Midday UTC, so the formatted calendar day is the same in any timezone a test
// might run in.
const NOW = Date.UTC(2026, 8, 17, 12);
const DAY = 24 * 60 * 60 * 1000;
const END = Date.UTC(2026, 10, 7, 12); // 7 Nov 2026
const GRACE = Date.UTC(2026, 10, 14, 12); // 14 Nov 2026

function snapshot(overrides: Partial<SubscriptionSnapshot> = {}): SubscriptionSnapshot {
  return {
    status: "active",
    service: { _id: "svc", name: null, service_type: "Monthly", billing_interval: "monthly" },
    current_period_start: NOW - 10 * DAY,
    current_period_end: END,
    cancel_at_period_end: false,
    auto_renews: true,
    grace_until: null,
    suspend_at: null,
    delete_at: null,
    storage: { limit: 150, used: 10, remaining: 140 },
    ...overrides,
  } as SubscriptionSnapshot;
}

const withoutAutoRenewsField = (s: SubscriptionSnapshot) => {
  const copy = { ...s };
  delete copy.auto_renews;
  return copy;
};

/* ── autoRenews ───────────────────────────────────────────────────────────── */

test("autoRenews: follows the API's flag", () => {
  assert.equal(autoRenews(snapshot({ auto_renews: true })), true);
  assert.equal(autoRenews(snapshot({ auto_renews: false })), false);
});

test("autoRenews: an older API response without the flag keeps the old assumption", () => {
  assert.equal(autoRenews(withoutAutoRenewsField(snapshot())), true);
});

test("autoRenews: no snapshot doesn't renew", () => {
  assert.equal(autoRenews(null), false);
  assert.equal(autoRenews(undefined), false);
});

/* ── planPeriodLine ───────────────────────────────────────────────────────── */

test("planPeriodLine: a plan with a mandate renews", () => {
  assert.equal(planPeriodLine(snapshot(), NOW), "Renews on 7 Nov 2026");
});

test("planPeriodLine: a plan without a mandate says when it ends, never that it renews", () => {
  assert.equal(planPeriodLine(snapshot({ auto_renews: false }), NOW), "Ends on 7 Nov 2026 — doesn't renew automatically");
  assert.equal(planPeriodLine(snapshot({ auto_renews: false }), END + DAY), "Ended on 7 Nov 2026");
});

test("planPeriodLine: unchanged cases — auto-renew turned off, no date yet, count-based plans, older API", () => {
  assert.equal(planPeriodLine(snapshot({ cancel_at_period_end: true, auto_renews: false }), NOW), "Access until 7 Nov 2026");
  assert.equal(planPeriodLine(snapshot({ current_period_end: null }), NOW), "Renewal date pending");
  const free = snapshot({ service: { _id: "f", name: null, service_type: "Free", billing_interval: null }, current_period_end: null, auto_renews: false });
  assert.equal(planPeriodLine(free, NOW), "No renewal — credits don't expire.");
  assert.equal(planPeriodLine(withoutAutoRenewsField(snapshot()), NOW), "Renews on 7 Nov 2026");
});

/* ── subscriptionBannerContent ────────────────────────────────────────────── */

test("banner: past due with a mandate keeps the retry-and-fix-payment message", () => {
  const content = subscriptionBannerContent(snapshot({ status: "past_due", grace_until: GRACE }));
  assert.deepEqual(content, {
    tone: "warning",
    message: "We couldn't take your renewal payment. We'll keep retrying until 14 Nov 2026 — update your payment method to avoid interruption.",
    ctaLabel: "Fix payment",
    scope: "app",
  });
});

test("banner: past due without a mandate says the plan ended — no retry, no payment method to fix", () => {
  const content = subscriptionBannerContent(snapshot({ status: "past_due", auto_renews: false, grace_until: GRACE }));
  assert.deepEqual(content, {
    tone: "warning",
    message: "Your plan ended on 7 Nov 2026 and doesn't renew automatically. Your studio stays open until 14 Nov 2026; after that it becomes read-only and your galleries are archived. Contact support to continue.",
    ctaLabel: "View plan",
    scope: "app",
  });
  assert.doesNotMatch(content!.message, /retry|payment method/);
});

test("banner: past due without a mandate or dates still reads sensibly", () => {
  const content = subscriptionBannerContent(snapshot({ status: "past_due", auto_renews: false, current_period_end: null, grace_until: null }));
  assert.equal(content!.message, "Your plan ended and doesn't renew automatically. Your studio stays open for a few more days; after that it becomes read-only and your galleries are archived. Contact support to continue.");
});

test("banner: an older API response keeps today's past-due message", () => {
  const content = subscriptionBannerContent(withoutAutoRenewsField(snapshot({ status: "past_due", grace_until: GRACE })));
  assert.equal(content!.ctaLabel, "Fix payment");
});

test("banner: other states are unchanged", () => {
  assert.equal(subscriptionBannerContent(null), null);
  assert.equal(subscriptionBannerContent(snapshot()), null);
  assert.equal(subscriptionBannerContent(snapshot({ auto_renews: false })), null);
  assert.equal(subscriptionBannerContent(snapshot({ cancel_at_period_end: true }))!.ctaLabel, "Turn auto-renew back on");
  assert.equal(subscriptionBannerContent(snapshot({ status: "suspended", delete_at: GRACE }))!.message, "Your studio is read-only. All galleries are archived and will be permanently deleted on 14 Nov 2026. Renew now to restore everything.");
  assert.equal(subscriptionBannerContent(snapshot({ status: "cancelled" }))!.message, "Your plan ends on 7 Nov 2026. After that your galleries are archived and deleted 7 days later.");
  assert.equal(subscriptionBannerContent(snapshot({ status: "expired" }))!.ctaLabel, "Choose a plan");
  assert.equal(subscriptionBannerContent(snapshot({ status: "pending_payment" }))!.scope, "settings");
});
