"use client";

/**
 * The quality chooser for a SINGLE photo.
 *
 * Deliberately not the bulk pre-flight: there is no size to warn about, no
 * method to explain and no picker to open, so all this asks is the one question
 * that still has two answers. Shown only where a choice actually exists (see
 * `useSinglePhotoDownload`), so a QHD-only gallery never gains an extra tap.
 *
 * Tier names come from the shared registry, so a photo the studio uploaded as
 * "Cinema 4K" is offered under that name here, in the bulk pre-flight, and in
 * the studio's own delivery preferences.
 */

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { ARCHIVE_TIER_FULL, type ArchiveTier } from "@/lib/delivery-preferences";
import type { SinglePhotoTier } from "@/lib/download/single";
import type { DownloadModalTheme } from "./DownloadPlanModal";

const FOCUSABLE = 'button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function QualityChoiceSheet({
  open,
  archiveTier,
  onPick,
  onClose,
  theme: t,
}: {
  open: boolean;
  /** The archive tier on offer. Null renders nothing — the caller had no
   *  choice to present and should have downloaded directly. */
  archiveTier: ArchiveTier | null;
  onPick: (tier: SinglePhotoTier) => void;
  onClose: () => void;
  theme: DownloadModalTheme;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Stop the lightbox behind this from closing on the same Escape.
        e.stopPropagation();
        onClose();
        return;
      }
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
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  if (!open || !archiveTier || typeof document === "undefined") return null;

  const font = t.font ? { fontFamily: t.font } : undefined;
  const options: { tier: SinglePhotoTier; label: string; note: string }[] = [
    {
      tier: "2560",
      label: "Web (2560px)",
      note: "Great for phones, sharing and printing small.",
    },
    {
      tier: archiveTier,
      label: ARCHIVE_TIER_FULL[archiveTier],
      note:
        archiveTier === "original"
          ? "The full camera file, with no watermark."
          : "Print resolution, with no watermark.",
    },
  ];

  return createPortal(
    // z-index sits above the guest lightbox (z-70) and the dashboard one, since
    // this is opened FROM them.
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-6"
      style={{ background: "rgba(31,26,14,0.55)" }}
      onClick={onClose}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="w-full rounded-t-3xl p-5 sm:max-w-[380px] sm:rounded-3xl"
        style={{ background: t.card, boxShadow: t.shadow, ...font }}
      >
        <div id={titleId} className="text-[16px] font-extrabold" style={{ color: t.text }}>
          Download this photo
        </div>
        <div className="mt-3.5 flex flex-col gap-2">
          {options.map((option) => (
            <button
              key={option.tier}
              type="button"
              onClick={() => onPick(option.tier)}
              className="cursor-pointer rounded-2xl border px-4 py-3 text-left"
              style={{ borderColor: t.border, background: t.sunken }}
            >
              <span className="block text-[13px] font-extrabold" style={{ color: t.text }}>
                {option.label}
              </span>
              <span className="mt-0.5 block text-[11.5px] font-semibold" style={{ color: t.muted }}>
                {option.note}
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full cursor-pointer py-2 text-[12.5px] font-bold"
          style={{ color: t.muted }}
        >
          Cancel
        </button>
      </div>
    </div>,
    document.body,
  );
}
