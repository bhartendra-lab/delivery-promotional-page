"use client";

import { getUsageSeverity } from "@/lib/types";
import { isStorageSnapshot } from "@/lib/billing-types";
import type { SubscriptionSnapshot } from "@/lib/billing-types";

const SEVERITY_COLOR: Record<"ok" | "warning" | "danger", string> = {
  ok: "var(--color-brand-navy)",
  warning: "var(--color-brand-warning)",
  danger: "var(--color-brand-danger)",
};

export function UsageMeter({ snapshot, loading }: { snapshot: SubscriptionSnapshot | null; loading?: boolean }) {
  if (loading) return <div className="skeleton h-[88px] rounded-xl" />;
  if (!snapshot) return null;

  const storage = isStorageSnapshot(snapshot);
  const used = storage ? snapshot.storage.used : snapshot.used;
  const limit = storage ? snapshot.storage.limit : snapshot.limit;
  const remaining = storage ? snapshot.storage.remaining : snapshot.remaining;
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const severity = getUsageSeverity(pct);

  return (
    <div className="rounded-xl border border-[var(--color-brand-border)] bg-[var(--color-brand-surface-raised)] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-muted)]">
        {storage ? "Storage used" : "Events used"}
      </p>
      {limit != null ? (
        <>
          <p className="mt-1.5 text-3xl font-bold tabular-nums text-[var(--color-brand-ink)]">
            {storage ? used.toFixed(1) : used}
            <span className="text-lg font-semibold text-[var(--color-brand-muted)]">
              {" "}
              / {storage ? `${limit} GB` : limit}
            </span>
          </p>
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[var(--color-brand-border)]">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${pct}%`, background: SEVERITY_COLOR[severity] }}
            />
          </div>
          <p className="mt-1 text-xs text-[var(--color-brand-muted)]">
            {storage ? `${remaining?.toFixed(1) ?? 0} GB` : remaining} remaining
          </p>
        </>
      ) : (
        <p className="mt-1.5 text-3xl font-bold tabular-nums text-[var(--color-brand-ink)]">
          {storage ? `${used.toFixed(1)} GB` : used}
        </p>
      )}
    </div>
  );
}
