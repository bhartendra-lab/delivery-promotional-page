"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GuestSession } from "@/lib/types";
import { clearGuestToken, getGuestToken } from "@/lib/guest-auth";
import { GuestAuthError, getGuestSession } from "@/lib/guest-api";
import { BrandLoader } from "./BrandLoader";
import { useEventTheme } from "./EventThemeContext";
import { WelcomeScreen } from "./screens/WelcomeScreen";
import { LoginScreen } from "./screens/LoginScreen";
import { ScanFlow } from "./screens/ScanFlow";
import { LoungeGallery } from "./screens/LoungeGallery";

type Step = "welcome" | "login" | "scan" | "lounge";

/**
 * Decide where a signed-in guest lands. There's no separate "team" step —
 * the name + team question is raised by `LoungeGallery` itself as a
 * non-dismissible sheet when it's still missing, so every authed guest just
 * goes to "scan" (no selfie yet) or "lounge".
 */
function decideStep(session: GuestSession): Step {
  if (!session.has_selfie) return "scan";
  return "lounge";
}

/**
 * Guest flow state machine. On mount it restores any stored session (skipping
 * welcome/login/scan as appropriate); a guest with no valid token sees the
 * pre-auth welcome screen first, then the Vyavasth-skinned login.
 */
export function EventFlow() {
  const { uniqueIdentifier } = useEventTheme();
  const [booting, setBooting] = useState(true);
  const [step, setStep] = useState<Step>("welcome");
  const [session, setSession] = useState<GuestSession | null>(null);
  const [authError, setAuthError] = useState(false);

  // Guards state updates from a restore that's still in flight after unmount.
  // Must be set true in the effect body itself, not just returned from
  // cleanup — StrictMode's dev-only mount→cleanup→remount would otherwise
  // leave this stuck at false after the first mount/cleanup pair, since
  // nothing else ever flips it back to true.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Restores (or re-restores) the session from the stored guest token. Runs on
  // mount, and again — in place, without a page navigation — once a guest
  // authenticates via WhatsApp OTP (see `onAuthed` below).
  const restoreSession = useCallback(async () => {
    const token = getGuestToken(uniqueIdentifier);
    if (!token) {
      if (mountedRef.current) {
        setStep("welcome");
        setBooting(false);
      }
      return;
    }
    try {
      const { guest } = await getGuestSession(uniqueIdentifier);
      if (!mountedRef.current) return;
      setSession(guest);
      setStep(decideStep(guest));
    } catch (err) {
      if (!mountedRef.current) return;
      if (err instanceof GuestAuthError) {
        // The stored token turned out to be invalid — same "no valid token"
        // state as never having one, so treat it identically (welcome, not
        // straight to login).
        clearGuestToken(uniqueIdentifier);
        setStep("welcome");
      } else {
        // Some other failure (e.g. network) while a token DOES exist — don't
        // claim this is a first-time visitor, just let them retry sign-in.
        setStep("login");
      }
    } finally {
      if (mountedRef.current) setBooting(false);
    }
  }, [uniqueIdentifier]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Defer so the (client-only) session restore never runs setState
      // synchronously inside the effect body.
      await Promise.resolve();
      if (cancelled) return;

      const params = new URLSearchParams(window.location.search);
      setAuthError(params.get("error") === "auth_failed");
      await restoreSession();
    })();
    return () => {
      cancelled = true;
    };
  }, [restoreSession]);

  // WhatsApp OTP verified: the token is already stored, so re-run the same
  // restore path in place instead of a full navigation (which used to remount
  // `EventExperience` and show the brand loader twice — once for the page
  // reload, once for this restore).
  const onAuthed = useCallback(() => {
    setAuthError(false);
    setBooting(true);
    void restoreSession();
  }, [restoreSession]);

  if (booting) return <BrandLoader />;

  if (step === "welcome") return <WelcomeScreen onContinue={() => setStep("login")} />;

  if (step === "login") return <LoginScreen authError={authError} onAuthed={onAuthed} />;

  if (step === "scan") {
    return (
      <ScanFlow
        guestName={session?.name}
        onComplete={(selfieUrl, selfieId) => {
          // The face search itself (and the matched-photos reveal) now happens
          // in the Lounge, driven by session.selfie_id — mirror it here so that
          // effect can run without waiting for a getGuestSession refetch.
          setSession((s) => (s ? { ...s, has_selfie: true, selfie_url: selfieUrl, selfie_id: selfieId } : s));
          setStep("lounge");
        }}
      />
    );
  }

  // step === "lounge" — but only render once the session is in hand.
  if (!session) return <BrandLoader />;
  return (
    <LoungeGallery
      session={session}
      onSessionChange={(patch) => setSession((s) => (s ? { ...s, ...patch } : s))}
      onReauth={() => {
        clearGuestToken(uniqueIdentifier);
        setSession(null);
        setStep("login");
      }}
      onRescan={() => setStep("scan")}
      onSignOut={() => {
        clearGuestToken(uniqueIdentifier);
        setSession(null);
        setStep("login");
      }}
    />
  );
}
