"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { OtpCodeInput } from "@/components/onboarding/OtpCodeInput";
import { IconWarningCircle, IconArrowLeft } from "@/components/ui/icons";

const RESEND_SECONDS = 30;
const CODE_LEN = 6;

/**
 * The OTP-entry step shared by the business-email and WhatsApp-number verify
 * flows (Settings → Studio Identity): code input, auto-submit at CODE_LEN,
 * the error box, Verify, the resend countdown, and resend's 429/retryAfter
 * drift-safety. Step 1 — collecting the destination — stays owned by each
 * caller; it's genuinely different there (email input + "same as login
 * email" vs. the +91 PhoneField) and isn't folded in here.
 *
 * `destination` is always shown in full, never masked: the user just typed
 * it into the field directly above and needs to confirm it's right — a
 * differently-obscured redisplay of what they entered seconds ago adds a
 * recall burden with no real privacy benefit on the user's own screen.
 *
 * Each caller renders this behind its own step conditional (a distinct
 * component in a ternary, not toggled by a prop), so going back fully
 * unmounts it. A fresh "Send code" always mounts a clean instance — the
 * countdown, code, error and shake state all reset for free without either
 * caller having to remember to clear them by hand.
 */
export function OtpCodeStep({
  destination,
  onBack,
  onVerify,
  onResend,
}: {
  /** Shown as "Code sent to {destination}" — always in full, see above. */
  destination: string;
  onBack: () => void;
  /** Verify the code against the backend; throw (with a user-facing message) on failure. */
  onVerify: (code: string) => Promise<void>;
  /** Request a fresh code. The caller already closes over its own explicit
   *  target (see the resend-target-mismatch fix in the request layer). */
  onResend: () => Promise<{ message: string }>;
}) {
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  // A wall-clock deadline, not a tick counter. Deriving secondsLeft from
  // `deadline - Date.now()` on every tick means a throttled/backgrounded tab
  // catches up instantly on the next tick instead of drifting — the old
  // per-tick setInterval-with-secondsLeft-in-deps version tore the interval
  // down and rebuilt it every second, turning it into a chain of timeouts
  // rather than a clock, and under-counted badly once the tab lost focus.
  const [deadline, setDeadline] = useState(() => Date.now() + RESEND_SECONDS * 1000);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const codeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function tick() {
      setSecondsLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    }
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [deadline]);

  async function submitCode(value: string) {
    setSubmitting(true);
    setError(null);
    try {
      await onVerify(value);
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
      await onResend();
      setDeadline(Date.now() + RESEND_SECONDS * 1000);
      setCode("");
      codeInputRef.current?.focus();
    } catch (err) {
      // Drift-safety: if the server's own cooldown disagrees, resume the
      // countdown from its retryAfter rather than erroring outright.
      if (err instanceof ApiError && err.status === 429 && err.body && typeof err.body === "object" && "retryAfter" in err.body) {
        const retryAfter = Number((err.body as { retryAfter?: number }).retryAfter);
        setDeadline(Date.now() + (Number.isFinite(retryAfter) ? retryAfter : RESEND_SECONDS) * 1000);
      }
      setError(err instanceof Error ? err.message : "Couldn't resend the code.");
    } finally {
      setResending(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="brand-focus flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--color-brand-muted)] hover:bg-[var(--color-brand-border)] hover:text-[var(--color-brand-ink)]"
        >
          <IconArrowLeft size={14} />
        </button>
        <p className="text-sm text-[var(--color-brand-muted)]">Code sent to {destination}</p>
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
  );
}
