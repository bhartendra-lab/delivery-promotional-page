"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { PhotoCap } from "@/lib/billing-types";
import { photoCapNearlyFull, photoCapWeight4k } from "@/lib/photo-cap";

const fmt = (n: number) => n.toLocaleString("en-IN");
const PANEL_WIDTH = 300;
const PANEL_MARGIN = 8;

/**
 * The event header's upload-limit chip (pay per event only) and the small
 * panel behind it. It answers the question studios phone about: "I have 3,900
 * photos and a 5,000 limit, so why can't I add 1,000?" Two rules explain it
 * and both are said here: deleting a photo does not give its upload back, and
 * a 4K photo uses more than one upload.
 */
export function UsageChip({ cap, onAddCapacity }: { cap: PhotoCap; onAddCapacity: () => void }) {
  /** Where the panel sits, measured from the chip when it opens. Null: closed. */
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const open = pos !== null;
  const setOpen = (next: boolean | ((v: boolean) => boolean)) => {
    const want = typeof next === "function" ? next(open) : next;
    if (!want) return setPos(null);
    const r = buttonRef.current?.getBoundingClientRect();
    if (!r) return;
    // Fixed to the viewport, not the chip: the header scrolls inside a box that
    // clips overflow, and on a narrow screen the chip wraps to the left edge.
    const left = Math.min(Math.max(PANEL_MARGIN, r.right - PANEL_WIDTH), window.innerWidth - PANEL_WIDTH - PANEL_MARGIN);
    setPos({ top: r.bottom + 6, left: Math.max(PANEL_MARGIN, left) });
  };
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!pos) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setPos(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPos(null);
    };
    // A snapshot position: close rather than drift when anything moves.
    const close = () => setPos(null);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [pos]);

  const left = Math.max(0, cap.cap - cap.used);
  const weight4k = photoCapWeight4k(cap);
  const nearlyFull = photoCapNearlyFull(cap);
  const usedShare = cap.cap > 0 ? Math.min(100, (cap.used / cap.cap) * 100) : 100;

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className={`brand-focus inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-[12.5px] font-semibold tabular-nums ${
          nearlyFull
            ? "border-[#F0D9B5] bg-[var(--color-brand-warning-soft)] text-[var(--color-brand-warning)]"
            : "border-[var(--color-brand-border)] bg-white text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)]"
        }`}
      >
        <span className="relative h-1.5 w-10 overflow-hidden rounded-full bg-[var(--color-brand-border)]" aria-hidden>
          <span
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ width: `${usedShare}%`, background: nearlyFull ? "var(--color-brand-warning)" : "var(--color-brand-navy)" }}
          />
        </span>
        {fmt(left)} uploads left
      </button>

      {pos && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Upload limit"
          style={{ top: pos.top, left: pos.left, width: Math.min(PANEL_WIDTH, window.innerWidth - PANEL_MARGIN * 2) }}
          className="fixed z-[60] rounded-xl border border-[var(--color-brand-border)] bg-white p-4 text-[13px] shadow-[0_14px_44px_rgba(42,34,24,0.18)]"
        >
          <p className="font-bold text-[var(--color-brand-ink)]">
            {fmt(cap.used)} of {fmt(cap.cap)} uploads used
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--color-brand-border)]" aria-hidden>
            <div
              className="h-full rounded-full"
              style={{ width: `${usedShare}%`, background: nearlyFull ? "var(--color-brand-warning)" : "var(--color-brand-navy)" }}
            />
          </div>

          <dl className="mt-3 space-y-1.5 text-[var(--color-brand-body)]">
            {cap.in_event != null && <Row label="Photos in the gallery" value={fmt(cap.in_event)} />}
            {cap.deleted_units != null && cap.deleted_units > 0 && (
              <Row label="Deleted, still counted" value={`${fmt(cap.deleted_units)} uploads`} />
            )}
            <Row
              label="Left"
              value={`${fmt(left)} uploads`}
              strong
            />
          </dl>
          {weight4k > 1 && left > 0 && (
            <p className="mt-1 text-right text-[12px] text-[var(--color-brand-muted)]">
              About {fmt(Math.floor(left / weight4k))} photos in 4K
            </p>
          )}

          <ul className="mt-3 space-y-1 border-t border-[#ECE5D8] pt-3 text-[12px] leading-relaxed text-[var(--color-brand-muted)]">
            <li>Deleting a photo doesn&apos;t give its upload back.</li>
            {weight4k > 1 && <li>A 4K photo uses {weight4k} uploads. Other photos use 1.</li>}
          </ul>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onAddCapacity();
            }}
            className="brand-focus mt-3 inline-flex h-9 w-full items-center justify-center rounded-lg border border-[var(--color-brand-border)] bg-white text-[12.5px] font-semibold text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)]"
          >
            Add more uploads
          </button>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt>{label}</dt>
      <dd className={`tabular-nums ${strong ? "font-bold text-[var(--color-brand-ink)]" : ""}`}>{value}</dd>
    </div>
  );
}
