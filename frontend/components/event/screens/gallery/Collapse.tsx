"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { INITIAL_MACHINE, stepCollapse, type ScrollMachine } from "./collapseOnScroll";

/** The fold's length. Matches the bottom nav's slide. */
export const FOLD_MS = 250;

/**
 * Folds its children to zero height and back, smoothly: a one-row grid whose
 * row animates between 1fr and 0fr, with a fade on top. Hidden content is
 * `inert`, so it leaves the tab order and the accessibility tree.
 *
 * Clipping is on while it folds or is folded, and off once it has settled
 * open: the mobile top bar's studio menu hangs out of its box and must not
 * be cut off.
 */
export function Collapse({ open, children, className = "" }: { open: boolean; children: React.ReactNode; className?: string }) {
  const [settled, setSettled] = useState(open);
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    setSettled(false);
  }
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => setSettled(true), FOLD_MS + 30);
    return () => clearTimeout(id);
  }, [open]);

  return (
    <div
      className={`grid shrink-0 transition-[grid-template-rows,opacity] ease-out motion-reduce:transition-none ${className}`}
      style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0, transitionDuration: `${FOLD_MS}ms` }}
      inert={!open}
      aria-hidden={!open || undefined}
    >
      <div className="min-h-0" style={{ overflow: open && settled ? "visible" : "hidden" }}>
        {children}
      </div>
    </div>
  );
}

/**
 * The phone gallery's fold state, fed from the grid scroller's scroll events
 * (see collapseOnScroll.ts for the rules). The machine lives in a ref so a
 * scroll event re-renders nothing unless the header actually changes.
 *
 * `resetKey` reopens the header when it changes: a new tab, folder or mode is
 * a new page, and it starts with everything showing.
 */
export function useScrollCollapse(resetKey: string): { collapsed: boolean; onScroll: (el: HTMLElement) => void } {
  const [collapsed, setCollapsed] = useState(false);
  const [prevKey, setPrevKey] = useState(resetKey);
  if (resetKey !== prevKey) {
    setPrevKey(resetKey);
    setCollapsed(false);
  }
  const machine = useRef<ScrollMachine>(INITIAL_MACHINE);

  const onScroll = useCallback(
    (el: HTMLElement) => {
      const step = stepCollapse(machine.current, collapsed, {
        top: el.scrollTop,
        max: el.scrollHeight - el.clientHeight,
        now: performance.now(),
      });
      machine.current = step.machine;
      if (step.collapsed !== collapsed) setCollapsed(step.collapsed);
    },
    [collapsed],
  );

  return { collapsed, onScroll };
}
