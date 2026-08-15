"use client";

import { useState } from "react";
import { AmbientBackdrop } from "../AmbientBackdrop";
import { useEventTheme } from "../EventThemeContext";
import { usePolicy } from "../policy/PolicyContext";
import { IconLock, IconShieldCheck } from "@/components/ui/icons";
import { PhoneStep } from "./PhoneStep";
import { OtpStep } from "./OtpStep";

type SubStep = "phone" | "otp";

/**
 * Screen container — WhatsApp OTP is the primary sign-in (`PhoneStep`, then
 * `OtpStep`); Google SSO is demoted to a de-emphasized fallback shown only at
 * the bottom of `OtpStep`. Owns the shared shell (brand halo, desktop hero
 * pane, policy footer) and the `{ name, phone }` carried between the two
 * sub-steps, mirroring `Login2` (mobile) and `DesktopAuth initStep="login"`
 * (split layout on large screens).
 */
export function LoginScreen({ authError = false }: { authError?: boolean }) {
  const { theme: t, event, uniqueIdentifier } = useEventTheme();
  const { openPolicy } = usePolicy();
  const [subStep, setSubStep] = useState<SubStep>("phone");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  const studio = event.include_company_branding ? event.company_name : undefined;
  const eventName = event.event_name || "this event";

  const cover = event.background_image
    ? { backgroundImage: `url(${event.background_image})`, backgroundSize: "cover", backgroundPosition: event.background_position || "center" }
    : { backgroundImage: `linear-gradient(150deg, ${t.cover[0]}, ${t.cover[1]})` };

  return (
    <div className="relative isolate grid min-h-[100dvh] grid-cols-1 lg:grid-cols-2" style={{ background: t.bg, fontFamily: t.font }}>
      <AmbientBackdrop a={t.cover[0]} b={t.brand} />
      {/* Desktop hero pane — the event's own cover (not a themed surface) */}
      <div className="relative hidden overflow-hidden lg:block">
        <div className={`absolute inset-0 ${event.background_image ? "hero-kenburns" : ""}`} style={cover} />
        <div className="absolute inset-0" style={{ background: t.heroScrim }} />
        <div className="fx-blur-in absolute inset-x-0 bottom-0 p-12 text-white">
          <div className="text-[12px] font-bold uppercase tracking-[0.22em] opacity-90">
            {event.event_type ? `${event.event_type} gallery` : "Event gallery"}
          </div>
          <div className="mt-2 text-[40px] font-extrabold leading-[1.1] tracking-[-0.02em]">{eventName}</div>
        </div>
      </div>

      {/* Auth pane */}
      <div className="relative flex flex-col px-7 sm:px-10">
        <div key={subStep} className="fx-stagger mx-auto flex w-full max-w-[380px] flex-1 flex-col">
          {/* brand zone */}
          <div className="flex flex-col items-center gap-5 pt-[clamp(48px,9vh,88px)]">
            <span className="fx-float relative flex h-24 w-24 items-center justify-center rounded-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/vyavasth-icon.svg" alt="vyavasth" className="relative z-10 h-[52px] w-[52px]" />
            </span>
            <span className="text-[24px] font-extrabold lowercase tracking-[-0.03em]" style={{ color: t.text }}>
              vyavasth
            </span>
          </div>

          {subStep === "phone" ? (
            <PhoneStep
              theme={t}
              eventName={eventName}
              studio={studio}
              authError={authError}
              uniqueIdentifier={uniqueIdentifier}
              name={name}
              phone={phone}
              onNameChange={setName}
              onPhoneChange={setPhone}
              onSent={() => setSubStep("otp")}
            />
          ) : (
            <OtpStep
              theme={t}
              uniqueIdentifier={uniqueIdentifier}
              name={name.trim()}
              phone={phone}
              onBack={() => setSubStep("phone")}
            />
          )}

          <p className="mb-7 mt-5 text-center text-[11px] font-semibold leading-[1.5]" style={{ color: t.faint }}>
            By continuing you agree to our{" "}
            <button type="button" onClick={() => openPolicy("terms")} className="underline underline-offset-2" style={{ color: t.muted }}>
              Terms
            </button>{" "}
            &amp;{" "}
            <button type="button" onClick={() => openPolicy("privacy")} className="underline underline-offset-2" style={{ color: t.muted }}>
              Privacy Policy
            </button>
            .
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── icons ──────────────────────────────────────────────────────────────── */

// Official Google 4-color "G" mark for the sign-in button — Google's brand
// guidelines require this exact multi-color asset, which no monochrome icon
// library (Phosphor/lucide/simple-icons) carries, so it stays hand-drawn.
function GoogleG({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8a12 12 0 1 1 0-24c3 0 5.8 1.1 7.9 3l5.7-5.7A20 20 0 1 0 24 44c11 0 20-9 20-20 0-1.3-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7A20 20 0 0 0 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2A12 12 0 0 1 12.7 28l-6.5 5A20 20 0 0 0 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.2C39.9 41.3 44 35.4 44 24c0-1.3-.1-2.3-.4-3.5z" />
    </svg>
  );
}
