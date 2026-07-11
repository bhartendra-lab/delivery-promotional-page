"use client";

import { useEffect, useRef, useState } from "react";
import { IconX } from "./icons";
import { clamp, parsePosNums } from "./coverPosition";

/**
 * Shown right after a studio picks a cover photo (upload or "Set as cover
 * photo" from the grid) — lets them drag the photo into position before it's
 * actually saved as the event cover. Cancelling discards the pick entirely.
 */
export function CoverPositionModal({
  imageUrl,
  initialPosition = "50% 50%",
  busy,
  onSave,
  onCancel,
}: {
  imageUrl: string;
  initialPosition?: string;
  busy: boolean;
  onSave: (position: string) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [dragPos, setDragPos] = useState(initialPosition);
  const bannerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; bx: number; by: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    const [bx, by] = parsePosNums(dragPos);
    dragRef.current = { x: e.clientX, y: e.clientY, bx, by };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current || !bannerRef.current) return;
    const rect = bannerRef.current.getBoundingClientRect();
    // Drag the image: moving right reveals the left edge → x% decreases.
    const nx = clamp(dragRef.current.bx - ((e.clientX - dragRef.current.x) / rect.width) * 100);
    const ny = clamp(dragRef.current.by - ((e.clientY - dragRef.current.y) / rect.height) * 100);
    setDragPos(`${nx.toFixed(1)}% ${ny.toFixed(1)}%`);
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cover-position-title"
      className="fixed inset-0 z-[210] flex items-center justify-center px-4"
      style={{ background: "rgba(42,34,24,0.48)", backdropFilter: "blur(3px)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="dash-rise flex max-h-[92vh] w-full max-w-[560px] flex-col overflow-hidden rounded-[14px] border border-[var(--color-brand-border)] bg-white shadow-[0_24px_64px_rgba(42,34,24,0.24)]">
        <div className="flex items-center justify-between gap-4 border-b border-[var(--color-brand-border)] px-5 py-4">
          <div>
            <h3 id="cover-position-title" className="text-[16px] font-bold tracking-tight text-[var(--color-brand-ink)]">
              Adjust cover photo
            </h3>
            <p className="mt-0.5 text-[12.5px] text-[var(--color-brand-muted)]">
              Drag the photo to choose what guests see.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label="Close"
            className="brand-focus flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--color-brand-muted)] hover:bg-[var(--color-brand-surface)] hover:text-[var(--color-brand-ink)] disabled:opacity-50"
          >
            <IconX size={16} />
          </button>
        </div>

        <div
          ref={bannerRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className="relative w-full shrink-0 cursor-grab touch-none select-none overflow-hidden active:cursor-grabbing"
          style={{
            height: 260,
            backgroundImage: `url(${imageUrl})`,
            backgroundSize: "cover",
            backgroundPosition: dragPos,
          }}
        >
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: "linear-gradient(to bottom, rgba(42,34,24,0) 60%, rgba(42,34,24,0.35) 100%)" }}
          />
        </div>

        <div className="flex items-center justify-end gap-2.5 px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="brand-focus inline-flex h-10 items-center rounded-lg border border-[var(--color-brand-border)] bg-white px-4 text-[13.5px] font-medium text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void onSave(dragPos)}
            disabled={busy}
            className="brand-focus inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--color-brand-navy)] px-4 text-[13.5px] font-semibold text-white hover:bg-[var(--color-brand-navy-deep)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-[2px] border-white/60 border-t-white" />
                Saving…
              </>
            ) : (
              "Save cover photo"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
