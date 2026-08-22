"use client";

import { useState } from "react";
import { requestBusinessEmailOtp, resendBusinessEmailOtp, verifyBusinessEmailOtp } from "@/lib/api";
import { setCompany } from "@/lib/auth";
import type { Company } from "@/lib/types";
import { Modal } from "@/components/ui/Modal";
import { IconWarningCircle } from "@/components/ui/icons";
import { SameAsCheckbox } from "./SettingsUI";
import { OtpCodeStep } from "./OtpCodeStep";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Step = "email" | "code";

/**
 * Business email verify flow — sibling of ChangeWhatsappModal, same shape
 * (Modal + the shared OtpCodeStep from the code step). Step 1 stays
 * genuinely different by design: email input + "same as login email" here,
 * the +91 PhoneField there. Everything else — header, back path, button
 * sizing, error box, success handling — is meant to be identical.
 */
export function ChangeBusinessEmailModal({
  open,
  onClose,
  currentEmail,
  verified,
  loginEmail,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  /** The already-saved business_email, if any — used for the "already verified" guard. */
  currentEmail?: string;
  verified?: boolean;
  /** From userProfile.email — powers "Same as login email". Always present once the
   *  profile has loaded; the checkbox shows disabled (not hidden) until then. */
  loginEmail?: string;
  /** Fired after a successful verify, before this modal closes itself. */
  onSuccess: (company: Company) => void;
}) {
  const [step, setStep] = useState<Step>("email");
  // Opens empty even though a currentEmail may exist (it's already visible
  // on the field above, via VerifiedBusinessEmailField) — a modal opened
  // specifically to CHANGE the address must not start with "Send code"
  // already disabled because the field happens to match the current value.
  const [email, setEmail] = useState("");
  const [sameAsLogin, setSameAsLogin] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedEmail = email.trim();
  const alreadyVerified = verified && currentEmail?.toLowerCase() === trimmedEmail.toLowerCase();
  const canSend = EMAIL_RE.test(trimmedEmail) && !alreadyVerified;

  function handleClose() {
    setStep("email");
    setEmail("");
    setSameAsLogin(false);
    setError(null);
    onClose();
  }

  function toggleSameAsLogin(next: boolean) {
    setSameAsLogin(next);
    if (next) setEmail(loginEmail ?? "");
  }

  async function sendCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSend || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await requestBusinessEmailOtp({ businessEmail: trimmedEmail });
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send the code. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerify(code: string) {
    const res = await verifyBusinessEmailOtp({ code });
    setCompany(res.company);
    onSuccess(res.company);
    handleClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Verify business email" size="sm">
      {step === "email" ? (
        <form onSubmit={sendCode} className="space-y-4">
          <p className="text-sm text-[var(--color-brand-muted)]">
            We&apos;ll send a 6-digit code to confirm this address.
          </p>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-muted)]">
              Business email
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setSameAsLogin(false);
              }}
              readOnly={sameAsLogin}
              required
              autoFocus
              placeholder="studio@email.com"
              className={`brand-focus h-10 w-full rounded-lg border border-[var(--color-brand-border)] px-3 text-sm text-[var(--color-brand-ink)] outline-none placeholder:text-[var(--color-brand-muted)]/60 ${
                sameAsLogin ? "cursor-default bg-[var(--color-brand-border)]/25 text-[var(--color-brand-muted)]" : "bg-[var(--color-brand-bg)]"
              }`}
            />
          </label>
          <SameAsCheckbox
            label="Same as login email"
            checked={sameAsLogin}
            onChange={toggleSameAsLogin}
            disabled={!loginEmail}
          />
          {alreadyVerified && (
            <p className="text-xs text-[var(--color-brand-muted)]">That address is already verified.</p>
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
            disabled={!canSend || submitting}
            className="brand-focus flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-brand-navy)] text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Sending code…" : "Send code"}
          </button>
        </form>
      ) : (
        <OtpCodeStep
          destination={trimmedEmail}
          onBack={() => setStep("email")}
          onVerify={handleVerify}
          onResend={() => resendBusinessEmailOtp({ businessEmail: trimmedEmail })}
        />
      )}
    </Modal>
  );
}
