"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconInfo } from "@/components/ui/icons";

const TIP_WIDTH = 250;
/** Room a tip needs below its anchor before it flips above instead. */
const TIP_FLIP_AT = 120;

type TipPosition = { top: number; left: number; width: number; above: boolean };

/**
 * The behaviour behind every tip in the dashboard, for any element that wants
 * to explain itself: spread `anchorProps` on the element and render `tip`
 * next to it.
 *
 * The tip is rendered into <body> at a fixed, viewport-clamped position rather
 * than absolutely inside its container: tips sit in scrolling columns, cards
 * that clip their own overflow and modal bodies, where an in-place tooltip was
 * cut off at the edges, and a centred 250px one ran off a phone screen.
 *
 * It opens on hover and on keyboard focus, which is also what a tap produces
 * on a touch screen. Its position is a snapshot of the anchor's, so it closes
 * on any scroll or resize rather than drifting away from it.
 */
export function useTip<T extends HTMLElement = HTMLElement>(text: string) {
  const anchorRef = useRef<T>(null);
  const tipId = useId();
  const [pos, setPos] = useState<TipPosition | null>(null);

  const open = useCallback(() => {
    const r = anchorRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(TIP_WIDTH, window.innerWidth - 16);
    const left = Math.min(Math.max(8, r.left + r.width / 2 - width / 2), window.innerWidth - width - 8);
    const above = r.bottom + TIP_FLIP_AT > window.innerHeight;
    setPos({ top: above ? r.top - 8 : r.bottom + 8, left, width, above });
  }, []);
  const close = useCallback(() => setPos(null), []);

  useEffect(() => {
    if (!pos) return;
    const dismiss = () => setPos(null);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [pos]);

  const tip = pos
    ? createPortal(
        <span
          id={tipId}
          role="tooltip"
          className="pointer-events-none fixed z-[70] rounded-lg bg-[var(--color-brand-ink)] px-3 py-2.5 text-left text-[11.5px] font-medium normal-case leading-relaxed tracking-normal text-white shadow-[0_6px_20px_rgba(42,34,24,0.22)]"
          style={{ top: pos.top, left: pos.left, width: pos.width, transform: pos.above ? "translateY(-100%)" : undefined }}
        >
          {text}
        </span>,
        document.body,
      )
    : null;

  return {
    isOpen: pos !== null,
    open,
    close,
    tip,
    anchorProps: {
      ref: anchorRef,
      onMouseEnter: open,
      onMouseLeave: close,
      onFocus: open,
      onBlur: close,
      "aria-describedby": pos ? tipId : undefined,
    },
  };
}

/**
 * Info tip: a small "i" that explains the label beside it. Opens on hover,
 * keyboard focus, and tap (a tap toggles it, since on a touch screen there is
 * no hover to leave).
 */
export function Tip({ text }: { text: string }) {
  const { anchorProps, tip, isOpen, open, close } = useTip<HTMLButtonElement>(text);
  return (
    <span className="inline-flex items-center">
      <button
        type="button"
        aria-label="More info"
        {...anchorProps}
        onClick={() => (isOpen ? close() : open())}
        className="brand-focus inline-flex cursor-help items-center rounded-full"
      >
        <IconInfo size={14} className="text-[#B5ADA4]" />
      </button>
      {tip}
    </span>
  );
}
