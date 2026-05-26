"use client";

import { useEffect, useState } from "react";

const DESKTOP_BREAKPOINT = 860;

/**
 * Matches the reference HTML's `useIsDesktop` hook (line 34). Returns true
 * when viewport ≥ 860px. SSR-safe: defaults to false on the server, syncs on
 * mount.
 */
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= DESKTOP_BREAKPOINT);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  return isDesktop;
}
