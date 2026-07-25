"use client";

import { useEffect } from "react";
import { useEventTheme } from "../../EventThemeContext";
import { IconX, IconScanFace, IconLogout } from "@/components/ui/icons";

/**
 * Guest profile sheet — the "DP" viewer opened by tapping the guest avatar.
 * Shows the selfie used for face-matching enlarged, plus the guest's account
 * actions: rescan their face (re-runs the scan flow) or sign out.
 */
export function ProfileSheet({
  name,
  selfieUrl,
  onRescan,
  onSignOut,
  onClose,
}: {
  name?: string;
  selfieUrl: string | null;
  onRescan: () => void;
  onSignOut: () => void;
  onClose: () => void;
}) {
  const { theme: t } = useEventTheme();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const initial = (name?.[0] ?? "·").toUpperCase();

  return (
    <div
      className="dash-fade fixed inset-0 z-[60] flex items-center justify-center p-5"
      style={{ background: "rgba(31,26,14,0.55)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="popup-pop w-full max-w-[380px] rounded-3xl p-7 text-center"
        style={{ background: t.card, fontFamily: t.font, boxShadow: t.shadow }}
      >
        <div className="flex justify-end">
          <button type="button" onClick={onClose} aria-label="Close" className="cursor-pointer" style={{ color: t.muted }}>
            <IconX size={20} />
          </button>
        </div>

        {/* DP — the selfie used for face-matching */}
        <div
          className="mx-auto -mt-2 flex h-32 w-32 items-center justify-center overflow-hidden rounded-full"
          style={{ background: t.sunken, border: `3px solid ${t.brand}` }}
        >
          {selfieUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={selfieUrl} alt="Your selfie" className="h-full w-full object-cover" />
          ) : (
            <span className="text-[40px] font-extrabold" style={{ color: t.brand }}>
              {initial}
            </span>
          )}
        </div>

        {name && (
          <div className="mt-4 text-[18px] font-extrabold" style={{ color: t.text }}>
            {name}
          </div>
        )}
        <div className="mt-1 text-[12.5px] font-semibold" style={{ color: t.muted }}>
          The selfie we use to find your photos
        </div>

        <div className="mt-6 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onRescan}
            className="flex cursor-pointer items-center justify-center gap-2 rounded-full py-3 text-[14px] font-extrabold transition-transform active:scale-[0.99]"
            style={{ background: t.brand, color: t.onBrand }}
          >
            <IconScanFace size={17} /> Rescan face
          </button>
          <button
            type="button"
            onClick={onSignOut}
            className="flex cursor-pointer items-center justify-center gap-2 rounded-full py-3 text-[14px] font-extrabold transition-transform active:scale-[0.99]"
            style={{ border: `1.5px solid ${t.border}`, color: t.error }}
          >
            <IconLogout size={16} /> Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

