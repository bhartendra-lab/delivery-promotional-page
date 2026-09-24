"use client";

/**
 * The friends layer's own toast.
 *
 * Not the lounge's: that one renders at `z-50`, underneath every friends
 * surface (`Z_FRIENDS` is 80), so a message raised from the people screen or
 * the consent sheet would have been posted behind the very screen that raised
 * it. Sitting one level above the sheets is the whole reason this exists.
 *
 * It also carries an optional action, which the lounge's cannot: the guest's
 * first ever add is the one moment worth offering a way straight to the tab
 * that has just appeared.
 */

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { SIGNAL, type ClientTheme } from "@/lib/client-theme";
import { Z_FRIENDS } from "./SheetShell";

/** Matches the lounge's own toast timing so the gallery feels of a piece.
 *  An actionable toast gets longer — it is asking for a decision, not just
 *  reporting one. */
const PLAIN_MS = 2600;
const ACTION_MS = 6000;

export type FriendsToastState = {
  message: string;
  action?: { label: string; onSelect: () => void };
} | null;

export function FriendsToast({
  t,
  toast,
  onDismiss,
}: {
  t: ClientTheme;
  toast: FriendsToastState;
  onDismiss: () => void;
}) {
  const hasAction = !!toast?.action;
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(onDismiss, hasAction ? ACTION_MS : PLAIN_MS);
    return () => clearTimeout(id);
  }, [toast, hasAction, onDismiss]);

  if (!toast || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+24px)] flex justify-center px-5"
      style={{ zIndex: Z_FRIENDS + 1 }}
      // The message is announced by the screen's own live region; a second
      // announcement from here would read every toast twice.
      aria-hidden
    >
      <div
        className="pointer-events-auto flex max-w-[420px] items-center gap-3 rounded-full py-2.5 pl-4 pr-2 shadow-lg"
        style={{ background: SIGNAL.viewer }}
      >
        <span className="text-[12.5px] font-bold text-white">{toast.message}</span>
        {toast.action && (
          <button
            type="button"
            onClick={() => {
              toast.action?.onSelect();
              onDismiss();
            }}
            className="min-h-[36px] shrink-0 cursor-pointer whitespace-nowrap rounded-full px-3.5 text-[12.5px] font-extrabold"
            style={{ background: t.brand, color: t.onBrand }}
          >
            {toast.action.label}
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
