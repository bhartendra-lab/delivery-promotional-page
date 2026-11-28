"use client";

import { useEffect, useRef, useState } from "react";
import { verifyWhatsappOtp, resendWhatsappOtp, abandonSignup, apiErrorCode, ApiError } from "@/lib/api";
import type { StudioDetailsInput } from "@/lib/api";
import { clearToken, clearCompany } from "@/lib/auth";
import type { Company } from "@/lib/types";
import { IconWarningCircle, IconArrowLeft } from "@/components/ui/icons";
import { OtpCodeInput } from "@/components/onboarding/OtpCodeInput";

const CODE_LEN = 6;
const RESEND_SECONDS = 30;

/**
 * The WhatsApp code for a Studio that signed up by email or Google, sent with
 * the first step's answers (the server saves them only once the code checks
 * out). A number that already has a studio offers "Sign in with WhatsApp
 * instead": the empty account this email just made is removed first, so the
 * email does not keep opening a second, empty studio.
 */
export function WhatsappOtpStep({
  whatsappNumber,
  details,
  onBack,
  onVerified,
}: {
  whatsappNumber: string;
  details: StudioDetailsInput;
  onBack: () => void;
  onVerified: (company: Company) => void;
}) {
  const [numberTaken, setNumberTaken] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [secondsLeft]);

  async function submit(value: string) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await verifyWhatsappOtp({ code: value, ...details });
      onVerified(res.company);
    } catch (err) {
      const errCode = apiErrorCode(err);
      if (errCode === "WHATSAPP_NUMBER_IN_USE") setNumberTaken(true);
      // The city could not be placed after all: back to the first step, which now asks the state.
      if (errCode === "STATE_REQUIRED") {
        onBack();
        return;
      }
      setShake(true);
      setTimeout(() => setShake(false), 500);
      setCode("");
      inputRef.current?.focus();
      setError(err instanceof Error ? err.message : "Invalid code");
    } finally {
      setSubmitting(false);
    }
  }

  function onCodeChange(v: string) {
    setCode(v);
    if (v.length === CODE_LEN) void submit(v);
  }

  async function resend() {
    setResending(true);
    setError(null);
    try {
      await resendWhatsappOtp();
      setSecondsLeft(RESEND_SECONDS);
      setCode("");
      inputRef.current?.focus();
    } catch (err) {
      // Drift-safety: if the server's own cooldown disagrees, resume the
      // countdown from its retryAfter rather than erroring outright.
      if (err instanceof ApiError && err.status === 429 && err.body && typeof err.body === "object" && "retryAfter" in err.body) {
        const retryAfter = Number((err.body as { retryAfter?: number }).retryAfter);
        setSecondsLeft(Number.isFinite(retryAfter) ? retryAfter : RESEND_SECONDS);
      }
      setError(err instanceof Error ? err.message : "Couldn't resend the code.");
    } finally {
      setResending(false);
    }
  }

  async function signInWithWhatsapp() {
    setLeaving(true);
    try {
      await abandonSignup();
    } catch {
      /* Not removable (it has something in it): signing out is still right. */
    }
    clearToken();
    clearCompany();
    window.location.assign(`/login?phone=${encodeURIComponent(whatsappNumber)}`);
  }

  const masked =
    whatsappNumber.length === 10
      ? `+91 ${whatsappNumber.slice(0, 2)}••• ••${whatsappNumber.slice(-2)}`
      : `+91 ${whatsappNumber}`;

  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="brand-focus mb-5 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-brand-muted)] hover:text-[var(--color-brand-ink)]"
      >
        <IconArrowLeft size={13} />
        Change details
      </button>

      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--color-brand-muted)]">
          Verify WhatsApp
        </p>
        <h2 className="text-2xl font-bold text-[var(--color-brand-ink)]">Enter the code</h2>
        <p className="text-sm text-[var(--color-brand-muted)]">Code sent to {masked}</p>
      </div>

      <OtpCodeInput ref={inputRef} value={code} onChange={onCodeChange} shake={shake} autoFocus length={CODE_LEN} />

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

      {numberTaken && (
        <button
          type="button"
          onClick={signInWithWhatsapp}
          disabled={leaving}
          className="brand-focus mt-3 flex h-11 w-full items-center justify-center rounded-lg border border-[var(--color-brand-navy)] text-sm font-semibold text-[var(--color-brand-navy)] hover:bg-[var(--color-brand-navy-soft)] disabled:opacity-60"
        >
          {leaving ? "Signing out…" : "Sign in with this WhatsApp number instead"}
        </button>
      )}

      <button
        type="button"
        disabled={code.length !== CODE_LEN || submitting}
        onClick={() => submit(code)}
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
    </>
  );
}
