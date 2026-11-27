"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { Plan } from "@/lib/plans";
import { formatInr, planLabel } from "@/lib/plans";
import { previewCheckout, getApiErrorCode } from "@/lib/billing";
import type { CheckoutPreview, SubscriptionSnapshot } from "@/lib/billing-types";
import { summaryRowsOf } from "@/lib/checkout-summary";
import { useCompany } from "@/lib/useCompany";
import { PlanChooser, type Mode, type PlanChooserSelection } from "@/components/billing/PlanChooser";
import { CouponField, type AppliedCoupon } from "@/components/billing/CouponField";
import { CheckoutSummary } from "@/components/billing/CheckoutSummary";
import { CheckoutBillingFields, type BillingFieldsStatus } from "@/components/billing/CheckoutBillingFields";
import { StorageClearConfirm } from "@/components/billing/StorageClearConfirm";
import { IconGift, IconLock, IconSparkle, IconWarningCircle } from "@/components/ui/icons";

/** What the parent needs to run the payment (useCheckoutFlow). */
export type CheckoutPayRequest = {
  selection: PlanChooserSelection;
  /** The total the studio saw, or null for a change scheduled at renewal. */
  total: number | null;
  couponCode?: string;
  confirmStorageClear: boolean;
  /** Call when checkout itself refuses the coupon. */
  onCouponRejected: () => void;
};

/** How long the plan picker has to sit still before the total is fetched again (quantity steppers fire fast). */
const PREVIEW_DEBOUNCE_MS = 250;

/**
 * The whole purchase on one screen: what to buy on the left (pay per event or
 * a storage plan, and how much), and the order on the right: what it costs
 * with the coupon and taxes, the coupon box, the state and an optional GSTIN,
 * and the one button that pays or, for a free total, activates.
 *
 * The total always comes from the server (POST /billing/checkout/preview),
 * against the billing state saved by CheckoutBillingFields. The parent runs
 * the payment and shows its progress; this panel never moves money itself.
 */
export function CheckoutPanel({
  plans,
  snapshot,
  initialMode,
  initialPlanId,
  initialQuantity,
  initialCouponCode,
  paying,
  onPay,
}: {
  plans: Plan[];
  snapshot: SubscriptionSnapshot | null;
  initialMode?: Mode;
  initialPlanId?: string | null;
  initialQuantity?: number;
  /** Applied once the plan is known (CouponField's initialCode). */
  initialCouponCode?: string | null;
  /** The payment is being opened (useCheckoutFlow's "processing"). */
  paying: boolean;
  onPay: (request: CheckoutPayRequest) => void;
}) {
  const company = useCompany();
  const [selection, setSelection] = useState<PlanChooserSelection | null>(null);
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [billing, setBilling] = useState<{ status: BillingFieldsStatus; version: number }>({ status: "loading", version: 0 });
  const [preview, setPreview] = useState<CheckoutPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [confirmStorageClear, setConfirmStorageClear] = useState(false);

  const billingReady = billing.status === "ready";
  const selectionKey = selection
    ? `${selection.plan._id}:${selection.mode === "event" ? selection.quantity : "s"}`
    : null;

  // A different purchase is a different question about deleting a lapsed plan's galleries.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets a per-purchase confirmation when the purchase changes
    setConfirmStorageClear(false);
  }, [selectionKey]);

  useEffect(() => {
    if (!selection || !billingReady) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- nothing to price yet: drop a stale total
      setPreview(null);
      setPreviewLoading(false);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(null);
    const timer = setTimeout(() => {
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
            setBilling((b) => ({ ...b, status: "needs_state" }));
          } else {
            setPreviewError(err instanceof Error ? err.message : "Couldn't calculate your total.");
          }
        })
        .finally(() => {
          if (!cancelled) setPreviewLoading(false);
        });
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // selectionKey stands for the selection; billing.version moves on with every saved state or GSTIN.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey, appliedCoupon?.code, billingReady, billing.version]);

  const isEvent = selection?.mode === "event";
  const eventUnitPrice = isEvent ? selection.plan.event_unit_price ?? 0 : 0;
  const isScheduled = preview?.mode === "scheduled";
  const priced = preview && preview.mode !== "scheduled" ? preview : null;
  const rows = priced ? summaryRowsOf(priced) : null;
  const total = priced ? priced.total : null;
  const proration = priced?.proration ?? null;
  const storageWarning = priced?.storage_data_warning ?? null;
  const isFullyCouponed = !!priced && !priced.requires_payment;
  /** A ₹0 total (a free first event): the one button gets the exclusive offer's gold, so it is the obvious next step. */
  const celebrate = isFullyCouponed && !previewLoading;

  const listPrice = isEvent ? selection.quantity * eventUnitPrice : (selection?.plan.price ?? 0);
  const lineLabel = isEvent
    ? `${selection.quantity} event${selection.quantity === 1 ? "" : "s"} × ${formatInr(eventUnitPrice)}`
    : proration
      ? "Prorated charge"
      : selection
        ? planLabel(selection.plan)
        : "";
  const prorationCredit =
    proration?.mode === "interval_upgrade" && rows?.unusedCredit ? { label: "Unused plan credit", amount: rows.unusedCredit } : null;

  const waitingForState = billing.status === "needs_state" || (billing.status === "error" && !priced);
  const pendingLabel = waitingForState
    ? "Choose your state"
    : billing.status === "loading" || billing.status === "saving" || previewLoading
      ? "Calculating…"
      : isScheduled
        ? "No charge now"
        : "—";

  const canPay =
    !!selection &&
    billingReady &&
    !previewLoading &&
    !paying &&
    (isScheduled || total !== null) &&
    (!storageWarning || confirmStorageClear);
  const payLabel = paying
    ? isFullyCouponed
      ? "Activating…"
      : "Opening payment…"
    : isScheduled
      ? "Schedule change"
      : isFullyCouponed
        ? "Activate plan"
        : total !== null && !previewLoading
          ? `Pay ${formatInr(total, { paise: true })}`
          : waitingForState
            ? "Choose your state to continue"
            : "Calculating…";

  function pay() {
    if (!selection || !canPay) return;
    onPay({
      selection,
      total,
      couponCode: appliedCoupon?.code,
      confirmStorageClear,
      onCouponRejected: () => setAppliedCoupon(null),
    });
  }

  const note: ReactNode = !selection
    ? null
    : isEvent
      ? "One time payment. Each event stays live for 3 months from the day you create it."
      : "Storage plans can be changed or cancelled any time.";

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] lg:gap-8">
      <section aria-label="Choose what to buy" className="min-w-0">
        <PlanChooser
          plans={plans}
          currentSnapshot={snapshot}
          initialMode={initialMode}
          initialPlanId={initialPlanId}
          initialQuantity={initialQuantity}
          variant="live"
          onSelectionChange={setSelection}
        />
      </section>

      <aside
        aria-label="Your order"
        className="flex flex-col gap-5 rounded-2xl border border-[var(--color-brand-border)] bg-[var(--color-brand-surface-raised)] p-5 shadow-[0_10px_30px_rgba(42,34,24,0.08)] sm:p-6 lg:sticky lg:top-6"
      >
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-base font-bold text-[var(--color-brand-ink)]">Your order</h2>
          {selection && (
            <span className="truncate text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-brand-navy)]">
              {planLabel(selection.plan)}
            </span>
          )}
        </div>

        {!selection ? (
          <p className="rounded-lg bg-[var(--color-brand-bg)] px-4 py-3 text-sm text-[var(--color-brand-muted)]">
            This is your current plan. Pick another one to see the price.
          </p>
        ) : (
          <>
            {previewError && (
              <p className="flex items-start gap-2 rounded-lg border border-[var(--color-brand-danger)]/30 bg-[var(--color-brand-danger-soft)] px-3 py-2.5 text-sm text-[var(--color-brand-danger)]">
                <IconWarningCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {previewError}
              </p>
            )}
            {isScheduled && preview?.mode === "scheduled" && (
              <p className="rounded-lg bg-[var(--color-brand-bg)] px-3 py-2.5 text-sm text-[var(--color-brand-muted)]">{preview.message}</p>
            )}
            <div className={`transition-opacity duration-200 ${previewLoading ? "opacity-60" : ""}`}>
              <CheckoutSummary
                bare
                lines={[{ label: lineLabel, amount: rows ? rows.lineAmount : listPrice }]}
                discountAmount={rows ? rows.discountAmount : appliedCoupon?.discountAmount}
                bonusEvents={priced ? priced.bonus_events : null}
                couponCode={priced ? priced.coupon?.code : null}
                nextBonusTier={priced ? priced.next_bonus_tier : null}
                taxableValue={priced ? priced.taxable_value : null}
                taxLines={priced ? priced.tax_lines : null}
                gstInclusive={rows ? rows.gstInclusive : true}
                prorationCredit={prorationCredit}
                total={isScheduled ? null : total}
                totalIsEstimate={!!proration}
                totalPendingLabel={pendingLabel}
                taxPendingLabel={waitingForState ? "Choose your state" : pendingLabel === "—" ? undefined : pendingLabel}
                prorationDetail={
                  proration
                    ? `Prorated for the remaining ${Math.round(proration.remaining_fraction * 100)}% of your current cycle.`
                    : undefined
                }
              />
            </div>

            <div className="flex flex-col gap-2 border-t border-[var(--color-brand-border)] pt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-brand-muted)]">Coupon</p>
              <CouponField
                serviceId={selection.plan._id}
                quantity={isEvent ? selection.quantity : undefined}
                onChange={setAppliedCoupon}
                initialCode={initialCouponCode}
              />
            </div>
          </>
        )}

        <div className="flex flex-col gap-2 border-t border-[var(--color-brand-border)] pt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-brand-muted)]">Billing</p>
          <CheckoutBillingFields
            studioName={company?.name}
            city={company?.city}
            address={company?.address}
            onStatus={(status, version) => setBilling({ status, version })}
          />
        </div>

        {storageWarning && (
          <StorageClearConfirm warning={storageWarning} checked={confirmStorageClear} onChange={setConfirmStorageClear} />
        )}

        {selection && (
          <div className="flex flex-col gap-2.5">
            {celebrate && (
              <p className="flex items-center justify-center gap-1.5 text-sm font-semibold text-[var(--color-brand-ink)]" aria-live="polite">
                <IconGift size={15} className="text-[var(--color-brand-navy)]" />
                Nothing to pay. It&apos;s on us.
              </p>
            )}
            <div className={`rounded-xl ${celebrate && canPay ? "exclusive-pulse" : ""}`}>
              <button
                type="button"
                onClick={pay}
                disabled={!canPay}
                className={
                  celebrate
                    ? "exclusive-seal cta-shine brand-focus inline-flex h-14 w-full items-center justify-center gap-2 rounded-xl px-4 text-base font-bold tracking-wide text-[var(--color-brand-ink)] transition-transform hover:-translate-y-px active:translate-y-0 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
                    : "brand-focus inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-brand-navy)] px-4 text-[15px] font-semibold text-white shadow-[0_6px_16px_rgba(42,34,24,0.16)] transition-[background-color,transform] hover:bg-[var(--color-brand-navy-deep)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
                }
              >
                {celebrate ? (
                  <span className="exclusive-twinkle" aria-hidden>
                    <IconSparkle size={18} />
                  </span>
                ) : (
                  !isScheduled && total !== null && <IconLock size={15} />
                )}
                {payLabel}
              </button>
            </div>
            <p className="text-center text-xs leading-relaxed text-[var(--color-brand-muted)]">
              {!isScheduled && !isFullyCouponed ? "Secure payment by Razorpay. " : ""}
              {note}
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}
