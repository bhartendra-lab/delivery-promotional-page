"use client";

import { forwardRef } from "react";

type OtpCodeInputProps = {
  value: string;
  onChange: (value: string) => void;
  shake?: boolean;
  autoFocus?: boolean;
  length?: number;
};

/**
 * Six-box OTP display over a single invisible real input — one input keeps
 * paste/autofill/mobile-keyboard behavior simple, the boxes are purely
 * decorative. Shared by the onboarding WhatsApp step and the settings
 * "change number" modal so the two never drift apart.
 */
export const OtpCodeInput = forwardRef<HTMLInputElement, OtpCodeInputProps>(function OtpCodeInput(
  { value, onChange, shake, autoFocus, length = 6 },
  ref,
) {
  return (
    <div className="relative mt-7">
      <div className={`flex justify-between gap-2 ${shake ? "guest-shake" : ""}`}>
        {Array.from({ length }).map((_, i) => (
          <div
            key={i}
            className="flex h-12 flex-1 items-center justify-center rounded-lg border text-lg font-bold tabular-nums"
            style={{
              borderColor: value.length === i ? "var(--color-brand-outline)" : "var(--color-brand-border)",
              background: "var(--color-brand-bg)",
              color: "var(--color-brand-ink)",
            }}
          >
            {value[i] ?? ""}
          </div>
        ))}
      </div>
      <input
        ref={ref}
        type="text"
        inputMode="numeric"
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, length))}
        aria-label={`${length}-digit verification code`}
        className="absolute inset-0 h-12 w-full cursor-default opacity-0"
      />
    </div>
  );
});
