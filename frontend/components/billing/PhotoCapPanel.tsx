"use client";

import { useEffect, useRef, useState } from "react";
import type { PhotoCap } from "@/lib/billing-types";
import { formatCount, formatInr } from "@/lib/plans";
import {
  MAX_PHOTO_CAP_BLOCKS,
  clampPhotoCapBlocks,
  minPhotoCapBlocks,
  photoCapHasGrown,
  photoCapOverBy,
} from "@/lib/photo-cap";
import { useCompany } from "@/lib/useCompany";
import { useSubscription } from "@/components/billing/SubscriptionProvider";
import { useCheckoutFlow } from "@/components/billing/useCheckoutFlow";
import { useEventPlan } from "@/components/billing/useEventPlan";
import { BillingDetailsForm } from "@/components/billing/BillingDetailsForm";
import { PhotoLimitTermsLink } from "@/components/billing/PhotoLimitTerms";

/** Same cadence as <ConfirmingPayment>: the grant arrives by webhook. */
const POLL_INTERVAL_MS = 2000;
const MAX_ATTEMPTS = 15;

/**
 * Which situation the panel is describing:
 *  - "selection": the upload dialog, with a selection that does not fit.
 *  - "paused": a run that hit the limit part-way (another device filled the event).
 *  - "room": the event page's "Add capacity", with nothing waiting.
 */
export type PhotoCapContext = "selection" | "paused" | "room";

/**
 * Buy extra photo capacity for ONE pay-per-event event, in place.
 *
 * The purchase runs through the same useCheckoutFlow as every other one. What
 * is different is the confirmation: capacity is granted to the event by
 * webhook, so after Razorpay reports success this polls the event's cap and
 * only calls `onCapacityAdded` once the cap has actually grown. The caller
 * must never start (or resume) an upload before that, because the server
 * would refuse it.
 *
 * Holds no selection of its own and never asks its host to reset, so a studio
 * that closes Razorpay without paying is back where it was, with everything it
 * picked still there.
 */
export function PhotoCapPanel({
  bookingId,
  photoCap,
  incoming,
  context,
  refreshPhotoCap,
  onCapacityAdded,
  secondary,
  onTermsOpenChange,
}: {
  bookingId: string;
  /** The event's cap as last read from the server. */
  photoCap: PhotoCap;
  /** New items waiting to go in; 0 when the studio is only adding room. */
  incoming: number;
  context: PhotoCapContext;
  /** Re-reads the cap from the server (GET /deliverables/archive-tiers). */
  refreshPhotoCap: () => Promise<PhotoCap | null>;
  /** The cap has grown by what was bought. */
  onCapacityAdded: (fresh: PhotoCap) => void;
  /** "Go back and select fewer photos" / "Stop here". */
  secondary?: { label: string; onClick: () => void };
  onTermsOpenChange?: (open: boolean) => void;
}) {
  const company = useCompany();
  const { hasBillingAccess } = useSubscription();
  const eventPlan = useEventPlan();
  const { state, runCheckout, reset } = useCheckoutFlow();

  const needed = minPhotoCapBlocks(photoCap, incoming);
  const min = Math.min(needed, MAX_PHOTO_CAP_BLOCKS);
  const [picked, setPicked] = useState(min);
  const blocks = clampPhotoCapBlocks(picked, min);
  const photosAdded = blocks * photoCap.addon_size;
  const amount = blocks * photoCap.addon_price;
  const over = photoCapOverBy(photoCap, incoming);

  /** What the purchase in flight was made against, for the confirmation poll. */
  const purchaseRef = useRef<{ before: PhotoCap; photosAdded: number } | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [pollRound, setPollRound] = useState(0);

  // Read through refs so the poll below keeps one stable identity per round.
  const refreshRef = useRef(refreshPhotoCap);
  const addedRef = useRef(onCapacityAdded);
  useEffect(() => {
    refreshRef.current = refreshPhotoCap;
    addedRef.current = onCapacityAdded;
  });

  const confirming = state.phase === "confirming";

  useEffect(() => {
    if (!confirming) return;
    const purchase = purchaseRef.current;
    if (!purchase) return;
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      if (cancelled || !purchase) return;
      attempts += 1;
      try {
        const fresh = await refreshRef.current();
        if (cancelled) return;
        if (fresh && photoCapHasGrown(purchase.before, fresh, purchase.photosAdded)) {
          purchaseRef.current = null;
          reset();
          addedRef.current(fresh);
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

  function pay() {
    if (!eventPlan) return;
    purchaseRef.current = { before: photoCap, photosAdded };
    setTimedOut(false);
    void runCheckout({
      serviceId: eventPlan._id,
      purpose: "photo_cap_topup",
      bookingId,
      blocks,
      description: `Extra photo capacity: ${formatCount(photosAdded)} photos`,
      before: null,
      currentPlanName: "",
      prefill: company
        ? { name: company.name, email: company.business_email, contact: company.whatsapp_number }
        : undefined,
    });
  }

  if (confirming) {
    return (
      <div className="flex flex-col items-start gap-3" aria-live="polite">
        {timedOut ? (
          <>
            <p className="text-[13.5px] leading-relaxed text-[var(--color-brand-ink)]">
              Your payment went through but the capacity has not shown up yet. This usually takes a minute.
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
  }

  // A studio that came in on free events may never have filled this in, and
  // checkout refuses without it. Collected here, then the payment carries on.
  if (state.phase === "error" && state.code === "BILLING_PROFILE_INCOMPLETE") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[13.5px] leading-relaxed text-[var(--color-brand-ink)]">
          Add your billing details first. They go on your invoice and decide how GST is charged.
        </p>
        <BillingDetailsForm
          studioAddress={company?.address}
          studioName={company?.name}
          gmbSkipped={company?.gmb_skipped}
          submitLabel="Save & continue to payment"
          onSaved={() => {
            reset();
            pay();
          }}
          onCancel={reset}
        />
      </div>
    );
  }

  const heading =
    context === "selection"
      ? "This upload goes over the event's photo limit"
      : context === "paused"
        ? "This event reached its photo limit"
        : "Add photo capacity";
  const body =
    context === "selection"
      ? `This event holds ${formatCount(photoCap.cap)} photos. It has ${formatCount(photoCap.used)} and you selected ${formatCount(incoming)}, which is ${formatCount(Math.max(0, over))} too many.`
      : context === "paused"
        ? `This event holds ${formatCount(photoCap.cap)} photos. ${formatCount(incoming)} photo${incoming === 1 ? " is" : "s are"} waiting to go in.`
        : `This event holds ${formatCount(photoCap.cap)} photos and has ${formatCount(photoCap.used)}.`;
  const payLabel =
    context === "selection"
      ? `Pay ${formatInr(amount)} and upload`
      : context === "paused"
        ? `Pay ${formatInr(amount)} and continue`
        : `Pay ${formatInr(amount)}`;
  const processing = state.phase === "processing";

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-[14px] font-bold leading-snug text-[var(--color-brand-ink)]">{heading}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-brand-muted)]">{body}</p>
      </div>

      {hasBillingAccess ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center rounded-lg border border-[var(--color-brand-border)] bg-white">
              <button
                type="button"
                aria-label="Add less capacity"
                disabled={blocks <= min || processing}
                onClick={() => setPicked(blocks - 1)}
                className="brand-focus h-9 w-9 rounded-l-lg text-base font-semibold text-[var(--color-brand-ink)] hover:bg-[var(--color-brand-hover)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                −
              </button>
              <span className="min-w-[3.5rem] px-2 text-center text-[13px] font-semibold tabular-nums text-[var(--color-brand-ink)]">
                {blocks}
              </span>
              <button
                type="button"
                aria-label="Add more capacity"
                disabled={blocks >= MAX_PHOTO_CAP_BLOCKS || processing}
                onClick={() => setPicked(blocks + 1)}
                className="brand-focus h-9 w-9 rounded-r-lg text-base font-semibold text-[var(--color-brand-ink)] hover:bg-[var(--color-brand-hover)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                +
              </button>
            </div>
            <p className="text-[13px] text-[var(--color-brand-ink)]" aria-live="polite">
              Add <strong className="tabular-nums">{formatCount(photosAdded)}</strong> photos
              <span className="text-[var(--color-brand-muted)]"> · {formatInr(amount)}, GST included</span>
            </p>
          </div>

          {needed > MAX_PHOTO_CAP_BLOCKS && (
            <p className="text-[12.5px] leading-relaxed text-[var(--color-brand-muted)]">
              One purchase can add up to {formatCount(MAX_PHOTO_CAP_BLOCKS * photoCap.addon_size)} photos. You can add
              more after this one, or select fewer photos.
            </p>
          )}

          {state.phase === "error" && (
            <p role="alert" className="text-[12.5px] leading-relaxed text-[var(--color-brand-danger)]">
              {state.message}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={pay}
              disabled={!eventPlan || processing}
              className="brand-focus inline-flex h-10 items-center rounded-lg bg-[var(--color-brand-navy)] px-4 text-[13.5px] font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {processing ? "Opening payment…" : payLabel}
            </button>
            {secondary && (
              <button
                type="button"
                onClick={secondary.onClick}
                disabled={processing}
                className="brand-focus inline-flex h-10 items-center rounded-lg border border-[var(--color-brand-border)] bg-white px-4 text-[13.5px] font-medium text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {secondary.label}
              </button>
            )}
            <PhotoLimitTermsLink eventPlan={eventPlan} onOpenChange={onTermsOpenChange} />
          </div>
        </>
      ) : (
        <>
          <p className="text-[13px] leading-relaxed text-[var(--color-brand-ink)]">
            {context === "selection"
              ? "Ask your studio admin to add photo capacity for this event, or select fewer photos."
              : "Ask your studio admin to add photo capacity for this event."}
          </p>
          <div className="flex flex-wrap items-center gap-2.5">
            {secondary && (
              <button
                type="button"
                onClick={secondary.onClick}
                className="brand-focus inline-flex h-10 items-center rounded-lg border border-[var(--color-brand-border)] bg-white px-4 text-[13.5px] font-medium text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)]"
              >
                {secondary.label}
              </button>
            )}
            <PhotoLimitTermsLink eventPlan={eventPlan} onOpenChange={onTermsOpenChange} />
          </div>
        </>
      )}
    </div>
  );
}
