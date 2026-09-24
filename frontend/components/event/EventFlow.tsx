"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GuestSession } from "@/lib/types";
import type { FriendFinderBlock } from "@/lib/friend-finder/types";
import { normalizeDeliveryPreferences } from "@/lib/delivery-preferences";
import { clearGuestToken, getGuestToken } from "@/lib/guest-auth";
import { GuestAuthError, getGuestSession, updateGuestSubType } from "@/lib/guest-api";
import { reportBug } from "@/lib/report-bug";
import { BrandLoader } from "./BrandLoader";
import { useEventTheme } from "./EventThemeContext";
import { WelcomeScreen } from "./screens/WelcomeScreen";
import { LoginScreen } from "./screens/LoginScreen";
import { ScanFlow } from "./screens/ScanFlow";
import { LoungeGallery } from "./screens/LoungeGallery";

type Step = "welcome" | "login" | "scan" | "lounge";

/** Where the scan screen was opened from, which is what its secondary action
 *  means: skipping (and being remembered as having skipped) on the way in,
 *  versus simply going back to a gallery the Guest is already inside. */
type ScanOrigin = "entry" | "gallery";

/**
 * Decide where a signed-in guest lands. There's no separate "team" step —
 * the name + team question is raised by `LoungeGallery` itself as a
 * non-dismissible sheet when it's still missing, so every authed guest just
 * goes to "scan" (no selfie yet) or "lounge".
 *
 * Three ways to earn the lounge without a selfie, and they are not the same:
 * the Studio has switched face search off for this event (there is no selfie
 * step to send anyone to), or the Guest has one already, or the Guest chose
 * "Skip for now" on a previous visit — a decision kept server-side precisely so
 * it survives this reload and the Guest's second device.
 */
function decideStep(session: GuestSession, faceSearchOn: boolean): Step {
  if (!faceSearchOn) return "lounge";
  if (session.has_selfie) return "lounge";
  if (session.face_scan_skipped_at) return "lounge";
  return "scan";
}

/**
 * Guest flow state machine. On mount it restores any stored session (skipping
 * welcome/login/scan as appropriate); a guest with no valid token sees the
 * pre-auth welcome screen first, then the Vyavasth-skinned login.
 */
export function EventFlow() {
  const { uniqueIdentifier, event } = useEventTheme();
  const [booting, setBooting] = useState(true);
  const [step, setStep] = useState<Step>("welcome");
  const [session, setSession] = useState<GuestSession | null>(null);
  const [authError, setAuthError] = useState(false);
  const [scanOrigin, setScanOrigin] = useState<ScanOrigin>("entry");
  /**
   * "Find your friends group", as the session reports it.
   *
   * Null covers two different things and deliberately treats them the same:
   * the backend's global switch is off (the key is absent from the response
   * entirely), or the session has not been restored yet. Nothing anywhere
   * renders for this feature unless the block is here AND `enabled` is true.
   */
  const [friendFinder, setFriendFinder] = useState<FriendFinderBlock | null>(null);
  /** A scan finished during this visit, so the lounge should raise the friends
   *  sheet once it has settled. Cleared by the lounge when it acts on it. */
  const [scanJustCompleted, setScanJustCompleted] = useState(false);

  // The Studio's per-event switch. Off means this flow has no selfie step at
  // all — see the render guard below, which is what stops a stale `step` from
  // showing one after the Studio switches it off mid-visit.
  const faceSearchOn = useMemo(
    () => normalizeDeliveryPreferences(event.delivery_preferences).face_search_enabled,
    [event.delivery_preferences],
  );

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
      const { guest, friend_finder } = await getGuestSession(uniqueIdentifier);
      if (!mountedRef.current) return;
      setSession(guest);
      setFriendFinder(friend_finder ?? null);
      // Arriving at the selfie screen this way is the entry flow, whose way out
      // is "Skip for now" — as opposed to a rescan opened from the gallery.
      setScanOrigin("entry");
      setStep(decideStep(guest, faceSearchOn));
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
  }, [uniqueIdentifier, faceSearchOn]);

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

  /**
   * "Skip for now" from the entry flow: the Guest goes straight into the
   * gallery, and is remembered as having skipped so they are not dropped back
   * here on their next visit or their next device.
   *
   * The session is patched optimistically and the request is deliberately NOT
   * awaited. Nothing the Guest can see depends on it landing, and holding the
   * gallery behind a write whose only job is to spare them one future question
   * would be exactly backwards — the worst case of a failure is being asked
   * again next time, which is where they already are.
   */
  const skipScan = useCallback(() => {
    setSession((s) => (s ? { ...s, face_scan_skipped_at: Date.now() } : s));
    void updateGuestSubType(uniqueIdentifier, { faceScanSkipped: true }).catch((err) => {
      console.warn("[updateGuestSubType] face scan skip not saved", err);
      void reportBug("Face scan — skip not saved", {
        Event: uniqueIdentifier,
        "Error message": err instanceof Error ? err.message : String(err),
      });
    });
    setStep("lounge");
  }, [uniqueIdentifier]);

  if (booting) return <BrandLoader />;

  if (step === "welcome") return <WelcomeScreen onContinue={() => setStep("login")} />;

  if (step === "login") return <LoginScreen authError={authError} onAuthed={onAuthed} />;

  // `faceSearchOn` is checked here as well as in `decideStep`: the Studio can
  // switch it off while this tab sits on the selfie screen, and the event data
  // refreshes underneath. Falling through to the lounge is the right answer —
  // there is nothing left for this screen to do.
  if (step === "scan" && faceSearchOn) {
    return (
      <ScanFlow
        guestName={session?.name}
        friendsNotice={friendFinder?.enabled === true}
        secondary={
          scanOrigin === "gallery"
            ? // Opened from inside the gallery. Backing out records nothing and
              // leaves any existing selfie exactly as it was.
              { label: "Back to gallery", onSelect: () => setStep("lounge") }
            : {
                label: "Skip for now",
                note: "You can still browse the gallery and scan your face later.",
                onSelect: skipScan,
              }
        }
        onComplete={(selfieUrl, selfieId) => {
          // The face search itself (and the matched-photos reveal) now happens
          // in the Lounge, driven by session.selfie_id — mirror it here so that
          // effect can run without waiting for a getGuestSession refetch.
          setSession((s) => (s ? { ...s, has_selfie: true, selfie_url: selfieUrl, selfie_id: selfieId } : s));
          // Arms the friends sheet's `sheet_after_scan` trigger. Set for every
          // successful scan, entry or rescan; the lounge decides whether this
          // guest is one who should be asked, and clears it either way.
          setScanJustCompleted(true);
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
      friendFinder={friendFinder}
      onFriendFinderChange={(patch) => setFriendFinder((f) => (f ? { ...f, ...patch } : f))}
      scanJustCompleted={scanJustCompleted}
      onScanTriggerConsumed={() => setScanJustCompleted(false)}
      onReauth={() => {
        clearGuestToken(uniqueIdentifier);
        setSession(null);
        setStep("login");
      }}
      onRescan={() => {
        // Guarded as well as hidden: the gallery renders no scan affordance
        // while face search is off, and this makes a stale one a no-op.
        if (!faceSearchOn) return;
        setScanOrigin("gallery");
        setStep("scan");
      }}
      onSignOut={() => {
        clearGuestToken(uniqueIdentifier);
        setSession(null);
        setFriendFinder(null);
        setStep("login");
      }}
    />
  );
}
