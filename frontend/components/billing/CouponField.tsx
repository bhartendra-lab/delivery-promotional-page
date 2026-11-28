"use client";

import { useEffect, useRef, useState } from "react";
import { getAvailableCoupons, validateCoupon } from "@/lib/billing";
import type { AvailableCoupon } from "@/lib/billing";
import { getMyReferrals } from "@/lib/api";
import { needsPlan } from "@/lib/auth";
import { useCompany } from "@/lib/useCompany";
import { formatInr } from "@/lib/plans";
import { appliedBonusLabel, couponChipLabel } from "@/lib/checkout-summary";
import { normalizeReferralCode } from "@/lib/referral";
import { IconCheck, IconX } from "@/components/ui/icons";

export type AppliedCoupon = {
  code: string;
  discountAmount: number;
  finalAmount: number;
  /** Free events a bonus coupon adds at this quantity; 0 for a percent coupon. */
  bonusEvents: number;
};

/**
 * Live on /checkout, the UpgradeModal and the onboarding plan step. Owns its
 * own validate-on-apply state; reports the applied result up via `onChange`
 * so the parent's CheckoutSummary/useCheckoutFlow can compute totals and pass
 * the code at checkout time.
 *
 * The code box is always open, and "Offers for you" sits right under it: the coupons this studio can use on this
 * plan right now (GET /billing/coupons/available), one tap each, so a studio
 * never has to remember a code it saw on the login page. A referred studio
 * that has not paid gets the referral program's coupon applied for it, the
 * same way as a `?coupon=` deep link. Every code and figure comes from the API.
 */
export function CouponField({
  serviceId,
  quantity,
  onChange,
  checkoutRejection,
  initialCode,
}: {
  serviceId: string;
  quantity?: number;
  onChange: (applied: AppliedCoupon | null) => void;
  /**
   * Set by the parent when POST /billing/checkout itself rejected the
   * coupon (400 "Coupon is not valid for this purchase") — it validated
   * fine but was exhausted in the race before checkout. Clears the applied
   * chip and shows this message once.
   */
  checkoutRejection?: string | null;
  /** Pre-fills and auto-validates once on mount — the landing page's `?coupon=` deep link. */
  initialCode?: string | null;
}) {
  const [input, setInput] = useState(initialCode ?? "");
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<AppliedCoupon | null>(null);
  const [offers, setOffers] = useState<AvailableCoupon[]>([]);
  const company = useCompany();
  // Only a studio that has not paid can be a referred studio still owed its
  // coupon, so only that one asks /referrals/me.
  const unpaid = !!company && needsPlan(company);
  const lastRejection = useRef<string | null | undefined>(undefined);
  const autoAppliedRef = useRef(false);

  useEffect(() => {
    if (checkoutRejection && checkoutRejection !== lastRejection.current) {
      setApplied(null);
      setError(checkoutRejection);
      onChange(null);
    }
    lastRejection.current = checkoutRejection;
    // onChange is stable enough for this purpose; including it would re-run
    // on every parent render since it's usually an inline function.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkoutRejection]);

  /**
   * `silent`: a coupon applied for the studio (the referral program's) that
   * turns out not to fit this plan is simply not applied, with no error the
   * studio did not cause.
   */
  async function runValidate(rawCode: string, { silent = false }: { silent?: boolean } = {}) {
    const code = rawCode.trim().toUpperCase();
    setValidating(true);
    setError(null);
    try {
      const result = await validateCoupon({ coupon_code: code, service_id: serviceId, quantity });
      if (result.valid) {
        // The discount as the plan lists its prices (before GST on a plan
        // that lists them before GST), so it matches the summary's rows.
        const next = {
          code: result.coupon?.code ?? code,
          discountAmount: result.list_discount_amount ?? result.discount_amount,
          finalAmount: result.final_amount,
          bonusEvents: result.bonus_events ?? 0,
        };
        setApplied(next);
        onChange(next);
      } else {
        setApplied(null);
        if (!silent) setError(result.message);
        onChange(null);
      }
    } catch (err) {
      setApplied(null);
      if (!silent) setError(err instanceof Error ? err.message : "Couldn't validate that coupon.");
      onChange(null);
    } finally {
      setValidating(false);
    }
  }

  useEffect(() => {
    if (!serviceId || autoAppliedRef.current) return;
    autoAppliedRef.current = true;
    if (initialCode) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- validates the deep-linked coupon once the plan is known
      runValidate(initialCode);
      return;
    }
    // D7: a referred studio that has not paid gets the program's coupon
    // pre-applied. /referrals/me only names one while that is true.
    if (!unpaid) return;
    let cancelled = false;
    getMyReferrals()
      .then((me) => {
        const code = normalizeReferralCode(me.referee_coupon_code);
        if (!cancelled && code) runValidate(code, { silent: true });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // Runs once, when serviceId first becomes available.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode, serviceId]);

  // "Offers for you": what this studio can use on this plan and quantity.
  useEffect(() => {
    if (!serviceId) return;
    let cancelled = false;
    getAvailableCoupons({ service_id: serviceId, quantity: quantity ?? 1 })
      .then((res) => {
        if (!cancelled) setOffers(res.coupons ?? []);
      })
      .catch(() => {
        if (!cancelled) setOffers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [serviceId, quantity]);

  // Re-validate whenever quantity or the selected plan changes with a coupon
  // applied — discount_amount is computed off the gross, so a stale discount
  // must never be shown.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- re-validates the already-applied coupon when price inputs change
    if (applied) runValidate(applied.code);
    // Only re-run on serviceId/quantity change, not on `applied` itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId, quantity]);

  if (applied) {
    const bonusLabel = appliedBonusLabel(applied.bonusEvents);
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-[var(--color-brand-navy)]/50 bg-[var(--color-brand-navy-soft)] px-3 py-2.5 text-sm">
        <IconCheck size={14} className="shrink-0 text-[var(--color-brand-navy)]" />
        <span className="font-bold tracking-wide text-[var(--color-brand-navy-deep)]">{applied.code}</span>
        <span className="text-[var(--color-brand-ink)]">
          applied · {bonusLabel ?? `−${formatInr(applied.discountAmount, { paise: true })}`}
        </span>
        <button
          type="button"
          onClick={() => {
            setApplied(null);
            setInput("");
            onChange(null);
          }}
          aria-label="Remove coupon"
          className="brand-focus ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[var(--color-brand-muted)] hover:bg-white/60"
        >
          <IconX size={12} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (input.trim() && !validating) void runValidate(input.trim());
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value.toUpperCase());
            setError(null);
          }}
          placeholder="Coupon code"
          aria-label="Coupon code"
          autoComplete="off"
          spellCheck={false}
          className="brand-focus h-10 min-w-0 flex-1 rounded-lg border border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] px-3 text-sm uppercase tracking-wide text-[var(--color-brand-ink)] placeholder:normal-case placeholder:tracking-normal placeholder:text-[var(--color-brand-muted)]/70"
        />
        <button
          type="submit"
          disabled={!input.trim() || validating}
          className="brand-focus h-10 shrink-0 rounded-lg border border-[var(--color-brand-navy)] px-4 text-sm font-semibold text-[var(--color-brand-navy)] transition-colors hover:bg-[var(--color-brand-navy-soft)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {validating ? "Checking…" : "Apply"}
        </button>
      </form>
      {error && (
        <p className="text-xs text-[var(--color-brand-danger)]" role="alert">
          {error}
        </p>
      )}
      {offers.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-[var(--color-brand-muted)]">Offers for you:</span>
          {offers.map((offer) => (
            <button
              key={offer.code}
              type="button"
              disabled={validating}
              onClick={() => runValidate(offer.code)}
              className="brand-focus inline-flex items-center rounded-full border border-dashed border-[var(--color-brand-navy)]/40 bg-[var(--color-brand-navy-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--color-brand-navy-deep)] transition-colors hover:border-[var(--color-brand-navy)] disabled:opacity-60"
            >
              {couponChipLabel(offer)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
