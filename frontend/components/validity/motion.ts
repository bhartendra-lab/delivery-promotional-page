"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * The small motion vocabulary of the Client's validity page.
 *
 * Three rules hold for everything here, because the page is opened once, on a
 * phone, by someone who did not ask for a show:
 *
 *   - every motion plays ONCE. Nothing loops, nothing replays on scroll back.
 *   - only `transform`, `opacity` and `filter` are animated.
 *   - with `prefers-reduced-motion: reduce` nothing moves at all: each hook
 *     answers with its finished state straight away.
 *
 * CSS does the easing (the keyframes and transitions live in globals.css,
 * under "Client validity page", in the same easing family as the rest of the
 * guest gallery). These hooks only decide WHEN.
 */

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/** Whether the reader has asked their device for less motion. False on the server. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(REDUCED_MOTION).matches : false,
  );
  useEffect(() => {
    const query = window.matchMedia(REDUCED_MOTION);
    const onChange = () => setReduced(query.matches);
    onChange();
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/**
 * True from the first time the element is on screen, and for good after that:
 * the observer disconnects, so scrolling away and back replays nothing.
 */
export function useInViewOnce<T extends Element>(options: { threshold?: number; rootMargin?: string } = {}): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  const { threshold = 0.25, rootMargin = "0px" } = options;
  useEffect(() => {
    const node = ref.current;
    if (!node || seen) return;
    if (typeof IntersectionObserver === "undefined") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- a browser with no observer shows everything in its final state
      setSeen(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { threshold, rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [seen, threshold, rootMargin]);
  return [ref, seen];
}

/**
 * A number that counts up to `target` once `play` turns true, then stays.
 * With reduced motion (or before `play`) it is simply the target or zero, so
 * the figure on screen is never a half-counted one that stopped.
 */
export function useCountUp(target: number, play: boolean, durationMs = 900): number {
  const reduced = usePrefersReducedMotion();
  const [value, setValue] = useState(0);
  useEffect(() => {
    // `play` turns true once (useInViewOnce), so this runs the count once.
    if (!play) return;
    if (reduced || target <= 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reduced motion: the final figure, with no count
      setValue(target);
      return;
    }
    let frame = 0;
    const startedAt = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      // Ease out: quick at first, settling onto the figure.
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [play, target, durationMs, reduced]);
  return value;
}
