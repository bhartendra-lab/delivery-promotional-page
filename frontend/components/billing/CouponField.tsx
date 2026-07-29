"use client";

import { useEffect, useRef, useState } from "react";
import { validateCoupon } from "@/lib/billing";
import { formatInr } from "@/lib/plans";
import { IconX } from "@/components/ui/icons";

export type AppliedCoupon = { code: string; discountAmount: number; finalAmount: number };

/**
 * Live on /checkout and the UpgradeModal. Owns its own validate-on-apply
 * state; reports the applied result up via `onChange` so the parent's
 * CheckoutSummary/useCheckoutFlow can compute totals and pass the code at
 * checkout time.
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
  const [expanded, setExpanded] = useState(Boolean(initialCode));
  const [input, setInput] = useState(initialCode ?? "");
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<AppliedCoupon | null>(null);
  const lastRejection = useRef<string | null | undefined>(undefined);
  const autoAppliedRef = useRef(false);

  useEffect(() => {
    if (checkoutRejection && checkoutRejection !== lastRejection.current) {
      setApplied(null);
      setExpanded(true);
      setError(checkoutRejection);
      onChange(null);
    }
    lastRejection.current = checkoutRejection;
    // onChange is stable enough for this purpose; including it would re-run
    // on every parent render since it's usually an inline function.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkoutRejection]);

  async function runValidate(code: string) {
    setValidating(true);
    setError(null);
    try {
      const result = await validateCoupon({ coupon_code: code, service_id: serviceId, quantity });
      if (result.valid) {
        const next = { code, discountAmount: result.discount_amount, finalAmount: result.final_amount };
        setApplied(next);
        onChange(next);
      } else {
        setApplied(null);
        setError(result.message);
        onChange(null);
      }
    } catch (err) {
      setApplied(null);
      setError(err instanceof Error ? err.message : "Couldn't validate that coupon.");
      onChange(null);
    } finally {
      setValidating(false);
    }
  }

  useEffect(() => {
    if (initialCode && !autoAppliedRef.current) {
      autoAppliedRef.current = true;
      runValidate(initialCode);
    }
    // Runs once, when serviceId first becomes available.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode, serviceId]);

  // Re-validate whenever quantity or the selected plan changes with a coupon
  // applied — discount_amount is computed off the gross, so a stale discount
  // must never be shown.
  useEffect(() => {
    if (applied) runValidate(applied.code);
    // Only re-run on serviceId/quantity change, not on `applied` itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId, quantity]);

  if (!expanded && !applied) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="brand-focus w-fit text-sm font-medium text-[var(--color-brand-muted)] underline-offset-2 hover:underline"
      >
        Have a coupon?
      </button>
    );
  }

  if (applied) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-[var(--color-brand-border)] bg-[var(--color-brand-navy-soft)] px-3 py-2 text-sm">
        <span className="font-bold text-[var(--color-brand-navy-deep)]">{applied.code}</span>
        <span className="text-[var(--color-brand-ink)]">
          · −{formatInr(applied.discountAmount, { paise: true })}
        </span>
        <button
          type="button"
          onClick={() => {
            setApplied(null);
            setInput("");
            setExpanded(false);
            onChange(null);
          }}
          aria-label="Remove coupon"
          className="brand-focus ml-auto flex h-6 w-6 items-center justify-center rounded-full text-[var(--color-brand-muted)] hover:bg-white/50"
        >
          <IconX size={12} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value.toUpperCase())}
          placeholder="COUPON CODE"
          className="brand-focus h-10 flex-1 rounded-lg border border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] px-3 text-sm uppercase tracking-wide text-[var(--color-brand-ink)] placeholder:text-[var(--color-brand-muted)]/60"
        />
        <button
          type="button"
          disabled={!input.trim() || validating}
          onClick={() => runValidate(input.trim())}
          className="brand-focus h-10 shrink-0 rounded-lg bg-[var(--color-brand-navy)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {validating ? "Checking…" : "Apply"}
        </button>
      </div>
      {error && (
        <p className="text-xs text-[var(--color-brand-danger)]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
