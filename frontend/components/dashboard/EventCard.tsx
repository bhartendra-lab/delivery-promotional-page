"use client";

import { useState } from "react";
import type { Booking, EventType, GalleryPublishStatus } from "@/lib/types";
import { buildShareUrl, formatEventDate } from "./shared";
import { EventBadge } from "./EventBadge";

type Props = {
  row: Booking;
  onOpen: (row: Booking) => void;
  /** Upload-in-progress lock — disables navigation and the footer actions. */
  locked?: boolean;
};

export function EventCard({ row, onOpen, locked = false }: Props) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(buildShareUrl(row._id));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore — clipboard may be unavailable
    }
  }

  function send() {
    const text = `Your photos are ready: ${buildShareUrl(row._id)}`;
    window.open(
      `https://wa.me/?text=${encodeURIComponent(text)}`,
      "_blank",
      "noopener",
    );
  }

  // Cover caption: "{slug} · {faces}f" — omit the whole caption if neither part exists.
  const facesPart =
    typeof row.total_faces === "number" && row.total_faces > 0
      ? `${row.total_faces}f`
      : "";
  const captionParts = [row.unique_identifier, facesPart].filter(Boolean);
  const caption = captionParts.join(" · ");

  // Meta row: "{location} · {date}" — omit empty parts and the whole row if neither.
  const datePart = row.event_date ? formatEventDate(row.event_date) : "";
  const metaParts = [row.location, datePart].filter(Boolean);
  const meta = metaParts.join(" · ");

  const filled = Boolean(row.background_image);

  return (
    <article className="dash-rise group flex flex-col overflow-hidden rounded-xl border border-[var(--color-brand-border)] bg-[var(--color-brand-surface-raised)] transition-colors hover:border-[var(--color-brand-outline)]">
      <button
        type="button"
        onClick={() => !locked && onOpen(row)}
        disabled={locked}
        aria-label={`Open ${row.name}`}
        className="brand-focus block w-full text-left disabled:cursor-not-allowed"
      >
        {/* Cover */}
        <div
          className="relative aspect-[16/9] w-full overflow-hidden rounded-t-xl"
          style={
            filled
              ? {
                  backgroundImage: `url(${row.background_image})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : {
                  backgroundImage:
                    "repeating-linear-gradient(45deg, #C9AFA0 0 18px, #9E8475 18px 36px)",
                }
          }
        >
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(to bottom, rgba(42,34,24,0) 45%, rgba(42,34,24,0.4) 100%)",
            }}
          />
          <StatusPill status={row.gallery_publish_status} />
          {caption && (
            <span className="absolute bottom-2 left-3 font-mono text-[11px] text-white/90">
              {caption}
            </span>
          )}
        </div>

        {/* Body */}
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--color-brand-ink)]">
              {row.name}
            </h3>
            {row.event && <EventBadge type={row.event as EventType} />}
          </div>

          {meta && (
            <p className="mt-1 truncate text-xs text-[var(--color-brand-muted)]">
              {meta}
            </p>
          )}

          <div className="mt-4 grid grid-cols-3 gap-2">
            <Metric label="Visits" value={row.trackings?.visit ?? 0} />
            <Metric label="Contacts" value={row.trackings?.contact ?? 0} />
            <Metric label="Reviews" value={row.trackings?.review ?? 0} />
          </div>
        </div>
      </button>

      {/* Footer */}
      <div className="flex gap-2 p-4 pt-0">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            copy();
          }}
          disabled={locked}
          className="brand-focus inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-[var(--color-brand-border)] bg-[var(--color-brand-surface-raised)] px-3 text-sm font-medium text-[var(--color-brand-ink)] transition-colors hover:border-[var(--color-brand-outline)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {copied ? <IconCheck size={14} /> : <IconLink size={14} />}
          {copied ? "Copied" : "Copy link"}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            send();
          }}
          disabled={locked}
          className="brand-focus inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-[var(--color-brand-navy)] text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <IconWhatsApp size={16} />
          Send
        </button>
      </div>
    </article>
  );
}

/** Gallery publish state shown as a small pill on the cover. */
const PUBLISH_STATUS: Record<GalleryPublishStatus, { label: string; dot: string }> = {
  published: { label: "Live", dot: "var(--color-brand-success)" },
  unpublished: { label: "Draft", dot: "var(--color-brand-warning)" },
  expired: { label: "Expired", dot: "var(--color-brand-muted)" },
};

function StatusPill({ status }: { status?: GalleryPublishStatus }) {
  if (!status || !(status in PUBLISH_STATUS)) return null;
  const { label, dot } = PUBLISH_STATUS[status];
  return (
    <span className="absolute left-3 top-2.5 inline-flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} aria-hidden />
      {label}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-base font-bold tabular-nums text-[var(--color-brand-ink)]">
        {value.toLocaleString()}
      </p>
      <p className="mt-0.5 text-xs text-[var(--color-brand-muted)]">{label}</p>
    </div>
  );
}

/* Inline icons — match the dashboard's hand-drawn icon set (no icon dep). */

function IconLink({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 14a4 4 0 0 1 0-5l2-2a4 4 0 0 1 6 6l-1 1" />
      <path d="M15 10a4 4 0 0 1 0 5l-2 2a4 4 0 0 1-6-6l1-1" />
    </svg>
  );
}

function IconCheck({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="5 12 10 17 19 7" />
    </svg>
  );
}

function IconWhatsApp({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2a10 10 0 0 0-8.6 15l-1.3 4.8 4.9-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-2.9.8.8-2.8-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.2-.6.8-.8 1-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.6-1.2a.4.4 0 0 0 0-.4c0-.1-.6-1.4-.8-1.9-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 2.8 2.8 0 0 0-.9 2.1c0 1.3.9 2.5 1 2.7.2.2 1.9 2.9 4.6 4 1.7.7 2.4.8 3.2.7.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.2-.3-.2-.5-.3z" />
    </svg>
  );
}
