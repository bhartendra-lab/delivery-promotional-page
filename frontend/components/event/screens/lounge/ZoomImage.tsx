"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Pinch / double-tap / scroll-wheel zoom with drag-to-pan. Self-contained and
 * reset per image (the parent keys it by id). Pan is clamped to the photo's
 * scaled bounds so it can never be dragged off-screen.
 *
 * Shared by both viewers. The reel turns double-tap zoom off (`doubleTapZoom`),
 * because there a double tap means "like", and listens to `onZoomChange` so it
 * can stop paging while the photo is zoomed: a vertical drag on a zoomed photo
 * pans it instead of moving to the next one. Pinch still zooms in both.
 */
export function ZoomImage({
  src,
  doubleTapZoom = true,
  onZoomChange,
  rounded = true,
}: {
  src: string;
  doubleTapZoom?: boolean;
  /** Fired when the photo goes from fit to zoomed, and back. */
  onZoomChange?: (zoomed: boolean) => void;
  /** Rounded corners (the framed desktop viewer). The reel is full-bleed. */
  rounded?: boolean;
}) {
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

  const zoomChange = useRef(onZoomChange);
  useEffect(() => {
    zoomChange.current = onZoomChange;
  }, [onZoomChange]);
  const reportedZoom = useRef(false);

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
    const zoomed = s > 1;
    if (zoomed !== reportedZoom.current) {
      reportedZoom.current = zoomed;
      zoomChange.current?.(zoomed);
    }
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
    if (doubleTapZoom) {
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
    }
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
        className={`max-h-full max-w-full select-none object-contain [-webkit-touch-callout:none] ${rounded ? "rounded-xl" : ""}`}
        style={{
          transform: `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`,
          transition: gesturing ? "none" : "transform 0.22s cubic-bezier(0.2, 0.7, 0.3, 1)",
          cursor: scale > 1 ? "grab" : doubleTapZoom ? "zoom-in" : "default",
          touchAction: "none",
        }}
      />
    </div>
  );
}
