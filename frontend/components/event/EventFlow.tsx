"use client";

import { useEffect, useState } from "react";
import type { DeliveryLandingPageData, GuestSession } from "@/lib/types";
import { clearGuestToken, getGuestToken } from "@/lib/guest-auth";
import { GuestAuthError, getGuestSession, updateGuestSubType } from "@/lib/guest-api";
import { BrandLoader } from "./BrandLoader";
import { useEventTheme } from "./EventThemeContext";
import { LoginScreen } from "./screens/LoginScreen";
import { TeamSelectScreen } from "./screens/TeamSelectScreen";
import { ScanFlow } from "./screens/ScanFlow";
import { LoungeGallery } from "./screens/LoungeGallery";

/** Flow steps. Login + the session bootstrap are real; team/scan/lounge land in
 *  the following phases (placeholders for now). */
type Step = "login" | "team" | "scan" | "lounge";

/** Decide where a signed-in guest lands, given their session + the event. */
function decideStep(event: DeliveryLandingPageData, session: GuestSession): Step {
  if (event.guest_types && event.guest_types.length > 0 && !session.guest_sub_type) return "team";
  if (!session.has_selfie) return "scan";
  return "lounge";
}

/**
 * Guest flow state machine. On mount it restores any stored session (skipping
 * login/team/scan as appropriate); otherwise it shows the Vyavasth-skinned
 * login. The selfie scan, team select and lounge land in Phases 4–8.
 */
export function EventFlow() {
  const { event, uniqueIdentifier } = useEventTheme();
  const [booting, setBooting] = useState(true);
  const [step, setStep] = useState<Step>("login");
  const [session, setSession] = useState<GuestSession | null>(null);
  const [authError, setAuthError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Defer so the (client-only) session restore never runs setState
      // synchronously inside the effect body.
      await Promise.resolve();
      if (cancelled) return;

      const params = new URLSearchParams(window.location.search);
      const hadError = params.get("error") === "auth_failed";

      const token = getGuestToken(uniqueIdentifier);
      if (!token) {
        setAuthError(hadError);
        setStep("login");
        setBooting(false);
        return;
      }

      try {
        const { guest } = await getGuestSession(uniqueIdentifier);
        if (cancelled) return;
        setSession(guest);
        setStep(decideStep(event, guest));
      } catch (err) {
        if (cancelled) return;
        if (err instanceof GuestAuthError) clearGuestToken(uniqueIdentifier);
        setStep("login");
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uniqueIdentifier, event]);

  if (booting) return <BrandLoader />;

  if (step === "login") return <LoginScreen authError={authError} />;

  if (step === "team") {
    return (
      <TeamSelectScreen
        teams={event.guest_types ?? []}
        onSubmit={async (team) => {
          await updateGuestSubType(uniqueIdentifier, team);
          setSession((s) => (s ? { ...s, guest_sub_type: team } : s));
          // No selfie yet → scan; otherwise straight to the lounge.
          setStep(session?.has_selfie ? "lounge" : "scan");
        }}
      />
    );
  }

  if (step === "scan") {
    return (
      <ScanFlow
        guestName={session?.name}
        onComplete={(selfieUrl) => {
          // Matched media_ids were cached in the session by ScanFlow; the lounge
          // reads them from there. We only mirror the selfie into session state.
          setSession((s) => (s ? { ...s, has_selfie: true, selfie_url: selfieUrl } : s));
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
