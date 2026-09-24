"use client";

/**
 * The shell every "Find your friends group" surface sits in.
 *
 * Bottom sheet below `sm`, centred dialog from there up — the pattern
 * `QualityChoiceSheet` already established in this gallery, factored out here
 * because this feature has four of them. Nothing new was added to the
 * dependencies for it: the repo has no Radix or shadcn, and one shell of ~90
 * lines is a smaller thing to own than a dialog library.
 *
 * What it guarantees, so no caller has to think about it again:
 *   · portalled to `document.body`, above every lounge overlay (see Z_FRIENDS);
 *   · Escape closes, and the event is stopped so a PhotoViewer underneath does
 *     not close on the same keypress;
 *   · Tab is trapped inside the panel, focus lands on the first control;
 *   · the panel never exceeds 90dvh, and its BODY is what scrolls, so a sticky
 *     footer stays put with the on-screen keyboard open;
 *   · the footer clears the home indicator via `env(safe-area-inset-bottom)`.
 */

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import type { ClientTheme } from "@/lib/client-theme";
import { IconX } from "@/components/ui/icons";

/**
 * Above the lounge's own overlays (intake / passcode / profile are `z-[60]`,
 * the PhotoViewer `z-[70]`) and below the policy overlay at `z-[100]`, which is
 * opened FROM these sheets and has to cover them.
 *
 * Deliberately not in `lib/download/layers.ts`: these never coexist with a
 * download surface (the friends sheets are gated shut while one is open), and
 * importing that module here would pull the download layer constants into this
 * chunk for one number.
 */
export const Z_FRIENDS = 80;

const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function SheetShell({
  t,
  open,
  onClose,
  title,
  /** Rendered in the sticky footer. Omit for a sheet whose body is all there is. */
  footer,
  /** Extra controls in the header, to the left of the close button (search, say). */
  headerExtra,
  /** Full-screen on phones instead of a 90dvh bottom sheet — the people screen
   *  wants the whole viewport, the consent sheet does not. */
  fullScreenOnPhone = false,
  /** Dialog width from `sm` up. 480px for the sheets, 720px for the people screen. */
  desktopWidth = 480,
  /**
   * Put focus on the first control when the sheet opens.
   *
   * False for a surface whose first control is a text field the guest did not
   * ask to type in: on a phone that throws the keyboard over the list they
   * opened the screen to read. Focus goes to the panel instead, so Tab still
   * starts inside the trap and Escape still reaches this component.
   */
  autoFocus = true,
  labelledBy,
  children,
}: {
  t: ClientTheme;
  open: boolean;
  onClose: () => void;
  title: string;
  footer?: React.ReactNode;
  headerExtra?: React.ReactNode;
  fullScreenOnPhone?: boolean;
  desktopWidth?: number;
  autoFocus?: boolean;
  /** Override the generated id when the caller renders its own heading. */
  labelledBy?: string;
  children: React.ReactNode;
}) {
  const generatedId = useId();
  const titleId = labelledBy ?? generatedId;
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Capture phase + stopPropagation: without it the PhotoViewer or the
        // profile sheet underneath closes on the same Escape.
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );
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
  }, [open, onClose]);

  // Focus the first control once the panel is in the DOM. Deferred a tick so
  // it runs after the browser has laid the sheet out, which is what makes the
  // scroll-into-view land in the right place on a phone.
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      if (autoFocus) panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
      else panel.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, autoFocus]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 flex items-end justify-center sm:items-center sm:p-6"
      style={{ background: "rgba(31,26,14,0.55)", zIndex: Z_FRIENDS }}
      onClick={onClose}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        /* Focusable as a focus TARGET only, never in the tab order — see the
           `autoFocus` note above. */
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`flex w-full flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl ${
          fullScreenOnPhone ? "h-[100dvh] rounded-t-none sm:h-[80vh]" : "max-h-[90dvh] sm:max-h-[80vh]"
        }`}
        style={{
          background: t.card,
          boxShadow: t.shadow,
          fontFamily: t.font,
          maxWidth: desktopWidth,
        }}
      >
        {/* Drag handle. Decorative — the sheet is dismissed by the backdrop, the
            close button or Escape; this is the affordance that says "sheet". */}
        <div className="flex justify-center pt-2.5 sm:hidden" aria-hidden>
          <span className="h-1 w-9 rounded-full" style={{ background: t.border }} />
        </div>

        <div className="flex items-start gap-3 px-5 pb-1 pt-3 sm:pt-5">
          <h2 id={titleId} className="min-w-0 flex-1 text-[17px] font-extrabold leading-[1.25]" style={{ color: t.text }}>
            {title}
          </h2>
          {headerExtra}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full"
            style={{ color: t.muted }}
          >
            <IconX size={18} />
          </button>
        </div>

        {/* The scrolling region. Keeping the overflow HERE (rather than on the
            panel) is what lets the footer below stay visible with the keyboard
            open, and what makes a landscape phone scroll the sheet internally. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>

        {footer && (
          <div
            className="shrink-0 border-t px-5 pt-3"
            style={{
              borderColor: t.border,
              background: t.card,
              paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
