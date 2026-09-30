"use client";

import { forwardRef, useState } from "react";

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
  // The real input is invisible, so the boxes have to show its focus: while it
  // has focus, the box the next digit lands in is highlighted (the last box
  // once all are filled). No highlight without focus — it would suggest typing
  // goes somewhere when it doesn't.
  const [focused, setFocused] = useState(false);
  const activeIndex = Math.min(value.length, length - 1);

  return (
    <div className="relative mt-7">
      <div className={`flex justify-between gap-2 ${shake ? "guest-shake" : ""}`}>
        {Array.from({ length }).map((_, i) => {
          const active = focused && i === activeIndex;
          return (
            <div
              key={i}
              className="flex h-12 flex-1 items-center justify-center rounded-lg border text-lg font-bold tabular-nums transition-[border-color,box-shadow] duration-150"
              style={{
                borderColor: active ? "var(--color-brand-navy)" : "var(--color-brand-border)",
                boxShadow: active ? "0 0 0 3px var(--color-brand-navy-soft)" : "none",
                background: active ? "#fff" : "var(--color-brand-bg)",
                color: "var(--color-brand-ink)",
              }}
            >
              {value[i] ?? ""}
            </div>
          );
        })}
      </div>
      <input
        ref={ref}
        type="text"
        inputMode="numeric"
        autoFocus={autoFocus}
        value={value}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, length))}
        aria-label={`${length}-digit verification code`}
        className="absolute inset-0 h-12 w-full cursor-default opacity-0"
      />
    </div>
  );
});
