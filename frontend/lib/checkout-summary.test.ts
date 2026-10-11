import { test } from "node:test";
import assert from "node:assert/strict";
import { summaryRowsOf, type PricedPreview } from "./checkout-summary.ts";

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
