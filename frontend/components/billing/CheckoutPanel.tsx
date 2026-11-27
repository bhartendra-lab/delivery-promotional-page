"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { Plan } from "@/lib/plans";
import { formatInr, formatListPrice, formatStorage, gstInclusiveOf, planLabel } from "@/lib/plans";
import { previewCheckout, getApiErrorCode } from "@/lib/billing";
import type { CheckoutPreview, SubscriptionSnapshot } from "@/lib/billing-types";
import { summaryRowsOf } from "@/lib/checkout-summary";
import { useCompany } from "@/lib/useCompany";
import { PlanChooser, type Mode, type PlanChooserSelection } from "@/components/billing/PlanChooser";
import { CouponField, type AppliedCoupon } from "@/components/billing/CouponField";
import { CheckoutSummary } from "@/components/billing/CheckoutSummary";
import { CheckoutBillingFields, type BillingFieldsStatus } from "@/components/billing/CheckoutBillingFields";
import { StorageClearConfirm } from "@/components/billing/StorageClearConfirm";
import { IconArchive, IconCalendar, IconCaretDown, IconLock, IconSparkle, IconWarningCircle } from "@/components/ui/icons";

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
  /** The chooser has reported at least once (a null before then is "not yet", not "nothing to buy"). */
  const [chooserReported, setChooserReported] = useState(false);
  /** Under lg the plan picker folds into one bar above the order; this opens it. */
  const [chooserOpen, setChooserOpen] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [billing, setBilling] = useState<{ status: BillingFieldsStatus; version: number }>({ status: "loading", version: 0 });
  const [preview, setPreview] = useState<CheckoutPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [confirmStorageClear, setConfirmStorageClear] = useState(false);
  /** Bumped when Pay is pressed with no state chosen: the State field turns red and takes focus. */
  const [stateNudge, setStateNudge] = useState(0);

  // The total is worked out with or without a state (18% GST either way; only
  // the CGST+SGST or IGST split waits for it). Only a save in flight holds it.
  const billingReady = billing.status === "ready";
  const billingSettled = billing.status !== "loading" && billing.status !== "saving";
  const selectionKey = selection
    ? `${selection.plan._id}:${selection.mode === "event" ? selection.quantity : "s"}`
    : null;

  // A different purchase is a different question about deleting a lapsed plan's galleries.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets a per-purchase confirmation when the purchase changes
    setConfirmStorageClear(false);
  }, [selectionKey]);

  useEffect(() => {
    if (!selection || !billingSettled) {
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
  }, [selectionKey, appliedCoupon?.code, billingSettled, billing.version]);

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

  const pendingLabel = !billingSettled || previewLoading ? "Calculating…" : isScheduled ? "No charge now" : "—";

  // Pressable before a state is chosen: pressing then asks for the state (see pay()).
  const canPay =
    !!selection &&
    billingSettled &&
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
        ? isEvent
          ? `Claim ${selection.quantity === 1 ? "your free event" : `${selection.quantity} free events`}`
          : "Activate plan"
        : total !== null && !previewLoading
          ? `Pay ${formatInr(total, { paise: true })}`
          : "Calculating…";

  function pay() {
    if (!selection || !canPay) return;
    // The one thing checkout cannot do without: the place of supply.
    if (!billingReady) {
      setStateNudge((n) => n + 1);
      return;
    }
    onPay({
      selection,
      total,
      couponCode: appliedCoupon?.code,
      confirmStorageClear,
      onCouponRejected: () => setAppliedCoupon(null),
    });
  }

  // Under the collapsed Total: what it is for, and what the coupon saved.
  const savings = rows ? rows.discountAmount : (appliedCoupon?.discountAmount ?? 0);
  const collapsedHint = selection
    ? [
        isEvent ? `${selection.quantity} event${selection.quantity === 1 ? "" : "s"}` : planLabel(selection.plan),
        savings > 0 ? `you save ${formatInr(savings, { paise: savings % 1 !== 0 })}` : null,
        priced?.tax_lines?.length ? (rows?.gstInclusive ? "taxes included" : "with taxes") : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : undefined;

  const note: ReactNode = !selection
    ? null
    : isEvent
      ? "One time payment. Each event stays live for 3 months from the day you create it."
      : "Storage plans can be changed or cancelled any time.";

  // Phones and tablets: the plan picker opens on its own only when there is
  // nothing to buy yet (a storage studio looking at its current tier).
  const showChooser = chooserOpen || (chooserReported && !selection);

  const payButton = selection && (
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
  );
  const securedBy = !isScheduled && !isFullyCouponed ? "Secure payment by Razorpay." : null;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] lg:gap-8">
      {/* Under lg: what is being bought, as one line. The offer and the total
          come first; the picker opens from here only when wanted. */}
      <SelectionBar
        selection={selection}
        pending={!chooserReported}
        open={showChooser}
        canClose={!!selection}
        onToggle={() => setChooserOpen((o) => !o)}
      />

      {/* Kept mounted while folded: it owns the selection. */}
      <section
        id="checkout-plan-chooser"
        aria-label="Choose what to buy"
        className={`min-w-0 lg:block ${showChooser ? "" : "hidden"}`}
      >
        <PlanChooser
          plans={plans}
          currentSnapshot={snapshot}
          initialMode={initialMode}
          initialPlanId={initialPlanId}
          initialQuantity={initialQuantity}
          variant="live"
          onSelectionChange={(next) => {
            setSelection(next);
            setChooserReported(true);
          }}
        />
        {selection && (
          <button
            type="button"
            onClick={() => setChooserOpen(false)}
            className="brand-focus mt-5 inline-flex h-11 w-full items-center justify-center rounded-xl border border-[var(--color-brand-navy)] text-sm font-semibold text-[var(--color-brand-navy)] transition-colors hover:bg-[var(--color-brand-navy-soft)] lg:hidden"
          >
            Done
          </button>
        )}
      </section>

      <aside
        aria-label="Your order"
        className="flex min-w-0 flex-col gap-5 lg:sticky lg:top-6 lg:rounded-2xl lg:border lg:border-[var(--color-brand-border)] lg:bg-[var(--color-brand-surface-raised)] lg:p-6 lg:shadow-[0_10px_30px_rgba(42,34,24,0.08)]"
      >
        <div className="hidden items-baseline justify-between gap-3 lg:flex">
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
            <div
              className={`transition-opacity duration-200 max-lg:rounded-2xl max-lg:border max-lg:border-[var(--color-brand-border)] max-lg:bg-[var(--color-brand-surface-raised)] max-lg:p-4 ${
                previewLoading ? "opacity-60" : ""
              }`}
            >
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
                taxPendingLabel={pendingLabel === "—" ? undefined : pendingLabel}
                collapsible
                collapsedHint={collapsedHint}
                prorationDetail={
                  proration
                    ? `Prorated for the remaining ${Math.round(proration.remaining_fraction * 100)}% of your current cycle.`
                    : undefined
                }
              />
            </div>
            {/* Under lg the offer leads: it is what a first-time studio came for. */}
            <div className="flex flex-col gap-2 max-lg:order-first lg:border-t lg:border-[var(--color-brand-border)] lg:pt-4">
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

        <div className="flex flex-col gap-2 lg:border-t lg:border-[var(--color-brand-border)] lg:pt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-brand-muted)]">Billing</p>
          <CheckoutBillingFields
            studioName={company?.name}
            city={company?.city}
            address={company?.address}
            onStatus={(status, version) => setBilling({ status, version })}
            nudge={stateNudge}
          />
        </div>

        {storageWarning && (
          <StorageClearConfirm warning={storageWarning} checked={confirmStorageClear} onChange={setConfirmStorageClear} />
        )}

        {selection && (
          <>
            {/* Under lg the note sits in the page, so the bar pinned to the
                bottom of the sheet holds the button and little else. */}
            <p className="text-xs leading-relaxed text-[var(--color-brand-muted)] lg:hidden">{note}</p>
            <div className="flex flex-col gap-2 max-lg:sticky max-lg:-bottom-5 max-lg:z-10 sm:max-lg:-bottom-6 max-lg:-mx-5 max-lg:-mb-5 max-lg:border-t max-lg:border-[var(--color-brand-border)] max-lg:bg-[var(--color-brand-surface-raised)] max-lg:px-5 max-lg:pt-3 max-lg:pb-[max(0.75rem,env(safe-area-inset-bottom))] max-lg:shadow-[0_-8px_24px_rgba(42,34,24,0.06)] sm:max-lg:-mx-7 sm:max-lg:-mb-6 sm:max-lg:px-7">
              {payButton}
              {securedBy && (
                <p className="flex items-center justify-center gap-1 text-center text-[11px] text-[var(--color-brand-muted)] lg:hidden">
                  <IconLock size={10} />
                  {securedBy}
                </p>
              )}
              <p className="hidden text-center text-xs leading-relaxed text-[var(--color-brand-muted)] lg:block">
                {securedBy ? `${securedBy} ` : ""}
                {note}
              </p>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

/**
 * Phones and tablets only: the purchase as one tappable line ("Pay per event ·
 * 1 event") that opens the full picker. On lg the picker is always shown in
 * its own column and this is not rendered.
 */
function SelectionBar({
  selection,
  pending,
  open,
  canClose,
  onToggle,
}: {
  selection: PlanChooserSelection | null;
  /** The picker has not reported yet: hold the space without guessing. */
  pending: boolean;
  open: boolean;
  /** False while nothing is selected: the picker has to stay open then. */
  canClose: boolean;
  onToggle: () => void;
}) {
  if (pending) {
    return <div aria-hidden className="h-[68px] animate-pulse rounded-2xl bg-[var(--color-brand-track)] lg:hidden" />;
  }

  let title = "Choose a plan";
  let detail = "Pick what to buy to see the price.";
  let icon = <IconCalendar size={18} />;
  if (selection?.mode === "event") {
    const { quantity, plan } = selection;
    title = "Pay per event";
    detail = `${quantity} event${quantity === 1 ? "" : "s"} · ${formatListPrice(plan.event_unit_price ?? 0, gstInclusiveOf(plan))} each`;
  } else if (selection?.mode === "storage") {
    const { plan } = selection;
    title = "Storage plan";
    icon = <IconArchive size={18} />;
    const per = plan.service_type === "Yearly" ? "yr" : "mo";
    detail = [
      typeof plan.storage_limit === "number" ? formatStorage(plan.storage_limit) : planLabel(plan),
      `${formatListPrice(plan.price ?? 0, gstInclusiveOf(plan))}/${per}`,
    ].join(" · ");
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={!canClose && open}
      aria-expanded={open}
      aria-controls="checkout-plan-chooser"
      className="brand-focus flex w-full items-center gap-3 rounded-2xl border border-[var(--color-brand-border)] bg-[var(--color-brand-surface-raised)] px-4 py-3.5 text-left transition-colors hover:border-[var(--color-brand-outline)] disabled:cursor-default lg:hidden"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-brand-navy-soft)] text-[var(--color-brand-navy)]">
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[15px] font-semibold text-[var(--color-brand-ink)]">{title}</span>
        <span className="truncate text-xs text-[var(--color-brand-muted)]">{detail}</span>
      </span>
      {canClose && (
        <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-[var(--color-brand-navy)]">
          {open ? "Close" : "Change"}
          <IconCaretDown size={12} className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </span>
      )}
    </button>
  );
}
