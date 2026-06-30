"use client";

import { useEffect } from "react";
import { useEventTheme } from "../../EventThemeContext";

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
            <XIcon size={20} />
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
            <ScanIcon size={17} /> Rescan face
          </button>
          <button
            type="button"
            onClick={onSignOut}
            className="flex cursor-pointer items-center justify-center gap-2 rounded-full py-3 text-[14px] font-extrabold transition-transform active:scale-[0.99]"
            style={{ border: `1.5px solid ${t.border}`, color: t.error }}
          >
            <SignOutIcon size={16} /> Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

function XIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="6" y1="18" x2="18" y2="6" />
    </svg>
  );
}

function ScanIcon({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
      <circle cx="12" cy="12" r="3.2" />
    </svg>
  );
}

function SignOutIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </svg>
  );
}
