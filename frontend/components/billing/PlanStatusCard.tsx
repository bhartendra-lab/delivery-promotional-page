"use client";

import { isStorageBasedPlan } from "@/lib/types";
import { isStorageSnapshot } from "@/lib/billing-types";
import type { SubscriptionSnapshot } from "@/lib/billing-types";

const formatDate = (ms: number) =>
  new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(ms));

export function PlanStatusCard({ snapshot, loading }: { snapshot: SubscriptionSnapshot | null; loading?: boolean }) {
  if (loading) return <div className="skeleton h-[96px] rounded-xl" />;

  if (!snapshot || !snapshot.service) {
    return (
      <div className="rounded-xl border border-[var(--color-brand-border)] bg-[var(--color-brand-surface-raised)] p-5">
        <p className="text-sm text-[var(--color-brand-muted)]">
          No plan on record. Contact support if this looks wrong.
        </p>
      </div>
    );
  }

  const { service } = snapshot;
  const planName = service.name || service.service_type;
  const isRecurring = isStorageBasedPlan(service.service_type);

  let periodLine: string;
  if (isRecurring) {
    if (snapshot.cancel_at_period_end && snapshot.current_period_end) {
      periodLine = `Access until ${formatDate(snapshot.current_period_end)}`;
    } else if (snapshot.current_period_end) {
      periodLine = `Renews on ${formatDate(snapshot.current_period_end)}`;
    } else {
      periodLine = "Renewal date pending";
    }
  } else {
    periodLine = "No renewal — credits don't expire.";
  }

  return (
    <div className="rounded-xl border border-[var(--color-brand-border)] bg-[var(--color-brand-surface-raised)] p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-brand-navy)]">
        {service.service_type}
      </p>
      <h3 className="mt-1 text-xl font-bold text-[var(--color-brand-ink)]">{planName}</h3>
      <p className="mt-1 text-sm text-[var(--color-brand-muted)]">{periodLine}</p>
      {isStorageSnapshot(snapshot) && snapshot.storage.limit != null && (
        <p className="mt-0.5 text-sm text-[var(--color-brand-muted)]">{snapshot.storage.limit} GB storage</p>
      )}
    </div>
  );
}
