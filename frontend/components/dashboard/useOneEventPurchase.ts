"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, getApiErrorCode } from "@/lib/api";
import { getAvailableCoupons, getBillingPlans, previewCheckout } from "@/lib/billing";
import { eventPlanOf } from "@/lib/plans";
import { autoCouponFor } from "@/lib/event-pay";

export type OneEventPurchase = {
  /** False while the plan, coupon and price are still being worked out. */
  settled: boolean;
  /** The pay per event plan to buy from, once known. */
  serviceId: string | null;
  /** The coupon this purchase will use, or null. */
  couponCode: string | null;
  /** What the studio pays, GST included, once priced. */
  total: number | null;
  /** Free events the coupon adds. */
  bonusEvents: number;
  /** The studio has never saved billing details (needed on the GST invoice). */
  needsBilling: boolean;
  /** Why this studio cannot buy here, shown instead of paying. */
  blockedReason: string | null;
  /** Prices the purchase again without the coupon. */
  dropCoupon: () => void;
  /** Billing details were just saved. */
  markBillingSaved: () => void;
};

/**
 * Prepares buying ONE pay per event event from the Add event modal, so that
 * "Continue to pay" can open Razorpay at once: finds the plan, picks the
 * coupon (autoCouponFor) and prices it through the checkout preview, which
 * also says whether billing details are still missing.
 *
 * `enabled` turns it on once the modal knows it is in pay mode and has heard
 * from /referrals/me (`refereeCoupon`, the referred studio's own coupon).
 */
export function useOneEventPurchase(enabled: boolean, refereeCoupon: string | null): OneEventPurchase {
  const [settled, setSettled] = useState(false);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [couponCode, setCouponCode] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [bonusEvents, setBonusEvents] = useState(0);
  const [needsBilling, setNeedsBilling] = useState(false);
  const [blockedReason, setBlockedReason] = useState<string | null>(null);
  // Bumped to price again (coupon dropped, billing saved).
  const [round, setRound] = useState(0);
  const [couponDropped, setCouponDropped] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    async function price(id: string, code: string | null): Promise<void> {
      try {
        const preview = await previewCheckout({ service_id: id, quantity: 1, ...(code ? { coupon_code: code } : {}) });
        if (cancelled) return;
        if ("total" in preview) {
          setTotal(preview.total);
          setBonusEvents(preview.bonus_events ?? 0);
          setCouponCode(preview.coupon?.code ?? null);
        }
        setNeedsBilling(false);
      } catch (err) {
        if (cancelled) return;
        if (getApiErrorCode(err) === "BILLING_PROFILE_INCOMPLETE") {
          // Razorpay still opens right after the details are saved; the
          // coupon is kept and checked by the checkout itself.
          setNeedsBilling(true);
          setCouponCode(code);
          return;
        }
        if (err instanceof ApiError && err.status === 403) {
          setBlockedReason("Only your studio's admin or billing contact can buy events. Ask them to buy one, then create this event.");
          return;
        }
        // A coupon that no longer fits: price it without one.
        if (code && err instanceof ApiError && err.status === 400) return price(id, null);
        // Anything else: the button still pays; checkout will say what is wrong.
        setCouponCode(code);
      }
    }

    (async () => {
      setSettled(false);
      try {
        const { plans } = await getBillingPlans();
        const plan = eventPlanOf(plans);
        if (cancelled) return;
        if (!plan) {
          setBlockedReason("Buying events isn't available right now. Please try again later.");
          return;
        }
        setServiceId(plan._id);
        let code: string | null = null;
        if (!couponDropped) {
          const offers = await getAvailableCoupons({ service_id: plan._id, quantity: 1 })
            .then((res) => res.coupons ?? [])
            .catch(() => []);
          code = autoCouponFor(offers, refereeCoupon);
        }
        if (cancelled) return;
        await price(plan._id, code);
      } catch {
        if (!cancelled) setBlockedReason("Couldn't load the price. Check your connection and try again.");
      } finally {
        if (!cancelled) setSettled(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, refereeCoupon, round, couponDropped]);

  const dropCoupon = useCallback(() => {
    setCouponDropped(true);
    setCouponCode(null);
    setBonusEvents(0);
    setTotal(null);
  }, []);

  const markBillingSaved = useCallback(() => {
    setNeedsBilling(false);
    setRound((n) => n + 1);
  }, []);

  return { settled, serviceId, couponCode, total, bonusEvents, needsBilling, blockedReason, dropCoupon, markBillingSaved };
}
