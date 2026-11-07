import { test } from "node:test";
import assert from "node:assert/strict";
import {
  summaryRowsOf,
  couponBonusRowLabel,
  nextTierNudge,
  couponChipLabel,
  appliedBonusLabel,
  type PricedPreview,
} from "./checkout-summary.ts";

const preview = (over: Partial<PricedPreview> = {}): PricedPreview => ({
  mode: "event_topup",
  description: "2 events",
  gross_amount: 498,
  discount_amount: 49.8,
  taxable_value: 379.83,
  tax_lines: [{ type: "IGST", percent: 18, amount: 68.37 }],
  total: 448.2,
  requires_payment: true,
  proration: null,
  ...over,
});

test("summaryRowsOf: an API from before the GST switch is read as GST-inclusive, on its gross figures", () => {
  assert.deepEqual(summaryRowsOf(preview()), {
    gstInclusive: true,
    lineAmount: 498,
    discountAmount: 49.8,
    unusedCredit: null,
  });
});

test("summaryRowsOf: a plan listed before GST shows its price and coupon rows before GST", () => {
  // 2 x 249 before GST, 10% off: charged 587.64 less 58.76 = 528.88.
  const rows = summaryRowsOf(
    preview({
      gross_amount: 587.64,
      discount_amount: 58.76,
      taxable_value: 448.2,
      tax_lines: [{ type: "IGST", percent: 18, amount: 80.68 }],
      total: 528.88,
      gst_inclusive: false,
      list_amount: 498,
      list_discount_amount: 49.8,
    }),
  );
  assert.deepEqual(rows, { gstInclusive: false, lineAmount: 498, discountAmount: 49.8, unusedCredit: null });
  // price - coupon = taxable value, and taxable value + GST = total.
  assert.equal(Math.round((rows.lineAmount - rows.discountAmount) * 100) / 100, 448.2);
  assert.equal(Math.round((448.2 + 80.68) * 100) / 100, 528.88);
});

test("summaryRowsOf: the unused plan credit follows the same basis", () => {
  const proration = { mode: "interval_upgrade" as const, remaining_fraction: 0.5, old_price: 1000, new_price: 10000, unused_credit: 590 };
  assert.equal(summaryRowsOf(preview({ proration })).unusedCredit, 590);
  assert.equal(summaryRowsOf(preview({ proration: { ...proration, list_unused_credit: 500 } })).unusedCredit, 500);
  // A tier upgrade has no credit row.
  assert.equal(summaryRowsOf(preview({ proration: { ...proration, mode: "tier_upgrade", unused_credit: null } })).unusedCredit, null);
});

test("couponBonusRowLabel: the bonus row names the code and the events", () => {
  assert.equal(couponBonusRowLabel("+1", 1), "Coupon +1: +1 free event");
  assert.equal(couponBonusRowLabel("TIER", 3), "Coupon TIER: +3 free events");
  assert.equal(couponBonusRowLabel(null, 2), "Coupon: +2 free events");
});

test("nextTierNudge: only while a bigger tier is in reach", () => {
  assert.equal(nextTierNudge({ min_quantity: 5, bonus_events: 2, events_to_add: 1 }), "Add 1 more to get 2 free");
  assert.equal(nextTierNudge({ min_quantity: 10, bonus_events: 3, events_to_add: 6 }), "Add 6 more to get 3 free");
  assert.equal(nextTierNudge(null), null);
  assert.equal(nextTierNudge(undefined), null);
});

test("couponChipLabel / appliedBonusLabel: figures from the coupon, no dashes", () => {
  const bonus = { code: "+1", reward_type: "bonus_events" as const, percent_off: null, bonus_events: 1, bonus_tiers: [{ min_quantity: 1, bonus_events: 1 }] };
  assert.equal(couponChipLabel(bonus), "+1 · 1 free event");
  assert.equal(couponChipLabel({ ...bonus, bonus_events: 0, bonus_tiers: [{ min_quantity: 2, bonus_events: 2 }] }), "+1 · 2 free events");
  assert.equal(couponChipLabel({ code: "STORAGE5", reward_type: "percent_off", percent_off: 5, bonus_events: 0, bonus_tiers: null }), "STORAGE5 · 5% off");
  assert.equal(appliedBonusLabel(2), "+2 free events");
  assert.equal(appliedBonusLabel(0), null);
  for (const text of [couponBonusRowLabel("+1", 1), nextTierNudge({ min_quantity: 5, bonus_events: 2, events_to_add: 1 }) ?? "", couponChipLabel(bonus)]) {
    assert.doesNotMatch(text, /[\u2013\u2014]/);
  }
});
