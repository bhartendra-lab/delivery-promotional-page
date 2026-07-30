"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { getBillingPlans, previewCheckout, getApiErrorCode } from "@/lib/billing";
import type { PlansResponse, CheckoutPreview } from "@/lib/billing-types";
import type { SubscriptionSnapshot } from "@/lib/billing-types";
import { getSubscription, ApiError } from "@/lib/billing";
import { eventPlanOf, formatInr, planLabel } from "@/lib/plans";
import type { Plan } from "@/lib/plans";
import { PlanChooser, type PlanChooserSelection } from "@/components/billing/PlanChooser";
import { CouponField, type AppliedCoupon } from "@/components/billing/CouponField";
import { CheckoutSummary } from "@/components/billing/CheckoutSummary";
import { CheckoutFlowStatus } from "@/components/billing/CheckoutFlowStatus";
import { useCheckoutFlow } from "@/components/billing/useCheckoutFlow";

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

export default function CheckoutPage() {
  return (
    <Suspense fallback={<CheckoutFallback />}>
      <CheckoutShell />
    </Suspense>
  );
}

function CheckoutFallback() {
  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-[var(--color-brand-bg)]">
      <p className="text-sm text-[var(--color-brand-muted)]">Loading…</p>
    </main>
  );
}

function CheckoutShell() {
  const router = useRouter();
  const search = useSearchParams();

  const rawPlan = search.get("plan");
  const planId = rawPlan && OBJECT_ID_RE.test(rawPlan) ? rawPlan : null;
  const qtyParam = search.get("qty");
  const qty = qtyParam ? Math.min(100, Math.max(1, Math.round(Number(qtyParam)) || 1)) : 1;
  const couponParam = search.get("coupon");

  const [authChecked, setAuthChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [plansData, setPlansData] = useState<PlansResponse | null>(null);
  const [snapshot, setSnapshot] = useState<SubscriptionSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [selection, setSelection] = useState<PlanChooserSelection | null>(null);
  const autoOpened = useRef(false);

  const [preview, setPreview] = useState<CheckoutPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [billingProfileIncomplete, setBillingProfileIncomplete] = useState(false);

  const { state, runCheckout, reset } = useCheckoutFlow();

  useEffect(() => {
    if (!isAuthenticated()) {
      const next = `/checkout${window.location.search}`;
      router.replace(`/login?next=${encodeURIComponent(next)}`);
      return;
    }
    setAuthChecked(true);
  }, [router]);

  useEffect(() => {
    if (!authChecked) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getBillingPlans(),
      getSubscription().catch((err) => {
        if (err instanceof ApiError && (err.status === 404 || err.status === 403)) return null;
        throw err;
      }),
    ])
      .then(([plans, sub]) => {
        if (cancelled) return;
        setPlansData(plans);
        setSnapshot(sub);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Something went wrong loading your plan.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authChecked]);

  const plans = useMemo(() => plansData?.plans ?? [], [plansData]);
  const targetPlan = useMemo<Plan | null>(() => {
    if (!planId) return null;
    return plans.find((p) => p._id === planId) ?? null;
  }, [plans, planId]);

  // Pre-flight guards (UX only — the server enforces all of these too).
  const guardMessage = useMemo(() => {
    if (!targetPlan) return null;
    if (targetPlan.service_type === "Free") return "The Free plan can't be purchased directly.";
    if (
      snapshot?.service &&
      ["Monthly", "Yearly"].includes(snapshot.service.service_type) &&
      targetPlan.service_type === "Event-based"
    ) {
      return "Cannot switch from a storage plan to pay-per-event. Choose a storage tier instead.";
    }
    if (snapshot?.service && snapshot.service._id === targetPlan._id) {
      return "You're already on this plan.";
    }
    return null;
  }, [targetPlan, snapshot]);

  const effectiveSelection: PlanChooserSelection | null = useMemo(() => {
    if (selection) return selection;
    if (!targetPlan || guardMessage) return null;
    if (targetPlan.service_type === "Event-based") {
      return { mode: "event", plan: targetPlan, quantity: qty };
    }
    return { mode: "storage", plan: targetPlan, isDowngrade: false };
  }, [selection, targetPlan, guardMessage, qty]);

  const currentPlanName = snapshot?.service?.name || snapshot?.service?.service_type || "your current plan";

  useEffect(() => {
    if (
      !autoOpened.current &&
      effectiveSelection &&
      state.phase === "idle" &&
      !guardMessage &&
      targetPlan
    ) {
      autoOpened.current = true;
      fireCheckout(effectiveSelection);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveSelection, guardMessage, targetPlan]);

  // Real tax + proration breakdown, computed server-side against the
  // company's own billing profile — replaces the client-guessed gross/total
  // below (which is wrong for a tier upgrade: it shows the full new-plan
  // price, not the true prorated charge).
  useEffect(() => {
    if (!effectiveSelection || guardMessage) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(null);
    setBillingProfileIncomplete(false);
    previewCheckout({
      service_id: effectiveSelection.plan._id,
      quantity: effectiveSelection.mode === "event" ? effectiveSelection.quantity : undefined,
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
          setBillingProfileIncomplete(true);
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
  }, [effectiveSelection, guardMessage, appliedCoupon?.code]);

  function fireCheckout(sel: PlanChooserSelection) {
    const description =
      sel.mode === "event" ? `${sel.quantity} event${sel.quantity === 1 ? "" : "s"}` : planLabel(sel.plan);
    runCheckout({
      serviceId: sel.plan._id,
      quantity: sel.mode === "event" ? sel.quantity : undefined,
      couponCode: appliedCoupon?.code,
      purpose: sel.mode === "event" ? "event_topup" : snapshot?.service ? "tier_upgrade" : "subscription",
      description,
      before: snapshot,
      currentPlanName,
      onCouponRejected: () => setAppliedCoupon(null),
    });
  }

  if (!authChecked || loading) {
    return (
      <main className="flex min-h-screen flex-1 items-center justify-center bg-[var(--color-brand-bg)]">
        <div className="skeleton h-64 w-full max-w-lg rounded-xl" />
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="flex min-h-screen flex-1 flex-col items-center justify-center gap-3 bg-[var(--color-brand-bg)] px-6 text-center">
        <p className="text-sm text-[var(--color-brand-danger)]">{loadError}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="brand-focus inline-flex h-10 items-center justify-center rounded-lg border border-[var(--color-brand-border)] px-4 text-sm font-semibold text-[var(--color-brand-ink)]"
        >
          Retry
        </button>
      </main>
    );
  }

  // Missing/garbage `plan`, or the plan chooser hasn't produced a valid
  // selection yet — the user came here to buy something; give them the thing.
  if (!targetPlan || guardMessage) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-1 flex-col gap-6 bg-[var(--color-brand-bg)] px-6 py-16">
        <h1 className="text-2xl font-bold text-[var(--color-brand-ink)]">Choose a plan</h1>
        {guardMessage && (
          <p className="rounded-lg border border-[var(--color-brand-warning)]/30 bg-[var(--color-brand-warning-soft)] px-4 py-3 text-sm text-[var(--color-brand-warning)]">
            {guardMessage}{" "}
            <a href="/dashboard/settings/billing" className="brand-focus font-semibold underline">
              Go to billing settings
            </a>
          </p>
        )}
        <PlanChooser
          plans={plans}
          currentSnapshot={snapshot}
          onContinue={(sel) => {
            setSelection(sel);
            autoOpened.current = false;
          }}
        />
      </main>
    );
  }

  if (state.phase !== "idle" && state.phase !== "processing") {
    return (
      <main className="flex min-h-screen flex-1 items-center justify-center bg-[var(--color-brand-bg)] px-6">
        <div className="w-full max-w-lg">
          <CheckoutFlowStatus
            state={state}
            onRetry={() => {
              reset();
              autoOpened.current = false;
            }}
            onGoToDashboard={() => router.replace("/dashboard/settings/billing")}
          />
        </div>
      </main>
    );
  }

  const eventPlan = eventPlanOf(plans);
  const isEvent = effectiveSelection?.mode === "event";
  const grossAmount = isEvent
    ? qty * (eventPlan?.event_unit_price ?? 0)
    : (effectiveSelection?.plan.price ?? 0);

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
  const grossLineLabel = isEvent
    ? `${qty} × ${formatInr(eventPlan?.event_unit_price ?? 0)}`
    : proration
      ? "Prorated charge"
      : "Plan price";
  const totalPendingLabel = billingProfileIncomplete
    ? "Add billing details to continue"
    : previewLoading
      ? "Calculating…"
      : isScheduled
        ? "No charge now"
        : "Calculated at payment";

  const canPay = !previewLoading && !billingProfileIncomplete && (isScheduled || displayTotal !== null);
  const payLabel =
    state.phase === "processing"
      ? "Opening payment…"
      : isScheduled
        ? "Schedule change"
        : displayTotal !== null
          ? `Pay ${formatInr(displayTotal, { paise: true })}`
          : totalPendingLabel;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-1 flex-col justify-center gap-6 bg-[var(--color-brand-bg)] px-6 py-16">
      <h1 className="text-2xl font-bold text-[var(--color-brand-ink)]">Confirm your purchase</h1>

      {billingProfileIncomplete && (
        <p className="rounded-lg border border-[var(--color-brand-warning)]/30 bg-[var(--color-brand-warning-soft)] px-4 py-3 text-sm text-[var(--color-brand-warning)]">
          Add your billing address before you can check out — it&apos;s what decides whether GST is charged as
          CGST+SGST or IGST on your invoice.{" "}
          <a href="/dashboard/settings/billing#billing-details" className="brand-focus font-semibold underline">
            Add billing details
          </a>
        </p>
      )}
      {previewError && !billingProfileIncomplete && (
        <p className="rounded-lg border border-[var(--color-brand-danger)]/30 bg-[var(--color-brand-danger-soft)] px-4 py-3 text-sm text-[var(--color-brand-danger)]">
          {previewError}
        </p>
      )}

      <CheckoutSummary
        title={effectiveSelection ? planLabel(effectiveSelection.plan) : ""}
        subtitle={isEvent ? `${qty} event${qty === 1 ? "" : "s"}` : undefined}
        lines={[{ label: grossLineLabel, amount: displayGross }]}
        discountAmount={displayDiscount}
        taxableValue={hasPreview ? preview.taxable_value : null}
        taxLines={hasPreview ? preview.tax_lines : null}
        prorationCredit={prorationCredit}
        total={isScheduled ? null : displayTotal}
        totalIsEstimate={!!proration}
        totalPendingLabel={totalPendingLabel}
        prorationDetail={
          proration ? `Prorated for the remaining ${Math.round(proration.remaining_fraction * 100)}% of your current cycle.` : undefined
        }
        note="One-time payment. Each event stays live for 3 months from the day you create it."
      />

      {effectiveSelection && (
        <CouponField
          serviceId={effectiveSelection.plan._id}
          quantity={isEvent ? qty : undefined}
          onChange={setAppliedCoupon}
          initialCode={couponParam}
        />
      )}

      <button
        type="button"
        disabled={state.phase === "processing" || !canPay}
        onClick={() => effectiveSelection && fireCheckout(effectiveSelection)}
        className="brand-focus inline-flex h-12 items-center justify-center rounded-lg bg-[var(--color-brand-navy)] text-base font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {payLabel}
      </button>
    </main>
  );
}
