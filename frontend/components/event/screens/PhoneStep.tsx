"use client";

import { useState } from "react";
import type { ClientTheme } from "@/lib/client-theme";
import { ApiError, requestGuestOtp } from "@/lib/api";
import { LockIcon, ShieldIcon } from "./loginIcons";

/**
 * Screen 1 · Phone entry — the primary, WhatsApp-OTP-only login step. No
 * Google here; SSO is the de-emphasized fallback on Screen 2 (OtpStep) only.
 */
export function PhoneStep({
  theme: t,
  eventName,
  studio,
  authError,
  uniqueIdentifier,
  name,
  phone,
  onNameChange,
  onPhoneChange,
  onSent,
}: {
  theme: ClientTheme;
  eventName: string;
  studio?: string;
  authError: boolean;
  uniqueIdentifier: string;
  name: string;
  phone: string;
  onNameChange: (v: string) => void;
  onPhoneChange: (v: string) => void;
  onSent: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState<"name" | "phone" | null>(null);

  const trimmedName = name.trim();
  const validPhone = phone.length === 10;
  const canSubmit = trimmedName.length > 0 && validPhone && !submitting;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      // The name is collected here but only sent with the OTP verification —
      // the backend won't persist a name from an unverified request.
      await requestGuestOtp({ uniqueIdentifier, phone });
      onSent();
    } catch (err) {
      setSubmitting(false);
      setError(
        err instanceof ApiError ? err.message : "Couldn’t send the code. Please try again.",
      );
    }
  }

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

      <div className="flex-1" />

      {studio && (
        <div className="mb-4 flex items-center justify-center gap-2" style={{ color: t.muted }}>
          <LockIcon size={13} />
          <span className="text-[12px] font-bold">A private gallery by {studio}</span>
        </div>
      )}

      <form onSubmit={submit} noValidate className="flex flex-col gap-3.5">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-bold uppercase tracking-[0.06em]" style={{ color: t.muted }}>
            Full Name
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            onFocus={() => setFocused("name")}
            onBlur={() => setFocused(null)}
            placeholder="e.g. Priya Sharma"
            autoComplete="name"
            className="w-full min-h-[52px]"
            style={{
              background: t.sunken,
              border: `1.5px solid ${focused === "name" ? t.brand : t.border}`,
              borderRadius: t.rField,
              padding: "0 16px",
              fontSize: 15.5,
              fontWeight: 700,
              color: t.text,
              fontFamily: t.font,
            }}
          />
        </label>

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
              onChange={(e) => onPhoneChange(e.target.value.replace(/\D/g, "").slice(0, 10))}
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

        {error && (
          <div className="text-[12.5px] font-semibold" style={{ color: t.error }} role="alert" aria-live="polite">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
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
          {submitting && (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
          )}
          {submitting ? "Sending…" : "Send OTP"}
        </button>
      </form>

      {/* trust line */}
      <div className="mt-4 flex items-start gap-2 px-1.5">
        <ShieldIcon size={16} style={{ color: t.brand, marginTop: 1, flex: "none" }} />
        <span className="text-[12px] font-semibold leading-[1.45]" style={{ color: t.muted }}>
          We use WhatsApp only to confirm it’s really you. We never post, message, or share anything.
        </span>
      </div>
    </>
  );
}
