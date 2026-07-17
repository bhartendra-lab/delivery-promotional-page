"use client";

import { useEffect, useRef, useState } from "react";
import { IconUpload } from "./icons";
import { clamp, parsePosNums } from "./coverPosition";

const RAW_RE =
  /\.(raw|cr2|cr3|nef|nrw|arw|srf|sr2|orf|rw2|dng|raf|3fr|kdc|mef|mrw|pef|ptx|r3d|rwl|srw|x3f|erf|fff|iiq)$/i;

/**
 * Cover banner shown only once the event has media (the empty/uploading
 * lifecycle never renders this). The cover is set by uploading a new image
 * (pushed through the upload engine → R2 url → `background_image`); already
 * uploaded photos get a "Set as cover photo" action in the media grid itself.
 */
export function CoverBanner({
  coverUrl,
  coverPosition,
  busy,
  disabled,
  onSetFromFile,
  onSavePosition,
}: {
  coverUrl?: string;
  /** Saved cover focal point (CSS object-position), e.g. "50% 35%". */
  coverPosition?: string;
  busy: boolean;
  disabled: boolean;
  onSetFromFile: (file: File) => void | Promise<void>;
  onSavePosition: (position: string) => void | Promise<void>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [repositioning, setRepositioning] = useState(false);
  const [dragPos, setDragPos] = useState("50% 50%");
  const fileRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; bx: number; by: number } | null>(null);
  const filled = !!coverUrl;

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
      className={`relative w-full shrink-0 overflow-hidden ${repositioning ? "cursor-grab touch-none select-none active:cursor-grabbing" : ""}`}
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
          onClick={() => setMenuOpen((o) => !o)}
          className="brand-focus inline-flex items-center gap-1.5 rounded-md border border-[var(--color-brand-border)] bg-white/90 px-3 py-1.5 text-[12.5px] font-semibold text-[var(--color-brand-ink)] backdrop-blur-sm hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-[2px] border-[var(--color-brand-border)] border-t-[var(--color-brand-navy)]" />
          ) : (
            <IconUpload size={14} className="text-[var(--color-brand-muted)]" />
          )}
          {filled ? "Change cover" : "Add cover photo"}
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-[calc(100%+6px)] z-30 w-[230px] overflow-hidden rounded-[10px] border border-[var(--color-brand-border)] bg-white shadow-[0_8px_28px_rgba(42,34,24,0.16)]">
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
            <p className="border-t border-[var(--color-brand-border)] px-3.5 py-2 text-[11px] leading-snug text-[var(--color-brand-muted)]">
              Tip: open any photo in the grid below and use its menu to set it as the cover.
            </p>
            {filled && (
              <button
                type="button"
                onClick={startReposition}
                className="flex w-full items-center gap-2.5 border-t border-[var(--color-brand-border)] px-3.5 py-2.5 text-left text-[13px] font-medium text-[var(--color-brand-ink)] hover:bg-[var(--color-brand-bg)]"
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
    </div>
  );
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
