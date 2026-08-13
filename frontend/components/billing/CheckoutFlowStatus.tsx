"use client";

import { ConfirmingPayment } from "./ConfirmingPayment";
import type { CheckoutFlowState, RunCheckoutInput } from "./useCheckoutFlow";

/**
 * Renders whatever <UpgradeModal>/`/checkout` needs for the current
 * useCheckoutFlow() phase. "idle" and "processing" render nothing here —
 * callers show their own summary/Pay button for "idle" and rely on the
 * Razorpay modal itself (plus a disabled Pay button) for "processing".
 */
export function CheckoutFlowStatus({
  state,
  onRetry,
  onGoToDashboard,
}: {
  state: CheckoutFlowState;
  onRetry: () => void;
  onGoToDashboard: () => void;
}) {
  if (state.phase === "confirming") {
    return (
      <ConfirmingPayment
        purpose={state.purpose}
        targetServiceId={state.targetServiceId}
        before={state.before}
        onGoToDashboard={onGoToDashboard}
      />
    );
  }

  if (state.phase === "scheduled") {
    const effectiveDate = new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(state.effectiveAt));
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 px-6 text-center">
        <h2 className="text-xl font-bold text-[var(--color-brand-ink)]">{state.message}</h2>
        <p className="text-sm text-[var(--color-brand-muted)]">Effective {effectiveDate}.</p>
        <button
          type="button"
          onClick={onGoToDashboard}
          className="brand-focus mt-2 inline-flex h-11 items-center justify-center rounded-lg bg-[var(--color-brand-navy)] px-6 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)]"
        >
          Back to billing
        </button>
      </div>
    );
  }

  // Abandoning a checkout is not a failure — neutral copy, no danger styling.
  if (state.phase === "dismissed") {
    return (
      <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-base font-semibold text-[var(--color-brand-ink)]">
          Payment wasn&apos;t completed.
        </p>
        <p className="text-sm text-[var(--color-brand-muted)]">
          You&apos;re still on {state.planName}.
        </p>
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={onRetry}
            className="brand-focus inline-flex h-11 items-center justify-center rounded-lg bg-[var(--color-brand-navy)] px-5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)]"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={onGoToDashboard}
            className="brand-focus inline-flex h-11 items-center justify-center rounded-lg border border-[var(--color-brand-border)] px-5 text-sm font-semibold text-[var(--color-brand-ink)] transition-colors hover:bg-[var(--color-brand-hover)]"
          >
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  if (state.phase === "fallback_link") {
    return (
      <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-base font-semibold text-[var(--color-brand-ink)]">
          We couldn&apos;t load the secure payment widget here.
        </p>
        <a
          href={state.shortUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="brand-focus inline-flex h-11 items-center justify-center rounded-lg bg-[var(--color-brand-navy)] px-6 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)]"
        >
          Open secure payment page →
        </a>
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 px-6 text-center">
        <p role="alert" className="text-sm text-[var(--color-brand-danger)]">
          {state.message}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="brand-focus inline-flex h-11 items-center justify-center rounded-lg border border-[var(--color-brand-border)] px-5 text-sm font-semibold text-[var(--color-brand-ink)] transition-colors hover:bg-[var(--color-brand-hover)]"
        >
          Try again
        </button>
      </div>
    );
  }

  return null;
}

export type { RunCheckoutInput };
