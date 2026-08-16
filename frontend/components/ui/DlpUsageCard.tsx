"use client";

import type { DlpUsage } from "@/lib/types";

type Props = {
  data: DlpUsage | null;
  loading?: boolean;
};

export function DlpUsageCard({ data, loading }: Props) {
  if (loading) {
    return <div className="skeleton h-[88px] rounded-xl" />;
  }

  const isCapped = data !== null && typeof data.limit === "number";
  const pct =
    isCapped && data
      ? Math.min(100, Math.round((data.used / (data.limit as number)) * 100))
      : 0;
  const isNearLimit = isCapped && data ? (data.remaining ?? 0) <= 2 : false;

  const resetDate = data
    ? new Date(data.month_start).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;

  return (
    <div className="rounded-xl border border-[var(--color-brand-border)] bg-[var(--color-brand-surface-raised)] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-muted)]">
        Pages this month
      </p>

      {isCapped && data ? (
        <>
          <p className="mt-1.5 text-3xl font-bold tabular-nums text-[var(--color-brand-ink)]">
            {data.used}
            <span className="text-lg font-semibold text-[var(--color-brand-muted)]">
              {" "}/ {data.limit}
            </span>
          </p>
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[var(--color-brand-border)]">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${pct}%`,
                background: isNearLimit ? "var(--color-brand-danger)" : "var(--color-brand-navy)",
              }}
            />
          </div>
          <p className="mt-1 text-xs text-[var(--color-brand-muted)]">
            {isNearLimit ? (
              <span className="text-[var(--color-brand-danger)]">{data.remaining} remaining</span>
            ) : (
              <>{data.remaining} remaining</>
            )}
            {resetDate && <span className="ml-1">· resets {resetDate}</span>}
          </p>
        </>
      ) : (
        <>
          <p className="mt-1.5 text-3xl font-bold tabular-nums text-[var(--color-brand-ink)]">
            {data?.used ?? 0}
          </p>
          <p className="mt-0.5 text-xs text-[var(--color-brand-muted)]">
            Total created this month
          </p>
        </>
      )}
    </div>
  );
}
