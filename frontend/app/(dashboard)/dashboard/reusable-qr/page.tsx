"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { deleteQr, generateQrCode, getAllQrCodes, unlinkQr } from "@/lib/api";
import type { AssignedEventSummary, QrCode } from "@/lib/types";
import { QrColorPicker } from "@/components/dashboard/reusable-qr/QrColorPicker";
import { QrCard } from "@/components/dashboard/reusable-qr/QrCard";
import { QrCardSkeleton } from "@/components/dashboard/reusable-qr/QrCardSkeleton";
import { IconQrCode, IconPlus } from "@/components/ui/icons";

/**
 * Reusable QR dashboard tab. Studios print one QR per stand and re-point it at
 * whichever event is currently live, instead of reprinting for every booking:
 * generate a colour-picked QR, view all QRs as full-width cards, link/relink
 * each to a live event, and delete with a typed confirm.
 */
export default function ReusableQrPage() {
  const [qrs, setQrs] = useState<QrCode[] | null>(null);
  const [qrLimit, setQrLimit] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);

  // Local toast — copied verbatim from `useBookingLifecycle`'s pattern rather
  // than inventing a new one.
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((message: string, type: "success" | "error" = "success") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getAllQrCodes();
      setQrs(res.qrs);
      setQrLimit(res.qr_limit);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load your QR codes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Generate: prepend the new QR (newest-first, matching the backend sort) so it
  // appears immediately. Rethrows so the picker can show an inline error (e.g.
  // the hard 400 cap) without losing the picked colour.
  const handleGenerate = useCallback(
    async (colorCode: string) => {
      const { qr } = await generateQrCode(colorCode);
      setQrs((prev) => (prev ? [qr, ...prev] : [qr]));
      notify("QR generated — link it to a live event whenever you're ready.");
    },
    [notify],
  );

  const handleLinked = useCallback(
    (qrUniqueId: string, assigned: AssignedEventSummary) => {
      setQrs((prev) =>
        prev ? prev.map((q) => (q.unique_id === qrUniqueId ? { ...q, assigned_event: assigned } : q)) : prev,
      );
      notify(`QR now points at ${assigned.name}.`);
    },
    [notify],
  );

  const handleUnlink = useCallback(
    async (qr: QrCode) => {
      try {
        await unlinkQr(qr.unique_id);
        setQrs((prev) =>
          prev ? prev.map((q) => (q.unique_id === qr.unique_id ? { ...q, assigned_event: null } : q)) : prev,
        );
        notify("QR unlinked.");
      } catch (err) {
        notify(err instanceof Error ? err.message : "Couldn't unlink the QR", "error");
        throw err; // keep the inline confirm open for a retry
      }
    },
    [notify],
  );

  const handleDelete = useCallback(
    async (qr: QrCode) => {
      try {
        await deleteQr(qr.unique_id);
        setQrs((prev) => (prev ? prev.filter((q) => q.unique_id !== qr.unique_id) : prev));
        notify("QR deleted.");
      } catch (err) {
        notify(err instanceof Error ? err.message : "Could not delete the QR", "error");
        throw err; // keep the confirm modal open for a retry
      }
    },
    [notify],
  );

  const isEmpty = !loading && qrs != null && qrs.length === 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
      <section className="dash-rise flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-brand-muted)]">
            Reusable QR · One sticker, any event
          </p>
          <h1 className="mt-1.5 text-3xl font-bold leading-tight text-[var(--color-brand-ink)]">
            Print once,<br className="hidden sm:block" /> re-point forever.
          </h1>
          <p className="mt-1.5 max-w-lg text-sm text-[var(--color-brand-muted)]">
            Generate a QR for a stand or signage, then re-point it at whichever event is live — no
            reprinting between bookings.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setGenerateOpen(true)}
          className="brand-focus inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-[var(--color-brand-navy)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)]"
        >
          <IconPlus />
          Generate new QR
        </button>
      </section>

      {generateOpen && (
        <QrColorPicker
          qrs={qrs ?? []}
          qrLimit={qrLimit}
          onGenerate={handleGenerate}
          onClose={() => setGenerateOpen(false)}
        />
      )}

      {error && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-lg border border-[var(--color-brand-danger)]/30 bg-[var(--color-brand-danger-soft)] px-4 py-3 text-sm text-[var(--color-brand-danger)]"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void reload()}
            className="brand-focus shrink-0 font-semibold underline"
          >
            Retry
          </button>
        </div>
      )}

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-bold tracking-tight text-[var(--color-brand-ink)]">
            Your QR codes
          </h2>
          {qrs && qrs.length > 0 && (
            <span className="text-xs text-[var(--color-brand-muted)]">
              <span className="font-semibold text-[var(--color-brand-ink)]">{qrs.length}</span>{" "}
              {qrs.length === 1 ? "QR" : "QRs"}
            </span>
          )}
        </div>

        {loading && !qrs ? (
          <QrCardSkeleton />
        ) : isEmpty ? (
          <EmptyState onGenerate={() => setGenerateOpen(true)} />
        ) : (
          qrs &&
          qrs.length > 0 && (
            <div className="dash-stagger grid grid-cols-1 gap-4 2xl:grid-cols-2">
              {qrs.map((qr) => (
                <QrCard
                  key={qr.unique_id}
                  qr={qr}
                  onLinked={handleLinked}
                  onUnlink={handleUnlink}
                  onDelete={handleDelete}
                  notify={notify}
                />
              ))}
            </div>
          )
        )}
      </section>

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 top-6 z-[230] flex justify-center px-4">
          <div
            className={`toast-rise pointer-events-auto inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-semibold text-white shadow-[0_8px_24px_rgba(42,34,24,0.18)] ${
              toast.type === "error" ? "bg-[var(--color-brand-danger)]" : "bg-[var(--color-brand-success)]"
            }`}
          >
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState({ onGenerate }: { onGenerate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-[var(--color-brand-border)] bg-[var(--color-brand-surface)] px-6 py-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[var(--color-brand-bg)] text-[var(--color-brand-muted)]">
        <IconQrCode size={28} />
      </div>
      <div className="space-y-1">
        <p className="text-lg font-bold text-[var(--color-brand-ink)]">No QR codes yet</p>
        <p className="max-w-sm text-sm text-[var(--color-brand-muted)]">
          Generate your first reusable QR, pick a colour, then print it once and re-point it at
          each live event.
        </p>
      </div>
      <button
        type="button"
        onClick={onGenerate}
        className="brand-focus inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--color-brand-navy)] px-5 text-sm font-semibold text-white hover:bg-[var(--color-brand-navy-deep)]"
      >
        <IconPlus />
        Generate new QR
      </button>
    </div>
  );
}

