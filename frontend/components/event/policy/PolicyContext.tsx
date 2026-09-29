"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

/**
 * Version of the guest-facing policy/consent text currently shown. Recorded with
 * every consent event so an old consent can be tied back to the exact wording the
 * guest agreed to. Bump this whenever the Terms / Privacy / consent copy changes.
 *
 * What each version showed on the selfie screen:
 *   v1.0  "I agree to let Vyavasth use my selfie to match my face to these
 *         photos and keep it on my gallery profile."
 *   v1.1  v1.0, plus a muted second line: the face picture is visible to other
 *         guests at this wedding (Find my people events).
 *   v1.2  "I agree to let Vyavasth use my selfie to find my photos and save it
 *         to my profile."                                   ← current, base
 *   v1.3  v1.2 continued in the same paragraph: "Other guests here can see my
 *         face picture."                          ← current, Find my people
 *
 * Old rows keep their meaning; nothing is migrated.
 */
export const POLICY_VERSION = "v1.2";

/**
 * The same consent, with the one extra sentence that a guest's face picture is
 * visible to other guests — true only on a gallery where "Find my people" is
 * switched on. Recorded instead of `POLICY_VERSION` on exactly those galleries,
 * so a consent row always names the wording that was actually on screen.
 *
 * LOAD-BEARING, and in the other repository too: the backend's
 * FACE_DISCLOSING_POLICY_VERSIONS (src/utils/friend-finder.utils.js) must list
 * this value. It is what lets a Guest who never answers the friends question
 * still show their face to others; a version recorded here that the backend
 * does not list turns every new Guest into initials. Ship the two together.
 *
 * Bump both of these whenever the selfie-consent copy changes.
 */
export const POLICY_VERSION_FRIENDS = "v1.3";

/** Which guest-facing policy document the overlay is showing. */
export type PolicyView = "terms" | "privacy" | "cookies";

type PolicyState = {
  /** The open document, or null when the overlay is closed. */
  view: PolicyView | null;
  openPolicy: (view: PolicyView) => void;
  close: () => void;
};

const Ctx = createContext<PolicyState | null>(null);

/**
 * Holds which policy document (if any) is open. Mounted inside the event theme
 * provider so the overlay and every screen share one open/close state — Guests
 * read the policies without leaving the gallery.
 */
export function PolicyProvider({ children }: { children: React.ReactNode }) {
  const [view, setView] = useState<PolicyView | null>(null);
  const openPolicy = useCallback((v: PolicyView) => setView(v), []);
  const close = useCallback(() => setView(null), []);
  const value = useMemo<PolicyState>(
    () => ({ view, openPolicy, close }),
    [view, openPolicy, close],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePolicy(): PolicyState {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePolicy must be used within a PolicyProvider");
  return v;
}
