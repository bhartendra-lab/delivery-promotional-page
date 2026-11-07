// lib/checkout-summary.ts — PURE. No React, no fetch, no env.
//
// The rows of a checkout summary that depend on the GST switch of the plan
// being bought (Service.gst_inclusive in the API).
//
// A plan lists its prices either with GST in them or before GST. The summary
// shows the price row and the coupon row in whichever basis the plan uses, so
// the rows always add up:
//
//   GST included   2 x 249 = 498.00, coupon -49.80, total 448.20
//                  (taxable value and GST shown as the make-up of the total)
//   before GST     2 x 249 = 498.00, coupon -49.80, taxable 448.20,
//                  GST 80.68, total 528.88
//
// The API sends both rows ready to show (list_amount, list_discount_amount);
// nothing here works out tax.

import type { AvailableCoupon, CheckoutPreview, NextBonusTier } from "./billing-types.ts";

export type PricedPreview = Exclude<CheckoutPreview, { mode: "scheduled" }>;

export type SummaryRows = {
  /** Whether the plan's prices include GST. */
  gstInclusive: boolean;
  /** The price row. */
  lineAmount: number;
  /** The coupon row; 0 when there is none. */
  discountAmount: number;
  /** The "unused plan credit" row of an interval switch, or null. */
  unusedCredit: number | null;
};

/**
 * The price, coupon and credit rows of a preview, in the basis its plan lists
 * prices in. An API that predates the switch sends no `list_*` fields, and
 * its gross figures are the right ones (every price included GST then).
 */
export function summaryRowsOf(preview: PricedPreview): SummaryRows {
  const proration = preview.proration;
  return {
    gstInclusive: preview.gst_inclusive !== false,
    lineAmount: preview.list_amount ?? preview.gross_amount,
    discountAmount: preview.list_discount_amount ?? preview.discount_amount,
    unusedCredit: proration ? (proration.list_unused_credit ?? proration.unused_credit) : null,
  };
}

/* ── Coupon rows (coupons v2) ──────────────────────────────────────────────
 * Every figure comes from the API (the preview's bonus_events and
 * next_bonus_tier, a coupon's own tiers or percent); these only word them.
 * No dashes, by the copy rule. */

function freeEvents(n: number): string {
  return `${n} free event${n === 1 ? "" : "s"}`;
}

/** The summary row for a bonus coupon: "Coupon +1: +1 free event". */
export function couponBonusRowLabel(code: string | null | undefined, bonusEvents: number): string {
  return `Coupon${code ? ` ${code}` : ""}: +${freeEvents(bonusEvents)}`;
}

/** Under the bonus row, while a bigger tier is in reach: "Add 1 more to get 2 free". */
export function nextTierNudge(next: NextBonusTier | null | undefined): string | null {
  if (!next || !(next.events_to_add > 0) || !(next.bonus_events > 0)) return null;
  return `Add ${next.events_to_add} more to get ${next.bonus_events} free`;
}

/** A one-tap chip in "Offers for you": "+1 · 1 free event", "STORAGE5 · 5% off". */
export function couponChipLabel(coupon: Pick<AvailableCoupon, "code" | "reward_type" | "percent_off" | "bonus_events" | "bonus_tiers">): string {
  if (coupon.reward_type === "bonus_events") {
    const n = coupon.bonus_events > 0 ? coupon.bonus_events : (coupon.bonus_tiers?.[0]?.bonus_events ?? 0);
    return `${coupon.code} · ${freeEvents(n)}`;
  }
  return `${coupon.code} · ${coupon.percent_off ?? 0}% off`;
}

/** What an applied coupon gives, for its chip: "+2 free events", or null for a percent coupon (its chip shows the amount). */
export function appliedBonusLabel(bonusEvents: number | null | undefined): string | null {
  return bonusEvents && bonusEvents > 0 ? `+${freeEvents(bonusEvents)}` : null;
}
