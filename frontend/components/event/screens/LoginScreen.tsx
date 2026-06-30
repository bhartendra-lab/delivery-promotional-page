"use client";

import { AmbientBackdrop } from "../AmbientBackdrop";
import { useEventTheme } from "../EventThemeContext";
import { usePolicy } from "../policy/PolicyContext";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

/**
 * Screen 1 · Login — Google-only, themed to the event's style_variant so the
 * whole guest journey reads as one palette. Mirrors `Login2` (mobile) and
 * `DesktopAuth initStep="login"` (split layout on large screens).
 */
export function LoginScreen({ authError = false }: { authError?: boolean }) {
  const { theme: t, event, uniqueIdentifier } = useEventTheme();
  const { openPolicy } = usePolicy();
  const studio = event.include_company_branding ? event.company_name : undefined;
  const eventName = event.event_name || "this event";

  const cover = event.background_image
    ? { backgroundImage: `url(${event.background_image})`, backgroundSize: "cover", backgroundPosition: event.background_position || "center" }
    : { backgroundImage: `linear-gradient(150deg, ${t.cover[0]}, ${t.cover[1]})` };

  const signIn = () => {
    window.location.href = `${API_BASE}/auth/google/guest-login?unique_identifier=${encodeURIComponent(uniqueIdentifier)}`;
  };

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
        <div className="fx-stagger mx-auto flex w-full max-w-[380px] flex-1 flex-col">
          {/* brand zone */}
          <div className="flex flex-col items-center gap-5 pt-[clamp(48px,9vh,88px)]">
            <span
              className="fx-float relative flex h-24 w-24 items-center justify-center rounded-full"
              style={{ background: t.accentWash }}
            >
              {/* spinning colour halo */}
              <span className="fx-spin-slow absolute -inset-2 rounded-full opacity-50" style={{ background: t.ring, filter: "blur(11px)" }} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/vyavasth-icon.svg" alt="vyavasth" className="relative z-10 h-[52px] w-[52px]" />
            </span>
            <span className="text-[24px] font-extrabold lowercase tracking-[-0.03em]" style={{ color: t.text }}>
              vyavasth
            </span>
          </div>

          {/* headline */}
          <div className="mt-10 flex flex-col gap-2.5 text-center">
            <h1 className="text-[27px] font-extrabold leading-[1.15] tracking-[-0.02em]" style={{ color: t.text }}>
              Find your photos
            </h1>
            <p className="px-1 text-[14.5px] font-semibold leading-[1.5]" style={{ color: t.muted }}>
              Sign in and we’ll pull out every picture you’re in from {eventName}.
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

          {/* event context */}
          {studio && (
            <div className="mb-4 flex items-center justify-center gap-2" style={{ color: t.muted }}>
              <LockIcon size={13} />
              <span className="text-[12px] font-bold">A private gallery by {studio}</span>
            </div>
          )}

          {/* the only option */}
          <button
            type="button"
            onClick={signIn}
            className="flex w-full cursor-pointer items-center justify-center gap-3 transition-transform hover:-translate-y-0.5 active:scale-[0.99]"
            style={{
              background: "#fff",
              border: `1px solid ${t.border}`,
              borderRadius: t.rField,
              padding: "15px 0",
              boxShadow: t.shadowSm,
              fontSize: 15,
              fontWeight: 800,
              color: t.text,
            }}
          >
            <GoogleG size={20} /> Continue with Google
          </button>

          {/* trust line */}
          <div className="mt-4 flex items-start gap-2 px-1.5">
            <ShieldIcon size={16} style={{ color: t.brand, marginTop: 1, flex: "none" }} />
            <span className="text-[12px] font-semibold leading-[1.45]" style={{ color: t.muted }}>
              We use Google only to confirm it’s really you. We never post, message, or share anything.
            </span>
          </div>

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

function LockIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function ShieldIcon({ size = 16, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d="M12 3l8 3v5c0 5-3.4 8.3-8 10-4.6-1.7-8-5-8-10V6z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}
