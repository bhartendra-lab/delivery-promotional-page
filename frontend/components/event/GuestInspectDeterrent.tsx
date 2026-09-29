"use client";

import { useEffect } from "react";

/**
 * A DETERRENT against casual inspection on the Guest gallery. Not protection:
 * DevTools cannot be blocked (the browser menu, `view-source:`, a second
 * device, and screenshots all need nothing from this page). What actually
 * protects the photos is server-side: the unguessable teaser keys, the
 * baked-in watermark, and get-media answering a Guest only from the matched
 * set the server stored (ids sent from DevTools can narrow a view, never
 * widen it).
 *
 * So only the cheap parts: no context menu (except where a Guest types — phone
 * numbers and codes get pasted), and the DevTools / view-source shortcuts
 * swallowed. The image-only rules (no drag, no iOS save sheet, no selection)
 * sit on the <img> elements themselves. Deliberately NO "DevTools detection" —
 * debugger loops, window-size or console-timing tricks misfire on zoom and
 * docked panels, burn CPU on low-end phones, and get pages flagged.
 *
 * Mounted by EventExperience only: the Studio dashboard is never affected.
 */
const EDITABLE = "input, textarea, [contenteditable]:not([contenteditable='false'])";
/** Matched on `code`, not `key`: on a Mac, Option changes `key` (⌥I is "ˆ"). */
const INSPECT_KEYS = ["KeyI", "KeyJ", "KeyC"];

export function GuestInspectDeterrent() {
  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest?.(EDITABLE)) return;
      e.preventDefault();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const blocked =
        e.key === "F12" ||
        (mod && e.shiftKey && INSPECT_KEYS.includes(e.code)) || // Ctrl/Cmd+Shift+I/J/C
        (e.metaKey && e.altKey && INSPECT_KEYS.includes(e.code)) || // Cmd+Option+I/J/C
        (mod && e.code === "KeyU"); // Ctrl/Cmd+U, view source
      if (!blocked) return;
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);
  return null;
}
