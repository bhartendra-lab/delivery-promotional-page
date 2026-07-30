"use client";

import { useEffect, useRef, useState } from "react";
import {
  requestBusinessEmailOtp,
  resendBusinessEmailOtp,
  verifyBusinessEmailOtp,
  ApiError,
} from "@/lib/api";
import { setCompany } from "@/lib/auth";
import type { Company } from "@/lib/types";
import { OtpCodeInput } from "@/components/onboarding/OtpCodeInput";
import { IconWarningCircle, IconArrowLeft } from "@/components/ui/icons";
import { SameAsPersonalCheckbox } from "./SettingsUI";

const RESEND_SECONDS = 30;
const CODE_LEN = 6;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Step = "email" | "code";

/**
 * Inline two-step business-email verify flow, rendered directly inside the
 * Business Information card (not a Modal — this is a "reveal in place"
 * affordance, unlike the WhatsApp number change which is a separate flow).
 *
 * This is a deliberate sibling of `ChangeWhatsappModal`/`WhatsappOtpStep`
 * rather than an extraction of their shared countdown/resend logic — the
 * codebase already tolerates that duplication between those two, and a third
 * near-identical copy here doesn't cross the threshold into a real
 * abstraction (different transport, different container: inline vs. modal).
 */
export function BusinessEmailVerifyBlock({
  currentEmail,
  verified,
  personalEmail,
  onSuccess,
  onClose,
}: {
  /** The already-saved business_email, if any — used for the "already verified" guard. */
  currentEmail?: string;
  verified?: boolean;
  /** From userProfile.personal_email — powers "Same as personal email". */
  personalEmail?: string;
  onSuccess: (company: Company) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState(currentEmail ?? "");
  const [sameAsPersonal, setSameAsPersonal] = useState(false);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const codeInputRef = useRef<HTMLInputElement>(null);

  const trimmedEmail = email.trim();
  const alreadyVerified = verified && currentEmail?.toLowerCase() === trimmedEmail.toLowerCase();
  const canSend = EMAIL_RE.test(trimmedEmail) && !alreadyVerified;

  useEffect(() => {
    if (step !== "code" || secondsLeft <= 0) return;
    const id = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [step, secondsLeft]);

  function toggleSameAsPersonal(next: boolean) {
    setSameAsPersonal(next);
    if (next) setEmail(personalEmail ?? "");
  }

  async function sendCode() {
    if (!canSend || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await requestBusinessEmailOtp({ businessEmail: trimmedEmail });
      setSecondsLeft(RESEND_SECONDS);
      setStep("code");
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
      const res = await verifyBusinessEmailOtp({ code: value });
      // Sync the Topbar/Sidebar cache here (same split as ChangeWhatsappModal);
      // the caller's onSuccess is responsible for setCompanyState + UI cleanup.
      setCompany(res.company);
      onSuccess(res.company);
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
      await resendBusinessEmailOtp();
      setSecondsLeft(RESEND_SECONDS);
      setCode("");
      codeInputRef.current?.focus();
    } catch (err) {
      // Drift-safety: if the server's own cooldown disagrees, resume the
      // countdown from its retryAfter rather than erroring outright — same
      // handling as ChangeWhatsappModal's resend().
      if (err instanceof ApiError && err.status === 429 && err.body && typeof err.body === "object" && "retryAfter" in err.body) {
        const retryAfter = Number((err.body as { retryAfter?: number }).retryAfter);
        setSecondsLeft(Number.isFinite(retryAfter) ? retryAfter : RESEND_SECONDS);
      }
      setError(err instanceof Error ? err.message : "Couldn't resend the code.");
    } finally {
      setResending(false);
    }
  }

  function backToEmail() {
    setStep("email");
    setCode("");
    setError(null);
  }

  return (
    <div className="mt-4 rounded-lg border border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] p-4">
      {step === "email" ? (
        // A plain <div>, not a <form> — this block renders inside the Studio
        // Identity page's own outer <form>, and nested <form>s break on the
        // server-rendered HTML parse (the browser silently closes the outer
        // form) even though React's runtime DOM calls would otherwise allow it.
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-muted)]">
              Verify business email
            </span>
            <button
              type="button"
              onClick={onClose}
              className="brand-focus text-xs font-semibold text-[var(--color-brand-muted)] hover:text-[var(--color-brand-ink)]"
            >
              Cancel
            </button>
          </div>
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setSameAsPersonal(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void sendCode();
              }
            }}
            readOnly={sameAsPersonal}
            required
            placeholder="studio@email.com"
            className={`brand-focus h-10 w-full rounded-lg border border-[var(--color-brand-border)] px-3 text-sm text-[var(--color-brand-ink)] outline-none placeholder:text-[var(--color-brand-muted)]/60 ${
              sameAsPersonal ? "cursor-default bg-[var(--color-brand-border)]/25 text-[var(--color-brand-muted)]" : "bg-white"
            }`}
          />
          {personalEmail && (
            <SameAsPersonalCheckbox
              label="Same as personal email"
              checked={sameAsPersonal}
              onChange={toggleSameAsPersonal}
            />
          )}
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
            type="button"
            onClick={() => void sendCode()}
            disabled={!canSend || submitting}
            className="brand-focus inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[var(--color-brand-navy)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Sending code…" : "Send code"}
          </button>
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={backToEmail}
              aria-label="Back"
              className="brand-focus flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--color-brand-muted)] hover:bg-[var(--color-brand-border)] hover:text-[var(--color-brand-ink)]"
            >
              <IconArrowLeft size={14} />
            </button>
            <p className="text-sm text-[var(--color-brand-muted)]">Code sent to {trimmedEmail}</p>
          </div>

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
    </div>
  );
}
