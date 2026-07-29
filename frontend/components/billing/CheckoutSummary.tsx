"use client";

import { formatInr } from "@/lib/plans";

export function CheckoutSummary({
  title,
  subtitle,
  lines,
  discountAmount,
  taxableValue,
  taxLines,
  prorationCredit,
  total,
  totalIsEstimate,
  totalPendingLabel = "Calculated at payment",
  prorationDetail,
  note,
}: {
  title: string;
  subtitle?: string;
  lines: { label: string; amount: number }[];
  discountAmount?: number | null;
  /** Taxable value (post-discount, pre-GST) and the CGST+SGST or IGST breakdown, from POST /billing/checkout/preview. */
  taxableValue?: number | null;
  taxLines?: { type: string; percent: number; amount: number }[] | null;
  /** e.g. unused plan credit on an interval switch — rendered like the coupon discount row. */
  prorationCredit?: { label: string; amount: number } | null;
  /** Null when the exact amount is only known once the server responds (proration). */
  total: number | null;
  totalIsEstimate?: boolean;
  /** What to show in place of the total while it's null — "Calculating…" mid-fetch vs. "Calculated at payment" as a terminal fallback. */
  totalPendingLabel?: string;
  /** Overrides the default "Prorated for the rest of your current cycle." caption under the total. */
  prorationDetail?: string;
  note?: string;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-[var(--color-brand-border)] bg-[var(--color-brand-surface)] p-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-brand-navy)]">
          {title}
        </p>
        {subtitle && <p className="mt-0.5 text-sm text-[var(--color-brand-muted)]">{subtitle}</p>}
      </div>

      <div className="flex flex-col gap-2 border-t border-[var(--color-brand-border)] pt-3">
        {lines.map((line) => (
          <div key={line.label} className="flex items-baseline justify-between text-sm">
            <span className="text-[var(--color-brand-muted)]">{line.label}</span>
            <span className="tabular-nums text-[var(--color-brand-ink)]">
              {formatInr(line.amount, { paise: true })}
            </span>
          </div>
        ))}
        {typeof discountAmount === "number" && discountAmount > 0 && (
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-[var(--color-brand-muted)]">Coupon discount</span>
            <span className="tabular-nums text-[var(--color-brand-navy-deep)]">
              −{formatInr(discountAmount, { paise: true })}
            </span>
          </div>
        )}
        {prorationCredit && prorationCredit.amount > 0 && (
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-[var(--color-brand-muted)]">{prorationCredit.label}</span>
            <span className="tabular-nums text-[var(--color-brand-navy-deep)]">
              −{formatInr(prorationCredit.amount, { paise: true })}
            </span>
          </div>
        )}
        {typeof taxableValue === "number" && taxLines && taxLines.length > 0 && (
          <>
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-[var(--color-brand-muted)]">Taxable value</span>
              <span className="tabular-nums text-[var(--color-brand-ink)]">
                {formatInr(taxableValue, { paise: true })}
              </span>
            </div>
            {taxLines.map((line) => (
              <div key={line.type} className="flex items-baseline justify-between text-sm">
                <span className="text-[var(--color-brand-muted)]">
                  {line.type} ({line.percent}%)
                </span>
                <span className="tabular-nums text-[var(--color-brand-ink)]">
                  {formatInr(line.amount, { paise: true })}
                </span>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="flex items-baseline justify-between border-t border-[var(--color-brand-border)] pt-3">
        <span className="text-sm font-semibold text-[var(--color-brand-ink)]">Total</span>
        <span
          aria-live="polite"
          className="text-xl font-bold tabular-nums text-[var(--color-brand-ink)]"
        >
          {total === null ? totalPendingLabel : formatInr(total, { paise: true })}
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
