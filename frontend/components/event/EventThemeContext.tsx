"use client";

import { createContext, useContext } from "react";
import type { ClientTheme } from "@/lib/client-theme";
import type { DeliveryLandingPageData } from "@/lib/types";

/**
 * Carries the resolved theme + event payload to every guest-gallery screen, so
 * components consume colours/shape ONLY from the theme registry (build spec §6).
 */
export type EventThemeValue = {
  theme: ClientTheme;
  event: DeliveryLandingPageData;
  /** The shared slug this experience was opened with. */
  uniqueIdentifier: string;
};

const Ctx = createContext<EventThemeValue | null>(null);

export const EventThemeProvider = Ctx.Provider;

export function useEventTheme(): EventThemeValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useEventTheme must be used within EventThemeProvider");
  return v;
}
