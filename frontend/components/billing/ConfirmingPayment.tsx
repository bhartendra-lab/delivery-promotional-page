"use client";

import { useEffect, useRef, useState } from "react";
import { getSubscription } from "@/lib/billing";
import type { SubscriptionSnapshot } from "@/lib/billing-types";
import { isStorageSnapshot } from "@/lib/billing-types";
import { formatStorage } from "@/lib/plans";
import { useSubscription } from "@/components/billing/SubscriptionProvider";
import { useChrome } from "@/components/dashboard/ChromeContext";

type Purpose = "event_topup" | "subscription" | "tier_upgrade" | "resume";

const POLL_INTERVAL_MS = 2000;
const MAX_ATTEMPTS = 15;

function isConfirmed(purpose: Purpose, before: SubscriptionSnapshot | null, fresh: SubscriptionSnapshot): boolean {
  if (purpose === "event_topup") {
    const beforeLimit = before && !isStorageSnapshot(before) ? before.limit : null;
    const freshLimit = !isStorageSnapshot(fresh) ? fresh.limit : null;
    if (freshLimit == null) return false;
    return beforeLimit == null || freshLimit > beforeLimit;
  }
  // Resume re-arms auto-renew on the SAME plan/mandate — service._id and
  // status ("active") never actually change, only cancel_at_period_end flips.
  if (purpose === "resume") return !fresh.cancel_at_period_end;
  return fresh.status === "active";
}

/**
 * The polling confirmation screen. Razorpay's webhook grants entitlement,
 * not the client-side `handler` callback — GET /billing/subscription can lag
 * a captured payment by anywhere from a few hundred ms to (rarely) a minute.
 * Never navigate straight to a success screen from `handler`; always land
 * here first. See plan §1.9 — getting this wrong tells a paying customer
 * their payment failed, the worst possible bug this feature can ship.
 */
export function ConfirmingPayment({
  purpose,
  targetServiceId,
  before,
  onConfirmed,
  onGoToDashboard,
}: {
  purpose: Purpose;
  targetServiceId: string;
  before: SubscriptionSnapshot | null;
  onConfirmed?: (s: SubscriptionSnapshot) => void;
  onGoToDashboard: () => void;
}) {
  const { refresh } = useSubscription();
  const { refreshDlpUsage } = useChrome();
  const [phase, setPhase] = useState<"polling" | "confirmed" | "timeout">("polling");
  const [confirmedSnapshot, setConfirmedSnapshot] = useState<SubscriptionSnapshot | null>(null);
  const attemptsRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppedRef = useRef(false);

  useEffect(() => {
    async function poll() {
      if (stoppedRef.current || document.visibilityState !== "visible") return;
      attemptsRef.current += 1;
      try {
        const fresh = await getSubscription();
        if (purpose === "subscription" || purpose === "tier_upgrade") {
          if (fresh.service?._id === targetServiceId && isConfirmed(purpose, before, fresh)) {
            stoppedRef.current = true;
            setConfirmedSnapshot(fresh);
            setPhase("confirmed");
            onConfirmed?.(fresh);
            await Promise.all([refresh(), refreshDlpUsage()]);
            return;
          }
        } else if (isConfirmed(purpose, before, fresh)) {
          stoppedRef.current = true;
          setConfirmedSnapshot(fresh);
          setPhase("confirmed");
          onConfirmed?.(fresh);
          await Promise.all([refresh(), refreshDlpUsage()]);
          return;
        }
      } catch {
        // Transient — keep polling; a hard failure here isn't the user's problem.
      }

      if (attemptsRef.current >= MAX_ATTEMPTS) {
        stoppedRef.current = true;
        setPhase("timeout");
        return;
      }
      timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible" && !stoppedRef.current && phase === "polling") {
        poll();
      }
    }

    poll();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stoppedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
    // Intentionally run once per mount — purpose/targetServiceId/before are
    // fixed for the lifetime of a single checkout attempt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === "confirmed" && confirmedSnapshot) {
    const planName = confirmedSnapshot.service?.name || confirmedSnapshot.service?.service_type || "your plan";
    const whatYouGot = isStorageSnapshot(confirmedSnapshot)
      ? `${formatStorage(confirmedSnapshot.storage.limit ?? 0)} · unlimited events`
      : purpose === "event_topup"
        ? `+${(confirmedSnapshot.limit ?? 0) - (before && !isStorageSnapshot(before) ? before.limit ?? 0 : 0)} events`
        : `${confirmedSnapshot.limit ?? 0} events`;

    return (
      <div className="flex min-h-[420px] flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-brand-success-soft)] text-[var(--color-brand-success)]">
          <CheckGlyph />
        </div>
        {purpose === "resume" ? (
          <>
            <h2 className="text-xl font-bold text-[var(--color-brand-ink)]">Auto-renew is back on.</h2>
            <p className="text-sm text-[var(--color-brand-muted)]">You&apos;re still on {planName}.</p>
          </>
        ) : (
          <>
            <h2 className="text-xl font-bold text-[var(--color-brand-ink)]">You&apos;re on {planName}.</h2>
            <p className="text-sm text-[var(--color-brand-muted)]">{whatYouGot}</p>
          </>
        )}
        <p className="text-sm text-[var(--color-brand-muted)]">Your invoice is on its way to your inbox.</p>
        <button
          type="button"
          onClick={onGoToDashboard}
          className="brand-focus mt-2 inline-flex h-11 items-center justify-center rounded-lg bg-[var(--color-brand-navy)] px-6 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)]"
        >
          Go to dashboard
        </button>
      </div>
    );
  }

  if (phase === "timeout") {
    return (
      <div className="flex min-h-[420px] flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-brand-navy-soft)] text-[var(--color-brand-navy)]">
          <CheckGlyph />
        </div>
        <h2 className="text-xl font-bold text-[var(--color-brand-ink)]">Payment received.</h2>
        <p className="max-w-sm text-sm text-[var(--color-brand-muted)]">
          Your plan is being activated — this usually completes within a minute. Your invoice will be
          emailed to you.
        </p>
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              stoppedRef.current = false;
              attemptsRef.current = 0;
              setPhase("polling");
            }}
            className="brand-focus inline-flex h-11 items-center justify-center rounded-lg border border-[var(--color-brand-border)] px-5 text-sm font-semibold text-[var(--color-brand-ink)] transition-colors hover:bg-[var(--color-brand-surface)]"
          >
            Check again
          </button>
          <button
            type="button"
            onClick={onGoToDashboard}
            className="brand-focus inline-flex h-11 items-center justify-center rounded-lg bg-[var(--color-brand-navy)] px-5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)]"
          >
            Go to dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="relative flex h-16 w-16 items-center justify-center">
        <div className="fx-glow-pulse absolute inset-0 rounded-full bg-[var(--color-brand-navy-soft)]" />
        <div className="relative h-9 w-9 animate-spin rounded-full border-[3px] border-[var(--color-brand-border)] border-t-[var(--color-brand-navy)]" />
      </div>
      <h2 className="text-xl font-bold text-[var(--color-brand-ink)]">Confirming your payment…</h2>
      <p className="text-sm text-[var(--color-brand-muted)]">
        This usually takes a few seconds. Don&apos;t close this window.
      </p>
    </div>
  );
}

function CheckGlyph() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
