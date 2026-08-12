"use client";

import { useState } from "react";
import { requestWhatsappChangeOtp, resendWhatsappChangeOtp, verifyWhatsappChangeOtp } from "@/lib/api";
import { setCompany } from "@/lib/auth";
import type { Company } from "@/lib/types";
import { Modal } from "@/components/ui/Modal";
import { IconWarningCircle } from "@/components/ui/icons";
import { PhoneField, extractIndianNational } from "./SettingsUI";
import { OtpCodeStep } from "./OtpCodeStep";

type Step = "number" | "otp";

export function ChangeWhatsappModal({
  open,
  onClose,
  currentNumber,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  /** The studio's current verified number, for the "already your current number" check. */
  currentNumber?: string;
  /** Fired after a successful verify, before this modal closes itself. */
  onSuccess: (company: Company) => void;
}) {
  const [step, setStep] = useState<Step>("number");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // extractIndianNational returns null for a stored value that doesn't
  // unambiguously parse as an Indian mobile number (legacy/foreign data) —
  // falling back to "" there means the "already your current number" guard
  // simply doesn't fire rather than guessing, consistent with how the
  // read-only display (VerifiedWhatsappField) treats the same ambiguity.
  const currentLast10 = extractIndianNational(currentNumber) ?? "";
  const validPhone = phone.length === 10;
  const sameAsCurrent = validPhone && phone === currentLast10;

  function handleClose() {
    setStep("number");
    setPhone("");
    setError(null);
    onClose();
  }

  async function sendCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validPhone || sameAsCurrent || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await requestWhatsappChangeOtp({ whatsappNumber: phone });
      setStep("otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send the code. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerify(code: string) {
    const res = await verifyWhatsappChangeOtp({ code });
    setCompany(res.company);
    onSuccess(res.company);
    handleClose();
  }

  const displayPhone = `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`;

  return (
    <Modal open={open} onClose={handleClose} title="Change WhatsApp number" size="sm">
      {step === "number" ? (
        // A real <form> — safe now that Modal portals to document.body, so
        // this is no longer nested inside Studio Identity's own <form>.
        <form onSubmit={sendCode} className="space-y-4">
          <p className="text-sm text-[var(--color-brand-muted)]">
            We&apos;ll send a 6-digit code to the new number. Your current number stays active until the new
            one is verified.
          </p>

          <PhoneField label="New WhatsApp number" value={phone} onChange={setPhone} required />
          {sameAsCurrent && (
            <span className="block text-xs text-[var(--color-brand-danger)]">
              That&apos;s already your current number.
            </span>
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
            disabled={!validPhone || sameAsCurrent || submitting}
            className="brand-focus flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-brand-navy)] text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Sending code…" : "Send code"}
          </button>
        </form>
      ) : (
        <OtpCodeStep
          destination={displayPhone}
          onBack={() => setStep("number")}
          onVerify={handleVerify}
          onResend={() => resendWhatsappChangeOtp({ whatsappNumber: phone })}
        />
      )}
    </Modal>
  );
}
