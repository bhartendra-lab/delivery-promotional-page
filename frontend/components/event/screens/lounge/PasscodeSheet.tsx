"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { verifyFamilyPasscode } from "@/lib/guest-api";
import { useEventTheme } from "../../EventThemeContext";
import { IconX } from "@/components/ui/icons";

const LEN = 6; // backend mints a 6-digit numeric gallery passcode.

/**
 * Passcode entry — a centered modal with one box per digit (OTP-style) driven by
 * the keyboard. The real code never reaches the client, so it's verified
 * server-side via `verify-family-passcode`; a wrong code shakes and clears.
 * Success promotes the guest to host (All Photos unlocked).
 */
export function PasscodeSheet({ onSuccess, onClose }: { onSuccess: () => void; onClose: () => void }) {
  const { theme: t, event, uniqueIdentifier } = useEventTheme();
  const [code, setCode] = useState("");
  const [shake, setShake] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function submit(value: string) {
    setBusy(true);
    setError(null);
    try {
      await verifyFamilyPasscode(uniqueIdentifier, event.delivery_landing_page_id, value);
      setDone(true);
      setTimeout(onSuccess, 550);
    } catch (err) {
      setBusy(false);
      setShake(true);
      setError(err instanceof ApiError && err.status === 400 ? "That passcode didn’t work." : "Couldn’t verify — try again.");
      setTimeout(() => {
        setCode("");
        setShake(false);
        inputRef.current?.focus();
      }, 600);
    }
  }

  function onChange(raw: string) {
    if (busy || done) return;
    const v = raw.replace(/\D/g, "").slice(0, LEN);
    setCode(v);
    if (error) setError(null);
    if (v.length === LEN) void submit(v);
  }

  const activeIndex = code.length;

  return (
    <div
      className="dash-fade fixed inset-0 z-[60] flex items-center justify-center p-5"
      style={{ background: "rgba(31,26,14,0.55)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="popup-pop w-full max-w-[420px] rounded-3xl p-7 sm:p-8"
        style={{ background: t.card, fontFamily: t.font, boxShadow: t.shadow }}
      >
        <div className="mb-6 flex items-start justify-between">
          <div>
            <div className="text-[19px] font-extrabold" style={{ color: t.text }}>Enter passcode</div>
            <div className="mt-1 text-[12.5px] font-semibold" style={{ color: t.muted }}>
              Shared by the host
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="cursor-pointer" style={{ color: t.muted }}>
            <IconX size={20} />
          </button>
        </div>

        {/* OTP boxes — a transparent input over them captures the keyboard */}
        <label className={`relative block ${shake ? "guest-shake" : ""}`}>
          <div className="flex justify-between gap-2">
            {Array.from({ length: LEN }).map((_, i) => {
              const char = code[i];
              const active = i === activeIndex && !done;
              return (
                <span
                  key={i}
                  className="flex h-14 flex-1 items-center justify-center rounded-xl text-[22px] font-extrabold tabular-nums transition-colors"
                  style={{
                    background: t.sunken,
                    border: `2px solid ${done ? t.success : active ? t.brand : char ? t.brand : t.border}`,
                    color: done ? t.success : t.text,
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
            onChange={(e) => onChange(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            disabled={busy || done}
            aria-label="Passcode"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            style={{ caretColor: "transparent" }}
          />
        </label>

        <div className="mt-4 h-5 text-center text-[12.5px] font-semibold" style={{ color: done ? t.success : t.error }}>
          {done ? <span className="fx-pop inline-block">Unlocked!</span> : error ?? ""}
        </div>

        {busy && !done && (
          <div className="flex justify-center pt-1">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" style={{ color: t.brand }} />
          </div>
        )}
      </div>
    </div>
  );
}

