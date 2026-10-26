"use client";

import { useEffect, useRef } from "react";

/** Marks the history entry the photo viewer pushed. */
const VIEWER_ENTRY = "vyvViewer";

const viewerEntryIsCurrent = () =>
  typeof window !== "undefined" && !!(window.history.state as Record<string, unknown> | null)?.[VIEWER_ENTRY];

/**
 * Gives an open photo viewer its own history entry, so Android's back button
 * and iOS's edge swipe close the viewer instead of leaving the gallery.
 *
 * ONE place keeps the two in step, whichever side moves first:
 *
 *   - the viewer opens          → push an entry (same URL, no navigation)
 *   - back / edge swipe         → `popstate` lands on the entry below ours →
 *                                 `onPop`, which closes the viewer
 *   - the viewer closes itself  → its X, Esc, or the gallery closing it to
 *                                 start a bulk download → step back off our
 *                                 entry, so it is never left behind to eat the
 *                                 guest's next back press
 *
 * The closing side never calls `history.back()` itself: every close is just
 * the viewer's state going to closed, and this hook notices. That is what
 * keeps a close from somewhere the viewer does not know about (the download
 * pre-flight) from stranding an entry.
 *
 * Safe with Next.js: the app router patches `pushState` and copies its own
 * markers (`__NA` and the tree) into the entry we push, so going back to the
 * gallery's own entry is an ordinary same-URL restore, not a reload (see
 * `onPopState` in next/dist/client/components/app-router.js). Safe with React
 * running effects twice in development too: `pushed` makes the push
 * idempotent.
 */
export function useViewerHistory(open: boolean, onPop: () => void) {
  const pushed = useRef(false);
  const onPopRef = useRef(onPop);
  useEffect(() => {
    onPopRef.current = onPop;
  }, [onPop]);

  useEffect(() => {
    if (open && !pushed.current) {
      window.history.pushState({ [VIEWER_ENTRY]: true }, "");
      pushed.current = true;
    } else if (!open && pushed.current) {
      pushed.current = false;
      if (viewerEntryIsCurrent()) window.history.back();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = () => {
      // Still on (or forward onto) a viewer entry: nothing to close.
      if (viewerEntryIsCurrent()) return;
      pushed.current = false;
      onPopRef.current();
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, [open]);
}
