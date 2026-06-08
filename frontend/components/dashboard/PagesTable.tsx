"use client";

import { useState } from "react";
import type { Booking, EventType } from "@/lib/types";
import { formatCreatedAt, buildShareUrl } from "./shared";
import { EventBadge } from "./EventBadge";

type Props = {
  rows: Booking[];
  onOpen: (row: Booking) => void;
};

export function PagesTable({ rows, onOpen }: Props) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function copy(id: string) {
    try {
      await navigator.clipboard.writeText(buildShareUrl(id));
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <div className="dash-fade overflow-hidden rounded-xl border border-[var(--color-brand-border)] bg-[var(--color-brand-surface)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--color-brand-border)] text-left text-[11px] uppercase tracking-[0.16em] text-[var(--color-brand-muted)]">
            <th className="px-5 py-3 font-semibold">Client / Event</th>
            <th className="px-5 py-3 text-right font-semibold">Visits</th>
            <th className="px-5 py-3 text-right font-semibold">Galleries</th>
            <th className="px-5 py-3 text-right font-semibold">Reviews</th>
            <th className="px-5 py-3 font-semibold">Created</th>
            <th className="px-5 py-3 text-right font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row._id}
              className="border-b border-[var(--color-brand-border)]/60 transition-colors last:border-b-0 hover:bg-[var(--color-brand-bg)]"
              style={{ animation: `dash-rise 0.4s cubic-bezier(0.2,0.7,0.3,1) ${i * 0.03}s both` }}
            >
              <td className="px-5 py-4">
                <p className="font-semibold text-[var(--color-brand-ink)]">{row.name}</p>
                {row.event && (
                  <div className="mt-0.5">
                    <EventBadge type={row.event as EventType} />
                  </div>
                )}
              </td>
              <Metric value={row.trackings?.visit ?? 0} />
              <Metric value={row.trackings?.delivery ?? 0} />
              <Metric value={row.trackings?.review ?? 0} />
              <td className="px-5 py-4 text-[var(--color-brand-muted)]">
                {formatCreatedAt(row.createdAt)}
              </td>
              <td className="px-5 py-4">
                <div className="flex items-center justify-end gap-1.5">
                  <ActionButton onClick={() => copy(row._id)} aria-label="Copy share URL" title="Copy share URL">
                    {copiedId === row._id ? (
                      <><CheckIcon /><span className="hidden lg:inline">Copied</span></>
                    ) : (
                      <><CopyIcon /><span className="hidden lg:inline">Copy link</span></>
                    )}
                  </ActionButton>
                  <ActionButton primary onClick={() => onOpen(row)} aria-label="Open event" title="Open event">
                    <ArrowIcon />
                    <span className="hidden lg:inline">Open</span>
                  </ActionButton>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Metric({ value }: { value: number }) {
  return (
    <td className="px-5 py-4 text-right">
      <span className="font-semibold tabular-nums text-[var(--color-brand-ink)]">
        {value.toLocaleString()}
      </span>
    </td>
  );
}

function ActionButton({
  primary,
  children,
  ...rest
}: { primary?: boolean; children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className={`brand-focus inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors ${
        primary
          ? "bg-[var(--color-brand-navy)] text-white hover:bg-[var(--color-brand-navy-deep)]"
          : "border border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)]"
      }`}
    >
      {children}
    </button>
  );
}

function CopyIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
      <rect x="8" y="8" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
      <path d="M5 12l5 5 9-12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
      <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
