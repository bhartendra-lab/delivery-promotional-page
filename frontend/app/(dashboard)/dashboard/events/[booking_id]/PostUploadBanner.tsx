"use client";

import { useEffect, useRef } from "react";
import { IconUpload, IconWarning, IconX } from "./icons";

/**
 * Info strip rendered below the tab strip after an upload completes
 * (recreated from `event-tabs.jsx`). Info + dismiss × only — never a CTA. The
 * top-right LivePill is the single Publish/Republish control.
 */
export function PostUploadBanner({
  type,
  photoCount,
  onDismiss,
}: {
  type: "publish" | "republish";
  photoCount: number;
  onDismiss: () => void;
}) {
  const isRepublish = type === "republish";
  const countStr = photoCount.toLocaleString("en-IN");
  const accent = isRepublish ? "var(--color-brand-warning)" : "var(--color-brand-navy)";

  return (
    <div
      className="flex items-center gap-3.5 border-b px-4 py-2.5 sm:px-10"
      style={{
        background: isRepublish ? "#FFFBF2" : "#FEF4F0",
        borderColor: isRepublish ? "#F0D9B5" : "#EDD5CC",
      }}
    >
      <span
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border"
        style={{
          background: isRepublish ? "var(--color-brand-warning-soft)" : "var(--color-brand-navy-soft)",
          borderColor: isRepublish ? "#F0D9B5" : "#EDD5CC",
          color: accent,
        }}
      >
        <IconUpload size={15} />
      </span>
      <div className="flex-1 text-[13px] leading-snug text-[var(--color-brand-ink)]">
        <strong className="font-bold">
          {isRepublish
            ? `${countStr} new photo${photoCount === 1 ? "" : "s"} added`
            : `${countStr} photo${photoCount === 1 ? "" : "s"} uploaded successfully`}
        </strong>
        <span className="text-[var(--color-brand-muted)]">
          {isRepublish
            ? "Guests won’t see the new media until you republish from the top-right button."
            : " — click Publish (top-right) to make this gallery live for your guests."}
        </span>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        title="Dismiss"
        aria-label="Dismiss"
        className="brand-focus inline-flex shrink-0 rounded p-1 opacity-60 hover:opacity-100"
        style={{ color: accent }}
      >
        <IconX size={15} />
      </button>
    </div>
  );
}

/**
 * Information-only dialog shown when new media finishes uploading AFTER the
 * gallery was already published. No Republish/CTA button — republish is only
 * available from the top-right LivePill (it's GPU-expensive, so we surface it
 * via the pill rather than auto-running it). `×` / Esc / backdrop close only.
 */
export function PostUploadInfoDialog({
  photoCount,
  onClose,
}: {
  photoCount: number;
  onClose: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const countStr = photoCount.toLocaleString("en-IN");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    cardRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="post-upload-info-title"
      className="fixed inset-0 z-[200] flex items-center justify-center px-4"
      style={{ background: "rgba(42,34,24,0.48)", backdropFilter: "blur(3px)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={cardRef}
        tabIndex={-1}
        className="dash-rise w-full max-w-[460px] rounded-[14px] border border-[var(--color-brand-border)] bg-white p-7 shadow-[0_24px_64px_rgba(42,34,24,0.24)] outline-none"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-brand-warning-soft)] text-[var(--color-brand-warning)]">
            <IconWarning size={18} />
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="brand-focus flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-brand-muted)] hover:bg-[var(--color-brand-surface)] hover:text-[var(--color-brand-ink)]"
          >
            <IconX size={16} />
          </button>
        </div>
        <h3
          id="post-upload-info-title"
          className="mb-2 text-[17px] font-bold tracking-tight text-[var(--color-brand-ink)]"
        >
          {countStr} new photo{photoCount === 1 ? "" : "s"} added to a live gallery
        </h3>
        <p className="text-[13px] leading-relaxed text-[var(--color-brand-muted)]">
          The newly uploaded content is <strong className="text-[var(--color-brand-ink)]">delivered to your Host
          automatically</strong> — it already appears in the full gallery. However, for the new photos to show up in
          Guest <strong className="text-[var(--color-brand-ink)]">face-recognition search</strong>, you need to
          <strong className="text-[var(--color-brand-ink)]"> Re-publish</strong> from the top-right button. We don’t do
          this automatically because re-publishing re-computes image embeddings (GPU-intensive).
        </p>
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="brand-focus inline-flex h-10 items-center rounded-lg border border-[var(--color-brand-border)] bg-white px-4 text-[13px] font-semibold text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)]"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
