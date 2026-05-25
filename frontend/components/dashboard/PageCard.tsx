"use client";

import { useState } from "react";
import type { DeliveryLandingPageListItem, EventType } from "@/lib/types";
import { buildShareUrl, formatCreatedAt, formatEventDate } from "./shared";
import { EventBadge } from "./EventBadge";

type Props = {
  row: DeliveryLandingPageListItem;
  onEdit: (row: DeliveryLandingPageListItem) => void;
};

export function PageCard({ row, onEdit }: Props) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(buildShareUrl(row._id));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <article className="dash-rise rounded-xl border border-[var(--color-brand-border)] bg-[var(--color-brand-surface)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-[var(--color-brand-ink)]">
            {row.client_name}
          </h3>
          <p className="mt-0.5 text-xs text-[var(--color-brand-muted)]">
            {formatEventDate(row.event_date)} · {formatCreatedAt(row.createdAt)}
          </p>
        </div>
        <EventBadge type={row.event_type as EventType} />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Metric label="Visits" value={row.trackings?.visit ?? 0} />
        <Metric label="Galleries" value={row.trackings?.delivery ?? 0} />
        <Metric label="Reviews" value={row.trackings?.review ?? 0} />
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={copy}
          className="brand-focus inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] text-sm font-medium text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)]"
        >
          {copied ? "✓ Copied" : "Copy URL"}
        </button>
        <button
          type="button"
          onClick={() => onEdit(row)}
          className="brand-focus inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-[var(--color-brand-navy)] text-sm font-semibold text-white hover:bg-[var(--color-brand-navy-deep)]"
        >
          Open →
        </button>
      </div>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-[var(--color-brand-bg)] px-2 py-2">
      <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--color-brand-muted)]">{label}</p>
      <p className="mt-0.5 text-base font-bold tabular-nums text-[var(--color-brand-ink)]">
        {value.toLocaleString()}
      </p>
    </div>
  );
}
