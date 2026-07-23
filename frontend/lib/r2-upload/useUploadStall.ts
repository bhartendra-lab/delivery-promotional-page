"use client";

import { useEffect, useRef, useState } from "react";

/** How long a live run may show zero movement before we call it stalled. */
const STALL_AFTER_MS = 90_000;
/** How often we re-check. Cheap — one timer, no work per tick. */
const TICK_MS = 5_000;

/**
 * True when a run says it's uploading but nothing has actually moved for a
 * while.
 *
 * Browsers suspend background tabs that burn CPU (Chrome's Energy Saver does
 * this from 133 onwards), and this pipeline's Web Worker compression is exactly
 * that kind of workload. There's no way to make an upload immune to it — so
 * rather than spin a progress ring that isn't progressing, we detect the quiet
 * and say so plainly.
 *
 * `marker` is any monotonically-changing progress value (photosDone works
 * well): every change restarts the clock, and the next tick clears the flag.
 */
export function useUploadStalled(active: boolean, paused: boolean, marker: number): boolean {
  const [stalled, setStalled] = useState(false);
  // 0 = not started yet; seeded on the first effect pass so nothing impure runs
  // during render.
  const lastMoveRef = useRef(0);
  const prevMarkerRef = useRef(marker);

  // Refs only — the timer below owns the state, so progress moving forward
  // never triggers a render of its own.
  useEffect(() => {
    if (prevMarkerRef.current !== marker || lastMoveRef.current === 0 || !active || paused) {
      prevMarkerRef.current = marker;
      lastMoveRef.current = Date.now();
    }
  }, [marker, active, paused]);

  useEffect(() => {
    // Not running: no timer. The returned value already reads false in that
    // case, so there's nothing to reset here.
    if (!active || paused) return;
    const id = setInterval(() => {
      const last = lastMoveRef.current;
      setStalled(last > 0 && Date.now() - last > STALL_AFTER_MS);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [active, paused]);

  return stalled && active && !paused;
}
