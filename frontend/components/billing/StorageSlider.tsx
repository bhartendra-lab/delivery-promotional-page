"use client";

import { useId } from "react";
import type { StorageTier } from "@/lib/plans";
import { formatStorage, formatInr, planForTier } from "@/lib/plans";

type Interval = "monthly" | "yearly";

export function StorageSlider({
  tiers,
  index,
  interval,
  onChange,
  currentTierIndex,
}: {
  tiers: StorageTier[];
  index: number;
  interval: Interval;
  onChange: (index: number) => void;
  /** Highlights the studio's current tier, if any (§5.6 app-side default). */
  currentTierIndex?: number | null;
}) {
  const id = useId();
  const max = tiers.length - 1;
  const pct = max > 0 ? (index / max) * 100 : 0;
  const activePlan = planForTier(tiers[index], interval);
  const priceLabel = activePlan
    ? `${formatInr(activePlan.price ?? 0)} per ${interval === "monthly" ? "month" : "year"}`
    : `Not available on ${interval} billing`;

  return (
    <div className="flex flex-col gap-3">
      <div className="hidden sm:block">
        <div className="relative flex h-11 items-center">
          <div
            aria-hidden
            className="pointer-events-none absolute left-0 right-0 h-1 rounded-full bg-[var(--color-brand-border)]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute left-0 h-1 rounded-full bg-[var(--color-brand-navy)]"
            style={{ width: `${pct}%` }}
          />
          <input
            type="range"
            min={0}
            max={max}
            step={1}
            value={index}
            onChange={(e) => onChange(Number(e.target.value))}
            aria-label="Storage plan"
            aria-valuetext={`${formatStorage(tiers[index].storage_limit)} — ${priceLabel}`}
            list={`${id}-tiers`}
            className="range-slider brand-focus relative z-10"
          />
          <datalist id={`${id}-tiers`}>
            {tiers.map((_, i) => (
              <option key={i} value={i} />
            ))}
          </datalist>
        </div>
        <div className="relative mt-1 h-9">
          {tiers.map((t, i) => {
            const available = Boolean(planForTier(t, interval));
            const selected = i === index;
            const isCurrent = currentTierIndex === i;
            return (
              <span
                key={t.storage_limit}
                className={`absolute top-0 -translate-x-1/2 whitespace-nowrap text-center text-xs ${
                  !available
                    ? "text-[var(--color-brand-muted)]/60 line-through"
                    : selected
                      ? "font-bold text-[var(--color-brand-ink)]"
                      : "font-medium text-[var(--color-brand-muted)]"
                }`}
                style={{ left: `${max > 0 ? (i / max) * 100 : 50}%` }}
              >
                {formatStorage(t.storage_limit)}
                {isCurrent && " · Current"}
              </span>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 sm:hidden" role="group" aria-label="Storage plan">
        {tiers.map((t, i) => {
          const available = Boolean(planForTier(t, interval));
          const selected = i === index;
          return (
            <button
              key={t.storage_limit}
              type="button"
              onClick={() => onChange(i)}
              className={`brand-focus min-h-11 rounded-full border px-4 text-sm font-semibold transition-colors ${
                selected
                  ? "border-[var(--color-brand-navy)] bg-[var(--color-brand-navy)] text-white"
                  : available
                    ? "border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] text-[var(--color-brand-ink)]"
                    : "border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] text-[var(--color-brand-muted)]/60 line-through"
              }`}
            >
              {formatStorage(t.storage_limit)}
              {currentTierIndex === i && " · Current"}
            </button>
          );
        })}
      </div>

      {!activePlan && (
        <p className="text-sm text-[var(--color-brand-muted)]">Not available on {interval} billing.</p>
      )}
    </div>
  );
}
