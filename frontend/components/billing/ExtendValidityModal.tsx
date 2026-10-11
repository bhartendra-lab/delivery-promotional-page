"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { previewCheckout, ApiError, getApiErrorCode } from "@/lib/billing";
import type { CheckoutPreview } from "@/lib/billing-types";
import { formatInr, formatPrice } from "@/lib/plans";
import {
  chargedOptionPrice,
  formatValidityDate,
  guardFollowUp,
  guardSentence,
  periodLabel,
  type ValidityExtensionRecord,
  type ValidityGuard,
  type ValidityOption,
} from "@/lib/event-validity";
import { useCompany } from "@/lib/useCompany";
import { Modal } from "@/components/ui/Modal";
import { useSubscription } from "@/components/billing/SubscriptionProvider";
import { useCheckoutFlow } from "@/components/billing/useCheckoutFlow";
import { useEventPlan } from "@/components/billing/useEventPlan";
import { BillingDetailsForm } from "@/components/billing/BillingDetailsForm";

/** Same cadence as the photo-limit panel: the extension is granted by webhook. */
const POLL_INTERVAL_MS = 2000;
const MAX_ATTEMPTS = 15;

/** What the dialog needs to know about the event, all of it from getBookingById. */
export type ExtendValidityEvent = {
  /** Epoch ms: the last moment the event is live now. */
  endsAt: number;
  /** The periods on sale for THIS event, each with the date it would run to. */
  options: ValidityOption[];
  /** Whether each option's `price` includes GST. When it does not, the card
   *  says "Plus GST" and the pay button carries the amount with GST. */
  gstInclusive: boolean;
  /** The newest extensions, newest first, and how many there have been. */
  extensions: ValidityExtensionRecord[];
  extensionCount: number;
};

/** The guard rail, from what the booking already says, until the preview
 *  answers with the authoritative one. */
function guardFromHistory(event: ExtendValidityEvent): ValidityGuard {
  const [last] = event.extensions;
  if (!last || event.extensionCount <= 0) return { extended: false, count: 0, last: null };
  return {
    extended: true,
    count: event.extensionCount,
    last: { at: last.at, months: last.months, to: last.to, by: last.by, by_name: last.by_name },
  };
}

/** Every preview but the "scheduled" one carries the amount and tax fields. */
type ValidityPreview = Exclude<CheckoutPreview, { mode: "scheduled" }>;

/**
 * Keep ONE pay per event event live for longer, from the dashboard.
 *
 * Opened from the status pill's "Extend validity" row, and by the reminder
 * email's link (`?extend=1`). The Studio picks a period, sees what it costs
 * with GST and the date the event would run to, and pays through the same
 * useCheckoutFlow as every other purchase.
 *
 * Two things here exist so nobody pays by mistake. If the event has already
 * been extended, the dialog says by whom and when, and a tick box gates the
 * pay button. And only one checkout per event is open at a time: when a
 * Client is paying from their own link right now, the dialog says so instead
 * of offering to pay too.
 *
 * Like extra photo capacity, the extension is granted by webhook, so after
 * Razorpay reports success this polls the event (`refreshEndsAt`) and only
 * calls `onExtended` once its end date has actually moved.
 */
export function ExtendValidityModal({
  open,
  onClose,
  bookingId,
  eventName,
  event,
  refreshEndsAt,
  onExtended,
}: {
  open: boolean;
  onClose: () => void;
  bookingId: string;
  eventName: string;
  event: ExtendValidityEvent;
  /** Re-reads the event and answers its current end (epoch ms), or null on failure. */
  refreshEndsAt: () => Promise<number | null>;
  /** The end date has moved to `endsAt`. */
  onExtended: (endsAt: number) => void;
}) {
  const company = useCompany();
  const { hasBillingAccess } = useSubscription();
  const eventPlan = useEventPlan(open);
  const { state, runCheckout, reset } = useCheckoutFlow();
  const groupName = useId();
  const againId = useId();

  const [months, setMonths] = useState<number | null>(null);
  const [extendAgain, setExtendAgain] = useState(false);
  const [preview, setPreview] = useState<ValidityPreview | null>(null);
  const [previewError, setPreviewError] = useState<{ message: string; code: string | null } | null>(null);
  const [previewRound, setPreviewRound] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const [pollRound, setPollRound] = useState(0);

  /** The end the purchase in flight was made against, for the confirmation poll. */
  const beforeEndRef = useRef<number | null>(null);
  // Read through refs so the poll below keeps one stable identity per round.
  const refreshRef = useRef(refreshEndsAt);
  const extendedRef = useRef(onExtended);
  useEffect(() => {
    refreshRef.current = refreshEndsAt;
    extendedRef.current = onExtended;
  });

  // A dialog reopened later starts clean: nothing preselected, nothing ticked.
  useEffect(() => {
    if (open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting the dialog's own form when it closes
    setMonths(null);
    setExtendAgain(false);
    setPreview(null);
    setPreviewError(null);
    setTimedOut(false);
    beforeEndRef.current = null;
    reset();
  }, [open, reset]);

  const serviceId = eventPlan?._id ?? null;

  // The real figures for the chosen period: the GST split from the studio's
  // billing profile, the authoritative guard rail, and whether someone else
  // has a checkout open for this event right now.
  useEffect(() => {
    if (!open || months == null || !serviceId || !hasBillingAccess) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing the previous period's figures while the new ones load
    setPreview(null);
    setPreviewError(null);
    previewCheckout({ service_id: serviceId, booking_id: bookingId, validity_months: months })
      .then((res) => {
        if (cancelled) return;
        if (res.mode === "event_validity_extension") setPreview(res);
      })
      .catch((err) => {
        if (cancelled) return;
        setPreviewError({
          message: err instanceof ApiError ? err.message : "Could not load the price. Check your connection and try again.",
          code: getApiErrorCode(err),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [open, months, serviceId, bookingId, hasBillingAccess, previewRound]);

  const confirming = state.phase === "confirming";

  useEffect(() => {
    if (!confirming) return;
    const before = beforeEndRef.current;
    if (before == null) return;
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      if (cancelled) return;
      attempts += 1;
      try {
        const fresh = await refreshRef.current();
        if (cancelled) return;
        if (typeof fresh === "number" && fresh > (before as number)) {
          beforeEndRef.current = null;
          reset();
          extendedRef.current(fresh);
          return;
        }
      } catch {
        // Transient: keep polling. A hard failure here is not the studio's problem.
      }
      if (cancelled) return;
      if (attempts >= MAX_ATTEMPTS) {
        setTimedOut(true);
        return;
      }
      timer = setTimeout(poll, POLL_INTERVAL_MS);
    }

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [confirming, pollRound, reset]);

  const picked = event.options.find((option) => option.months === months) ?? null;
  const guard = preview?.guard ?? guardFromHistory(event);
  const guardLine = guardSentence(guard, "studio");
  const needsAgain = guard.extended;

  const pay = useCallback(() => {
    if (!serviceId || !picked) return;
    beforeEndRef.current = event.endsAt;
    setTimedOut(false);
    void runCheckout({
      serviceId,
      purpose: "validity_extension",
      bookingId,
      months: picked.months,
      description: `Extend ${eventName} by ${periodLabel(picked.months)}`,
      before: null,
      currentPlanName: "",
      prefill: company
        ? { name: company.name, email: company.business_email, contact: company.whatsapp_number }
        : undefined,
    });
  }, [serviceId, picked, event.endsAt, runCheckout, bookingId, eventName, company]);

  const subtitle = `${eventName} is live till ${formatValidityDate(event.endsAt)}. After that it closes, and its photos are deleted.`;
  const processing = state.phase === "processing";
  const billingIncomplete =
    (state.phase === "error" && state.code === "BILLING_PROFILE_INCOMPLETE") ||
    previewError?.code === "BILLING_PROFILE_INCOMPLETE";
  // Someone else has a checkout open for this event: said by the preview, or
  // by checkout itself when they got in between the two.
  const lockedByOther =
    preview?.lock_held_by_other === true ||
    previewError?.code === "EXTENSION_IN_PROGRESS" ||
    (state.phase === "error" && state.code === "EXTENSION_IN_PROGRESS");

  let body: React.ReactNode;
  if (confirming) {
    body = (
      <div className="flex flex-col items-start gap-3 py-2" aria-live="polite">
        {timedOut ? (
          <>
            <p className="text-[13.5px] leading-relaxed text-[var(--color-brand-ink)]">
              Your payment went through and is taking a moment to show. This usually takes a minute.
            </p>
            <button
              type="button"
              onClick={() => {
                setTimedOut(false);
                setPollRound((n) => n + 1);
              }}
              className="brand-focus inline-flex h-10 items-center rounded-lg border border-[var(--color-brand-border)] bg-white px-4 text-[13.5px] font-semibold text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)]"
            >
              Check again
            </button>
          </>
        ) : (
          <div className="flex items-center gap-3">
            <span className="inline-block h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-[var(--color-brand-border)] border-t-[var(--color-brand-navy)]" />
            <p className="text-[13.5px] font-semibold text-[var(--color-brand-ink)]">Confirming your payment</p>
          </div>
        )}
      </div>
    );
  } else if (!hasBillingAccess) {
    // A Member who is neither an admin nor the billing contact cannot pay.
    body = (
      <p className="py-2 text-[13.5px] leading-relaxed text-[var(--color-brand-ink)]">
        Ask your studio admin to extend this event.
      </p>
    );
  } else if (billingIncomplete) {
    // A studio that came in on free events may never have filled this in, and
    // checkout refuses without it. Collected here, then the dialog carries on.
    body = (
      <div className="flex flex-col gap-3">
        <p className="text-[13.5px] leading-relaxed text-[var(--color-brand-ink)]">
          Add your billing details first. They go on your invoice and decide how GST is charged.
        </p>
        <BillingDetailsForm
          studioAddress={company?.address}
          studioName={company?.name}
          gmbSkipped={company?.gmb_skipped}
          submitLabel="Save & continue"
          onSaved={() => {
            reset();
            setPreviewError(null);
            setPreviewRound((n) => n + 1);
          }}
          onCancel={() => {
            reset();
            setPreviewError(null);
            setMonths(null);
          }}
        />
      </div>
    );
  } else if (event.options.length === 0) {
    body = (
      <p className="py-2 text-[13.5px] leading-relaxed text-[var(--color-brand-ink)]">
        This event cannot be extended any further right now.
      </p>
    );
  } else {
    body = (
      <div className="flex flex-col gap-4">
        {guardLine && (
          <div className="rounded-lg border border-[var(--color-brand-border)] bg-[var(--color-brand-warning-soft)] px-3.5 py-3">
            <p className="text-[13px] font-semibold leading-snug text-[var(--color-brand-ink)]">{guardLine}</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--color-brand-muted)]">{guardFollowUp(guard)}</p>
          </div>
        )}

        <div role="radiogroup" aria-label="How much longer" className="flex flex-col gap-2">
          {event.options.map((option) => {
            const selected = option.months === months;
            return (
              <label
                key={option.months}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-3 transition-colors ${
                  selected
                    ? "border-[var(--color-brand-navy)] bg-[var(--color-brand-surface-raised)]"
                    : "border-[var(--color-brand-border)] bg-white hover:border-[var(--color-brand-outline)]"
                }`}
              >
                <input
                  type="radio"
                  name={groupName}
                  value={option.months}
                  checked={selected}
                  disabled={processing}
                  onChange={() => {
                    reset();
                    setMonths(option.months);
                  }}
                  className="brand-focus h-4 w-4 shrink-0 rounded-full accent-[var(--color-brand-navy)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-bold text-[var(--color-brand-ink)]">{periodLabel(option.months)}</span>
                    {option.best_value && (
                      <span className="rounded-full bg-[var(--color-brand-success-soft)] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-[var(--color-brand-success)]">
                        Best value
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-[12.5px] text-[var(--color-brand-muted)]">
                    Live till {formatValidityDate(option.new_end)}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[14px] font-bold tabular-nums text-[var(--color-brand-ink)]">
                    {formatPrice(option.price)}
                  </span>
                  <span className="block text-[11.5px] text-[var(--color-brand-muted)]">
                    {event.gstInclusive ? "GST included" : "Plus GST"}
                  </span>
                </span>
              </label>
            );
          })}
        </div>

        {picked && lockedByOther && (
          <div className="flex flex-col items-start gap-2.5 rounded-lg border border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] px-3.5 py-3" aria-live="polite">
            <p className="text-[13px] leading-relaxed text-[var(--color-brand-ink)]">
              A Client is paying for this right now. Check back in a few minutes.
            </p>
            <button
              type="button"
              onClick={() => {
                reset();
                setPreviewRound((n) => n + 1);
              }}
              className="brand-focus inline-flex h-9 items-center rounded-lg border border-[var(--color-brand-border)] bg-white px-3.5 text-[13px] font-semibold text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)]"
            >
              Check again
            </button>
          </div>
        )}

        {picked && !lockedByOther && (
          <>
            {preview && (
              <dl className="flex flex-col gap-1 rounded-lg bg-[var(--color-brand-bg)] px-3.5 py-3 text-[12.5px] text-[var(--color-brand-muted)]">
                <div className="flex justify-between gap-3">
                  <dt>{periodLabel(picked.months)} more</dt>
                  <dd className="tabular-nums">{formatInr(preview.taxable_value, { paise: true })}</dd>
                </div>
                {preview.tax_lines.map((line) => (
                  <div key={line.type} className="flex justify-between gap-3">
                    <dt>
                      {line.type} ({line.percent}%)
                    </dt>
                    <dd className="tabular-nums">{formatInr(line.amount, { paise: true })}</dd>
                  </div>
                ))}
                <div className="mt-1 flex justify-between gap-3 border-t border-[var(--color-brand-border)] pt-1.5 text-[13px] font-bold text-[var(--color-brand-ink)]">
                  <dt>Total</dt>
                  <dd className="tabular-nums">{formatInr(preview.total, { paise: true })}</dd>
                </div>
              </dl>
            )}

            {needsAgain && (
              <label htmlFor={againId} className="flex cursor-pointer items-start gap-2.5">
                <input
                  id={againId}
                  type="checkbox"
                  checked={extendAgain}
                  onChange={(e) => setExtendAgain(e.target.checked)}
                  className="brand-focus mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-brand-navy)]"
                />
                <span className="text-[13px] font-semibold text-[var(--color-brand-ink)]">Yes, extend it again</span>
              </label>
            )}

            {previewError && previewError.code !== "EXTENSION_IN_PROGRESS" && (
              <p role="alert" className="text-[12.5px] leading-relaxed text-[var(--color-brand-danger)]">
                {previewError.message}
              </p>
            )}
            {state.phase === "error" && (
              <p role="alert" className="text-[12.5px] leading-relaxed text-[var(--color-brand-danger)]">
                {state.message}
              </p>
            )}
            {state.phase === "dismissed" && (
              <p className="text-[12.5px] leading-relaxed text-[var(--color-brand-muted)]" aria-live="polite">
                Payment was not completed. Nothing was charged and the event is unchanged.
              </p>
            )}
          </>
        )}

        <p className="text-[12px] leading-relaxed text-[var(--color-brand-muted)]">
          The time is added to the date the event was due to close. Extensions are not refundable.
        </p>
      </div>
    );
  }

  const canPay =
    Boolean(picked) && Boolean(serviceId) && !lockedByOther && !processing && (!needsAgain || extendAgain) && !previewError;
  const showFooter = !confirming && hasBillingAccess && !billingIncomplete && event.options.length > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Extend this event"
      subtitle={subtitle}
      size="md"
      footer={
        showFooter ? (
          <div className="flex flex-wrap items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={processing}
              className="brand-focus inline-flex h-10 items-center rounded-lg border border-[var(--color-brand-border)] bg-white px-4 text-[13.5px] font-medium text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Not now
            </button>
            <button
              type="button"
              onClick={pay}
              disabled={!canPay}
              className="brand-focus inline-flex h-10 items-center rounded-lg bg-[var(--color-brand-navy)] px-4 text-[13.5px] font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {processing
                ? "Opening payment…"
                : picked
                  ? // What is actually paid, GST included: the preview's total
                    // once it has answered, the option's own figure until then.
                    `Pay ${formatPrice(preview?.total ?? chargedOptionPrice(picked))}`
                  : "Choose a period"}
            </button>
          </div>
        ) : undefined
      }
    >
      {body}
    </Modal>
  );
}
