"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

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
