"use client";

import { useState } from "react";
import { requestWhatsappOtp } from "@/lib/api";
import { IconWarningCircle } from "@/components/ui/icons";

export function StudioDetailsStep({
  onSent,
}: {
  onSent: (studioName: string, whatsappNumber: string) => void;
}) {
  const [studioName, setStudioName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validPhone = phone.length === 10;
  const canSubmit = studioName.trim().length > 0 && validPhone && !submitting;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await requestWhatsappOtp({ whatsappNumber: phone });
      onSent(studioName.trim(), phone);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send the code. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--color-brand-muted)]">
          Set up your studio
        </p>
        <h2 className="text-2xl font-bold text-[var(--color-brand-ink)]">Tell us about your studio</h2>
        <p className="text-sm text-[var(--color-brand-muted)]">
          Confirm your studio name and verify a WhatsApp number — delivery notifications and client
          replies go here.
        </p>
      </div>

      <form onSubmit={submit} className="mt-7 space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-muted)]">
            Studio name
          </span>
          <input
            type="text"
            value={studioName}
            onChange={(e) => setStudioName(e.target.value)}
            required
            placeholder="e.g. Radiant Studios"
            className="brand-focus h-11 w-full rounded-lg border border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] px-3 text-sm text-[var(--color-brand-ink)] outline-none placeholder:text-[var(--color-brand-muted)]/70"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-muted)]">
            WhatsApp number
          </span>
          <div className="flex h-11 items-center rounded-lg border border-[var(--color-brand-border)] bg-[var(--color-brand-bg)]">
            <span className="flex h-full items-center border-r border-[var(--color-brand-border)] px-3 text-sm font-medium text-[var(--color-brand-muted)]">
              +91
            </span>
            <input
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              maxLength={10}
              required
              placeholder="98765 43210"
              className="brand-focus h-full flex-1 bg-transparent px-3 text-sm text-[var(--color-brand-ink)] outline-none placeholder:text-[var(--color-brand-muted)]/60"
            />
          </div>
        </label>

        {error && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-[var(--color-brand-danger)]/30 bg-[var(--color-brand-danger-soft)] px-3 py-2.5 text-sm text-[var(--color-brand-danger)]"
          >
            <IconWarningCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </p>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="brand-focus flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-brand-navy)] text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Sending code…" : "Send code"}
        </button>
      </form>
    </>
  );
}
