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
 * existed don't carry it; those keep the old assumption (it renews), so this
 * dashboard can ship before the API does without changing anything.
 */
export function autoRenews(snapshot: SubscriptionSnapshot | null | undefined): boolean {
  return Boolean(snapshot) && snapshot!.auto_renews !== false;
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
          message: `Your plan ended${ended} and doesn't renew automatically. Your studio stays open${until}; after that it becomes read-only and your galleries are archived. Contact support to continue.`,
          ctaLabel: "View plan",
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
