"use client";

import { useEffect, useRef, useState } from "react";
import type { ClientTheme } from "@/lib/client-theme";
import { ApiError, requestGuestOtp, resendGuestOtp, verifyGuestOtp } from "@/lib/api";
import { setGuestToken } from "@/lib/guest-auth";
import { LockIcon, GoogleG } from "./loginIcons";

const CODE_LEN = 6;
const RESEND_SECONDS = 30;
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

/** "9876543210" -> "98••• ••210" */
function maskPhone(phone: string): string {
  if (phone.length !== 10) return phone;
  return `${phone.slice(0, 2)}${"•".repeat(3)} ${"•".repeat(2)}${phone.slice(-3)}`;
}

/**
 * Merged sign-in step — phone entry and OTP verification on one screen. The
 * WhatsApp number field stays visible and editable throughout: the 6-digit
 * code boxes reveal inline beneath it once an OTP is sent, and editing the
 * number away from the one the OTP was sent to collapses them back (no
 * separate "change number" nav needed). Google SSO is a de-emphasized text
 * link, shown only once a code is in flight.
 */
export function SignInStep({
  theme: t,
  eventName,
  studio,
  authError,
  uniqueIdentifier,
  onAuthed,
}: {
  theme: ClientTheme;
  eventName: string;
  studio?: string;
  authError: boolean;
  uniqueIdentifier: string;
  /** Guest verified their OTP — re-run `EventFlow`'s session restore in place. */
  onAuthed: () => void;
}) {
  const [phone, setPhone] = useState("");
  // The number the OTP was actually sent to. Not cleared on edit — editing
  // BACK to this exact number restores the OTP view without a re-send, since
  // the code the guest was sent is still valid.
  const [sentPhone, setSentPhone] = useState<string | null>(null);
  const [code, setCode] = useState("");

  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [focused, setFocused] = useState<"phone" | null>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);

  const formValid = phone.length === 10;
  const otpVisible = sentPhone !== null && phone === sentPhone;

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [secondsLeft]);

  function onPhoneChange(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, 10);
    setPhone(digits);
    // Only an actual divergence from the sent-to number collapses the OTP
    // view — editing back to that same number restores it for free below.
    if (sentPhone !== null && digits !== sentPhone) {
      setCode("");
      setSecondsLeft(0);
      setError(null);
    }
  }

  /** Shared by the first send and any resend triggered by editing back to a
   *  fresh number — both are the same "send me a code" action server-side. */
  async function sendOtp() {
    if (!formValid || sending) return;
    setSending(true);
    setError(null);
    try {
      await requestGuestOtp({ uniqueIdentifier, phone });
      setSentPhone(phone);
      setCode("");
      setSecondsLeft(RESEND_SECONDS);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        // A code was already sent to this number recently — it's likely still
        // valid, so still reveal the entry boxes instead of a dead-end error.
        const body = err.body as { retryAfter?: number } | null;
        setSentPhone(phone);
        setCode("");
        setSecondsLeft(typeof body?.retryAfter === "number" ? body.retryAfter : RESEND_SECONDS);
      } else {
        setError(err instanceof ApiError ? err.message : "Couldn’t send the code. Please try again.");
      }
    } finally {
      setSending(false);
    }
  }

  async function submitOtp(value: string) {
    if (!sentPhone) return;
    setVerifying(true);
    setError(null);
    try {
      const { token } = await verifyGuestOtp({ uniqueIdentifier, phone: sentPhone, code: value });
      setGuestToken(uniqueIdentifier, token);
      onAuthed();
    } catch (err) {
      setVerifying(false);
      setShake(true);
      setError(err instanceof ApiError ? err.message : "Couldn’t verify — try again.");
      setTimeout(() => {
        setCode("");
        setShake(false);
        codeInputRef.current?.focus();
      }, 500);
    }
  }

  function onCodeChange(raw: string) {
    if (verifying) return;
    const v = raw.replace(/\D/g, "").slice(0, CODE_LEN);
    setCode(v);
    if (error) setError(null);
    if (v.length === CODE_LEN) void submitOtp(v);
  }

  async function resend() {
    if (secondsLeft > 0 || resending || !sentPhone) return;
    setResending(true);
    setError(null);
    try {
      await resendGuestOtp({ uniqueIdentifier, phone: sentPhone });
      setSecondsLeft(RESEND_SECONDS);
      setCode("");
      codeInputRef.current?.focus();
    } catch (err) {
      // Safety net: if the UI and server cooldowns ever drift, resume the
      // countdown from the server's own retryAfter instead of surfacing a
      // dead-end error.
      if (err instanceof ApiError && err.status === 429) {
        const body = err.body as { retryAfter?: number } | null;
        setSecondsLeft(typeof body?.retryAfter === "number" ? body.retryAfter : RESEND_SECONDS);
      } else {
        setError(err instanceof ApiError ? err.message : "Couldn’t resend the code. Please try again.");
      }
    } finally {
      setResending(false);
    }
  }

  const googleFallbackHref = `${API_BASE}/auth/google/guest-login?unique_identifier=${encodeURIComponent(uniqueIdentifier)}&phone=${encodeURIComponent(phone)}`;
  const activeIndex = code.length;

  return (
    <>
      {/* headline */}
      <div className="mt-10 flex flex-col gap-2.5 text-center">
        <h1 className="text-[27px] font-extrabold leading-[1.15] tracking-[-0.02em]" style={{ color: t.text }}>
          Find your photos
        </h1>
        <p className="px-1 text-[14.5px] font-semibold leading-[1.5]" style={{ color: t.muted }}>
          Sign in with WhatsApp and we’ll pull out every picture you’re in from {eventName}.
        </p>
      </div>

      {authError && (
        <div
          className="mt-5 flex items-center justify-center gap-2 rounded-xl px-3.5 py-2.5 text-center text-[12.5px] font-semibold"
          style={{ background: t.errorSoft, color: t.error }}
        >
          Sign-in didn’t complete. Please try again.
        </div>
      )}

      {studio && (
        <div className="mb-4 mt-6 flex items-center justify-center gap-2" style={{ color: t.muted }}>
          <LockIcon size={13} />
          <span className="text-[12px] font-bold">A private gallery by {studio}</span>
        </div>
      )}

      <div className="flex flex-col gap-3.5">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-bold uppercase tracking-[0.06em]" style={{ color: t.muted }}>
            WhatsApp number
          </span>
          <div
            className="flex w-full min-h-[52px] items-center gap-2.5"
            style={{
              background: t.sunken,
              border: `1.5px solid ${focused === "phone" ? t.brand : t.border}`,
              borderRadius: t.rField,
              padding: "0 16px",
            }}
          >
            <span className="flex-none select-none text-[15.5px] font-extrabold" style={{ color: t.muted }} aria-hidden>
              +91
            </span>
            <span className="h-5 w-px flex-none" style={{ background: t.border }} aria-hidden />
            <input
              type="tel"
              inputMode="numeric"
              maxLength={10}
              value={phone}
              onChange={(e) => onPhoneChange(e.target.value)}
              onFocus={() => setFocused("phone")}
              onBlur={() => setFocused(null)}
              placeholder="98765 43210"
              autoComplete="tel-national"
              aria-label="WhatsApp number, 10 digits"
              className="w-full min-w-0 flex-1 bg-transparent"
              style={{ fontSize: 15.5, fontWeight: 700, color: t.text, fontFamily: t.font }}
            />
          </div>
        </label>

        {otpVisible && (
          <div className="fx-rise flex flex-col gap-2">
            <span className="text-[12px] font-bold uppercase tracking-[0.06em]" style={{ color: t.muted }}>
              Code sent to +91 {maskPhone(sentPhone)}
            </span>
            <label className={`relative block ${shake ? "guest-shake" : ""}`}>
              <span className="sr-only">Enter the 6-digit code sent to your WhatsApp</span>
              <div className="flex justify-between gap-2">
                {Array.from({ length: CODE_LEN }).map((_, i) => {
                  const char = code[i];
                  const active = i === activeIndex && !verifying;
                  return (
                    <span
                      key={i}
                      className="flex h-14 flex-1 items-center justify-center rounded-xl text-[22px] font-extrabold tabular-nums transition-colors"
                      style={{
                        background: t.card,
                        border: `2px solid ${active || char ? t.brand : t.border}`,
                        color: t.text,
                      }}
                    >
                      {char ? <span className="fx-pop inline-block">{char}</span> : ""}
                    </span>
                  );
                })}
              </div>
              <input
                ref={codeInputRef}
                value={code}
                onChange={(e) => onCodeChange(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                disabled={verifying}
                aria-label="6-digit OTP code"
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                style={{ caretColor: "transparent" }}
              />
            </label>
          </div>
        )}

        {error && (
          <div className="text-[12.5px] font-semibold" style={{ color: t.error }} role="alert" aria-live="polite">
            {error}
          </div>
        )}

        {otpVisible ? (
          <button
            type="button"
            onClick={() => code.length === CODE_LEN && submitOtp(code)}
            disabled={code.length !== CODE_LEN || verifying}
            className="mt-1 flex w-full items-center justify-center gap-2 transition-transform hover:-translate-y-0.5 active:scale-[0.99] disabled:pointer-events-none disabled:cursor-not-allowed"
            style={
              code.length === CODE_LEN
                ? {
                    background: t.brand,
                    color: t.onBrand,
                    borderRadius: t.rField,
                    padding: "15px 0",
                    boxShadow: t.shadowSm,
                    fontSize: 15,
                    fontWeight: 800,
                  }
                : {
                    background: t.sunken,
                    color: t.faint,
                    border: `1.5px solid ${t.border}`,
                    borderRadius: t.rField,
                    padding: "13.5px 0",
                    boxShadow: "none",
                    fontSize: 15,
                    fontWeight: 800,
                  }
            }
          >
            {verifying && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
            {verifying ? "Verifying…" : "Verify"}
          </button>
        ) : (
          <button
            type="button"
            onClick={sendOtp}
            disabled={!formValid || sending}
            className="mt-1 flex w-full items-center justify-center gap-2 transition-transform hover:-translate-y-0.5 active:scale-[0.99] disabled:pointer-events-none disabled:cursor-not-allowed"
            style={
              formValid
                ? {
                    background: t.brand,
                    color: t.onBrand,
                    borderRadius: t.rField,
                    padding: "15px 0",
                    boxShadow: t.shadowSm,
                    fontSize: 15,
                    fontWeight: 800,
                  }
                : {
                    background: t.sunken,
                    color: t.faint,
                    border: `1.5px solid ${t.border}`,
                    borderRadius: t.rField,
                    padding: "13.5px 0",
                    boxShadow: "none",
                    fontSize: 15,
                    fontWeight: 800,
                  }
            }
          >
            {sending && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
            {sending ? "Sending…" : "Send OTP"}
          </button>
        )}

        {otpVisible && (
          <div className="flex items-center justify-center">
            <button
              type="button"
              onClick={resend}
              disabled={secondsLeft > 0 || resending}
              aria-live="polite"
              className="flex min-h-11 cursor-pointer items-center px-1 text-[12.5px] font-bold disabled:cursor-not-allowed"
              style={{ color: secondsLeft > 0 ? t.faint : t.brand }}
            >
              {resending ? "Sending…" : secondsLeft > 0 ? `Resend in 0:${String(secondsLeft).padStart(2, "0")}` : "Resend OTP"}
            </button>
          </div>
        )}
      </div>

      {/* de-emphasized Google fallback — a text link, only once a code is in flight */}
      {otpVisible && (
        <div className="mt-6 flex flex-col items-center gap-1.5 text-center">
          <span className="text-[11.5px] font-semibold" style={{ color: t.faint }}>
            Didn’t get the code?
          </span>
          <a
            href={googleFallbackHref}
            className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 text-[12.5px] font-bold underline underline-offset-2"
            style={{ color: t.brand }}
          >
            <GoogleG size={13} /> Continue with Google instead
          </a>
        </div>
      )}
    </>
  );
}
