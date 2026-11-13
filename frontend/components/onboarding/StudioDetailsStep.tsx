"use client";

import { useEffect, useState } from "react";
import { ApiError, attachReferral, requestWhatsappOtp, resolveReferral } from "@/lib/api";
import { normalizeReferralCode } from "@/lib/referral";
import { clearStoredReferral, getStoredReferral } from "@/lib/referral-storage";
import { IconWarningCircle } from "@/components/ui/icons";

/**
 * The optional Referral code, attached when the step is submitted (lib/referral.ts
 * keeps a code from a referral link until now). It never blocks onboarding: a
 * refused code shows the server's sentence under the field, and submitting
 * again with the same code goes on without it.
 */
type ReferralField = {
  code: string;
  /** The inviting studio's name when the code came from a link and resolved: shown as a chip. */
  invitedBy: string | null;
  source: "link" | "manual";
  /** Attached (or the studio already had a referral): nothing more to send. */
  done: boolean;
  /** The code that was refused, so the next submit goes on without it. */
  refused: string | null;
  error: string | null;
};

export function StudioDetailsStep({
  onSent,
}: {
  onSent: (studioName: string, whatsappNumber: string) => void;
}) {
  const [studioName, setStudioName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [referral, setReferral] = useState<ReferralField>({
    code: "",
    invitedBy: null,
    source: "manual",
    done: false,
    refused: null,
    error: null,
  });

  // Prefill from a referral link, and name the inviting studio when the code is real.
  useEffect(() => {
    const stored = getStoredReferral();
    if (!stored) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount; reading it in the initializer would mismatch the server render
    setReferral((r) => ({ ...r, code: stored.code, source: "link" }));
    resolveReferral(stored.code)
      .then((res) => {
        if (!cancelled && res.valid) setReferral((r) => (r.code === stored.code ? { ...r, invitedBy: res.studio_name ?? stored.code } : r));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const validPhone = phone.length === 10;
  const canSubmit = studioName.trim().length > 0 && validPhone && !submitting;

  /** Attaches the Referral code if there is one to attach. False only when it was refused just now. */
  async function attachReferralCode(): Promise<boolean> {
    const code = normalizeReferralCode(referral.code);
    if (referral.done || !code || code === referral.refused) return true;
    try {
      await attachReferral({ code, source: referral.source });
      clearStoredReferral();
      setReferral((r) => ({ ...r, done: true, error: null }));
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // The studio already has a referral: first attach wins.
        clearStoredReferral();
        setReferral((r) => ({ ...r, done: true, error: null }));
        return true;
      }
      const message = err instanceof Error ? err.message : "This referral code could not be added.";
      setReferral((r) => ({ ...r, invitedBy: null, refused: code, error: `${message} Change it, or continue without it.` }));
      return false;
    }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      if (!(await attachReferralCode())) return;
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

        {!referral.done && (
          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-muted)]">
              Referral code <span className="normal-case tracking-normal">(optional)</span>
            </span>
            {referral.invitedBy ? (
              <div className="flex h-11 items-center justify-between gap-3 rounded-lg border border-[var(--color-brand-border)] bg-[var(--color-brand-navy-soft)] px-3">
                <span className="truncate text-sm font-semibold text-[var(--color-brand-ink)]">
                  Referred by {referral.invitedBy}
                </span>
                <button
                  type="button"
                  onClick={() => setReferral((r) => ({ ...r, invitedBy: null, source: "manual" }))}
                  className="brand-focus shrink-0 rounded-sm text-xs font-semibold text-[var(--color-brand-navy)] underline underline-offset-2 hover:text-[var(--color-brand-navy-deep)]"
                >
                  Change
                </button>
              </div>
            ) : (
              <input
                type="text"
                value={referral.code}
                onChange={(e) =>
                  setReferral((r) => ({ ...r, code: e.target.value.toUpperCase().slice(0, 24), source: "manual", error: null }))
                }
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                placeholder="If another studio invited you"
                aria-invalid={referral.error ? true : undefined}
                aria-describedby={referral.error ? "referral-code-error" : undefined}
                className="brand-focus h-11 w-full rounded-lg border border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] px-3 font-mono text-sm tracking-[0.08em] text-[var(--color-brand-ink)] outline-none placeholder:font-sans placeholder:tracking-normal placeholder:text-[var(--color-brand-muted)]/70"
              />
            )}
            {referral.error && (
              <p id="referral-code-error" className="mt-1.5 text-xs text-[var(--color-brand-danger)]">
                {referral.error}
              </p>
            )}
          </div>
        )}

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
