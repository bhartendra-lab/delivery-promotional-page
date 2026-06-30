"use client";

import { useEffect, useRef, useState } from "react";
import type { MediaItem } from "@/lib/types";
import { IconImage, IconLock, IconUpload, IconX } from "./icons";

const RAW_RE =
  /\.(raw|cr2|cr3|nef|nrw|arw|srf|sr2|orf|rw2|dng|raf|3fr|kdc|mef|mrw|pef|ptx|r3d|rwl|srw|x3f|erf|fff|iiq)$/i;

/**
 * Cover banner shown only once the event has media (the empty/uploading
 * lifecycle never renders this). A cover can be set two ways: upload a new
 * image (pushed through the upload engine → R2 url → `background_image`) or pick
 * one of the already-uploaded images (its R2 url → `background_image`).
 */
export function CoverBanner({
  coverUrl,
  coverPosition,
  media,
  busy,
  disabled,
  lockReason,
  onSetFromUrl,
  onSetFromFile,
  onSavePosition,
}: {
  coverUrl?: string;
  /** Saved cover focal point (CSS object-position), e.g. "50% 35%". */
  coverPosition?: string;
  media: MediaItem[];
  busy: boolean;
  disabled: boolean;
  /** When set, the cover is immutable (e.g. locked after publishing) — the
   *  control is disabled and this string is shown as the explanation. */
  lockReason?: string | null;
  onSetFromUrl: (url: string) => void | Promise<void>;
  onSetFromFile: (file: File) => void | Promise<void>;
  onSavePosition: (position: string) => void | Promise<void>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [repositioning, setRepositioning] = useState(false);
  const [dragPos, setDragPos] = useState("50% 50%");
  const fileRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; bx: number; by: number } | null>(null);
  const filled = !!coverUrl;
  const locked = !!lockReason;

  const shownPos = repositioning ? dragPos : coverPosition || "center";

  const startReposition = () => {
    setDragPos(parsePos(coverPosition));
    setRepositioning(true);
    setMenuOpen(false);
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (!repositioning) return;
    const [bx, by] = parsePosNums(dragPos);
    dragRef.current = { x: e.clientX, y: e.clientY, bx, by };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!repositioning || !dragRef.current || !bannerRef.current) return;
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
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  return (
    <div
      ref={bannerRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className={`relative w-full overflow-hidden ${repositioning ? "cursor-grab touch-none select-none active:cursor-grabbing" : ""}`}
      style={{
        height: 240,
        ...(filled
          ? { backgroundImage: `url(${coverUrl})`, backgroundSize: "cover", backgroundPosition: shownPos }
          : {
              backgroundImage:
                "repeating-linear-gradient(45deg, #C9AFA0 0 18px, #9E8475 18px 36px)",
            }),
      }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "linear-gradient(to bottom, rgba(42,34,24,0) 45%, rgba(42,34,24,0.4) 100%)" }}
      />

      {repositioning && (
        // Stop pointer events here from reaching the banner's drag handler —
        // otherwise the banner captures the pointer and swallows these clicks.
        <div
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 bg-[rgba(42,34,24,0.6)] px-4 py-3 backdrop-blur-sm sm:px-6"
        >
          <span className="text-[12.5px] font-semibold text-white">Drag the photo to choose what guests see</span>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setRepositioning(false)}
              className="brand-focus cursor-pointer rounded-md bg-white/15 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-white/25"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                void onSavePosition(dragPos);
                setRepositioning(false);
              }}
              className="brand-focus cursor-pointer rounded-md bg-white px-3 py-1.5 text-[12.5px] font-semibold text-[var(--color-brand-ink)] hover:bg-white/90"
            >
              Save position
            </button>
          </div>
        </div>
      )}

      <div className={`absolute right-4 top-4 sm:right-6 ${repositioning ? "hidden" : ""}`} ref={wrapRef}>
        <button
          type="button"
          disabled={disabled || busy}
          title={locked ? "The cover photo is locked after publishing — you can still reposition it." : undefined}
          onClick={() => setMenuOpen((o) => !o)}
          className="brand-focus inline-flex items-center gap-1.5 rounded-md border border-[var(--color-brand-border)] bg-white/90 px-3 py-1.5 text-[12.5px] font-semibold text-[var(--color-brand-ink)] backdrop-blur-sm hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-[2px] border-[var(--color-brand-border)] border-t-[var(--color-brand-navy)]" />
          ) : locked ? (
            <IconLock size={13} className="text-[var(--color-brand-muted)]" />
          ) : (
            <IconImage size={14} className="text-[var(--color-brand-muted)]" />
          )}
          {locked ? "Adjust cover" : filled ? "Change cover" : "Add cover photo"}
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-[calc(100%+6px)] z-30 w-[230px] overflow-hidden rounded-[10px] border border-[var(--color-brand-border)] bg-white shadow-[0_8px_28px_rgba(42,34,24,0.16)]">
            {locked ? (
              <p className="border-b border-[var(--color-brand-border)] px-3.5 py-2.5 text-[11.5px] font-medium leading-snug text-[var(--color-brand-muted)]">
                The cover photo is locked after publishing. You can still reposition it.
              </p>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    fileRef.current?.click();
                  }}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-medium text-[var(--color-brand-ink)] hover:bg-[var(--color-brand-bg)]"
                >
                  <IconUpload size={15} className="text-[var(--color-brand-muted)]" />
                  Upload a new photo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setPickerOpen(true);
                  }}
                  disabled={media.length === 0}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-medium text-[var(--color-brand-ink)] hover:bg-[var(--color-brand-bg)] disabled:opacity-40"
                >
                  <IconImage size={15} className="text-[var(--color-brand-muted)]" />
                  Choose from uploaded
                </button>
              </>
            )}
            {filled && (
              <button
                type="button"
                onClick={startReposition}
                className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-medium text-[var(--color-brand-ink)] hover:bg-[var(--color-brand-bg)] ${locked ? "" : "border-t border-[var(--color-brand-border)]"}`}
              >
                <MoveIcon size={15} />
                Reposition cover
              </button>
            )}
          </div>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file && !RAW_RE.test(file.name)) void onSetFromFile(file);
        }}
      />

      {pickerOpen && (
        <CoverPicker
          media={media}
          onPick={(url) => {
            setPickerOpen(false);
            void onSetFromUrl(url);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

function clamp(v: number): number {
  return Math.max(0, Math.min(100, v));
}
/** Parse a CSS object-position into numeric [x, y] percentages. */
function parsePosNums(p: string): [number, number] {
  const m = p.match(/(-?[\d.]+)%\s+(-?[\d.]+)%/);
  return m ? [clamp(parseFloat(m[1])), clamp(parseFloat(m[2]))] : [50, 50];
}
/** Normalise an object-position string, defaulting to centre. */
function parsePos(p?: string): string {
  if (!p) return "50% 50%";
  const [x, y] = parsePosNums(p);
  return `${x}% ${y}%`;
}

function MoveIcon({ size = 15, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className={className ?? "text-[var(--color-brand-muted)]"}>
      <path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" />
    </svg>
  );
}

/** Lightweight modal grid of already-uploaded thumbnails to pick a cover from. */
function CoverPicker({
  media,
  onPick,
  onClose,
}: {
  media: MediaItem[];
  onPick: (url: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pickable = media.filter((m) => !m._id.startsWith("optimistic-"));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cover-picker-title"
      className="fixed inset-0 z-[200] flex items-center justify-center px-4"
      style={{ background: "rgba(42,34,24,0.48)", backdropFilter: "blur(3px)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dash-rise flex max-h-[82vh] w-full max-w-[720px] flex-col overflow-hidden rounded-[14px] border border-[var(--color-brand-border)] bg-white shadow-[0_24px_64px_rgba(42,34,24,0.24)]">
        <div className="flex items-center justify-between gap-4 border-b border-[var(--color-brand-border)] px-5 py-4">
          <div>
            <h3 id="cover-picker-title" className="text-[16px] font-bold tracking-tight text-[var(--color-brand-ink)]">
              Choose a cover photo
            </h3>
            <p className="mt-0.5 text-[12.5px] text-[var(--color-brand-muted)]">
              Pick any already-uploaded image to use as the event cover.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="brand-focus flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-brand-muted)] hover:bg-[var(--color-brand-surface)] hover:text-[var(--color-brand-ink)]"
          >
            <IconX size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
            {pickable.map((m) => (
              <button
                key={m._id}
                type="button"
                onClick={() => onPick(m.url)}
                className="brand-focus group relative aspect-square overflow-hidden rounded bg-[var(--color-brand-surface)]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={m.url}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                />
                <span className="absolute inset-0 ring-0 ring-[var(--color-brand-navy)] transition-all group-hover:ring-2" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
