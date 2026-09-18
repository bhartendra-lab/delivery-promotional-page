"use client";

import { useLayoutEffect, useState } from "react";

/**
 * Whether a line-clamped element is actually cutting text off, measured in the
 * browser.
 *
 * Character counts cannot answer this: five one-word lines overflow a 3-line
 * clamp while a 200-character paragraph on a wide desktop may not, and the
 * cover's own width changes with the viewport. So the only honest signal is the
 * element's own overflow, which means measuring after layout — hence a LAYOUT
 * effect: the "Read more" control this drives must be there in the same paint
 * as the clamped text, not a frame later.
 *
 * Re-measured whenever:
 *  - the element resizes (window resize, phone rotation, the studio preview's
 *    device toggle) — a `ResizeObserver`, which also delivers the first reading;
 *  - the webfont finishes loading. Playfair arrives after first paint and its
 *    metrics move the line breaks, so a cold load measured against the fallback
 *    font alone is wrong;
 *  - `deps` change — text can change without the clamped box changing size at
 *    all, which no observer would report.
 *
 * Lives in its own module so the studio's Gallery Design preview can reuse it
 * without importing the guest cover (and its sheet) into the dashboard bundle.
 */
export function useIsTruncated(
  ref: React.RefObject<HTMLElement | null>,
  deps: React.DependencyList,
): boolean {
  const [truncated, setTruncated] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) {
      setTruncated(false);
      return;
    }

    // > 1 rather than > 0: sub-pixel line heights (any fallback font, and every
    // Devanagari run) leave a fractional difference on text that fits.
    const measure = () => setTruncated(el.scrollHeight - el.clientHeight > 1);

    // First reading, in the same commit as the text it describes.
    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(el);

    let live = true;
    // `document.fonts` is missing in some older WebViews, and `ready` rejects
    // if a face fails to load — neither is a reason to leave the reading stale.
    document.fonts?.ready
      .then(() => {
        if (live) measure();
      })
      .catch(() => {});

    return () => {
      live = false;
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the caller owns this list; the hook re-measures on exactly the values it is handed, plus the ref and the observers above
  }, [ref, ...deps]);

  return truncated;
}
