"use client";

import { IconUpload, IconX } from "./icons";

/**
 * Info strip rendered below the tab strip after an upload completes. Info +
 * dismiss × only — never a CTA: galleries are live from creation, so there is
 * nothing for the studio to do. Background processing (embeddings → face
 * search) is deliberately not surfaced to the studio; the strip just confirms
 * the photos are up and the gallery is live.
 */
export function PostUploadBanner({
  photoCount,
  onDismiss,
}: {
  photoCount: number;
  onDismiss: () => void;
}) {
  const countStr = photoCount.toLocaleString("en-IN");

  return (
    <div
      className="flex items-center gap-3.5 border-b px-4 py-2.5 sm:px-10"
      style={{ background: "#FFFBF2", borderColor: "#F0D9B5" }}
    >
      <span
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border"
        style={{
          background: "var(--color-brand-warning-soft)",
          borderColor: "#F0D9B5",
          color: "var(--color-brand-warning)",
        }}
      >
        <IconUpload size={15} />
      </span>
      <div className="flex-1 text-[13px] leading-snug text-[var(--color-brand-ink)]">
        <strong className="font-bold">
          {countStr} photo{photoCount === 1 ? "" : "s"} uploaded — your gallery is live
        </strong>
        <span className="text-[var(--color-brand-muted)]">
          {" "}
          The new photos are now part of your live gallery for guests.
        </span>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        title="Dismiss"
        aria-label="Dismiss"
        className="brand-focus inline-flex shrink-0 rounded p-1 opacity-60 hover:opacity-100"
        style={{ color: "var(--color-brand-warning)" }}
      >
        <IconX size={15} />
      </button>
    </div>
  );
}
