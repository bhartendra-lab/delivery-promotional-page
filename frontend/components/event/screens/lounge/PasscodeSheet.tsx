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
 *
 * Two modes. Normally it is the optional "Unlock" action: closable every way a
 * modal can be. In `required` mode it is the ONLY thing between the Guest and
 * an empty screen — face search is off for this event and no folder is public,
 * so there is literally nothing they can see yet — and it takes the same
 * non-dismissible contract `IntakeSheet` documents: no close button, no
 * Escape, no backdrop dismiss.
 *
 * Being undismissable is what makes the help block below load-bearing rather
 * than decorative: a Guest who does not have the code needs a way to ask for
 * it, and a way out of the gallery entirely.
 */
export function PasscodeSheet({
  onSuccess,
  onClose,
  required = false,
  studioName,
  contactUrl,
  onContactClick,
  onSignOut,
}: {
  onSuccess: () => void;
  onClose: () => void;
  /** Hold the Guest here: no close affordance of any kind. */
  required?: boolean;
  /** What to call the Studio in "Message …" — already resolved by the parent,
   *  which knows whether this event shows Studio branding at all. */
  studioName?: string;
  /** The Studio's WhatsApp chat, or null when there is no number to message. */
  contactUrl?: string | null;
  /** Engagement tracking, shared with every other contact CTA in the gallery. */
  onContactClick?: () => void;
  /** Back to the login screen — the Guest's only other way out of a required
   *  sheet, for someone who signed in as the wrong person. */
  onSignOut?: () => void;
}) {
  const { theme: t, event, uniqueIdentifier } = useEventTheme();
  const [code, setCode] = useState("");
  const [shake, setShake] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (required) return; // no Escape out of a sheet that is the only way in
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose, required]);

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
      // A 429 carries the limiter's own sentence, which says what to do (wait);
      // the generic "try again" would send the Guest straight back into the
      // wall they just hit.
      setError(
        err instanceof ApiError && err.status === 400
          ? "That passcode didn’t work."
          : err instanceof ApiError && err.status === 429
            ? err.message
            : "Couldn’t verify — try again.",
      );
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
      // Scrolls when the sheet is taller than what's left of the viewport —
      // required mode adds the help block, and on a phone the numeric keypad
      // takes half the screen the moment the input focuses. `m-auto` below
      // still centres it whenever it fits; `items-center` would not, and would
      // push the passcode boxes above the top edge with no way to reach them.
      // Same treatment, for the same reason, as `IntakeSheet`.
      className="dash-fade fixed inset-0 z-[60] flex overflow-y-auto p-5"
      style={{ background: "rgba(31,26,14,0.55)" }}
      onClick={required ? undefined : onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="popup-pop m-auto w-full max-w-[420px] rounded-3xl p-7 sm:p-8"
        style={{ background: t.card, fontFamily: t.font, boxShadow: t.shadow }}
      >
        <div className="mb-6 flex items-start justify-between">
          <div>
            {/* Required mode is a Guest's first sight of the gallery, so it
                says what this place IS before asking for anything. */}
            <div className="text-[19px] font-extrabold" style={{ color: t.text }}>
              {required ? "This gallery is private" : "Enter passcode"}
            </div>
            <div className="mt-1 text-[12.5px] font-semibold" style={{ color: t.muted }}>
              {required ? "Enter the 6-digit passcode the family shared with you." : "Shared by the host"}
            </div>
          </div>
          {!required && (
            <button type="button" onClick={onClose} aria-label="Close" className="cursor-pointer" style={{ color: t.muted }}>
              <IconX size={20} />
            </button>
          )}
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

        {/* Only in required mode. Optional mode is opened deliberately by a
            Guest who came looking for it, and already has the whole gallery
            behind it to fall back on. */}
        {required && !done && (
          <div className="mt-5 border-t pt-4 text-center" style={{ borderColor: t.border }}>
            <p className="text-[12.5px] font-semibold leading-[1.5]" style={{ color: t.muted }}>
              Don&rsquo;t have it? Ask the family who invited you, or ask the Studio to give you access.
            </p>
            <div className="mt-3 flex flex-col items-center gap-2">
              {contactUrl && (
                <a
                  href={contactUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={onContactClick}
                  className="w-full cursor-pointer rounded-full py-3 text-center text-[13px] font-extrabold"
                  style={{ background: t.sunken, color: t.text, border: `1px solid ${t.border}` }}
                >
                  Message {studioName || "the studio"}
                </a>
              )}
              {onSignOut && (
                // For the Guest who signed in on the wrong number, or on
                // someone else's phone. The only exit from this sheet that
                // isn't the passcode.
                <button
                  type="button"
                  onClick={onSignOut}
                  className="cursor-pointer px-4 py-2.5 text-[12.5px] font-bold"
                  style={{ color: t.faint }}
                >
                  Use a different number
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

