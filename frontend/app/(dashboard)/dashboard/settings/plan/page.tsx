"use client";

import { useState } from "react";
import { useChrome } from "@/components/dashboard/ChromeContext";
import { isCountBasedPlan, isStorageBasedPlan, getUsageSeverity } from "@/lib/types";
import { SectionHeading, Card, StorageIcon } from "../SettingsUI";
import { IconRefresh } from "@/components/ui/icons";

/**
 * Your Account → Plan & Storage. A closer look at the same usage numbers
 * already fetched once for the whole dashboard (`ChromeContext.dlpUsage`) and
 * shown compactly in the sidebar meter — no separate fetch, no new backend
 * call. Mirrors the sidebar's count-based / storage-based / uncapped
 * branches and severity thresholds so the two stay in sync by construction.
 */
export default function PlanStoragePage() {
  const { dlpUsage, dlpLoading, refreshDlpUsage } = useChrome();
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await refreshDlpUsage();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeading
        eyebrow="Your Account"
        title="Plan & Storage"
        description="How much room you have left this month, the same numbers shown in your sidebar."
      />

      <Card title="Current usage" icon={<StorageIcon />}>
        <UsageBody usage={dlpUsage} loading={dlpLoading} />

        <div className="mt-4 flex items-center justify-between border-t border-[var(--color-brand-border)] pt-4">
          <p className="text-xs text-[var(--color-brand-muted)]">
            Need a bigger plan? Reach out to your Vyavasth contact and we will help you switch.
          </p>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing || dlpLoading}
            className="brand-focus inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-[var(--color-brand-border)] px-3 text-xs font-semibold text-[var(--color-brand-ink)] hover:bg-[var(--color-brand-bg)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <IconRefresh className={refreshing ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </Card>
    </div>
  );
}

function UsageBody({
  usage,
  loading,
}: {
  usage: ReturnType<typeof useChrome>["dlpUsage"];
  loading: boolean;
}) {
  if (loading) {
    return <div className="skeleton h-[92px] rounded-lg" />;
  }

  if (!usage) {
    return (
      <p className="text-sm text-[var(--color-brand-muted)]">
        We could not load your usage right now. Refresh the page to try again.
      </p>
    );
  }

  const used = usage.used ?? 0;
  const resetDate = new Date(usage.month_start).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  if (isCountBasedPlan(usage.service_type) && typeof usage.limit === "number") {
    const limit = usage.limit;
    const remaining = usage.remaining ?? Math.max(limit - used, 0);
    const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
    const low = remaining <= 2;
    return (
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-muted)]">
          Events created this month
        </p>
        <p className="mt-1.5 text-3xl font-bold tabular-nums text-[var(--color-brand-ink)]">
          {used}
          <span className="text-lg font-semibold text-[var(--color-brand-muted)]"> / {limit}</span>
        </p>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-brand-border)]">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${pct}%`, background: low ? "var(--color-brand-danger)" : "var(--color-brand-navy)" }}
          />
        </div>
        <p className="mt-2 text-xs text-[var(--color-brand-muted)]">
          <span className={low ? "text-[var(--color-brand-danger)]" : ""}>{remaining} events left</span>
          {" · resets "}
          {resetDate}
        </p>
      </div>
    );
  }

  if (isStorageBasedPlan(usage.service_type) && typeof usage.limit === "number") {
    const limit = usage.limit;
    const remaining = usage.remaining ?? Math.max(limit - used, 0);
    const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
    const severity = getUsageSeverity(pct);
    const barColor =
      severity === "danger"
        ? "var(--color-brand-danger)"
        : severity === "warning"
          ? "var(--color-brand-warning)"
          : "var(--color-brand-success)";
    return (
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-muted)]">
          Storage used
        </p>
        <p className="mt-1.5 text-3xl font-bold tabular-nums text-[var(--color-brand-ink)]">
          {used.toFixed(1)}
          <span className="text-lg font-semibold text-[var(--color-brand-muted)]"> / {limit.toFixed(1)} GB</span>
        </p>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-brand-border)]">
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: barColor }} />
        </div>
        <p className="mt-2 text-xs text-[var(--color-brand-muted)]">
          {remaining.toFixed(1)} GB left{" · resets "}
          {resetDate}
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-muted)]">
        Events created this month
      </p>
      <p className="mt-1.5 text-3xl font-bold tabular-nums text-[var(--color-brand-ink)]">{used}</p>
      <p className="mt-1 text-xs text-[var(--color-brand-muted)]">Your plan does not cap how many events you create.</p>
    </div>
  );
}
