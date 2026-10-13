"use client";

/**
 * The two iOS-only save surfaces for a SINGLE photo. Both render nothing
 * everywhere else, and nothing on an iPhone whose share sheet opened straight
 * away — which is the usual case.
 *
 *  - "Your photo is ready": the photo was fetched, but by then the browser no
 *    longer honoured the original tap, and the share sheet will not open
 *    without one. This asks for it.
 *  - Press and hold: there is no share sheet here at all (an old iOS, a
 *    stripped-down web view), so the photo is shown full-screen and the Guest
 *    saves it with the system's own long-press menu.
 *
 * See `lib/download/share.ts` for why an iPhone cannot simply download.
 */

import { createPortal } from "react-dom";
import { Z_SAVE_SHEET } from "@/lib/download/layers";
import type { DownloadModalTheme } from "./DownloadPlanModal";

/** Opts an element out of `GuestInspectDeterrent`'s context-menu block: the
 *  long-press menu is the whole point of the press-and-hold view. */
export const ALLOW_SAVE_ATTR = "data-allow-save";

export function SavePhotoSheet({
  ready,
  onSave,
  holdUrl,
  onClose,
  theme: t,
}: {
  ready: boolean;
  onSave: () => void;
  holdUrl: string | null;
  onClose: () => void;
  theme: DownloadModalTheme;
}) {
  if ((!ready && !holdUrl) || typeof document === "undefined") return null;
  const font = t.font ? { fontFamily: t.font } : undefined;

  if (holdUrl) {
    return createPortal(
      <div
        className="fixed inset-0 flex flex-col"
        style={{ background: "rgba(12,9,6,0.96)", zIndex: Z_SAVE_SHEET, ...font }}
        role="dialog"
        aria-modal="true"
        aria-label="Save this photo"
      >
        <p className="shrink-0 px-6 pb-3 pt-6 text-center text-[14px] font-bold leading-[1.45] text-white">
          Press and hold the photo, then tap “Save to Photos”.
        </p>
        <div className="flex min-h-0 flex-1 items-center justify-center px-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={holdUrl}
            alt="Your photo"
            {...{ [ALLOW_SAVE_ATTR]: "" }}
            className="max-h-full max-w-full rounded-lg object-contain"
            // The gallery's own tiles switch the long-press menu off; this is
            // the one image that needs it.
            style={{ WebkitTouchCallout: "default", WebkitUserSelect: "auto", userSelect: "auto" }}
          />
        </div>
        <div className="shrink-0 px-5 pb-6 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full cursor-pointer rounded-full py-3.5 text-[14px] font-extrabold"
            style={{ background: t.brand, color: t.onBrand }}
          >
            Done
          </button>
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div
      className="fixed inset-0 flex items-end justify-center sm:items-center sm:p-6"
      style={{ background: "rgba(31,26,14,0.55)", zIndex: Z_SAVE_SHEET }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Your photo is ready"
        onClick={(e) => e.stopPropagation()}
        className="w-full rounded-t-3xl p-5 sm:max-w-[380px] sm:rounded-3xl"
        style={{ background: t.card, boxShadow: t.shadow, ...font }}
      >
        <div className="text-[16px] font-extrabold" style={{ color: t.text }}>
          Your photo is ready
        </div>
        <p className="mt-1.5 text-[12.5px] font-semibold leading-[1.5]" style={{ color: t.muted }}>
          Tap below, then choose “Save Image” to keep it in your Photos.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={onSave}
            className="cursor-pointer rounded-full py-3.5 text-[14px] font-extrabold"
            style={{ background: t.brand, color: t.onBrand }}
          >
            Save to Photos
          </button>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer py-1.5 text-[12.5px] font-bold"
            style={{ color: t.muted }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
