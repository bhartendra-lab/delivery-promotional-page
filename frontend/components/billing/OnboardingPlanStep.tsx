"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  clearCompany,
  clearToken,
  isAuthenticated,
  needsOnboarding,
  needsPlan,
  setCompany,
  PLAN_STEP_PATH,
} from "@/lib/auth";
import { useCompany } from "@/lib/useCompany";
import { getCompanyDetails } from "@/lib/api";
import {
  ApiError,
  getApiErrorCode,
  getBillingPlans,
  getBillingProfile,
  getSubscription,
  previewCheckout,
} from "@/lib/billing";
import type { CheckoutPreview, SubscriptionSnapshot } from "@/lib/billing-types";
import { formatInr, planLabel } from "@/lib/plans";
import type { Plan } from "@/lib/plans";
import { PlanChooser, type PlanChooserSelection } from "@/components/billing/PlanChooser";
import { CouponField, type AppliedCoupon } from "@/components/billing/CouponField";
import { CheckoutSummary } from "@/components/billing/CheckoutSummary";
import { CheckoutFlowStatus } from "@/components/billing/CheckoutFlowStatus";
import { BillingDetailsForm } from "@/components/billing/BillingDetailsForm";
import { StorageClearConfirm } from "@/components/billing/StorageClearConfirm";
import { useCheckoutFlow } from "@/components/billing/useCheckoutFlow";

/** Same support line the dashboard's top bar links to. */
const SUPPORT_WHATSAPP_URL = "https://wa.me/917581072329";

type Step = "choose" | "billing" | "confirm";
type Gate =
  | { status: "checking" }
  | { status: "ready" }
  /** A team member without billing access: only the studio's admin can pay. */
  | { status: "no_access" }
  | { status: "error"; message: string };

/**
 * The compulsory last step of onboarding (/checkout?onboarding=1): a studio
 * that has finished its details, WhatsApp code and Google Business step must
 * buy events or a storage plan before the dashboard opens.
 *
 * Not a second purchase flow. It is the same chooser, billing form, summary,
 * coupon field and useCheckoutFlow the upgrade modal runs, laid out as a page
 * with no way around it: the only exits are paying, logging out, and asking
 * for help on WhatsApp.
 *
 * Whether the studio belongs here is decided from a FRESH company, never the
 * cached one. A studio that paid on another device, or whose payment landed
 * after it left, must be let through rather than asked to pay again.
 */
export function OnboardingPlanStep() {
  const router = useRouter();
  const company = useCompany();
  const [gate, setGate] = useState<Gate>({ status: "checking" });
  const [plans, setPlans] = useState<Plan[]>([]);
  const [snapshot, setSnapshot] = useState<SubscriptionSnapshot | null>(null);
  const [billingComplete, setBillingComplete] = useState<boolean | null>(null);

  const [step, setStep] = useState<Step>("choose");
  const [selection, setSelection] = useState<PlanChooserSelection | null>(null);
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [preview, setPreview] = useState<CheckoutPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [confirmStorageClear, setConfirmStorageClear] = useState(false);
  /** Paid, but the plan had not shown up yet when the studio asked for the dashboard. */
  const [activationPending, setActivationPending] = useState(false);
  const { state, runCheckout, reset } = useCheckoutFlow();

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace(`/login?next=${encodeURIComponent(PLAN_STEP_PATH)}`);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { company: fresh } = await getCompanyDetails();
        if (cancelled) return;
        setCompany(fresh);
        if (needsOnboarding(fresh)) {
          router.replace("/onboarding");
          return;
        }
        if (!needsPlan(fresh)) {
          router.replace("/dashboard");
          return;
        }
        const [plansRes, sub, profile] = await Promise.all([
          getBillingPlans(),
          getSubscription().catch((err) => {
            if (err instanceof ApiError && err.status === 404) return null;
            throw err;
          }),
          getBillingProfile().catch(() => null),
        ]);
        if (cancelled) return;
        setPlans(plansRes.plans);
        setSnapshot(sub);
        setBillingComplete(profile ? Boolean(profile.billing.place_of_supply_state) : null);
        setGate({ status: "ready" });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 403) {
          setGate({ status: "no_access" });
          return;
        }
        setGate({
          status: "error",
          message: err instanceof Error ? err.message : "Something went wrong loading your plan options.",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // The real total (tax, coupon, any first-purchase bonus), computed by the
  // server against the studio's billing profile.
  useEffect(() => {
    if (!selection || step !== "confirm") return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- marks the fetch below as in flight; guarded by `cancelled` on completion
    setPreviewLoading(true);
    setPreviewError(null);
    previewCheckout({
      service_id: selection.plan._id,
      quantity: selection.mode === "event" ? selection.quantity : undefined,
      coupon_code: appliedCoupon?.code,
    })
      .then((res) => {
        if (!cancelled) setPreview(res);
      })
      .catch((err) => {
        if (cancelled) return;
        setPreview(null);
        if (getApiErrorCode(err) === "BILLING_PROFILE_INCOMPLETE") {
          setBillingComplete(false);
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

  function handleSelection(sel: PlanChooserSelection) {
    setSelection(sel);
    setPreview(null);
    setConfirmStorageClear(false);
    setStep(billingComplete === false ? "billing" : "confirm");
  }

  function handlePay() {
    if (!selection) return;
    runCheckout({
      serviceId: selection.plan._id,
      quantity: selection.mode === "event" ? selection.quantity : undefined,
      couponCode: appliedCoupon?.code,
      purpose: selection.mode === "event" ? "event_topup" : "subscription",
      description:
        selection.mode === "event"
          ? `${selection.quantity} event${selection.quantity === 1 ? "" : "s"}`
          : planLabel(selection.plan),
      before: snapshot,
      // Only read by the "payment wasn't completed" screen, which this step
      // replaces with its own wording (hideDashboardExit).
      currentPlanName: "",
      prefill: company
        ? { name: company.name, email: company.business_email, contact: company.whatsapp_number }
        : undefined,
      onCouponRejected: () => setAppliedCoupon(null),
      confirmStorageClear,
    });
  }

  /**
   * The cached company still says "plan required" at this point, and the
   * dashboard gate reads the cache, so it is refreshed BEFORE navigating or the
   * studio would be sent straight back here.
   */
  async function openDashboard() {
    try {
      const { company: fresh } = await getCompanyDetails();
      setCompany(fresh);
      if (needsPlan(fresh)) {
        // Razorpay has the money but the webhook has not granted the plan yet.
        setActivationPending(true);
        return;
      }
    } catch {
      /* Fall through: the dashboard gate re-checks against the server. */
    }
    router.replace("/dashboard");
  }

  function logOut() {
    clearToken();
    clearCompany();
    router.replace("/login");
  }

  if (gate.status === "checking") {
    return (
      <Shell>
        <div className="skeleton h-64 w-full rounded-xl" />
      </Shell>
    );
  }

  if (gate.status === "error" || gate.status === "no_access") {
    return (
      <Shell onLogOut={logOut}>
        <div className="flex flex-col items-center gap-3 rounded-xl border border-[var(--color-brand-border)] bg-[var(--color-brand-surface-raised)] p-7 text-center">
          {gate.status === "no_access" ? (
            <p className="text-sm text-[var(--color-brand-ink)]">
              Your studio has not chosen a plan yet. Ask your studio admin to sign in and choose one, and the
              dashboard will open for everyone.
            </p>
          ) : (
            <>
              <p className="text-sm text-[var(--color-brand-danger)]">{gate.message}</p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="brand-focus inline-flex h-10 items-center justify-center rounded-lg border border-[var(--color-brand-border)] px-4 text-sm font-semibold text-[var(--color-brand-ink)]"
              >
                Retry
              </button>
            </>
          )}
        </div>
      </Shell>
    );
  }

  const isEvent = selection?.mode === "event";
  const eventUnitPrice = isEvent ? selection.plan.event_unit_price ?? 0 : 0;
  const isScheduled = preview?.mode === "scheduled";
  const hasPreview = !!preview && !isScheduled;
  const displayTotal = hasPreview ? preview.total : null;
  const displayGross = hasPreview
    ? preview.gross_amount
    : isEvent
      ? selection.quantity * eventUnitPrice
      : (selection?.plan.price ?? 0);
  const storageWarning = hasPreview ? preview.storage_data_warning ?? null : null;
  const isFullyCouponed = hasPreview && !preview.requires_payment;
  const canPay = !previewLoading && displayTotal !== null && (!storageWarning || confirmStorageClear);
  const payLabel =
    state.phase === "processing"
      ? isFullyCouponed
        ? "Activating…"
        : "Opening payment…"
      : isFullyCouponed
        ? "Activate plan"
        : displayTotal !== null
          ? `Pay ${formatInr(displayTotal, { paise: true })}`
          : previewLoading
            ? "Calculating…"
            : "Calculated at payment";

  const showingFlow = state.phase !== "idle" && state.phase !== "processing";

  return (
    <Shell onLogOut={logOut}>
      <div className="rounded-xl border border-[var(--color-brand-border)] bg-[var(--color-brand-surface-raised)] p-6 shadow-[0_4px_12px_rgba(42,34,24,0.08)] sm:p-8">
        {showingFlow ? (
          <>
            {activationPending && (
              <p className="mb-4 rounded-lg border border-[var(--color-brand-warning)]/30 bg-[var(--color-brand-warning-soft)] px-4 py-3 text-sm text-[var(--color-brand-warning)]">
                Your payment is still being confirmed. This usually takes a minute. Please check again shortly.
              </p>
            )}
            <CheckoutFlowStatus
              state={state}
              onRetry={() => {
                setActivationPending(false);
                reset();
              }}
              onGoToDashboard={() => void openDashboard()}
              hideDashboardExit
            />
          </>
        ) : step === "billing" ? (
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-base font-bold text-[var(--color-brand-ink)]">Billing details</h2>
              <p className="mt-1 text-sm text-[var(--color-brand-muted)]">
                Needed on your invoice, and to work out GST correctly.
              </p>
            </div>
            <BillingDetailsForm
              studioAddress={company?.address}
              studioName={company?.name}
              gmbSkipped={company?.gmb_skipped}
              submitLabel="Save & continue"
              onSaved={() => {
                setBillingComplete(true);
                setStep("confirm");
              }}
              onCancel={() => setStep("choose")}
            />
          </div>
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
              lines={[
                {
                  label: isEvent ? `${selection.quantity} × ${formatInr(eventUnitPrice)}` : "Plan price",
                  amount: displayGross,
                },
              ]}
              discountAmount={hasPreview ? preview.discount_amount : appliedCoupon?.discountAmount}
              bonusEvents={hasPreview ? preview.bonus_events : null}
              taxableValue={hasPreview ? preview.taxable_value : null}
              taxLines={hasPreview ? preview.tax_lines : null}
              total={displayTotal}
              totalPendingLabel={previewLoading ? "Calculating…" : "Calculated at payment"}
              note={
                isEvent
                  ? "One-time payment. Each event stays live for 3 months from the day you create it."
                  : "Storage plans can be changed or cancelled anytime."
              }
            />
            <CouponField
              serviceId={selection.plan._id}
              quantity={isEvent ? selection.quantity : undefined}
              onChange={setAppliedCoupon}
            />
            {storageWarning && (
              <StorageClearConfirm
                warning={storageWarning}
                checked={confirmStorageClear}
                onChange={setConfirmStorageClear}
              />
            )}
            <div className="flex flex-col gap-3 sm:flex-row-reverse sm:items-center">
              <button
                type="button"
                onClick={handlePay}
                disabled={state.phase === "processing" || !canPay}
                className="brand-focus inline-flex h-11 items-center justify-center rounded-lg bg-[var(--color-brand-navy)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)] disabled:cursor-not-allowed disabled:opacity-60 sm:flex-1"
              >
                {payLabel}
              </button>
              <button
                type="button"
                onClick={() => setStep("choose")}
                disabled={state.phase === "processing"}
                className="brand-focus inline-flex h-11 items-center justify-center rounded-lg border border-[var(--color-brand-border)] px-4 text-sm font-semibold text-[var(--color-brand-ink)] transition-colors hover:bg-[var(--color-brand-hover)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Change plan
              </button>
            </div>
          </div>
        ) : (
          <PlanChooser
            plans={plans}
            currentSnapshot={snapshot}
            // Pay per event is the default; coming back from "Change plan" reopens
            // on whatever was chosen.
            initialMode={selection ? undefined : "event"}
            initialPlanId={selection?.plan._id}
            initialQuantity={selection?.mode === "event" ? selection.quantity : undefined}
            onContinue={handleSelection}
            continueLabel="Continue"
          />
        )}
      </div>
    </Shell>
  );
}

/**
 * The step's frame: logo, "Step 4 of 4", the heading, and the two exits that
 * are not paying. Deliberately no close button and no link to the dashboard.
 */
function Shell({ children, onLogOut }: { children: React.ReactNode; onLogOut?: () => void }) {
  return (
    <main className="flex min-h-screen flex-1 justify-center bg-[var(--color-brand-bg)] px-6 py-12">
      <div className="w-full max-w-xl dash-rise">
        <div className="mb-8 flex flex-col items-center gap-3">
          <img src="/vyavasth-full-logo.svg" alt="Vyavasth" height={80} />
        </div>

        <div className="mb-4">
          <p className="mb-1.5 text-xs text-[var(--color-brand-muted)]">Step 4 of 4</p>
          <div
            role="progressbar"
            aria-valuenow={4}
            aria-valuemin={1}
            aria-valuemax={4}
            aria-label="Studio setup progress"
            className="flex gap-1.5"
          >
            {[1, 2, 3, 4].map((n) => (
              <span key={n} className="h-1 flex-1 rounded-full bg-[var(--color-brand-navy)]" />
            ))}
          </div>
        </div>

        <h1 className="text-2xl font-bold text-[var(--color-brand-ink)]">Choose how you want to pay</h1>
        <p className="mb-6 mt-1.5 text-sm text-[var(--color-brand-muted)]">
          Pick one to open your dashboard. You can switch to a storage plan later.
        </p>

        {children}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm">
          <a
            href={SUPPORT_WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="brand-focus rounded-sm font-medium text-[var(--color-brand-navy)] underline underline-offset-2 hover:text-[var(--color-brand-navy-deep)]"
          >
            Chat with us on WhatsApp
          </a>
          {onLogOut && (
            <button
              type="button"
              onClick={onLogOut}
              className="brand-focus rounded-sm font-medium text-[var(--color-brand-muted)] hover:text-[var(--color-brand-ink)]"
            >
              Log out
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
