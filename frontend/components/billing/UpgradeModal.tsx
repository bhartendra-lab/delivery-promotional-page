"use client";

import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { planLabel, eventPlanOf } from "@/lib/plans";
import type { Plan } from "@/lib/plans";
import { isStorageBasedPlan } from "@/lib/types";
import { planHasLapsed } from "@/lib/subscription-status";
import { useCompany } from "@/lib/useCompany";
import { getCompanyDetails } from "@/lib/api";
import { setCompany } from "@/lib/auth";
import { useSubscription } from "@/components/billing/SubscriptionProvider";
import { useReminders } from "@/components/dashboard/RemindersProvider";
import { CheckoutFlowStatus } from "@/components/billing/CheckoutFlowStatus";
import { CheckoutPanel, type CheckoutPayRequest } from "@/components/billing/CheckoutPanel";
import { useCheckoutFlow } from "@/components/billing/useCheckoutFlow";
import { IconWarningCircle } from "@/components/ui/icons";

/**
 * Every purchase of events or a plan, the studio's first one included (the
 * welcome dialog and the first-purchase notice open it too): one screen
 * (CheckoutPanel) with the plan on the left and the order, coupon, billing
 * state and pay button on the right. While a payment is under way, or once it
 * is done, the screen shows its progress.
 */
export function UpgradeModal({
  open,
  onClose,
  plans,
  preset,
  initialCoupon,
  loaded,
  loadFailed,
  onRetryLoad,
}: {
  open: boolean;
  onClose: () => void;
  plans: Plan[];
  /** Opens straight to a mode, e.g. when a 402 fires from event creation. */
  preset?: "event" | "storage";
  /** Applied as the modal opens, e.g. the free first event on a studio's first visit. */
  initialCoupon?: string;
  /**
   * False until the plans fetch has resolved at least once. Gates the
   * chooser's very first mount: against an empty `plans` array it would
   * decide pay per event is not on offer.
   */
  loaded: boolean;
  /** The plans fetch failed outright — distinct from "loaded but nothing purchasable". */
  loadFailed: boolean;
  onRetryLoad: () => void;
}) {
  const router = useRouter();
  const company = useCompany();
  const { snapshot, refresh } = useSubscription();
  const { refresh: refreshReminders } = useReminders();
  const { state, runCheckout, reset } = useCheckoutFlow();

  const currentPlanName = snapshot?.service?.name || snapshot?.service?.service_type || "your current plan";
  // Same derivation PlanChooser uses internally (same inputs), so the two
  // never disagree about whether pay-per-event exists for this studio.
  const eventOptionAvailable =
    Boolean(eventPlanOf(plans)) &&
    (!isStorageBasedPlan(snapshot?.service?.service_type) || planHasLapsed(snapshot));

  function handleClose() {
    reset();
    onClose();
  }

  function handlePay({ selection, total, couponCode, confirmStorageClear, onCouponRejected }: CheckoutPayRequest) {
    runCheckout({
      serviceId: selection.plan._id,
      quantity: selection.mode === "event" ? selection.quantity : undefined,
      value: total ?? undefined,
      couponCode,
      purpose: selection.mode === "event" ? "event_topup" : snapshot?.service ? "tier_upgrade" : "subscription",
      description:
        selection.mode === "event"
          ? `${selection.quantity} event${selection.quantity === 1 ? "" : "s"}`
          : planLabel(selection.plan),
      before: snapshot,
      currentPlanName,
      prefill: company
        ? { name: company.name, email: company.business_email, contact: company.whatsapp_number }
        : undefined,
      onCouponRejected,
      confirmStorageClear,
    });
  }

  const showingFlow = state.phase !== "idle" && state.phase !== "processing";

  return (
    <Modal
      open={open}
      onClose={handleClose}
      size={showingFlow ? "md" : "xl"}
      title={showingFlow ? "Upgrade plan" : "Choose your plan"}
      subtitle={
        showingFlow
          ? undefined
          : eventOptionAvailable
            ? "Pay per event, or move to a storage plan."
            : "Pick the storage tier that fits."
      }
    >
      {showingFlow ? (
        <CheckoutFlowStatus
          state={state}
          onRetry={() => reset()}
          onGoToDashboard={() => {
            const boughtEvents = state.phase === "confirming" && state.purpose === "event_topup";
            handleClose();
            router.push(boughtEvents ? "/dashboard" : "/dashboard/settings/billing");
            refresh();
            // A first purchase: the cached company still says "plan required",
            // and the first-purchase prompts read it. Best-effort.
            void getCompanyDetails()
              .then(({ company: fresh }) => setCompany(fresh))
              .catch(() => {});
            // The studio has just become entitled to a custom domain, and the
            // custom-domain prompt is driven by a server-computed flag that
            // RemindersProvider fetched once at dashboard mount — before the
            // upgrade. Without this refresh the dialog wouldn't appear until
            // their next visit. Best-effort; never blocks the navigation.
            void refreshReminders();
          }}
        />
      ) : loadFailed ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <IconWarningCircle className="h-6 w-6 text-[var(--color-brand-danger)]" />
          <p className="text-sm text-[var(--color-brand-muted)]">
            Couldn&apos;t load pricing. Check your connection and try again.
          </p>
          <button
            type="button"
            onClick={onRetryLoad}
            className="brand-focus inline-flex h-10 items-center justify-center rounded-lg border border-[var(--color-brand-border)] px-4 text-sm font-semibold text-[var(--color-brand-ink)] transition-colors hover:bg-[var(--color-brand-hover)]"
          >
            Retry
          </button>
        </div>
      ) : !loaded ? (
        // Never mount the chooser against an empty catalog — see the `loaded` prop doc above.
        <div className="flex flex-col items-center justify-center gap-3 py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[var(--color-brand-border)] border-t-[var(--color-brand-navy)]" />
          <p className="text-sm text-[var(--color-brand-muted)]">Loading plans…</p>
        </div>
      ) : (
        <CheckoutPanel
          plans={plans}
          snapshot={snapshot}
          initialMode={preset}
          initialCouponCode={initialCoupon}
          paying={state.phase === "processing"}
          onPay={handlePay}
        />
      )}
    </Modal>
  );
}
