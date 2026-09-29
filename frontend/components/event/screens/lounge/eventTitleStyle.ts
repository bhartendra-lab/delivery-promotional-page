import type { CSSProperties } from "react";

/**
 * The event name's editorial treatment — Playfair italic 700 — in one place.
 *
 * Three screens set it: the pre-auth welcome, the mobile lounge cover
 * (`CoverMasthead`) and the desktop one (`DesktopCover`). Each used to carry
 * its own copy of the style object, and the welcome screen had drifted to a
 * bold sans-serif of its own, so the first thing a Guest saw did not match the
 * gallery it led into.
 *
 * Two sizes, each keeping the line height its cover already had so neither
 * lounge cover moves: mobile `clamp(30px, 8vw, 44px)` at 1.1, desktop (the `lg`
 * shell, 1024px up) `clamp(40px, 4.6vw, 60px)` at 1.08.
 */
export function eventTitleStyle(size: "mobile" | "desktop"): CSSProperties {
  return {
    fontFamily: "var(--font-playfair), Georgia, serif",
    fontStyle: "italic",
    fontWeight: 700,
    fontSize: size === "desktop" ? "clamp(40px, 4.6vw, 60px)" : "clamp(30px, 8vw, 44px)",
    lineHeight: size === "desktop" ? 1.08 : 1.1,
  };
}
