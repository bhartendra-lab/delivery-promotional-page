"use client";

import { useEffect, useRef, useState } from "react";
import { IconUpload, IconDownload, IconX } from "./icons";
import { clamp, parsePosNums } from "./coverPosition";
import { downloadImage } from "@/lib/media-actions";

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
  const [repositioning, setRepositioning] = useState(false);
  const [dragPos, setDragPos] = useState("50% 50%");
  const [fullscreen, setFullscreen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; bx: number; by: number } | null>(null);
  const filled = !!coverUrl;

  const shownPos = repositioning ? dragPos : coverPosition || "center";

  const startReposition = () => {
    setDragPos(parsePos(coverPosition));
    setRepositioning(true);
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

  function handleDownload() {
    if (!coverUrl) return;
    void downloadImage(coverUrl, "cover");
  }

  return (
    <>
      <div
        ref={bannerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className={`group relative w-full shrink-0 overflow-hidden ${repositioning ? "cursor-grab touch-none select-none active:cursor-grabbing" : ""}`}
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

        {repositioning ? (
          <>
            {/* Hint — centered over the image, a subtle scrim behind the text
                only (Notion layout), not a full bottom bar. */}
            <div className="pointer-events-none absolute inset-x-0 top-1/2 z-20 flex -translate-y-1/2 justify-center px-4">
              <span className="rounded-md bg-[rgba(42,34,24,0.55)] px-3 py-1.5 text-center text-[12.5px] font-semibold text-white backdrop-blur-sm">
                Drag the photo to choose what guests see
              </span>
            </div>

            {/* Actions — top-right, same corner as the hover cluster below.
                Stop pointer-down here so it doesn't reach the banner's drag
                handler and start a drag from the controls themselves. */}
            <div
              onPointerDown={(e) => e.stopPropagation()}
              className="absolute right-4 top-4 z-30 flex shrink-0 items-center gap-2 sm:right-6"
            >
              <button
                type="button"
                onClick={() => setRepositioning(false)}
                className="brand-focus cursor-pointer rounded-md bg-white/15 px-3 py-1.5 text-[12.5px] font-semibold text-white backdrop-blur-sm hover:bg-white/25"
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
          </>
        ) : filled ? (
          /* Hover cluster — hidden at rest, revealed on hover/focus. */
          <div className="absolute right-4 top-4 z-20 flex items-center divide-x divide-[var(--color-brand-border)] overflow-hidden rounded-md border border-[var(--color-brand-border)] bg-white/90 opacity-0 shadow-[0_2px_10px_rgba(42,34,24,0.1)] backdrop-blur-sm transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 sm:right-6">
            <CoverActionButton
              onClick={() => fileRef.current?.click()}
              disabled={disabled || busy}
              busy={busy}
              label="Change cover"
              icon={<IconUpload size={14} />}
            />
            <CoverActionButton
              onClick={startReposition}
              disabled={disabled || busy}
              label="Reposition"
              icon={<MoveIcon size={14} />}
            />
            <CoverActionButton
              onClick={handleDownload}
              disabled={disabled || busy}
              label="Download"
              icon={<IconDownload size={14} />}
            />
            <CoverActionButton
              onClick={() => setFullscreen(true)}
              disabled={disabled}
              label="Fullscreen"
              icon={<IconExpand size={14} />}
            />
          </div>
        ) : (
          /* Empty state — nothing to hover over, so the CTA stays visible. */
          <div className="absolute right-4 top-4 sm:right-6">
            <button
              type="button"
              disabled={disabled || busy}
              onClick={() => fileRef.current?.click()}
              className="brand-focus inline-flex items-center gap-1.5 rounded-md border border-[var(--color-brand-border)] bg-white/90 px-3 py-1.5 text-[12.5px] font-semibold text-[var(--color-brand-ink)] backdrop-blur-sm hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-[2px] border-[var(--color-brand-border)] border-t-[var(--color-brand-navy)]" />
              ) : (
                <IconUpload size={14} className="text-[var(--color-brand-muted)]" />
              )}
              Add cover photo
            </button>
          </div>
        )}

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

      {fullscreen && coverUrl && (
        <FullscreenPreview url={coverUrl} onClose={() => setFullscreen(false)} />
      )}
    </>
  );
}

/** One icon action inside the hover cluster / Notion-style corner control. */
function CoverActionButton({
  onClick,
  disabled,
  busy,
  label,
  icon,
}: {
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="brand-focus flex h-8 w-8 items-center justify-center text-[var(--color-brand-muted)] transition-colors hover:bg-[var(--color-brand-bg)] hover:text-[var(--color-brand-ink)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {busy ? (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-[2px] border-[var(--color-brand-border)] border-t-[var(--color-brand-navy)]" />
      ) : (
        icon
      )}
    </button>
  );
}

/** Minimal full-screen preview of the cover — Escape or scrim click closes it. */
function FullscreenPreview({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-6"
      style={{ background: "rgba(42,34,24,0.9)" }}
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close preview"
        className="brand-focus absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
      >
        <IconX size={18} />
      </button>
      <img
        src={url}
        alt="Cover photo, full size"
        className="max-h-full max-w-full rounded-lg object-contain shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
        onClick={(e) => e.stopPropagation()}
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
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" />
    </svg>
  );
}

function IconExpand({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 9V5h4" />
      <path d="M16 5h4v4" />
      <path d="M20 15v4h-4" />
      <path d="M8 19H4v-4" />
    </svg>
  );
}
