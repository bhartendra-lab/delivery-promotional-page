"use client";

import { useEffect, useRef, useState } from "react";
import {
  requestWhatsappChangeOtp,
  resendWhatsappChangeOtp,
  verifyWhatsappChangeOtp,
  ApiError,
} from "@/lib/api";
import { setCompany } from "@/lib/auth";
import type { Company } from "@/lib/types";
import { Modal } from "@/components/ui/Modal";
import { OtpCodeInput } from "@/components/onboarding/OtpCodeInput";
import { IconWarningCircle, IconArrowLeft } from "@/components/ui/icons";

const RESEND_SECONDS = 30;
const CODE_LEN = 6;

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
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const codeInputRef = useRef<HTMLInputElement>(null);

  const currentLast10 = (currentNumber ?? "").replace(/\D/g, "").slice(-10);
  const validPhone = phone.length === 10;
  const sameAsCurrent = validPhone && phone === currentLast10;

  useEffect(() => {
    if (step !== "otp" || secondsLeft <= 0) return;
    const id = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [step, secondsLeft]);

  function handleClose() {
    setStep("number");
    setPhone("");
    setCode("");
    setError(null);
    setSecondsLeft(RESEND_SECONDS);
    onClose();
  }

  async function sendCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validPhone || sameAsCurrent || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await requestWhatsappChangeOtp({ whatsappNumber: phone });
      setSecondsLeft(RESEND_SECONDS);
      setStep("otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send the code. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitCode(value: string) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await verifyWhatsappChangeOtp({ code: value });
      setCompany(res.company);
      onSuccess(res.company);
      handleClose();
    } catch (err) {
      setShake(true);
      setTimeout(() => setShake(false), 500);
      setCode("");
      codeInputRef.current?.focus();
      setError(err instanceof Error ? err.message : "Invalid code");
    } finally {
      setSubmitting(false);
    }
  }

  function onCodeChange(v: string) {
    setCode(v);
    if (v.length === CODE_LEN) void submitCode(v);
  }

  async function resend() {
    setResending(true);
    setError(null);
    try {
      await resendWhatsappChangeOtp();
      setSecondsLeft(RESEND_SECONDS);
      setCode("");
      codeInputRef.current?.focus();
    } catch (err) {
      // Drift-safety: if the server's own cooldown disagrees, resume the
      // countdown from its retryAfter rather than erroring outright — same
      // handling as the onboarding OTP step's resend().
      if (err instanceof ApiError && err.status === 429 && err.body && typeof err.body === "object" && "retryAfter" in err.body) {
        const retryAfter = Number((err.body as { retryAfter?: number }).retryAfter);
        setSecondsLeft(Number.isFinite(retryAfter) ? retryAfter : RESEND_SECONDS);
      }
      setError(err instanceof Error ? err.message : "Couldn't resend the code.");
    } finally {
      setResending(false);
    }
  }

  const masked = phone.length === 10 ? `+91 ${phone.slice(0, 2)}••• ••${phone.slice(-2)}` : `+91 ${phone}`;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Change WhatsApp number"
      size="sm"
      headerLeading={
        step === "otp" ? (
          <button
            type="button"
            onClick={() => setStep("number")}
            aria-label="Back"
            className="brand-focus flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--color-brand-muted)] hover:bg-[var(--color-brand-border)] hover:text-[var(--color-brand-ink)]"
          >
            <IconArrowLeft size={14} />
          </button>
        ) : undefined
      }
    >
      {step === "number" ? (
        <form onSubmit={sendCode} className="space-y-4">
          <p className="text-sm text-[var(--color-brand-muted)]">
            We&apos;ll send a 6-digit code to the new number. Your current number stays active until the new
            one is verified.
          </p>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-muted)]">
              New WhatsApp number
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
            {sameAsCurrent && (
              <span className="mt-1.5 block text-xs text-[var(--color-brand-danger)]">
                That&apos;s already your current number.
              </span>
            )}
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
            disabled={!validPhone || sameAsCurrent || submitting}
            className="brand-focus flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-brand-navy)] text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Sending code…" : "Send code"}
          </button>
        </form>
      ) : (
        <div>
          <p className="text-sm text-[var(--color-brand-muted)]">Code sent to {masked}</p>

          <OtpCodeInput ref={codeInputRef} value={code} onChange={onCodeChange} shake={shake} autoFocus length={CODE_LEN} />

          {error && (
            <p
              role="alert"
              aria-live="polite"
              className="mt-3 flex items-start gap-2 rounded-lg border border-[var(--color-brand-danger)]/30 bg-[var(--color-brand-danger-soft)] px-3 py-2.5 text-sm text-[var(--color-brand-danger)]"
            >
              <IconWarningCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </p>
          )}

          <button
            type="button"
            disabled={code.length !== CODE_LEN || submitting}
            onClick={() => submitCode(code)}
            className="brand-focus mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-brand-navy)] text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Verifying…" : "Verify"}
          </button>

          <p className="mt-4 text-center text-xs text-[var(--color-brand-muted)]" aria-live="polite">
            {secondsLeft > 0 ? (
              <>Resend in 0:{String(secondsLeft).padStart(2, "0")}</>
            ) : (
              <button
                type="button"
                onClick={resend}
                disabled={resending}
                className="brand-focus font-semibold text-[var(--color-brand-navy)] underline-offset-2 hover:underline disabled:opacity-60"
              >
                {resending ? "Resending…" : "Resend OTP"}
              </button>
            )}
          </p>
        </div>
      )}
    </Modal>
  );
}
