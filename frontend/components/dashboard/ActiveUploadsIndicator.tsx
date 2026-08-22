"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  activeUploadsServerSnapshot,
  cancelUploadFor,
  listActiveUploads,
  pauseUploadFor,
  resumeUploadFor,
  subscribeActiveUploads,
  type ActiveUpload,
} from "@/lib/r2-upload/registry";
import { useUploadStalled } from "@/lib/r2-upload/useUploadStall";
import { useChrome } from "./ChromeContext";
import { IconCaretDown, IconOpen, IconPause, IconPlay } from "@/components/ui/icons";

const RING = 34;
const RING_R = 14;
const RING_CIRC = 2 * Math.PI * RING_R;

/**
 * Floating cross-event upload indicator (bottom-right, above every dashboard
 * page).
 *
 * Uploads live in a module-level engine registry, so a run started on event A
 * keeps going after you navigate to event B, the dashboard, or Settings. This
 * is that run's home while you're elsewhere: progress, pause/resume, cancel,
 * and a way back. It hides itself on the uploading event's own page, where the
 * full upload card already tells the story.
 */
export function ActiveUploadsIndicator() {
  const active = useSyncExternalStore(subscribeActiveUploads, listActiveUploads, activeUploadsServerSnapshot);
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);

  // Don't shadow the full upload card on the booking you're already looking at.
  const elsewhere = active.filter((u) => !pathname.endsWith(`/events/${u.bookingId}`));

  if (elsewhere.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[200] w-[min(340px,calc(100vw-2rem))] sm:bottom-6 sm:right-6">
      <div className="dash-rise overflow-hidden rounded-xl border border-[var(--color-brand-border)] bg-white shadow-[0_14px_44px_rgba(42,34,24,0.18)]">
        {elsewhere.map((upload, i) => (
          <UploadRow
            key={upload.bookingId}
            upload={upload}
            expanded={expanded}
            onToggle={() => setExpanded((v) => !v)}
            showDivider={i > 0}
            /* Only the first row carries the expand chevron when collapsed —
               the rest stay hidden until the card is open. */
            hidden={!expanded && i > 0}
          />
        ))}

        {expanded && elsewhere.length > 1 && (
          <p className="border-t border-[var(--color-brand-border)] bg-[var(--color-brand-warning-soft)] px-3.5 py-2.5 text-[11.5px] leading-relaxed text-[var(--color-brand-warning)]">
            Uploading to {elsewhere.length} events at once — they share your connection, so both will
            take longer than one alone.
          </p>
        )}

        {!expanded && elsewhere.length > 1 && (
          <p className="border-t border-[var(--color-brand-border)] px-3.5 py-2 text-[11.5px] text-[var(--color-brand-muted)]">
            +{elsewhere.length - 1} more upload{elsewhere.length - 1 === 1 ? "" : "s"} running
          </p>
        )}
      </div>
    </div>
  );
}

function UploadRow({
  upload,
  expanded,
  onToggle,
  showDivider,
  hidden,
}: {
  upload: ActiveUpload;
  expanded: boolean;
  onToggle: () => void;
  showDivider: boolean;
  hidden: boolean;
}) {
  const { settleStorage } = useChrome();
  const [cancelling, setCancelling] = useState(false);
  const stalled = useUploadStalled(true, upload.paused, upload.photosDone);

  if (hidden) return null;

  const status = cancelling
    ? "Stopping…"
    : upload.paused
      ? "Paused"
      : stalled
        ? "Waiting on this tab"
        : "Uploading";

  return (
    <div className={showDivider ? "border-t border-[var(--color-brand-border)]" : undefined}>
      <div className="flex items-center gap-3 px-3.5 py-3">
        <ProgressRing percent={upload.percent} paused={upload.paused || cancelling} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-[var(--color-brand-ink)]">{upload.name}</div>
          <div className="truncate text-[11.5px] tabular-nums text-[var(--color-brand-muted)]">
            {status} · {upload.photosDone.toLocaleString("en-IN")} of{" "}
            {upload.photosTotal.toLocaleString("en-IN")} photos
          </div>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={expanded ? "Hide upload controls" : "Show upload controls"}
          className="brand-focus flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--color-brand-muted)] hover:bg-[var(--color-brand-hover)] hover:text-[var(--color-brand-ink)]"
        >
          <CaretIcon size={14} up={!expanded} />
        </button>
      </div>

      {expanded && (
        <>
          {stalled && !upload.paused && (
            <p className="mx-3.5 mb-2.5 rounded-md bg-[var(--color-brand-warning-soft)] px-2.5 py-2 text-[11.5px] leading-relaxed text-[var(--color-brand-warning)]">
              Nothing has moved for a while. Browsers slow down tabs running in the background — open
              this event to get it going again.
            </p>
          )}
          <div className="flex items-center gap-1.5 border-t border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] px-3 py-2.5">
            <Link
              href={`/dashboard/events/${upload.bookingId}`}
              title="Open this event"
              className="brand-focus inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--color-brand-border)] bg-white px-2.5 text-[12px] font-semibold text-[var(--color-brand-ink)] no-underline hover:border-[var(--color-brand-outline)]"
            >
              <IconOpen size={13} />
              Open event
            </Link>
            <span className="flex-1" />
            <button
              type="button"
              disabled={cancelling}
              onClick={() => {
                if (upload.paused) {
                  resumeUploadFor(upload.bookingId);
                } else {
                  // The engine pauses instantly; the storage number catches up
                  // quietly on the sidebar meter afterwards.
                  pauseUploadFor(upload.bookingId);
                  void settleStorage();
                }
              }}
              className="brand-focus inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--color-brand-border)] bg-white px-2.5 text-[12px] font-semibold text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {upload.paused ? <IconPlay size={12} /> : <IconPause size={12} />}
              {upload.paused ? "Resume" : "Pause"}
            </button>
            <button
              type="button"
              disabled={cancelling}
              onClick={() => {
                setCancelling(true);
                void cancelUploadFor(upload.bookingId).finally(() => void settleStorage());
              }}
              className="brand-focus inline-flex h-8 items-center rounded-md px-2.5 text-[12px] font-semibold text-[var(--color-brand-muted)] hover:bg-white hover:text-[var(--color-brand-danger)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {cancelling ? "Stopping…" : "Stop"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ProgressRing({ percent, paused }: { percent: number; paused: boolean }) {
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: RING, height: RING }}>
      <svg width={RING} height={RING} viewBox="0 0 34 34" className="-rotate-90">
        <circle cx="17" cy="17" r={RING_R} fill="none" stroke="var(--color-brand-border)" strokeWidth="3" />
        <circle
          cx="17"
          cy="17"
          r={RING_R}
          fill="none"
          stroke={paused ? "var(--color-brand-muted)" : "var(--color-brand-navy)"}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={RING_CIRC}
          strokeDashoffset={RING_CIRC * (1 - Math.min(100, Math.max(0, percent)) / 100)}
          style={{ transition: "stroke-dashoffset 600ms ease" }}
        />
      </svg>
      <span
        className="absolute text-[9.5px] font-bold tabular-nums"
        style={{ color: paused ? "var(--color-brand-muted)" : "var(--color-brand-navy)" }}
      >
        {percent}
      </span>
    </span>
  );
}

/* ── icons ──────────────────────────────────────────────────────── */

/** Expand/collapse caret — points up by default, flips 180° when `up` is false. */
function CaretIcon({ size, up }: { size: number; up: boolean }) {
  return <IconCaretDown size={size} style={{ transform: up ? "rotate(180deg)" : "none" }} />;
}
