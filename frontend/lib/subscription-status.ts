/**
 * What the dashboard tells a studio about its plan's renewal — the plan card's
 * validity line and the billing banner. Pure (no React, no I/O) so every
 * wording decision is unit-tested; the components only render it.
 *
 * The one rule that matters: never promise a renewal that won't happen. A
 * Monthly/Yearly plan renews only while it has a Razorpay mandate. Plans
 * activated with a 100% coupon, or set by support, have none — they simply
 * end — and the API says so with `auto_renews`.
 */
import type { SubscriptionSnapshot } from "./billing-types.ts";
import { isStorageBasedPlan } from "./types.ts";

export const formatBillingDate = (ms: number) =>
  new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(ms));

/**
 * Whether the plan renews on its own. API responses from before `auto_renews`
 * existed don't carry it; for those we fall back to the one thing the old
 * payload did say — whether auto-renew was switched off — so this dashboard can
 * ship before the API does without changing what a studio sees.
 */
export function autoRenews(snapshot: SubscriptionSnapshot | null | undefined): boolean {
  if (!snapshot) return false;
  if (snapshot.auto_renews !== undefined) return snapshot.auto_renews;
  return !snapshot.cancel_at_period_end;
}

/**
 * The plan is over and nothing will bring it back on its own, so buying is the
 * way forward — including buying the very same plan again.
 *
 * Mirrors the API's own routing rule (currentPlanHasLapsed in
 * billing.service.js): past the period end with no auto-renew, or suspended.
 * The dashboard needs it because the plan picker used to disable the tier a
 * studio was already on — which, for a studio whose plan had ended, disabled
 * the only thing that would have helped it.
 */
export function planHasLapsed(snapshot: SubscriptionSnapshot | null | undefined, now: number = Date.now()): boolean {
  if (!snapshot || !isStorageBasedPlan(snapshot.service?.service_type)) return false;
  if (snapshot.status === "suspended" || snapshot.status === "expired") return true;
  const end = snapshot.current_period_end;
  return (end == null || end <= now) && !autoRenews(snapshot);
}

/**
 * Whether to offer "turn auto-renew on" — one button for the two plans that
 * won't renew but still have time left to defer a first charge to: auto-renew
 * switched off, and a plan that never had a mandate at all (comped, or set by
 * support). The API's resume endpoint accepts exactly these two.
 */
export function canTurnOnAutoRenew(snapshot: SubscriptionSnapshot | null | undefined, now: number = Date.now()): boolean {
  if (!snapshot || !isStorageBasedPlan(snapshot.service?.service_type)) return false;
  if (!["active", "cancelled"].includes(snapshot.status)) return false;
  if (autoRenews(snapshot)) return false;
  return snapshot.current_period_end != null && snapshot.current_period_end > now;
}

/** The plan card's validity line. */
export function planPeriodLine(snapshot: SubscriptionSnapshot, now: number = Date.now()): string {
  if (!isStorageBasedPlan(snapshot.service?.service_type)) return "No renewal — credits don't expire.";
  const end = snapshot.current_period_end;
  if (!end) return "Renewal date pending";
  if (snapshot.cancel_at_period_end) return `Access until ${formatBillingDate(end)}`;
  if (autoRenews(snapshot)) return `Renews on ${formatBillingDate(end)}`;
  return end > now
    ? `Ends on ${formatBillingDate(end)} — doesn't renew automatically`
    : `Ended on ${formatBillingDate(end)}`;
}

export type BannerTone = "neutral" | "warning" | "danger";

export type BannerContent = {
  tone: BannerTone;
  message: string;
  ctaLabel: string;
  /** "app" banners render everywhere (via <SubscriptionBanner scope="app" />); "settings" only within billing settings. */
  scope: "app" | "settings";
};

/** The billing banner for a snapshot, or null when there's nothing to say. */
export function subscriptionBannerContent(snapshot: SubscriptionSnapshot | null): BannerContent | null {
  if (!snapshot) return null;

  switch (snapshot.status) {
    case "active":
      if (snapshot.cancel_at_period_end && snapshot.current_period_end) {
        return {
          tone: "warning",
          message: `Auto-renew is off. You have access until ${formatBillingDate(snapshot.current_period_end)}.`,
          ctaLabel: "Turn auto-renew back on",
          scope: "settings",
        };
      }
      return null;
    case "pending_payment":
      return {
        tone: "neutral",
        message: "A payment is being confirmed. This usually takes a few seconds.",
        ctaLabel: "Check status",
        scope: "settings",
      };
    case "past_due": {
      // No mandate: there is no payment to retry and no payment method to fix.
      // The plan simply ended.
      if (!autoRenews(snapshot)) {
        const ended = snapshot.current_period_end ? ` on ${formatBillingDate(snapshot.current_period_end)}` : "";
        const until = snapshot.grace_until ? ` until ${formatBillingDate(snapshot.grace_until)}` : " for a few more days";
        return {
          tone: "warning",
          message: `Your plan ended${ended} and doesn't renew automatically. Your studio stays open${until}; after that it becomes read-only and your galleries are archived. Renew your plan to keep everything running.`,
          ctaLabel: "Renew plan",
          scope: "app",
        };
      }
      const graceLine = snapshot.grace_until
        ? `We'll keep retrying until ${formatBillingDate(snapshot.grace_until)}`
        : "We'll keep retrying over the next few days";
      return {
        tone: "warning",
        message: `We couldn't take your renewal payment. ${graceLine} — update your payment method to avoid interruption.`,
        ctaLabel: "Fix payment",
        scope: "app",
      };
    }
    case "suspended": {
      const deleteLine = snapshot.delete_at
        ? `permanently deleted on ${formatBillingDate(snapshot.delete_at)}`
        : "permanently deleted soon";
      return {
        tone: "danger",
        message: `Your studio is read-only. All galleries are archived and will be ${deleteLine}. Renew now to restore everything.`,
        ctaLabel: "Renew now",
        scope: "app",
      };
    }
    case "cancelled": {
      const dateLine = snapshot.current_period_end ? ` on ${formatBillingDate(snapshot.current_period_end)}` : "";
      return {
        tone: "warning",
        message: `Your plan ends${dateLine}. After that your galleries are archived and deleted 7 days later.`,
        ctaLabel: "Turn auto-renew back on",
        scope: "app",
      };
    }
    case "expired":
      return {
        tone: "danger",
        message: "Your subscription has ended. Choose a plan to start again.",
        ctaLabel: "Choose a plan",
        scope: "app",
      };
    default:
      return null;
  }
}
