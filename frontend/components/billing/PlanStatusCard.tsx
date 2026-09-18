"use client";

import { isStorageSnapshot } from "@/lib/billing-types";
import type { SubscriptionSnapshot } from "@/lib/billing-types";
import { planPeriodLine } from "@/lib/subscription-status";

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
  const periodLine = planPeriodLine(snapshot);

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
