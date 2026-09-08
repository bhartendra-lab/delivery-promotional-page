"use client";

/**
 * The per-photo metadata tip — an info icon that reveals filename, size,
 * quality tier and upload time.
 *
 * THE HOVER RULE, which is most of the work here: the panel opens on hovering
 * the icon and stays open while the pointer is over EITHER the icon or the
 * panel, closing only once the pointer has left both for CLOSE_DELAY_MS. A
 * naive `onMouseLeave` on the icon alone closes the panel the instant the
 * pointer travels the gap towards it, which makes the filename impossible to
 * copy — the one thing the panel is most likely to be opened for.
 *
 * The delay is what makes the gap crossable, and it is also why the icon and
 * the panel live inside ONE wrapper: a single enter/leave pair over both
 * elements is far more reliable than trying to keep two of them in sync.
 *
 * Click toggles as well, so the tip is reachable on a touchscreen where there
 * is no hover at all.
 */

import { useEffect, useId, useRef, useState } from "react";
import type { MediaItem } from "@/lib/types";
import { nameFromUrl } from "@/lib/media-actions";
import { photoQualityLabel } from "@/lib/quality-tiers";
import { IconCopy, IconCheck, IconInfo } from "./icons";

/** Long enough to cross the gap between icon and panel without hurrying, short
 *  enough that the panel doesn't linger over a photo the pointer has left. */
const CLOSE_DELAY_MS = 450;

/**
 * Bytes as the studio thinks of them: MB to two decimals, or whole KB below a
 * megabyte. Absent on media uploaded before byte counts were recorded, which
 * shows as an em dash rather than a misleading "0".
 */
export function formatPhotoSize(bytes: number | undefined | null): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return "—";
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString("en-IN")} KB`;
  return `${mb.toFixed(2)} MB`;
}

/** "8 Sep 2026, 4:32 pm" — a wall-clock reading, not an ISO string. */
export function formatUploadedAt(createdAt: string | undefined): string {
  if (!createdAt) return "—";
  const at = new Date(createdAt);
  if (Number.isNaN(at.getTime())) return "—";
  return at.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * The size to show BESIDE the quality. For a photo with an archive copy that is
 * the archive object's size, because that is the file the quality names —
 * reporting the 2560px byte count under "Original file" would describe a
 * different file from the one on the same row.
 */
function displayedSize(item: MediaItem): number | undefined {
  return item.archive_variant ? item.archive_size : item.size;
}

export function PhotoInfoTip({
  item,
  placement = "tile",
}: {
  item: MediaItem;
  /** "tile" opens up-and-right from a grid thumbnail; "toolbar" opens
   *  down-and-left from the preview's top-right controls. */
  placement?: "tile" | "toolbar";
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const copiedTimer = useRef<number | null>(null);
  const panelId = useId();

  const cancelClose = () => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  };

  useEffect(
    () => () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
      if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
    },
    [],
  );

  const filename = item.filename || nameFromUrl(item.url);

  async function copyFilename() {
    try {
      await navigator.clipboard.writeText(filename);
      setCopied(true);
      if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // No clipboard permission (or an insecure context) — the filename is
      // still on screen to read, so there is nothing worth interrupting for.
    }
  }

  const rows: { label: string; value: string }[] = [
    { label: "Size", value: formatPhotoSize(displayedSize(item)) },
    { label: "Quality", value: photoQualityLabel(item.archive_variant) },
    { label: "Uploaded", value: formatUploadedAt(item.createdAt) },
  ];

  return (
    // One wrapper over icon AND panel: see the hover rule above.
    <div
      className={
        placement === "tile"
          ? "absolute bottom-2 left-2 z-20"
          : "relative inline-flex"
      }
      onPointerEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onPointerLeave={scheduleClose}
    >
      <button
        type="button"
        aria-label="Photo details"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={
          placement === "tile"
            ? `flex h-6 w-6 items-center justify-center rounded-md bg-black/40 text-white transition-opacity hover:bg-black/60 focus-visible:opacity-100 group-hover:opacity-100 ${
                open ? "opacity-100" : "opacity-0"
              }`
            : "flex h-8 w-8 items-center justify-center rounded-lg text-white/90 hover:bg-white/10"
        }
      >
        <IconInfo size={placement === "tile" ? 13 : 16} />
      </button>

      {open && (
        <div
          id={panelId}
          role="tooltip"
          onClick={(e) => e.stopPropagation()}
          className={`absolute w-[248px] rounded-xl border border-[var(--color-brand-border)] bg-white p-3 text-left shadow-[0_12px_36px_rgba(42,34,24,0.20)] ${
            placement === "tile"
              ? "bottom-[calc(100%+6px)] left-0"
              : "right-0 top-[calc(100%+6px)]"
          }`}
        >
          <div className="flex items-start gap-1.5">
            <span
              className="min-w-0 flex-1 break-all text-[12px] font-semibold leading-snug text-[var(--color-brand-ink)]"
              title={filename}
            >
              {filename}
            </span>
            <button
              type="button"
              onClick={() => void copyFilename()}
              aria-label={copied ? "Filename copied" : "Copy filename"}
              title={copied ? "Copied" : "Copy filename"}
              className="brand-focus mt-[1px] flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--color-brand-muted)] hover:bg-[var(--color-brand-hover)] hover:text-[var(--color-brand-ink)]"
            >
              {copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
            </button>
          </div>

          <dl className="mt-2.5 flex flex-col gap-1.5 border-t border-[var(--color-brand-border)] pt-2.5">
            {rows.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-3">
                <dt className="text-[11.5px] text-[var(--color-brand-muted)]">{row.label}</dt>
                <dd className="text-[11.5px] font-semibold text-[var(--color-brand-ink)]">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
