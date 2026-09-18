"use client";

import { Fragment, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { useEventTheme } from "../../EventThemeContext";
import { guestMessageLabelFor } from "@/lib/event-occasion";
import { toMessageParagraphs } from "@/lib/guest-message";
import { IconX } from "@/components/ui/icons";

const FOCUSABLE = 'button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The studio's full message, opened from "Read more" under the cover's
 * three-line clamp. A bottom sheet on phones, a centred card from 640px.
 *
 * WHY THIS PORTALS TO `document.body`, and why it must keep doing so:
 * `HeroSubtitle` renders inside `.hero-text` on both covers and inside
 * `.fx-blur-in` on the Welcome screen. Both animations are `fill-mode: both`,
 * so their final `transform` (and `.fx-blur-in`'s `filter`) stays applied long
 * after the animation ends — and an ancestor carrying either becomes the
 * containing block for `position: fixed` descendants. Rendered in place, this
 * sheet would be positioned against the title block instead of the viewport,
 * and then clipped away entirely by the cover's `overflow-hidden`.
 *
 * The portal escapes that, but it also escapes the `translate="no"` wrapper in
 * `app/(client)/layout.tsx` — and this surface is the single most translation-
 * tempting thing on the page: a paragraph of free prose. Chrome's translation
 * re-parents text nodes into injected `<font>` wrappers and the next structural
 * commit tears the whole React root down, so the portal root carries the opt-out
 * itself. Do not drop `translate="no"`/`notranslate` from it.
 */
export function MessageSheet({
  eventName,
  eventType,
  message,
  onClose,
}: {
  eventName: string;
  eventType?: string | null;
  /** The raw `custom_message` — split into paragraphs here. */
  message: string | null | undefined;
  onClose: () => void;
}) {
  const { theme: t } = useEventTheme();
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      // A manual focus trap: there are only ever one or two focusable elements
      // in here, so this is cheaper than taking on a dependency for it.
      if (e.key !== "Tab" || !panel.current) return;
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  // Focus starts on Close. The caller returns focus to "Read more" on the way
  // out, so a keyboard guest lands back where they left the cover.
  useEffect(() => {
    const timer = window.setTimeout(() => closeButton.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const paragraphs = toMessageParagraphs(message);
  // Nothing to show means the cover never offered the button in the first
  // place; bail rather than opening an empty card.
  if (paragraphs.length === 0 || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="notranslate fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6"
      translate="no"
      style={{ background: "rgba(31,26,14,0.55)" }}
      onClick={onClose}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="modal-pop modal-slide-up flex max-h-[80dvh] w-full flex-col rounded-t-3xl sm:max-h-[80vh] sm:max-w-[560px] sm:rounded-3xl"
        // The portal sits outside the lounge's inline font, so the panel
        // re-states it rather than inheriting the document's dashboard sans.
        style={{ background: t.card, boxShadow: t.shadow, fontFamily: t.font }}
      >
        <div className="flex items-start gap-3 px-6 pb-3 pt-6">
          <div className="min-w-0 flex-1">
            <span
              className="text-[11px] font-semibold uppercase tracking-[0.16em]"
              style={{ color: t.muted }}
            >
              {guestMessageLabelFor(eventType)}
            </span>
            <h2
              id={titleId}
              className="mt-1.5 text-[22px] break-words"
              // Playfair upright, not the cover's italic: this is a heading
              // over prose, not the cover's display line.
              style={{
                fontFamily: "var(--font-playfair), Georgia, serif",
                fontWeight: 700,
                lineHeight: 1.2,
                color: t.text,
              }}
            >
              {eventName}
            </h2>
          </div>
          <button
            ref={closeButton}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 -mt-2 shrink-0 cursor-pointer p-2.5"
            style={{ color: t.muted }}
          >
            <IconX size={20} />
          </button>
        </div>

        {/* The body scrolls, the header stays. `contain` keeps a flick at the
            end of a long message from scrolling the gallery behind it. */}
        <div
          className="min-h-0 flex-1 overflow-y-auto px-6 pb-[calc(env(safe-area-inset-bottom)+24px)] sm:pb-7"
          style={{ overscrollBehavior: "contain" }}
        >
          {paragraphs.map((lines, i) => (
            <p
              key={i}
              className="max-w-[60ch] break-words text-[16px]"
              style={{ color: t.text, lineHeight: 1.65, marginTop: i === 0 ? 0 : "0.9em" }}
            >
              {lines.map((line, j) => (
                <Fragment key={j}>
                  {j > 0 && <br />}
                  {line}
                </Fragment>
              ))}
            </p>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
