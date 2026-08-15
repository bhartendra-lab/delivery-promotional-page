"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBooking, ApiError } from "@/lib/api";
import { EVENT_TYPES, type EventType } from "@/lib/types";
import { useChrome } from "./ChromeContext";
import { useUpgradeModal } from "@/components/billing/UpgradeModalProvider";
import { IconX, IconCheck } from "@/components/ui/icons";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function AddEventModal({ open, onClose }: Props) {
  const router = useRouter();
  // Plan type is stamped onto the created booking so getDlpUsage's later
  // aggregation can match bookings by plan. Shared via ChromeContext (single
  // dashboard-wide fetch); may be null while usage is still loading.
  const { dlpUsage } = useChrome();
  const { openUpgradeModal } = useUpgradeModal();
  const [name, setName] = useState("");
  const [eventType, setEventType] = useState<EventType | null>(null);
  const [eventDate, setEventDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets all form state on open transition, not a render loop
    setName("");
    setEventType(null);
    setEventDate("");
    setError(null);
    setSubmitting(false);
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const canSubmit = name.trim().length > 0 && eventType !== null && !submitting;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !eventType) return;
    setSubmitting(true);
    setError(null);
    try {
      const trimmedName = name.trim();
      // Event date is optional — send a numeric epoch only when set, else omit.
      const epoch = eventDate ? new Date(`${eventDate}T00:00:00`).getTime() : NaN;
      const res = await createBooking({
        event_name: trimmedName,
        event_type: eventType,
        ...(Number.isFinite(epoch) ? { event_date: epoch } : {}),
        service_type: dlpUsage?.service_type ?? undefined,
      });
      // Canonical metadata is fetched from getBookingById on the event page; no
      // need to cache it here.
      onClose();
      router.push(`/dashboard/events/${res.booking_id}`);
    } catch (err) {
      setSubmitting(false);
      if (err instanceof ApiError && err.status === 402) {
        onClose();
        openUpgradeModal({ preset: "event" });
        return;
      }
      setError(err instanceof Error ? err.message : "Could not create event");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-20 sm:pt-28" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close modal"
        onClick={submitting ? undefined : onClose}
        className="drawer-fade absolute inset-0 bg-[var(--color-brand-ink)]/40 backdrop-blur-[1px]"
      />
      <form
        onSubmit={submit}
        className="dash-rise relative w-full max-w-[520px] overflow-hidden rounded-xl border border-[var(--color-brand-border)] bg-white shadow-[0_12px_40px_rgba(42,34,24,0.12)]"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-brand-border)] px-6 py-4">
          <div>
            <h2 className="text-[18px] font-bold leading-tight tracking-tight text-[var(--color-brand-ink)]">
              Add new event
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-brand-muted)]">
              Create a page for this booking. You can upload photos and share the link in the next step.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="brand-focus flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--color-brand-muted)] hover:bg-[var(--color-brand-surface)] hover:text-[var(--color-brand-ink)] disabled:opacity-50"
            aria-label="Close"
          >
            <IconX size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 pt-5">
          <div className="mb-5">
            <label className="mb-2 block text-[12.5px] font-semibold text-[var(--color-brand-ink)]">
              Event name <span className="ml-0.5 text-[var(--color-brand-navy)]">*</span>
            </label>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Rohan & Aanya Wedding"
              disabled={submitting}
              className="brand-focus block w-full rounded-lg border border-[var(--color-brand-border)] bg-white px-3.5 py-2.5 text-[14px] text-[var(--color-brand-ink)] outline-none placeholder:text-[var(--color-brand-muted)]/70"
            />
          </div>

          <div className="mb-5">
            <label className="mb-2 block text-[12.5px] font-semibold text-[var(--color-brand-ink)]">
              Event type <span className="ml-0.5 text-[var(--color-brand-navy)]">*</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {EVENT_TYPES.map((t) => {
                const active = t === eventType;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setEventType(t)}
                    disabled={submitting}
                    className={`brand-focus inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-[13px] transition-colors ${
                      active
                        ? "border border-[var(--color-brand-navy)] bg-[var(--color-brand-navy-soft)] font-semibold text-[var(--color-brand-navy)]"
                        : "border border-[var(--color-brand-border)] bg-white font-medium text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)]"
                    }`}
                  >
                    {active && (
                      <IconCheck size={13} weight="bold" />
                    )}
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mb-6">
            <label
              htmlFor="add-event-date"
              className="mb-2 block text-[12.5px] font-semibold text-[var(--color-brand-ink)]"
            >
              Event date{" "}
              <span className="font-medium text-[var(--color-brand-muted)]">(optional)</span>
            </label>
            <input
              id="add-event-date"
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              disabled={submitting}
              className="brand-focus block w-full rounded-lg border border-[var(--color-brand-border)] bg-white px-3.5 py-2.5 text-[14px] text-[var(--color-brand-ink)] outline-none"
            />
          </div>

          {error && (
            <p role="alert" className="mb-4 rounded-lg border border-[var(--color-brand-danger)]/30 bg-[var(--color-brand-danger-soft)] px-3 py-2 text-[12.5px] text-[var(--color-brand-danger)]">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 border-t border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] px-6 py-3.5">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="brand-focus inline-flex h-10 items-center rounded-lg border border-[var(--color-brand-border)] bg-white px-4 text-[13.5px] font-medium text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="brand-focus inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--color-brand-navy)] px-4 text-[13.5px] font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-[2px] border-white/60 border-t-white" />
                Creating…
              </>
            ) : (
              "Create event"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
