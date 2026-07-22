"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GuestMediaItem } from "@/lib/types";
import { SIGNAL } from "@/lib/client-theme";
import { downloadImage, shareImage } from "@/lib/media-actions";
import { useEventTheme } from "../../EventThemeContext";

/**
 * Immersive fullscreen viewer (near-black ground — never themed). Carries Like
 * (locked heart-red), Share (Web Share → local sheet, fallback copy-link) and
 * Download. In select mode the right action becomes the selection toggle.
 */
export function PhotoViewer({
  items,
  index,
  onClose,
  onNav,
  liked,
  onToggleLike,
  selectMode,
  selected,
  onToggleSelect,
  onToast,
  onDownloaded,
}: {
  items: GuestMediaItem[];
  index: number;
  onClose: () => void;
  onNav: (i: number) => void;
  liked: Set<string>;
  onToggleLike: (item: GuestMediaItem) => void;
  selectMode: boolean;
  selected: Set<string>;
  onToggleSelect: (item: GuestMediaItem) => void;
  onToast: (msg: string) => void;
  /** Fired after a successful single-photo download — drives the post-download review nudge. */
  onDownloaded?: () => void;
}) {
  const { theme: t, event } = useEventTheme();
  const item = items[index];

  const step = (d: number) => {
    if (items.length < 2) return;
    onNav((index + d + items.length) % items.length);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, items.length]);

  if (!item) return null;
  const isLiked = liked.has(item._id);
  const isSel = selected.has(item._id);

  async function onShare() {
    const r = await shareImage(item.url, event.event_name);
    if (r === "copied") onToast("Link copied");
    else if (r === "failed") onToast("Couldn’t share");
  }
  async function onDownload() {
    onToast("Downloading…");
    await downloadImage(item.url);
    onDownloaded?.();
  }

  return (
    <div className="fixed inset-0 z-[70] flex flex-col" style={{ background: SIGNAL.viewer }}>
      {/* top chrome */}
      <div className="flex items-center justify-between px-4 pt-4">
        <button type="button" onClick={onClose} aria-label="Close" className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-white" style={{ background: "rgba(255,255,255,0.14)" }}>
          <XIcon size={18} />
        </button>
        <span className="text-[12.5px] font-extrabold tabular-nums" style={{ color: "rgba(255,253,245,0.7)" }}>
          {String(index + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}
        </span>
        {selectMode ? (
          <button
            type="button"
            onClick={() => onToggleSelect(item)}
            aria-label={isSel ? "Deselect" : "Select"}
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full"
            style={{ background: isSel ? t.brand : "rgba(255,255,255,0.14)", color: t.onBrand }}
          >
            {isSel ? <CheckIcon size={18} /> : <span className="h-4 w-4 rounded-full border-2" style={{ borderColor: "rgba(255,253,245,0.75)" }} />}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <ChipButton label="Like" onClick={() => onToggleLike(item)}>
              <HeartIcon size={19} filled={isLiked} color={isLiked ? SIGNAL.liked : "#fff"} />
            </ChipButton>
            <ChipButton label="Download" onClick={onDownload}>
              <DownloadIcon size={19} />
            </ChipButton>
            {/* Web Share is a mobile affordance — hide it on desktop. */}
            <ChipButton label="Share" onClick={onShare} className="lg:hidden">
              <ShareIcon size={19} />
            </ChipButton>
          </div>
        )}
      </div>

      {/* image */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-3 py-4">
        <ZoomImage key={item._id} src={item.url} />
        {items.length > 1 && (
          <>
            <button type="button" onClick={() => step(-1)} aria-label="Previous" className="absolute left-4 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-white" style={{ background: "rgba(20,16,8,0.5)" }}>
              <ChevronIcon size={20} dir="left" />
            </button>
            <button type="button" onClick={() => step(1)} aria-label="Next" className="absolute right-4 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-white" style={{ background: "rgba(20,16,8,0.5)" }}>
              <ChevronIcon size={20} dir="right" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Pinch / double-tap / scroll-wheel zoom with drag-to-pan. Self-contained and
 * reset per image (the parent keys it by id). Pan is clamped to the photo's
 * scaled bounds so it can never be dragged off-screen.
 */
function ZoomImage({ src }: { src: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [gesturing, setGesturing] = useState(false);

  // Refs mirror state so pointer handlers always read live values.
  const sRef = useRef(1);
  const txRef = useRef(0);
  const tyRef = useRef(0);

  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinch = useRef<{ d0: number; s0: number; mx: number; my: number; t0x: number; t0y: number } | null>(null);
  const pan = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const lastTap = useRef(0);

  const MIN = 1;
  const MAX = 4;

  // Apply a transform, clamping the pan so the scaled photo stays in view.
  const commit = useCallback((s: number, x: number, y: number) => {
    const wrap = wrapRef.current;
    const img = imgRef.current;
    if (wrap && img) {
      const maxX = Math.max(0, (img.clientWidth * s - wrap.clientWidth) / 2);
      const maxY = Math.max(0, (img.clientHeight * s - wrap.clientHeight) / 2);
      x = Math.max(-maxX, Math.min(maxX, x));
      y = Math.max(-maxY, Math.min(maxY, y));
    }
    sRef.current = s;
    txRef.current = x;
    tyRef.current = y;
    setScale(s);
    setTx(x);
    setTy(y);
  }, []);

  // Zoom toward a focal point (relative to the viewport centre).
  const zoomTo = useCallback(
    (next: number, cx: number, cy: number) => {
      const k = next / sRef.current;
      commit(next, cx - (cx - txRef.current) * k, cy - (cy - tyRef.current) * k);
    },
    [commit],
  );

  const center = (clientX: number, clientY: number) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: clientX - r.left - r.width / 2, y: clientY - r.top - r.height / 2 };
  };

  // Non-passive wheel listener so we can preventDefault and zoom toward cursor.
  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { x, y } = center(e.clientX, e.clientY);
      const next = Math.max(MIN, Math.min(MAX, sRef.current * (e.deltaY < 0 ? 1.18 : 1 / 1.18)));
      if (next !== sRef.current) zoomTo(next, x, y);
    };
    img.addEventListener("wheel", onWheel, { passive: false });
    return () => img.removeEventListener("wheel", onWheel);
  }, [zoomTo]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const r = wrapRef.current!.getBoundingClientRect();
      pinch.current = {
        d0: Math.hypot(a.x - b.x, a.y - b.y),
        s0: sRef.current,
        mx: (a.x + b.x) / 2 - r.left - r.width / 2,
        my: (a.y + b.y) / 2 - r.top - r.height / 2,
        t0x: txRef.current,
        t0y: tyRef.current,
      };
      pan.current = null;
      lastTap.current = 0;
      setGesturing(true);
      return;
    }

    // Double-tap / double-click toggles between fit and 2.5×.
    const now = Date.now();
    if (now - lastTap.current < 280) {
      lastTap.current = 0;
      if (sRef.current > 1) commit(1, 0, 0);
      else {
        const { x, y } = center(e.clientX, e.clientY);
        zoomTo(2.5, x, y);
      }
      return;
    }
    lastTap.current = now;
    if (sRef.current > 1) {
      pan.current = { x: e.clientX, y: e.clientY, tx: txRef.current, ty: tyRef.current };
      setGesturing(true);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const p = pinch.current;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const next = Math.max(MIN, Math.min(MAX, p.s0 * (dist / p.d0)));
      const r = wrapRef.current!.getBoundingClientRect();
      const m1x = (a.x + b.x) / 2 - r.left - r.width / 2;
      const m1y = (a.y + b.y) / 2 - r.top - r.height / 2;
      const cx = (p.mx - p.t0x) / p.s0;
      const cy = (p.my - p.t0y) / p.s0;
      commit(next, m1x - cx * next, m1y - cy * next);
    } else if (pan.current) {
      commit(sRef.current, pan.current.tx + (e.clientX - pan.current.x), pan.current.ty + (e.clientY - pan.current.y));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 1 && sRef.current > 1) {
      const [only] = [...pointers.current.values()];
      pan.current = { x: only.x, y: only.y, tx: txRef.current, ty: tyRef.current };
    }
    if (pointers.current.size === 0) {
      pan.current = null;
      setGesturing(false);
    }
  };

  return (
    <div ref={wrapRef} className="flex h-full w-full items-center justify-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={src}
        alt=""
        draggable={false}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="max-h-full max-w-full select-none rounded-xl object-contain"
        style={{
          transform: `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`,
          transition: gesturing ? "none" : "transform 0.22s cubic-bezier(0.2, 0.7, 0.3, 1)",
          cursor: scale > 1 ? "grab" : "zoom-in",
          touchAction: "none",
        }}
      />
    </div>
  );
}

function ChipButton({ label, onClick, children, className = "" }: { label: string; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-white ${className}`}
      style={{ background: "rgba(255,255,255,0.14)" }}
    >
      {children}
    </button>
  );
}

function XIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="6" y1="18" x2="18" y2="6" />
    </svg>
  );
}
function HeartIcon({ size = 19, filled, color = "#fff" }: { size?: number; filled?: boolean; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? color : "none"} stroke={color} strokeWidth={2} strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}
function DownloadIcon({ size = 19 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12M7 11l5 5 5-5M5 21h14" />
    </svg>
  );
}
function ShareIcon({ size = 19 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v13M8 7l4-4 4 4M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6" />
    </svg>
  );
}
function CheckIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="5 12 10 17 19 7" />
    </svg>
  );
}
function ChevronIcon({ size = 20, dir }: { size?: number; dir: "left" | "right" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" style={{ transform: dir === "left" ? "rotate(180deg)" : undefined }}>
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}
