"use client";

import { useEffect, useRef, useState } from "react";
import type { ClientTheme } from "@/lib/client-theme";
import { ApiError, resendGuestOtp, verifyGuestOtp } from "@/lib/api";
import { setGuestToken } from "@/lib/guest-auth";
import { ChevronLeftIcon, GoogleG } from "./loginIcons";

const CODE_LEN = 6;
const RESEND_SECONDS = 30;
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

/** "9876543210" -> "98••• ••210" */
function maskPhone(phone: string): string {
  if (phone.length !== 10) return phone;
  return `${phone.slice(0, 2)}${"•".repeat(3)} ${"•".repeat(2)}${phone.slice(-3)}`;
}

/**
 * Screen 2 · OTP verification — the 6-digit code entry, with a de-emphasized
 * "Continue with Google" fallback at the bottom for guests whose WhatsApp
 * message never arrives. On success it stores the guest token and does a full
 * navigation back into the event, mirroring `AuthCallbackClient` so `EventFlow`
 * remounts and restores the session the same way it does for Google guests.
 */
export function OtpStep({
  theme: t,
  uniqueIdentifier,
  name,
  phone,
  onBack,
}: {
  theme: ClientTheme;
  uniqueIdentifier: string;
  name: string;
  phone: string;
  onBack: () => void;
}) {
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
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
    setVerifying(true);
    setError(null);
    try {
      // `name` rides along so the backend can persist it now that the code
      // proves the guest owns this number — it's ignored before verification.
      const { token } = await verifyGuestOtp({ uniqueIdentifier, phone, code: value, name });
      setGuestToken(uniqueIdentifier, token);
      window.location.replace(`/event/${encodeURIComponent(uniqueIdentifier)}`);
    } catch (err) {
      setVerifying(false);
      setShake(true);
      setError(err instanceof ApiError ? err.message : "Couldn’t verify — try again.");
      setTimeout(() => {
        setCode("");
        setShake(false);
        inputRef.current?.focus();
      }, 500);
    }
  }

  function onCodeChange(raw: string) {
    if (verifying) return;
    const v = raw.replace(/\D/g, "").slice(0, CODE_LEN);
    setCode(v);
    if (error) setError(null);
    if (v.length === CODE_LEN) void submit(v);
  }

  async function resend() {
    if (secondsLeft > 0 || resending) return;
    setResending(true);
    setError(null);
    try {
      await resendGuestOtp({ uniqueIdentifier, phone });
      setSecondsLeft(RESEND_SECONDS);
      setCode("");
      inputRef.current?.focus();
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
          Enter the code
        </h1>
        <p className="px-1 text-[14.5px] font-semibold leading-[1.5]" style={{ color: t.muted }}>
          {name ? `${name}, code` : "Code"} sent on WhatsApp to{" "}
          <span style={{ color: t.text }}>+91 {maskPhone(phone)}</span>
        </p>
      </div>

      <div className="flex-1" />

      {/* OTP boxes — a transparent input over them captures the keyboard */}
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
                  background: t.sunken,
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
          ref={inputRef}
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

      <div className="mt-3 min-h-5 text-center text-[12.5px] font-semibold" style={{ color: t.error }} role="alert" aria-live="polite">
        {error ?? ""}
      </div>

      <button
        type="button"
        onClick={() => code.length === CODE_LEN && submit(code)}
        disabled={code.length !== CODE_LEN || verifying}
        className="mt-1 flex w-full items-center justify-center gap-2 transition-transform hover:-translate-y-0.5 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-55"
        style={{
          background: t.brand,
          color: t.onBrand,
          borderRadius: t.rField,
          padding: "15px 0",
          boxShadow: t.shadowSm,
          fontSize: 15,
          fontWeight: 800,
        }}
      >
        {verifying && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
        {verifying ? "Verifying…" : "Verify"}
      </button>

      {/* resend + change number */}
      <div className="mt-2 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex min-h-11 cursor-pointer items-center gap-1 px-1 text-[12.5px] font-bold"
          style={{ color: t.muted }}
        >
          <ChevronLeftIcon size={14} /> Change number
        </button>

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

      {/* de-emphasized Google fallback — only on this screen */}
      <div className="mt-7 flex flex-col items-center gap-2.5 border-t pt-6" style={{ borderColor: t.border }}>
        <span className="text-[11.5px] font-semibold" style={{ color: t.faint }}>
          Didn’t get the code?
        </span>
        <a
          href={googleFallbackHref}
          className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-2.5 transition-transform hover:-translate-y-0.5 active:scale-[0.99]"
          style={{
            background: "transparent",
            border: `1px solid ${t.border}`,
            borderRadius: t.rField,
            padding: "12px 0",
            fontSize: 13,
            fontWeight: 700,
            color: t.muted,
          }}
        >
          <GoogleG size={15} /> Continue with Google
        </a>
      </div>
    </>
  );
}
