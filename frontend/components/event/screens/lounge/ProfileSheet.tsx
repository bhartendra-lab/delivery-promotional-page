"use client";

import { useEffect } from "react";
import { useEventTheme } from "../../EventThemeContext";
import { IconX, IconScanFace, IconLogout, IconGear, IconChevronRight } from "@/components/ui/icons";
import { GuestPhoto } from "./GuestPhoto";

/**
 * Guest profile sheet — the "DP" viewer opened by tapping the guest avatar.
 * Shows the guest's picture enlarged, plus their account actions: rescan their
 * face (re-runs the scan flow) or sign out.
 *
 * The picture is their profile face once the backend serves those (their own
 * face from a gallery photo they are in), and their selfie before that, as it
 * always was (see lib/profile-face.ts). The copy follows: a profile face is
 * never called a selfie.
 *
 * Three states, because a selfie is no longer a given: a Guest may have one, or
 * have skipped the scan, or be in a gallery whose Studio has switched face
 * search off entirely. In that last case the sheet says nothing about selfies
 * at all — offering a scan the event does not do would be a dead end — but it
 * still shows the Guest's picture if one exists, since switching face search
 * off deletes nothing.
 */
export function ProfileSheet({
  name,
  photoUrl,
  profileFace,
  faceSearchOn,
  hasSelfie,
  onRescan,
  onSignOut,
  onClose,
  onOpenGuestControl,
}: {
  name?: string;
  /** The guest's picture (lib/profile-face.ts#guestPhotoUrl), or null. */
  photoUrl: string | null;
  /** The backend serves profile faces: the picture is a face from the
   *  gallery, never the selfie, and the copy says so. */
  profileFace: boolean;
  /** The event's `face_search_enabled` preference. */
  faceSearchOn: boolean;
  /** This Guest has a validated selfie (not merely an image on file). */
  hasSelfie: boolean;
  onRescan: () => void;
  onSignOut: () => void;
  onClose: () => void;
  /** A Client's Guest Control (collections on). Absent for everyone else,
   *  and then the sheet is exactly what it was. */
  onOpenGuestControl?: () => void;
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

        {/* DP: the profile face, or the selfie before the backend serves those */}
        <div
          className="mx-auto -mt-2 flex h-32 w-32 items-center justify-center overflow-hidden rounded-full"
          style={{ background: t.sunken, border: `3px solid ${t.brand}` }}
        >
          <GuestPhoto
            url={photoUrl}
            alt={profileFace ? "Your photo from the gallery" : "Your selfie"}
            fallback={
              <span className="text-[40px] font-extrabold" style={{ color: t.brand }}>
                {initial}
              </span>
            }
          />
        </div>

        {name && (
          <div className="mt-4 text-[18px] font-extrabold" style={{ color: t.text }}>
            {name}
          </div>
        )}
        {faceSearchOn && (
          <div className="mt-1 text-[12.5px] font-semibold" style={{ color: t.muted }}>
            {!hasSelfie
              ? "Add a selfie to find the photos you’re in"
              : !profileFace
                ? "The selfie we use to find your photos"
                : photoUrl
                  ? "Your photo from the gallery"
                  : "Your photo appears here once you are found in the gallery."}
          </div>
        )}

        {onOpenGuestControl && (
          <button
            type="button"
            onClick={onOpenGuestControl}
            className="mt-6 flex w-full cursor-pointer items-center gap-3 rounded-2xl px-4 py-3 text-left transition-transform active:scale-[0.99]"
            style={{ background: t.sunken }}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: t.accentWash, color: t.brand }}>
              <IconGear size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-extrabold" style={{ color: t.text }}>
                Guest Control
              </span>
              <span className="block truncate text-[12px] font-semibold" style={{ color: t.muted }}>
                Share the gallery, passcode and editors
              </span>
            </span>
            <IconChevronRight size={16} style={{ color: t.muted }} />
          </button>
        )}

        <div className={`${onOpenGuestControl ? "mt-3" : "mt-6"} flex flex-col gap-2.5`}>
          {faceSearchOn && (
            <button
              type="button"
              onClick={onRescan}
              className="flex cursor-pointer items-center justify-center gap-2 rounded-full py-3 text-[14px] font-extrabold transition-transform active:scale-[0.99]"
              style={{ background: t.brand, color: t.onBrand }}
            >
              <IconScanFace size={17} /> {hasSelfie ? "Rescan face" : "Scan my face"}
            </button>
          )}
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

