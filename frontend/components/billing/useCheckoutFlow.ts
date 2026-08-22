"use client";

import { useCallback, useRef, useState } from "react";
import { checkout, ApiError } from "@/lib/billing";
import { openCheckout } from "@/lib/razorpay";
import type { SubscriptionSnapshot } from "@/lib/billing-types";

export type CheckoutPurpose = "event_topup" | "subscription" | "tier_upgrade";

export type CheckoutFlowState =
  | { phase: "idle" }
  | { phase: "processing" }
  | { phase: "scheduled"; message: string; effectiveAt: number }
  | { phase: "confirming"; purpose: CheckoutPurpose; targetServiceId: string; before: SubscriptionSnapshot | null }
  | { phase: "dismissed"; planName: string }
  | { phase: "fallback_link"; shortUrl: string }
  | { phase: "error"; message: string };

export type RunCheckoutInput = {
  serviceId: string;
  quantity?: number;
  couponCode?: string | null;
  purpose: CheckoutPurpose;
  description: string;
  before: SubscriptionSnapshot | null;
  currentPlanName: string;
  prefill?: { name?: string; email?: string; contact?: string };
  /** Called when the server rejects the coupon at redeem time (400) even
   *  though it validated fine earlier — lets the caller clear the applied chip. */
  onCouponRejected?: (message: string) => void;
};

/**
 * The single checkout -> narrow -> Razorpay -> confirm sequence, shared by
 * /checkout and <UpgradeModal> so the six POST /billing/checkout response
 * branches (plan §1.5) are never implemented twice and cannot drift.
 */
export function useCheckoutFlow() {
  const [state, setState] = useState<CheckoutFlowState>({ phase: "idle" });
  const inFlight = useRef(false);

  const reset = useCallback(() => setState({ phase: "idle" }), []);

  const runCheckout = useCallback(async (input: RunCheckoutInput) => {
    // Guards against a double-submit creating two Razorpay orders — a ref,
    // not just a disabled attribute, since disabled can lag a fast double-click.
    if (inFlight.current) return;
    inFlight.current = true;
    setState({ phase: "processing" });

    try {
      const res = await checkout({
        service_id: input.serviceId,
        quantity: input.quantity,
        coupon_code: input.couponCode ?? undefined,
      });

      // Narrowing order per plan §1.5: `status` first, then razorpay_order_id
      // (even when a subscription id is also present), else subscription-based.
      // Two branches carry a `status`, so this has to switch on the literal —
      // `"status" in res` alone would send an "activated" response into the
      // "scheduled" screen and render undefined copy and an Invalid Date.
      if ("status" in res) {
        if (res.status === "activated") {
          // A 100%-off coupon: the server already granted the plan, with no
          // Razorpay step at all. Straight to the same confirmation screen a
          // paid checkout lands on — its first poll of GET /billing/subscription
          // sees the change immediately, since it has already been applied.
          setState({
            phase: "confirming",
            purpose: input.purpose,
            targetServiceId: input.serviceId,
            before: input.before,
          });
          return;
        }
        setState({ phase: "scheduled", message: res.message, effectiveAt: res.effective_at });
        return;
      }

      if ("razorpay_order_id" in res) {
        await openCheckout({
          keyId: res.key_id,
          orderId: res.razorpay_order_id,
          amountRupees: res.amount,
          description: input.description,
          prefill: input.prefill,
          onSuccess: () => {
            setState({
              phase: "confirming",
              purpose: input.purpose,
              targetServiceId: input.serviceId,
              before: input.before,
            });
          },
          onDismiss: () => {
            setState({ phase: "dismissed", planName: input.currentPlanName });
          },
        });
        return;
      }

      // Branch B — subscription_id + short_url, no Order.
      try {
        await openCheckout({
          keyId: res.key_id,
          subscriptionId: res.razorpay_subscription_id,
          description: input.description,
          prefill: input.prefill,
          onSuccess: () => {
            setState({
              phase: "confirming",
              purpose: input.purpose,
              targetServiceId: input.serviceId,
              before: input.before,
            });
          },
          onDismiss: () => {
            setState({ phase: "dismissed", planName: input.currentPlanName });
          },
        });
      } catch {
        // Razorpay script failed to load (blocked, offline) — fall back to
        // the hosted short_url link rather than a dead end.
        setState({ phase: "fallback_link", shortUrl: res.short_url });
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && /coupon/i.test(err.message)) {
        input.onCouponRejected?.(err.message);
      }
      const message =
        err instanceof ApiError && [400, 402, 409].includes(err.status)
          ? err.message
          : "Something went wrong. Please contact support.";
      setState({ phase: "error", message });
    } finally {
      inFlight.current = false;
    }
  }, []);

  return { state, runCheckout, reset };
}
