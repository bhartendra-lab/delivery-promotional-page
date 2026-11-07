import { test } from "node:test";
import assert from "node:assert/strict";
import {
  autoCouponFor,
  continueToPayLabel,
  appliedCouponLine,
  shouldRetryPaidCreate,
  PAID_CREATE_MAX_ATTEMPTS,
  referralOfferOf,
  referralInviteCopy,
} from "./event-pay.ts";
import type { AvailableCoupon } from "./billing-types.ts";
import type { MyReferrals } from "./referral.ts";

const coupon = (over: Partial<AvailableCoupon>): AvailableCoupon => ({
  code: "X",
  reward_type: "percent_off",
  percent_off: null,
  bonus_tiers: null,
  valid_until: null,
  audience: null,
  headline: null,
  subline: null,
  bonus_events: 0,
  next_bonus_tier: null,
  ...over,
});

test("autoCouponFor: a referred studio's own coupon comes first", () => {
  const offers = [coupon({ code: "FIRSTFREE", reward_type: "bonus_events", bonus_events: 1 })];
  assert.equal(autoCouponFor(offers, " welcome10 "), "WELCOME10");
});

test("autoCouponFor: free events beat percent off; a tier that needs more events is never spent", () => {
  const offers = [
    coupon({ code: "STORAGE5", percent_off: 5 }),
    coupon({ code: "TIER", reward_type: "bonus_events", bonus_events: 0 }),
    coupon({ code: "FIRSTFREE", reward_type: "bonus_events", bonus_events: 1 }),
  ];
  assert.equal(autoCouponFor(offers, null), "FIRSTFREE");
  assert.equal(autoCouponFor([coupon({ code: "A", percent_off: 5 }), coupon({ code: "B", percent_off: 10 })]), "B");
  assert.equal(autoCouponFor([coupon({ code: "TIER", reward_type: "bonus_events", bonus_events: 0 })]), null);
  assert.equal(autoCouponFor([], null), null);
  assert.equal(autoCouponFor(null), null);
});

test("continueToPayLabel and appliedCouponLine", () => {
  assert.equal(continueToPayLabel(null), "Continue to pay");
  assert.match(continueToPayLabel(470.82), /^Continue to pay ₹470\.82$/);
  assert.equal(appliedCouponLine("FIRSTFREE", 1), "FIRSTFREE applied: you also get 1 free event.");
  assert.equal(appliedCouponLine("SAVE10", 0), "SAVE10 applied.");
  assert.equal(appliedCouponLine(null, 2), null);
});

test("shouldRetryPaidCreate: only a 402 while the payment lands, and not forever", () => {
  assert.equal(shouldRetryPaidCreate(402, 1), true);
  assert.equal(shouldRetryPaidCreate(402, PAID_CREATE_MAX_ATTEMPTS), false);
  assert.equal(shouldRetryPaidCreate(400, 1), false);
  assert.equal(shouldRetryPaidCreate(null, 1), false);
});

const me = (over: Partial<MyReferrals>): MyReferrals => ({
  eligible: true,
  program_active: true,
  code: "PIXL7K2Q",
  link: "https://deliver.vyavasth.in/r/PIXL7K2Q",
  rewards_for_my_plan: { type: "event_credit", quantity: 1 },
  share_message: null,
  stats: null,
  referrals: [],
  referred_by: null,
  referee_coupon_code: null,
  ...over,
});

test("referralOfferOf: only a studio with a code, while the program runs, with a reward it gets now", () => {
  assert.deepEqual(referralOfferOf(me({})), { kind: "event_credit", quantity: 1 });
  assert.deepEqual(referralOfferOf(me({ rewards_for_my_plan: { type: "validity_days", quantity: 7 } })), {
    kind: "validity_days",
    quantity: 7,
  });
  assert.equal(referralOfferOf(me({ eligible: false })), null);
  assert.equal(referralOfferOf(me({ program_active: false })), null);
  assert.equal(referralOfferOf(me({ link: null })), null);
  assert.equal(referralOfferOf(me({ rewards_for_my_plan: { type: "pending", quantity: null } })), null);
  assert.equal(referralOfferOf(me({ rewards_for_my_plan: { type: "event_credit", quantity: 0 } })), null);
  assert.equal(referralOfferOf(null), null);
});

test("referralInviteCopy: figures from the offer, no dashes", () => {
  const one = referralInviteCopy({ kind: "event_credit", quantity: 1 });
  assert.equal(one.short, "Get an event free");
  assert.equal(one.title, "Your next event, free");
  assert.match(one.body, /you get 1 free event\./);
  const week = referralInviteCopy({ kind: "validity_days", quantity: 7 });
  assert.equal(week.title, "7 days more on your plan, on us");
  assert.match(week.body, /your plan runs 7 days longer\./);
  assert.equal(referralInviteCopy({ kind: "event_credit", quantity: 2 }).short, "Get 2 events free");
  for (const copy of [one, week]) {
    for (const text of Object.values(copy)) assert.doesNotMatch(text, /[–—]/);
  }
});
