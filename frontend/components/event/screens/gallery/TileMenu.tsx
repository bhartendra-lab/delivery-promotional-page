"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { ClientTheme } from "@/lib/client-theme";
import { IconX } from "@/components/ui/icons";

export type TileMenuItem = {
  key: string;
  label: string;
  icon: React.ReactNode;
  onSelect: () => void;
};

/** Popover width, and the row height both modes are built from. */
const POPOVER_W = 200;
const POPOVER_ROW = 44;
const SHEET_ROW = 52;
/** Keeps the popover off the very edge of the window. */
const EDGE = 8;
/** The sheet's floating photo: its width, its tallest, and how much of it
 *  sits on the sheet rather than above it. */
const PREVIEW_W = 124;
const PREVIEW_MAX_H = 176;
const PREVIEW_OVERLAP = 0.4;

/**
 * A photo tile's 3-dot menu. ONE per grid, not one per tile, and portalled to
 * <body>: inside a tile it would be clipped by the tile's rounded,
 * overflow-hidden box, painted under the next tile (every tile's entrance
 * animation is a transform, so each one is its own stacking context), and
 * unmounted the moment windowing scrolled its tile away.
 *
 * - "sheet" (phones and tablets): a bottom action sheet. Thumb reach, 52px
 *   rows, Cancel at the bottom, tap the scrim to close. With a `preview` it
 *   is the Pinterest sheet instead: the photo floats over the sheet's top
 *   edge, an X at the top left closes it, and there is no Cancel row.
 * - "popover" (mouse and trackpad): anchored under the trigger, flipped above
 *   when there is no room below. Closes on an outside press, Escape, scroll or
 *   resize: it is positioned from the trigger's rect at the moment of opening,
 *   so anything that moves the trigger would leave it floating.
 *
 * Keyboard: focus moves to the first item on open, arrows and Home/End move
 * between items, Escape closes. Focus always goes back to the trigger.
 */
export function TileMenu({
  t,
  mode,
  anchor,
  anchorRect,
  items,
  preview,
  onClose,
}: {
  t: ClientTheme;
  mode: "sheet" | "popover";
  /** The 3-dot button that opened this. Focus returns to it on close. */
  anchor: HTMLElement;
  /** The trigger's rect, read in the click that opened the menu. */
  anchorRect: DOMRect;
  items: TileMenuItem[];
  /** The photo, shown above the sheet's actions (sheet mode only). `aspect`
   *  is width over height, already clamped for display. */
  preview?: { src: string; aspect: number };
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Read through a ref so the listeners below are attached once per open and
  // never re-subscribe because the parent re-rendered.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const restoreFocus = () => {
      if (anchor.isConnected) anchor.focus({ preventScroll: true });
    };
    const close = () => {
      closeRef.current();
      restoreFocus();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Stopped, in the capture phase, so the gallery does not also read this
      // Escape as "leave select mode": the menu is what the guest meant.
      e.stopPropagation();
      close();
    };
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target)) return;
      // A press on the trigger itself is left to its own click, which toggles.
      if (anchor.contains(target)) return;
      close();
    };
    document.addEventListener("keydown", onKey, true);
    if (mode === "popover") {
      document.addEventListener("pointerdown", onDown, true);
      // Capture: scroll events do not bubble, but they do pass through the
      // capture phase, so this sees the gallery's own scroll container.
      window.addEventListener("scroll", close, { capture: true, passive: true });
      window.addEventListener("resize", close);
    }
    // First item, so a keyboard user lands inside the menu.
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [anchor, mode]);

  const pick = (item: TileMenuItem) => {
    // Close first: the action may open a sheet of its own (the quality choice,
    // the required visit), which must not open under this one.
    onClose();
    if (anchor.isConnected) anchor.focus({ preventScroll: true });
    item.onSelect();
  };

  const onMenuKey = (e: React.KeyboardEvent) => {
    const rows = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    if (!rows.length) return;
    const at = rows.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (e.key === "ArrowDown") next = at < 0 ? 0 : (at + 1) % rows.length;
    else if (e.key === "ArrowUp") next = at < 0 ? rows.length - 1 : (at - 1 + rows.length) % rows.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = rows.length - 1;
    else if (e.key === "Tab" && mode === "popover") {
      // A popover is not a place to tab around in; leaving it closes it.
      e.preventDefault();
      onClose();
      if (anchor.isConnected) anchor.focus({ preventScroll: true });
      return;
    }
    if (next < 0) return;
    e.preventDefault();
    rows[next].focus();
  };

  const cancel = () => {
    onClose();
    if (anchor.isConnected) anchor.focus({ preventScroll: true });
  };

  let body: React.ReactNode;
  if (mode === "popover") {
    const height = items.length * POPOVER_ROW + 8;
    const below = anchorRect.bottom + 6;
    const fitsBelow = below + height <= window.innerHeight - EDGE;
    const top = fitsBelow ? below : Math.max(EDGE, anchorRect.top - 6 - height);
    const left = Math.min(window.innerWidth - POPOVER_W - EDGE, Math.max(EDGE, anchorRect.right - POPOVER_W));
    body = (
      <div
        ref={menuRef}
        role="menu"
        aria-label="Photo options"
        onKeyDown={onMenuKey}
        className="popup-pop fixed z-[60] flex flex-col overflow-hidden rounded-2xl py-1"
        style={{
          top,
          left,
          width: POPOVER_W,
          background: t.card,
          border: `1px solid ${t.border}`,
          boxShadow: t.shadow,
          transformOrigin: fitsBelow ? "top right" : "bottom right",
        }}
      >
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            role="menuitem"
            onClick={() => pick(item)}
            className="flex w-full cursor-pointer items-center gap-2.5 px-4 text-left text-[13.5px] font-bold outline-none hover:bg-[var(--row-hover)] focus-visible:bg-[var(--row-hover)]"
            style={{ color: t.text, height: POPOVER_ROW, ["--row-hover" as string]: t.sunken }}
          >
            <span className="shrink-0" style={{ color: t.muted }}>
              {item.icon}
            </span>
            {item.label}
          </button>
        ))}
      </div>
    );
  } else {
    const thumbH = preview ? Math.min(PREVIEW_MAX_H, Math.round(PREVIEW_W / preview.aspect)) : 0;
    const overlap = Math.round(thumbH * PREVIEW_OVERLAP);
    const row = (item: TileMenuItem) => (
      <button
        key={item.key}
        type="button"
        role="menuitem"
        onClick={() => pick(item)}
        className="flex w-full cursor-pointer items-center gap-3.5 rounded-xl px-3 text-left text-[15px] font-bold outline-none active:bg-[var(--row-hover)] focus-visible:bg-[var(--row-hover)]"
        style={{ color: t.text, height: SHEET_ROW, ["--row-hover" as string]: t.sunken }}
      >
        <span className="flex w-6 shrink-0 justify-center" style={{ color: t.muted }}>
          {item.icon}
        </span>
        {item.label}
      </button>
    );
    body = (
      <div className="fixed inset-0 z-[60]" role="presentation">
        <div aria-hidden className="scrim-in absolute inset-0" style={{ background: "rgba(23,17,10,0.45)" }} onClick={cancel} />
        <div
          ref={menuRef}
          role="menu"
          aria-label="Photo options"
          onKeyDown={onMenuKey}
          className={`sheet-up absolute inset-x-0 bottom-0 mx-auto w-full max-w-[520px] px-2 ${preview ? "rounded-t-[24px]" : "rounded-t-[20px] pt-2"}`}
          style={{
            background: t.card,
            boxShadow: t.shadow,
            // Room for the X above the first row, however wide the photo.
            paddingTop: preview ? Math.max(56, overlap + 14) : undefined,
            paddingBottom: "calc(8px + env(safe-area-inset-bottom))",
            paddingLeft: "max(8px, env(safe-area-inset-left))",
            paddingRight: "max(8px, env(safe-area-inset-right))",
          }}
        >
          {preview ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview.src}
                alt=""
                aria-hidden
                draggable={false}
                className="pointer-events-none absolute left-1/2 -translate-x-1/2 select-none rounded-2xl object-cover [-webkit-touch-callout:none]"
                style={{ top: overlap - thumbH, width: PREVIEW_W, height: thumbH, boxShadow: "0 10px 30px rgba(0,0,0,0.28)", background: t.sunken }}
              />
              <button
                type="button"
                onClick={cancel}
                aria-label="Close"
                className="absolute left-2 top-2 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full active:bg-[var(--row-hover)]"
                style={{ color: t.text, ["--row-hover" as string]: t.sunken }}
              >
                <IconX size={22} />
              </button>
              {items.map(row)}
            </>
          ) : (
            <>
              <span aria-hidden className="mx-auto mb-1 block h-1 w-9 rounded-full" style={{ background: t.border }} />
              {items.map(row)}
              <div aria-hidden className="mx-3 my-1 h-px" style={{ background: t.border }} />
              <button
                type="button"
                onClick={cancel}
                className="flex w-full cursor-pointer items-center justify-center rounded-xl text-[15px] font-bold active:bg-[var(--row-hover)]"
                style={{ color: t.muted, height: SHEET_ROW, ["--row-hover" as string]: t.sunken }}
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // A portal's events still bubble through the React tree to the grid; nothing
  // up there should hear a click that belonged to the menu.
  return createPortal(<div onClick={(e) => e.stopPropagation()}>{body}</div>, document.body);
}
