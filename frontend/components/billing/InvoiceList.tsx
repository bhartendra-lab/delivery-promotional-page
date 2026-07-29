"use client";

import { useState } from "react";
import { getInvoice } from "@/lib/billing";
import type { Invoice } from "@/lib/billing-types";
import { formatInr } from "@/lib/plans";
import { IconDownload } from "@/components/ui/icons";

const formatDate = (ms: number) =>
  new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(ms));

export function InvoiceList({ invoices, loading }: { invoices: Invoice[]; loading?: boolean }) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  async function handleDownload(id: string) {
    setDownloadingId(id);
    try {
      // Presigned URL is short-lived — fetch fresh every time, never cache it.
      const { pdf_url } = await getInvoice(id);
      window.open(pdf_url, "_blank", "noopener");
    } catch {
      /* silently ignored — the row's own state just stops spinning */
    } finally {
      setDownloadingId(null);
    }
  }

  if (loading) return <div className="skeleton h-40 rounded-xl" />;

  if (invoices.length === 0) {
    return (
      <p className="rounded-xl border border-[var(--color-brand-border)] bg-[var(--color-brand-surface)] p-5 text-sm text-[var(--color-brand-muted)]">
        No invoices yet. They&apos;ll appear here after your first payment.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--color-brand-border)] bg-[var(--color-brand-surface)]">
      <table className="w-full min-w-[480px] text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--color-brand-border)] text-xs uppercase tracking-[0.08em] text-[var(--color-brand-muted)]">
            <th className="px-4 py-3 font-semibold">Invoice #</th>
            <th className="px-4 py-3 font-semibold">Date</th>
            <th className="px-4 py-3 font-semibold">Amount</th>
            <th className="px-4 py-3 font-semibold">Status</th>
            <th className="px-4 py-3 font-semibold">Download</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => (
            <tr key={inv._id} className="border-b border-[var(--color-brand-border)] last:border-0">
              <td className="px-4 py-3 font-medium text-[var(--color-brand-ink)]">{inv.invoice_number}</td>
              <td className="px-4 py-3 text-[var(--color-brand-muted)]">{formatDate(inv.issued_at)}</td>
              <td className="px-4 py-3 tabular-nums text-[var(--color-brand-ink)]">
                {formatInr(inv.total, { paise: true })}
              </td>
              <td className="px-4 py-3">
                <span
                  className={
                    inv.status === "void"
                      ? "text-[var(--color-brand-muted)] line-through"
                      : "text-[var(--color-brand-ink)]"
                  }
                >
                  {inv.status}
                </span>
              </td>
              <td className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => handleDownload(inv._id)}
                  disabled={downloadingId === inv._id}
                  aria-label={`Download invoice ${inv.invoice_number}`}
                  className="brand-focus inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-brand-muted)] transition-colors hover:bg-[var(--color-brand-border)] hover:text-[var(--color-brand-ink)] disabled:opacity-50"
                >
                  {downloadingId === inv._id ? (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    <IconDownload size={15} />
                  )}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
