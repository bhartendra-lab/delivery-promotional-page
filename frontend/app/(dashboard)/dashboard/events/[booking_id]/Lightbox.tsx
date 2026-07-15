"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MediaItem } from "@/lib/types";
import { downloadImage } from "@/lib/media-actions";
import { IconChevronLeft, IconChevronRight, IconDownload, IconHeart, IconStar, IconTrash, IconX, IconZoomIn, IconZoomOut } from "./icons";

const MIN_SCALE = 1;
const MAX_SCALE = 6;

/**
 * Full-screen preview overlay with wheel/trackpad-pinch zoom, drag-to-pan when
 * zoomed, prev/next through the folder, a per-image delete action, and
 * Escape/× to close. Matches the design language (dark warm scrim, terracotta
 * accents, flat surfaces).
 */
export function Lightbox({
  items,
  index,
  onIndexChange,
  onClose,
  onDelete,
  onToggleShortlist,
}: {
  items: MediaItem[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
  /** Delete the previewed item. Omitted where delete isn't offered (Smart Selects). */
  onDelete?: (item: MediaItem) => void;
  /** Toggle the previewed item's shortlist flag (Smart Selects). */
  onToggleShortlist?: (item: MediaItem) => void;
}) {
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const item = items[index];
  const count = items.length;

  const reset = useCallback(() => {
    setScale(1);
    setTx(0);
    setTy(0);
  }, []);

  const go = useCallback(
    (dir: number) => {
      if (count === 0) return;
      const next = (index + dir + count) % count;
      onIndexChange(next);
      reset();
    },
    [index, count, onIndexChange, reset],
  );

  // Keyboard: Esc close, arrows navigate, +/- zoom.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowRight") {
        go(1);
      } else if (e.key === "ArrowLeft") {
        go(-1);
      } else if (e.key === "+" || e.key === "=") {
        setScale((s) => clamp(s * 1.4));
      } else if (e.key === "-") {
        setScale((s) => {
          const next = clamp(s / 1.4);
          if (next === 1) {
            setTx(0);
            setTy(0);
          }
          return next;
        });
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [go, onClose]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    // Trackpad pinch arrives as a wheel event with ctrlKey set; treat all
    // vertical wheel as zoom inside the stage.
    const factor = Math.exp(-e.deltaY * 0.0015);
    setScale((s) => {
      const next = clamp(s * factor);
      if (next === 1) {
        setTx(0);
        setTy(0);
      }
      return next;
    });
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (scale <= 1) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, tx, ty };
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setTx(drag.current.tx + (e.clientX - drag.current.x));
    setTy(drag.current.ty + (e.clientY - drag.current.y));
  };
  const endDrag = () => {
    drag.current = null;
    setDragging(false);
  };

  if (!item) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
      className="fixed inset-0 z-[210] flex flex-col"
      style={{ background: "rgba(42,34,24,0.92)" }}
    >
      {/* Top toolbar */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="text-[13px] font-semibold tabular-nums text-white/80">
            {index + 1} / {count.toLocaleString("en-IN")}
          </span>
          {(item.likes_count ?? 0) > 0 && (
            <span
              className="inline-flex items-center gap-1 text-[12.5px] font-semibold tabular-nums text-white/80"
              title={item.host_liked ? "Liked by the host" : "Liked by guests"}
            >
              <IconHeart
                size={13}
                filled={!!item.host_liked}
                style={item.host_liked ? { color: "var(--color-brand-navy)" } : undefined}
              />
              {(item.likes_count ?? 0).toLocaleString("en-IN")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <ToolButton label="Zoom out" disabled={scale <= MIN_SCALE} onClick={() => setScale((s) => { const n = clamp(s / 1.4); if (n === 1) { setTx(0); setTy(0); } return n; })}>
            <IconZoomOut size={17} />
          </ToolButton>
          <span className="w-12 text-center text-[12px] font-semibold tabular-nums text-white/70">
            {Math.round(scale * 100)}%
          </span>
          <ToolButton label="Zoom in" disabled={scale >= MAX_SCALE} onClick={() => setScale((s) => clamp(s * 1.4))}>
            <IconZoomIn size={17} />
          </ToolButton>
          <span className="mx-1 h-5 w-px bg-white/20" />
          {onToggleShortlist && (
            <ToolButton
              label={item.shortlisted ? "Remove from shortlist" : "Shortlist photo"}
              active={!!item.shortlisted}
              onClick={() => onToggleShortlist(item)}
            >
              <IconStar size={16} filled={!!item.shortlisted} />
            </ToolButton>
          )}
          <ToolButton label="Download photo" onClick={() => downloadImage(item.url)}>
            <IconDownload size={16} />
          </ToolButton>
          {onDelete && (
            <ToolButton label="Delete photo" danger onClick={() => onDelete(item)}>
              <IconTrash size={16} />
            </ToolButton>
          )}
          <ToolButton label="Close preview" onClick={onClose}>
            <IconX size={18} />
          </ToolButton>
        </div>
      </div>

      {/* Stage */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden" onWheel={onWheel}>
        {count > 1 && (
          <button
            type="button"
            aria-label="Previous photo"
            onClick={() => go(-1)}
            className="absolute left-2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:left-5"
          >
            <IconChevronLeft size={22} />
          </button>
        )}

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.url}
          alt=""
          draggable={false}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onDoubleClick={() => (scale > 1 ? reset() : setScale(2.2))}
          className="max-h-full max-w-full select-none object-contain"
          style={{
            transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
            transition: dragging ? "none" : "transform 140ms ease-out",
            cursor: scale > 1 ? (dragging ? "grabbing" : "grab") : "zoom-in",
            touchAction: "none",
          }}
        />

        {count > 1 && (
          <button
            type="button"
            aria-label="Next photo"
            onClick={() => go(1)}
            className="absolute right-2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:right-5"
          >
            <IconChevronRight size={22} />
          </button>
        )}
      </div>
    </div>
  );
}

function ToolButton({
  children,
  label,
  onClick,
  disabled,
  danger,
  active,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  /** Persistent "on" state (e.g. shortlisted) — tinted amber. */
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
      style={active ? { color: "var(--color-brand-warning)" } : undefined}
      className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
        active ? "" : "text-white"
      } ${danger ? "hover:bg-[var(--color-brand-danger)]" : "hover:bg-white/15"}`}
    >
      {children}
    </button>
  );
}

function clamp(s: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
}
