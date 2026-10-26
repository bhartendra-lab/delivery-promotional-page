"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * A device with a real hover: a mouse or a trackpad. Deliberately not a width
 * breakpoint. An iPad is wider than any phone breakpoint and has no hover at
 * all, so hover-revealed controls gated on width are invisible there and can
 * never be revealed. The same query backs the `can-hover:` Tailwind variant in
 * app/globals.css, so CSS and JS always agree on which kind of device this is.
 */
export const HOVER_POINTER_QUERY = "(hover: hover) and (pointer: fine)";

/**
 * Live `matchMedia` result. `useSyncExternalStore` rather than state + effect,
 * so the first client render already has the right answer and nothing flips
 * after mount. `serverValue` is what a server render assumes.
 */
export function useMediaQuery(query: string, serverValue = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

/** True on a mouse or trackpad device; false on phones and tablets. */
export function useHoverPointer(): boolean {
  return useMediaQuery(HOVER_POINTER_QUERY);
}
