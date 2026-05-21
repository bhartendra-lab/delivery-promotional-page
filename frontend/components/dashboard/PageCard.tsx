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
    <article className="dash-rise rounded-2xl border border-[var(--color-brand-border)] bg-white p-4 shadow-sm transition-colors hover:border-[var(--color-brand-outline)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-[var(--color-brand-ink)]">
            {row.client_name}
          </h3>
          <p className="mt-0.5 text-xs text-[var(--color-brand-muted)]">
            {formatEventDate(row.event_date)} · Created{" "}
            {formatCreatedAt(row.createdAt)}
          </p>
        </div>
        <EventBadge type={row.event_type as EventType} />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Metric
          label="Visits"
          value={row.trackings?.visit ?? 0}
          tone="navy"
        />
        <Metric
          label="Deliveries"
          value={row.trackings?.delivery ?? 0}
          tone="gold"
        />
        <Metric
          label="Reviews"
          value={row.trackings?.review ?? 0}
          tone="success"
        />
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={copy}
          className="brand-focus inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-[var(--color-brand-border)] bg-white text-sm font-medium text-[var(--color-brand-ink)] hover:bg-[var(--color-brand-navy-soft)]/40"
        >
          {copied ? "✓ Copied" : "Copy URL"}
        </button>
        <button
          type="button"
          onClick={() => onEdit(row)}
          className="brand-focus inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[var(--color-brand-navy)] text-sm font-semibold text-white hover:bg-[var(--color-brand-navy-deep)]"
        >
          View / Edit →
        </button>
      </div>
    </article>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "navy" | "gold" | "success";
}) {
  const styles =
    tone === "navy"
      ? {
          bg: "var(--color-brand-navy-soft)",
          fg: "var(--color-brand-navy)",
        }
      : tone === "gold"
        ? {
            bg: "var(--color-brand-gold-soft)",
            fg: "var(--color-brand-gold-deep)",
          }
        : {
            bg: "var(--color-brand-success-soft)",
            fg: "var(--color-brand-success)",
          };
  return (
    <div
      className="rounded-lg px-2 py-2"
      style={{ background: styles.bg }}
    >
      <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--color-brand-muted)]">
        {label}
      </p>
      <p
        className="text-base font-semibold tabular-nums"
        style={{ color: styles.fg }}
      >
        {value.toLocaleString()}
      </p>
    </div>
  );
}
