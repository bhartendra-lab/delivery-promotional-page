"use client";

import { useId, useState } from "react";
import { formatInr } from "@/lib/plans";
import { couponBonusRowLabel, nextTierNudge } from "@/lib/checkout-summary";
import type { NextBonusTier } from "@/lib/billing-types";
import { IconCaretDown } from "@/components/ui/icons";

/**
 * The money part of a checkout: the price, any coupon or credit, then three
 * lines a studio can read at a glance: Subtotal, Taxes, Total. Taxes is one
 * row that opens to show CGST + SGST or IGST.
 *
 * A plan that lists its prices with GST in them has no Subtotal row (it would
 * equal the total); its Taxes row reads "included" and the total is the price.
 */
export function CheckoutSummary({
  title,
  subtitle,
  lines,
  discountAmount,
  bonusEvents,
  couponCode,
  nextBonusTier,
  taxableValue,
  taxLines,
  gstInclusive = true,
  prorationCredit,
  total,
  totalIsEstimate,
  totalPendingLabel = "Calculated at payment",
  taxPendingLabel,
  prorationDetail,
  note,
  bare = false,
}: {
  title?: string;
  subtitle?: string;
  lines: { label: string; amount: number }[];
  discountAmount?: number | null;
  /** Free events the coupon adds to this purchase (the preview's `bonus_events`). */
  bonusEvents?: number | null;
  /** The coupon behind them (the preview's `coupon.code`), named in the row. */
  couponCode?: string | null;
  /** The next tier up of a bonus coupon (the preview's `next_bonus_tier`), for the nudge under the row. */
  nextBonusTier?: NextBonusTier | null;
  /** Taxable value (post-discount, pre-GST) and the CGST+SGST or IGST breakdown, from POST /billing/checkout/preview. */
  taxableValue?: number | null;
  taxLines?: { type: string; percent: number; amount: number }[] | null;
  /** The plan's prices include GST (lib/checkout-summary.ts summaryRowsOf). */
  gstInclusive?: boolean;
  /** e.g. unused plan credit on an interval switch — rendered like the coupon discount row. */
  prorationCredit?: { label: string; amount: number } | null;
  /** Null when the exact amount is only known once the server responds (proration). */
  total: number | null;
  totalIsEstimate?: boolean;
  /** What to show in place of the total while it's null — "Calculating…" mid-fetch vs. "Calculated at payment" as a terminal fallback. */
  totalPendingLabel?: string;
  /** Shown on the Taxes row while there are no tax lines yet, e.g. "Choose your state". */
  taxPendingLabel?: string;
  /** Overrides the default "Prorated for the rest of your current cycle." caption under the total. */
  prorationDetail?: string;
  note?: string;
  /** No card of its own: for a parent that already draws one. */
  bare?: boolean;
}) {
  const [taxesOpen, setTaxesOpen] = useState(false);
  const taxesId = useId();
  const hasTaxes = Array.isArray(taxLines) && taxLines.length > 0;
  const taxTotal = hasTaxes ? taxLines.reduce((sum, l) => sum + l.amount, 0) : 0;
  const taxPercent = hasTaxes ? taxLines.reduce((sum, l) => sum + l.percent, 0) : 0;
  const showSubtotal = !gstInclusive && typeof taxableValue === "number";
  const nudge = nextTierNudge(nextBonusTier);

  return (
    <div
      className={
        bare
          ? "flex flex-col gap-3"
          : "flex flex-col gap-3 rounded-xl border border-[var(--color-brand-border)] bg-[var(--color-brand-surface-raised)] p-5"
      }
    >
      {(title || subtitle) && (
        <div>
          {title && (
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-brand-navy)]">{title}</p>
          )}
          {subtitle && <p className="mt-0.5 text-sm text-[var(--color-brand-muted)]">{subtitle}</p>}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {lines.map((line) => (
          <Row key={line.label} label={line.label} value={formatInr(line.amount, { paise: true })} />
        ))}
        {typeof discountAmount === "number" && discountAmount > 0 && (
          <Row label="Coupon discount" value={`−${formatInr(discountAmount, { paise: true })}`} good />
        )}
        {typeof bonusEvents === "number" && bonusEvents > 0 && (
          <Row label={couponBonusRowLabel(couponCode, bonusEvents)} value={formatInr(0)} good />
        )}
        {nudge && (
          <p className="-mt-1 text-xs font-medium text-[var(--color-brand-navy)]" aria-live="polite">
            {nudge}
          </p>
        )}
        {prorationCredit && prorationCredit.amount > 0 && (
          <Row label={prorationCredit.label} value={`−${formatInr(prorationCredit.amount, { paise: true })}`} good />
        )}
      </div>

      {(showSubtotal || hasTaxes || taxPendingLabel) && (
        <div className="flex flex-col gap-2 border-t border-dashed border-[var(--color-brand-border)] pt-3">
          {showSubtotal && <Row label="Subtotal" value={formatInr(taxableValue!, { paise: true })} />}
          {hasTaxes ? (
            <div>
              <button
                type="button"
                onClick={() => setTaxesOpen((o) => !o)}
                aria-expanded={taxesOpen}
                aria-controls={taxesId}
                className="brand-focus flex w-full items-baseline justify-between rounded text-sm"
              >
                <span className="inline-flex items-center gap-1 text-[var(--color-brand-muted)] underline decoration-dotted underline-offset-4">
                  {gstInclusive ? "Taxes (included)" : `Taxes (${taxPercent}% GST)`}
                  <IconCaretDown size={11} className={`transition-transform duration-200 ${taxesOpen ? "rotate-180" : ""}`} />
                </span>
                <span className="tabular-nums text-[var(--color-brand-ink)]">{formatInr(taxTotal, { paise: true })}</span>
              </button>
              <div
                id={taxesId}
                hidden={!taxesOpen}
                className="mt-2 flex flex-col gap-1 border-l-2 border-[var(--color-brand-border)] pl-3"
              >
                {gstInclusive && typeof taxableValue === "number" && (
                  <Row small label="Value before tax" value={formatInr(taxableValue, { paise: true })} />
                )}
                {taxLines!.map((line) => (
                  <Row small key={line.type} label={`${line.type} (${line.percent}%)`} value={formatInr(line.amount, { paise: true })} />
                ))}
              </div>
            </div>
          ) : (
            taxPendingLabel && <Row label="Taxes" value={taxPendingLabel} muted />
          )}
        </div>
      )}

      <div className="flex items-baseline justify-between border-t border-[var(--color-brand-border)] pt-3">
        <span className="text-sm font-semibold text-[var(--color-brand-ink)]">Total</span>
        <span aria-live="polite" className="text-2xl font-bold tabular-nums text-[var(--color-brand-ink)]">
          {total === null ? (
            <span className="text-sm font-medium text-[var(--color-brand-muted)]">{totalPendingLabel}</span>
          ) : (
            formatInr(total, { paise: true })
          )}
        </span>
      </div>
      {totalIsEstimate && total !== null && (
        <p className="-mt-2 text-xs text-[var(--color-brand-muted)]">
          {prorationDetail ?? "Prorated for the rest of your current cycle."}
        </p>
      )}

      {note && <p className="text-xs leading-relaxed text-[var(--color-brand-muted)]">{note}</p>}
    </div>
  );
}

function Row({
  label,
  value,
  good,
  muted,
  small,
}: {
  label: string;
  value: string;
  good?: boolean;
  muted?: boolean;
  small?: boolean;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${small ? "text-xs" : "text-sm"}`}>
      <span className="text-[var(--color-brand-muted)]">{label}</span>
      <span
        className={`text-right tabular-nums ${
          good
            ? "font-medium text-[var(--color-brand-navy-deep)]"
            : muted
              ? "text-[var(--color-brand-muted)]"
              : "text-[var(--color-brand-ink)]"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
