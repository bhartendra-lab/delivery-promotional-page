"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { formatInr, planLabel, eventPlanOf } from "@/lib/plans";
import type { Plan } from "@/lib/plans";
import { previewCheckout, getApiErrorCode } from "@/lib/billing";
import type { CheckoutPreview } from "@/lib/billing-types";
import { isStorageBasedPlan } from "@/lib/types";
import { useCompany } from "@/lib/useCompany";
import { useSubscription } from "@/components/billing/SubscriptionProvider";
import { PlanChooser, type PlanChooserSelection } from "@/components/billing/PlanChooser";
import { CouponField, type AppliedCoupon } from "@/components/billing/CouponField";
import { CheckoutSummary } from "@/components/billing/CheckoutSummary";
import { CheckoutFlowStatus } from "@/components/billing/CheckoutFlowStatus";
import { useCheckoutFlow } from "@/components/billing/useCheckoutFlow";
import { BillingDetailsForm } from "@/components/billing/BillingDetailsForm";
import { IconArrowLeft, IconWarningCircle } from "@/components/ui/icons";

type Step = "choose" | "billing" | "confirm" | "status";

export function UpgradeModal({
  open,
  onClose,
  plans,
  preset,
  loaded,
  loadFailed,
  onRetryLoad,
  billingComplete,
}: {
  open: boolean;
  onClose: () => void;
  plans: Plan[];
  /** Opens straight to a mode, e.g. when a 402 fires from event creation. */
  preset?: "event" | "storage";
  /**
   * False until the plans/profile fetch has resolved at least once. Gates
   * PlanChooser's very first mount — without this, PlanChooser would
   * initialise its pricing-model verdict against an empty `plans` array on a
   * cold first open and (for "cards") wrongly skip straight to the storage
   * slider, since `bothAvailable` reads false before the catalog exists.
   */
  loaded: boolean;
  /** The plans/profile fetch failed outright — distinct from "loaded but nothing purchasable". */
  loadFailed: boolean;
  onRetryLoad: () => void;
  /** null while the proactive billing-profile check is still in flight. */
  billingComplete: boolean | null;
}) {
  const router = useRouter();
  const company = useCompany();
  const { snapshot, refresh } = useSubscription();
  const [step, setStep] = useState<Step>("choose");
  const [selection, setSelection] = useState<PlanChooserSelection | null>(null);
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  // Local override once the studio saves billing details (or the reactive
  // backstop below discovers the proactive check was stale) — takes
  // precedence over the provider's own `billingComplete` prop.
  const [billingKnownComplete, setBillingKnownComplete] = useState<boolean | null>(null);
  const { state, runCheckout, reset } = useCheckoutFlow();

  const [preview, setPreview] = useState<CheckoutPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const currentPlanName = snapshot?.service?.name || snapshot?.service?.service_type || "your current plan";
  // Same derivation PlanChooser uses internally (same inputs), so the two
  // never disagree about whether pay-per-event exists for this studio.
  const eventOptionAvailable =
    Boolean(eventPlanOf(plans)) && !isStorageBasedPlan(snapshot?.service?.service_type);
  const needsBillingDetails = (billingKnownComplete ?? billingComplete) === false;

  function handleClose() {
    setStep("choose");
    setSelection(null);
    setAppliedCoupon(null);
    setPreview(null);
    reset();
    onClose();
  }

  function handleSelection(sel: PlanChooserSelection) {
    setSelection(sel);
    setStep(needsBillingDetails ? "billing" : "confirm");
  }

  function handleBillingSaved() {
    setBillingKnownComplete(true);
    setStep("confirm");
  }

  // Real tax + proration breakdown, computed server-side — replaces the
  // client-guessed gross/total below, which is wrong for a tier upgrade (it
  // shows the full new-plan price, not the true prorated charge) and today
  // shows "Calculated at payment" for storage upgrades instead of a number.
  useEffect(() => {
    if (!selection || step !== "confirm") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clears stale preview synchronously when the selection is cleared
      if (!selection) setPreview(null);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(null);
    previewCheckout({
      service_id: selection.plan._id,
      quantity: selection.mode === "event" ? selection.quantity : undefined,
      coupon_code: appliedCoupon?.code,
    })
      .then((res) => {
        if (cancelled) return;
        setPreview(res);
      })
      .catch((err) => {
        if (cancelled) return;
        setPreview(null);
        if (getApiErrorCode(err) === "BILLING_PROFILE_INCOMPLETE") {
          // Reactive backstop — the proactive check said complete but the
          // server disagrees (stale, or edited elsewhere); resolve in-flow
          // instead of a dead-end banner.
          setBillingKnownComplete(false);
          setStep("billing");
        } else {
          setPreviewError(err instanceof Error ? err.message : "Couldn't calculate your total.");
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selection, appliedCoupon?.code, step]);

  function handlePay() {
    if (!selection) return;
    const description =
      selection.mode === "event"
        ? `${selection.quantity} event${selection.quantity === 1 ? "" : "s"}`
        : planLabel(selection.plan);
    runCheckout({
      serviceId: selection.plan._id,
      quantity: selection.mode === "event" ? selection.quantity : undefined,
      couponCode: appliedCoupon?.code,
      purpose: selection.mode === "event" ? "event_topup" : snapshot?.service ? "tier_upgrade" : "subscription",
      description,
      before: snapshot,
      currentPlanName,
      onCouponRejected: () => setAppliedCoupon(null),
    });
  }

  const isEvent = selection?.mode === "event";
  const eventUnitPrice = isEvent
    ? plans.find((p) => p._id === selection?.plan._id)?.event_unit_price ?? 0
    : 0;
  const grossAmount = isEvent ? selection.quantity * eventUnitPrice : (selection?.plan.price ?? 0);

  const isScheduled = preview?.mode === "scheduled";
  const hasPreview = !!preview && !isScheduled;
  const displayTotal = hasPreview ? preview.total : null;
  const displayGross = hasPreview ? preview.gross_amount : grossAmount;
  const displayDiscount = hasPreview ? preview.discount_amount : appliedCoupon?.discountAmount;
  const proration = hasPreview ? preview.proration : null;
  const prorationCredit =
    proration?.mode === "interval_upgrade" && proration.unused_credit
      ? { label: "Unused plan credit", amount: proration.unused_credit }
      : null;
  const grossLineLabel = isEvent ? `${selection?.quantity} × ${formatInr(eventUnitPrice)}` : proration ? "Prorated charge" : "Plan price";
  const totalPendingLabel = previewLoading ? "Calculating…" : isScheduled ? "No charge now" : "Calculated at payment";
  const canPay = !previewLoading && (isScheduled || displayTotal !== null);
  const payLabel = isScheduled
    ? "Schedule change"
    : displayTotal !== null
      ? `Pay ${formatInr(displayTotal, { paise: true })}`
      : totalPendingLabel;

  const showingFlow = state.phase !== "idle";
  const effectiveStep: Step = showingFlow ? "status" : step;

  const HEADER: Record<Step, { title: string; subtitle?: string; size: "sm" | "md" | "lg" }> = {
    choose: {
      title: "Choose your plan",
      subtitle: eventOptionAvailable ? "Pay per event, or move to a storage plan." : "Pick the storage tier that fits.",
      size: "lg",
    },
    billing: {
      title: "Billing details",
      subtitle: "Needed on your invoice — and to work out GST correctly.",
      size: "lg",
    },
    confirm: { title: "Confirm your purchase", size: "md" },
    status: { title: "Upgrade plan", size: "md" },
  };
  const header = HEADER[effectiveStep];

  function backFromConfirm() {
    setStep(needsBillingDetails ? "billing" : "choose");
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      size={header.size}
      title={header.title}
      subtitle={header.subtitle}
      headerLeading={
        !showingFlow && (step === "billing" || step === "confirm") ? (
          <button
            type="button"
            onClick={() => (step === "billing" ? setStep("choose") : backFromConfirm())}
            aria-label="Back"
            className="brand-focus flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--color-brand-muted)] hover:bg-[var(--color-brand-border)] hover:text-[var(--color-brand-ink)]"
          >
            <IconArrowLeft size={14} />
          </button>
        ) : undefined
      }
      footer={
        !showingFlow && step === "confirm" && selection ? (
          <div className="flex flex-col gap-3 sm:flex-row-reverse sm:items-center">
            <button
              type="button"
              onClick={handlePay}
              disabled={!canPay}
              className="brand-focus inline-flex h-11 flex-1 items-center justify-center rounded-lg bg-[var(--color-brand-navy)] text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {payLabel}
            </button>
            <button
              type="button"
              onClick={backFromConfirm}
              className="brand-focus inline-flex h-11 items-center justify-center rounded-lg border border-[var(--color-brand-border)] px-4 text-sm font-semibold text-[var(--color-brand-ink)] transition-colors hover:bg-[var(--color-brand-surface)]"
            >
              Back
            </button>
          </div>
        ) : undefined
      }
    >
      {showingFlow ? (
        <CheckoutFlowStatus
          state={state}
          onRetry={() => reset()}
          onGoToDashboard={() => {
            handleClose();
            router.push("/dashboard/settings/billing");
            refresh();
          }}
        />
      ) : step === "billing" ? (
        <BillingDetailsForm
          studioAddress={company?.address}
          studioName={company?.name}
          gmbSkipped={company?.gmb_skipped}
          submitLabel="Save & continue"
          onSaved={handleBillingSaved}
          onCancel={() => setStep("choose")}
        />
      ) : step === "confirm" && selection ? (
        <div className="flex flex-col gap-5">
          {previewError && (
            <p className="rounded-lg border border-[var(--color-brand-danger)]/30 bg-[var(--color-brand-danger-soft)] px-4 py-3 text-sm text-[var(--color-brand-danger)]">
              {previewError}
            </p>
          )}
          <CheckoutSummary
            title={planLabel(selection.plan)}
            subtitle={isEvent ? `${selection.quantity} event${selection.quantity === 1 ? "" : "s"}` : undefined}
            lines={[{ label: grossLineLabel, amount: displayGross }]}
            discountAmount={displayDiscount}
            taxableValue={hasPreview ? preview.taxable_value : null}
            taxLines={hasPreview ? preview.tax_lines : null}
            prorationCredit={prorationCredit}
            total={isScheduled ? null : displayTotal}
            totalIsEstimate={!!proration}
            totalPendingLabel={totalPendingLabel}
            prorationDetail={
              proration
                ? `Prorated for the remaining ${Math.round(proration.remaining_fraction * 100)}% of your current cycle.`
                : undefined
            }
            note={
              selection.mode === "storage"
                ? "Storage plans can be changed or cancelled anytime, but can't be switched back to pay-per-event."
                : "One-time payment. Each event stays live for 3 months from the day you create it."
            }
          />
          <CouponField
            serviceId={selection.plan._id}
            quantity={isEvent ? selection.quantity : undefined}
            onChange={setAppliedCoupon}
          />
        </div>
      ) : loadFailed ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <IconWarningCircle className="h-6 w-6 text-[var(--color-brand-danger)]" />
          <p className="text-sm text-[var(--color-brand-muted)]">
            Couldn&apos;t load pricing. Check your connection and try again.
          </p>
          <button
            type="button"
            onClick={onRetryLoad}
            className="brand-focus inline-flex h-10 items-center justify-center rounded-lg border border-[var(--color-brand-border)] px-4 text-sm font-semibold text-[var(--color-brand-ink)] transition-colors hover:bg-[var(--color-brand-surface)]"
          >
            Retry
          </button>
        </div>
      ) : !loaded ? (
        // Never mount PlanChooser against an empty catalog — see the `loaded`
        // prop doc above. This is what actually fixes the modal opening
        // straight on the storage slider on a cold first click.
        <div className="flex flex-col items-center justify-center gap-3 py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[var(--color-brand-border)] border-t-[var(--color-brand-navy)]" />
          <p className="text-sm text-[var(--color-brand-muted)]">Loading plans…</p>
        </div>
      ) : (
        <PlanChooser
          plans={plans}
          currentSnapshot={snapshot}
          initialMode={preset}
          onContinue={handleSelection}
          variant="cards"
        />
      )}
    </Modal>
  );
}
