"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ClientTheme } from "@/lib/client-theme";
import { IconChevronLeft, IconX } from "@/components/ui/icons";

/**
 * The one shell every collections sheet sits in, so they all open, close,
 * scroll and trap keys the same way.
 *
 * Phone and tablet portrait (the gallery's mobile shell, under 1024px):
 *   - "bottom": a bottom sheet up to `maxPhoneHeight` with a handle; drag the
 *     handle or the header down to close.
 *   - "full": a full-screen sheet with a back chevron (Review and send, Guest
 *     Control).
 * Desktop shell:
 *   - "modal": centred, `width` wide.
 *   - "drawer": a right-side drawer, `width` wide (Guest Control).
 *
 * Portalled to <body> above the viewer (z-70) and below the toast (z-80), so
 * "Add to collection" from the reel opens over the photo and the toast it ends
 * with is still seen. It is a fixed overlay with its own scroll, so it never
 * undoes the gallery's pinned <html>/<body>.
 *
 * Keys: Escape closes. Every key that starts inside the sheet stops at the
 * sheet, so an arrow in the name field does not page the reel underneath and
 * Escape does not also leave select mode.
 */
export function CollectionSheet({
  t,
  desktop,
  phone = "bottom",
  desktopKind = "modal",
  width = 420,
  maxPhoneHeight = "70vh",
  title,
  subtitle,
  onClose,
  footer,
  children,
  z = 75,
}: {
  t: ClientTheme;
  desktop: boolean;
  phone?: "bottom" | "full";
  desktopKind?: "modal" | "drawer";
  width?: number;
  maxPhoneHeight?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  onClose: () => void;
  /** Pinned under the scrolling body (the primary button). */
  footer?: React.ReactNode;
  children: React.ReactNode;
  z?: number;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  // Focus in on open, back to whatever had it on close.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    panelRef.current?.focus({ preventScroll: true });
    return () => {
      if (before?.isConnected) before.focus({ preventScroll: true });
    };
  }, []);

  // A key that lands outside the sheet (focus on <body> after a click on the
  // scrim's edge) must not reach the gallery either while the sheet is up.
  //
  // Sheets can stack (a confirm over Review and send). A key inside any sheet
  // is that sheet's own (its panel handles it, below); one from outside goes
  // to the TOP sheet only, which is the last one portalled into <body>.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as Element | null)?.closest?.("[data-collection-sheet]")) return;
      e.stopPropagation();
      const sheets = document.querySelectorAll("[data-collection-sheet]");
      if (e.key === "Escape" && sheets[sheets.length - 1] === panelRef.current) closeRef.current();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);

  const onPanelKey = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  /* drag down to close (phone bottom sheet) */
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ y: number; t: number; id: number } | null>(null);
  const draggable = !desktop && phone === "bottom";
  const onDown = (e: React.PointerEvent) => {
    if (!draggable || (e.target as HTMLElement).closest("button,input,a")) return;
    dragRef.current = { y: e.clientY, t: performance.now(), id: e.pointerId };
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    setDrag(Math.max(0, e.clientY - d.y));
  };
  const onUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    const dy = Math.max(0, e.clientY - d.y);
    const v = dy / Math.max(1, performance.now() - d.t);
    if (dy > 90 || (dy > 24 && v > 0.6)) onClose();
    else setDrag(0);
  };

  const header = (
    <div
      className="shrink-0 select-none px-5 pt-2"
      style={{ touchAction: draggable ? "none" : undefined }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      {draggable && <span aria-hidden className="mx-auto mb-2 block h-1 w-9 rounded-full" style={{ background: t.border }} />}
      <div className="flex items-start gap-2 pb-3 pt-1">
        {!desktop && phone === "full" && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Back"
            className="-ml-2 flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full"
            style={{ color: t.text }}
          >
            <IconChevronLeft size={22} />
          </button>
        )}
        <div className="min-w-0 flex-1" style={{ paddingTop: !desktop && phone === "full" ? 8 : 0 }}>
          <h2 id={titleId} className="truncate text-[17px] font-extrabold" style={{ color: t.text }}>
            {title}
          </h2>
          {subtitle != null && (
            <div className="mt-0.5 truncate text-[12.5px] font-semibold" style={{ color: t.muted }}>
              {subtitle}
            </div>
          )}
        </div>
        {(desktop || phone === "bottom") && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full"
            style={{ color: t.muted }}
          >
            <IconX size={19} />
          </button>
        )}
      </div>
    </div>
  );

  const body = (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5" style={{ scrollbarWidth: "thin" }}>
      {children}
    </div>
  );
  const foot = footer ? (
    <div
      className="shrink-0 px-5 pt-3"
      style={{ borderTop: `1px solid ${t.border}`, paddingBottom: desktop ? 20 : "calc(14px + env(safe-area-inset-bottom))" }}
    >
      {footer}
    </div>
  ) : (
    <div className="shrink-0" style={{ height: desktop ? 12 : "calc(8px + env(safe-area-inset-bottom))" }} />
  );

  let panelClass: string;
  let panelStyle: React.CSSProperties;
  if (desktop && desktopKind === "drawer") {
    panelClass = "drawer-in absolute inset-y-0 right-0 flex flex-col";
    panelStyle = { width: `min(${width}px, 100vw)`, paddingTop: 12 };
  } else if (desktop) {
    panelClass = "popup-pop relative mx-auto flex flex-col rounded-3xl";
    panelStyle = { width: `min(${width}px, calc(100vw - 32px))`, maxHeight: "min(86vh, 760px)", paddingTop: 12 };
  } else if (phone === "full") {
    panelClass = "sheet-up absolute inset-0 flex flex-col";
    panelStyle = {
      paddingTop: "calc(6px + env(safe-area-inset-top))",
      paddingLeft: "env(safe-area-inset-left)",
      paddingRight: "env(safe-area-inset-right)",
    };
  } else {
    panelClass = "sheet-up absolute inset-x-0 bottom-0 mx-auto flex w-full max-w-[560px] flex-col rounded-t-[20px]";
    panelStyle = {
      maxHeight: maxPhoneHeight,
      paddingLeft: "env(safe-area-inset-left)",
      paddingRight: "env(safe-area-inset-right)",
      transform: drag ? `translateY(${drag}px)` : undefined,
      transition: dragging ? "none" : "transform 0.22s cubic-bezier(0.32, 0.72, 0.32, 1)",
    };
  }

  const centred = desktop && desktopKind === "modal";
  return createPortal(
    // Clicks inside a portal still bubble through the React tree; nothing in
    // the gallery behind should hear one that belonged to the sheet.
    <div
      className={`fixed inset-0 ${centred ? "flex items-center justify-center" : ""}`}
      style={{ zIndex: z, fontFamily: t.font }}
      onClick={(e) => e.stopPropagation()}
    >
      <div aria-hidden className="scrim-in absolute inset-0" style={{ background: "rgba(23,17,10,0.5)" }} onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        data-collection-sheet=""
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onPanelKey}
        className={`${panelClass} outline-none`}
        style={{ background: t.card, boxShadow: t.shadow, color: t.text, ...panelStyle }}
      >
        {header}
        {body}
        {foot}
      </div>
    </div>,
    document.body,
  );
}

/** A square checkbox in the theme's colours: checked, partly, or empty. */
export function CheckBox({ t, state, disabled }: { t: ClientTheme; state: "checked" | "unchecked" | "indeterminate"; disabled?: boolean }) {
  const on = state !== "unchecked";
  return (
    <span
      aria-hidden
      className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[7px] transition-colors"
      style={{
        background: on ? (disabled ? t.faint : t.brand) : "transparent",
        border: on ? "none" : `1.75px solid ${disabled ? t.border : t.faint}`,
        color: t.onBrand,
      }}
    >
      {state === "checked" && (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {state === "indeterminate" && <span className="block h-[2.5px] w-[10px] rounded-full" style={{ background: "currentColor" }} />}
    </span>
  );
}

/** A full-width button in the brand colour, for sheet footers. */
export function PrimaryButton({
  t,
  children,
  onClick,
  disabled,
  busy,
}: {
  t: ClientTheme;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-full py-3.5 text-[14.5px] font-extrabold transition-transform active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
      style={{ background: t.brand, color: t.onBrand }}
    >
      {children}
    </button>
  );
}
