// lib/event-pay.ts — "Continue to pay" in the Add event modal, and the
// referral invitations shown there. PURE: every price, coupon and reward
// figure comes from the API; this file only chooses between them and words
// them. No dashes in user-facing copy.
//
// A pay per event studio with no events left still opens Add event and fills
// it in. Its button then reads "Continue to pay", which buys ONE event
// straight away (Razorpay opens directly, no plan picker) and, once the
// payment lands, creates the event from what was typed.

import type { AvailableCoupon } from "./billing-types.ts";
import { formatInr } from "./plans.ts";
import { normalizeReferralCode, type MyReferrals } from "./referral.ts";

/**
 * The coupon a one-event purchase applies by itself, or null.
 *
 *  - A referred studio's own coupon (GET /referrals/me names it only while it
 *    is owed) comes first, the same rule as the checkout's coupon field.
 *  - Otherwise the offer that gives the most on ONE event: free events first
 *    (a bonus coupon whose first tier needs more than one event gives nothing
 *    here, so it is never spent on this purchase), then the biggest percent off.
 */
export function autoCouponFor(offers: readonly AvailableCoupon[] | null | undefined, refereeCode?: string | null): string | null {
  const referee = normalizeReferralCode(refereeCode);
  if (referee) return referee;
  let best: AvailableCoupon | null = null;
  const score = (o: AvailableCoupon) =>
    o.reward_type === "bonus_events" ? 1000 + (o.bonus_events || 0) : (o.percent_off || 0);
  for (const offer of offers ?? []) {
    const gives = offer.reward_type === "bonus_events" ? (offer.bonus_events || 0) > 0 : (offer.percent_off || 0) > 0;
    if (!gives) continue;
    if (!best || score(offer) > score(best)) best = offer;
  }
  return best?.code ?? null;
}

/** The pay button: the amount once the preview has priced it. */
export function continueToPayLabel(total: number | null | undefined): string {
  return typeof total === "number" && Number.isFinite(total) ? `Continue to pay ${formatInr(total, { paise: true })}` : "Continue to pay";
}

/** What the applied coupon does to this purchase, as one short line, or null. */
export function appliedCouponLine(code: string | null | undefined, bonusEvents: number | null | undefined): string | null {
  if (!code) return null;
  const bonus = Number(bonusEvents) || 0;
  if (bonus > 0) return `${code} applied: you also get ${bonus} free event${bonus === 1 ? "" : "s"}.`;
  return `${code} applied.`;
}

/* ── Creating the event once the payment lands ─────────────────────────── */

/** How often, and how many times, the paid event is retried while the payment is still being confirmed. */
export const PAID_CREATE_RETRY_MS = 2000;
export const PAID_CREATE_MAX_ATTEMPTS = 20;

/**
 * Whether a create that failed after paying should be tried again. Razorpay's
 * webhook grants the event, not the browser, so for a few seconds after
 * paying the create is still refused with 402 (no events left). Anything
 * else is a real error.
 */
export function shouldRetryPaidCreate(status: number | null | undefined, attempt: number): boolean {
  return status === 402 && attempt < PAID_CREATE_MAX_ATTEMPTS;
}

/* ── Referral invitations ──────────────────────────────────────────────── */

export type ReferralOffer = { kind: "event_credit" | "validity_days"; quantity: number };

/**
 * What referring earns this studio on its current plan, or null when there is
 * nothing to invite with: the program is off, the studio has not paid yet (it
 * has no code), or the reward is only saved for later.
 */
export function referralOfferOf(me: MyReferrals | null | undefined): ReferralOffer | null {
  if (!me?.eligible || !me.program_active || !me.link) return null;
  const reward = me.rewards_for_my_plan;
  if (!reward || (reward.type !== "event_credit" && reward.type !== "validity_days")) return null;
  const quantity = Number(reward.quantity) || 0;
  return quantity > 0 ? { kind: reward.type, quantity } : null;
}

export type ReferralInviteCopy = {
  /** The short line beside the pay button. */
  short: string;
  title: string;
  body: string;
  cta: string;
};

export function referralInviteCopy(offer: ReferralOffer): ReferralInviteCopy {
  const n = offer.quantity;
  if (offer.kind === "event_credit") {
    const what = n === 1 ? "an event" : `${n} events`;
    const free = `${n} free event${n === 1 ? "" : "s"}`;
    return {
      short: `Get ${what} free`,
      title: n === 1 ? "Your next event, on us" : `${n} events, on us`,
      body: `Know a studio that would love Vyavasth? Invite them. When they join and make their first payment, you get ${free}. Every studio you bring earns you ${n === 1 ? "another one" : `${n} more`}.`,
      cta: "Invite a studio",
    };
  }
  const days = `${n} day${n === 1 ? "" : "s"}`;
  return {
    short: `Get ${days} free`,
    title: `${days} more on your plan, on us`,
    body: `Know a studio that would love Vyavasth? Invite them. When they join and make their first payment, your plan runs ${days} longer. Every studio you bring adds ${days} more.`,
    cta: "Invite a studio",
  };
}
