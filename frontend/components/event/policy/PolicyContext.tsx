"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

/**
 * Version of the guest-facing policy/consent text currently shown. Recorded with
 * every consent event so an old consent can be tied back to the exact wording the
 * guest agreed to. Bump this whenever the Terms / Privacy / consent copy changes.
 */
export const POLICY_VERSION = "v1.0";

/**
 * The same consent, shown with one extra sentence — that a guest's face picture
 * from this event will be visible to other guests — which is only true on a
 * gallery where "Find your friends group" is switched on. Recorded instead of
 * `POLICY_VERSION` on exactly those galleries, so a consent row always names
 * the wording that was actually on screen.
 *
 * Bump both of these whenever the selfie-consent copy changes.
 */
export const POLICY_VERSION_FRIENDS = "v1.1";

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
