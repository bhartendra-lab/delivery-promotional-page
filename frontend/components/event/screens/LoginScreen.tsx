"use client";

import { useEffect, useState } from "react";
import type { ClientTheme } from "@/lib/client-theme";
import { AmbientBackdrop } from "../AmbientBackdrop";
import { useEventTheme } from "../EventThemeContext";
import { usePolicy } from "../policy/PolicyContext";
import { IconBrowser, IconCopy } from "@/components/ui/icons";
import { SignInStep } from "./SignInStep";
import { PoweredBy } from "./ScanFlow";

/** Mirrors the studio-name length policy `MobileTopBar.tsx` already uses (SHORT_STUDIO_NAME). */
const SHORT_STUDIO_NAME = 18;

function truncateStudio(name: string): string {
  return name.length > SHORT_STUDIO_NAME ? `${name.slice(0, SHORT_STUDIO_NAME)}…` : name;
}

/**
 * Screen container — WhatsApp OTP is the primary sign-in (`SignInStep`, phone
 * entry and code verification merged into one screen); Google SSO is
 * demoted to a de-emphasized text-link fallback shown only once a code is in
 * flight. No cover/hero treatment here — `WelcomeScreen` (which always
 * precedes this, see `EventFlow`) already showed the event's identity, so
 * this stays a plain, focused sign-in utility.
 */
export function LoginScreen({
  authError = false,
  onAuthed,
}: {
  authError?: boolean;
  /** Guest just verified their OTP (or is arriving via a token that's already
   *  stored) — re-run `EventFlow`'s session restore in place. */
  onAuthed: () => void;
}) {
  const { theme: t, event, uniqueIdentifier } = useEventTheme();
  const { openPolicy } = usePolicy();
  // In-app browsers (WhatsApp/Instagram) often strip the camera API entirely —
  // catch that here, before the guest invests a phone number + OTP, rather
  // than letting them discover it two screens later at the scan step.
  const [cameraUnsupported, setCameraUnsupported] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Defer so this never calls setState synchronously inside the effect body.
      await Promise.resolve();
      if (cancelled) return;
      if (!navigator.mediaDevices?.getUserMedia) setCameraUnsupported(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const rawStudio = event.include_company_branding ? event.company_name : undefined;
  const studio = rawStudio ? truncateStudio(rawStudio) : undefined;
  const eventName = event.event_name || "this event";

  return (
    <div className="relative isolate flex min-h-[100dvh] flex-col" style={{ background: t.bg, fontFamily: t.font }}>
      <AmbientBackdrop a={t.cover[0]} b={t.brand} />

      <div className="relative flex flex-1 flex-col px-7 sm:px-10">
        <div className="fx-stagger mx-auto flex w-full max-w-[380px] flex-1 flex-col justify-center">
          <SignInStep
            theme={t}
            eventName={eventName}
            studio={studio}
            authError={authError}
            uniqueIdentifier={uniqueIdentifier}
            onAuthed={onAuthed}
          />

          <p className="mb-2 mt-5 text-center text-[11px] font-semibold leading-[1.5]" style={{ color: t.faint }}>
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

        <PoweredBy />
      </div>

      {cameraUnsupported && <BrowserUnsupportedNotice t={t} />}
    </div>
  );
}

/* ── camera-capability nudge ───────────────────────────────────────────── */

/**
 * Blocking notice shown when `navigator.mediaDevices.getUserMedia` isn't
 * present at all — typically a stripped-down in-app webview (WhatsApp /
 * Instagram) that can never reach the camera. Mirrors the severity of
 * `ScanFlow`'s camera `PermissionGate`: the scan step strictly requires a
 * camera, so there's no point letting the guest submit a phone number and
 * OTP here first only to hit the same wall two screens later.
 */
function BrowserUnsupportedNotice({ t }: { t: ClientTheme }) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard?.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the guest can still copy from the address bar */
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      style={{ background: "rgba(20,14,9,0.55)", backdropFilter: "blur(2px)" }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="fx-rise m-3 w-full max-w-[400px] rounded-3xl p-6"
        style={{ background: t.card, border: `1px solid ${t.border}`, boxShadow: t.shadow }}
      >
        <div
          className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full"
          style={{ background: t.errorSoft, color: t.error }}
        >
          <IconBrowser size={30} />
        </div>
        <h2 className="text-center text-[19px] font-extrabold tracking-[-0.02em]" style={{ color: t.text }}>
          Open in a different browser
        </h2>
        <p className="mt-2 text-center text-[13.5px] font-semibold leading-[1.5]" style={{ color: t.muted }}>
          This page can’t reach the camera here — it may be running inside another app’s in-app browser. Open the
          link in Chrome (Android) or Safari (iPhone) to continue.
        </p>
        <div className="mt-5">
          <button
            type="button"
            onClick={copyLink}
            className="cta-shine flex w-full cursor-pointer items-center justify-center gap-2 rounded-full py-3.5 text-[14px] font-extrabold transition-transform active:scale-[0.99]"
            style={{ background: t.brand, color: t.onBrand }}
          >
            <IconCopy size={16} /> {copied ? "Link copied!" : "Copy link"}
          </button>
        </div>
      </div>
    </div>
  );
}
