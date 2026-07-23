"use client";

import { useEffect, useRef, useState } from "react";
import type { Booking, EventType, GalleryPublishStatus, ServiceType } from "@/lib/types";
import { isStorageBasedPlan } from "@/lib/types";
import { buildShareUrl, formatEventDate, getExpiryWarning } from "./shared";
import { EventBadge } from "./EventBadge";
import { TypeConfirmModal } from "@/app/(dashboard)/dashboard/events/[booking_id]/TypeConfirmModal";

type Props = {
  row: Booking;
  onOpen: (row: Booking) => void;
  /**
   * True when *this* event has an upload running. Opening and sharing stay
   * live — the upload keeps going wherever you navigate — but the lifecycle
   * actions (archive / restore / clear data) are held back, since they'd pull
   * the gallery out from under a run that's still writing to it.
   */
  locked?: boolean;
  /**
   * Lifecycle actions. When provided they perform the API call + list refresh
   * (and toast) in the parent; the card owns the confirm/busy UI only. Archive
   * only renders for Monthly/Yearly + published rows; Restore/Clear render on
   * archived rows.
   */
  onArchive?: (row: Booking) => Promise<void>;
  onRestore?: (row: Booking) => Promise<void>;
  onClearData?: (row: Booking) => Promise<void>;
};

type Acting = "archive" | "restore" | "delete" | null;

export function EventCard({ row, onOpen, locked = false, onArchive, onRestore, onClearData }: Props) {
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState<"archive" | "delete" | null>(null);
  const [acting, setActing] = useState<Acting>(null);

  const status = row.gallery_publish_status;
  const isArchived = status === "archived";
  const isExpired = status === "expired";
  const warning = getExpiryWarning(row);
  // Archive is offered only for storage-plan galleries that are still live.
  const canArchive =
    !!onArchive &&
    isStorageBasedPlan(row.service_type as ServiceType | null | undefined) &&
    status === "published";

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
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  }

  // Run a modal-gated action (archive / clear-data). Keeps the modal open on
  // failure so the user can retry — the parent surfaces the error toast.
  async function runConfirmed(kind: "archive" | "delete") {
    const fn = kind === "archive" ? onArchive : onClearData;
    if (!fn) return;
    setActing(kind);
    try {
      await fn(row);
      setConfirm(null);
    } catch {
      /* parent toasts; leave the modal open to retry */
    } finally {
      setActing(null);
    }
  }

  async function doRestore() {
    if (!onRestore) return;
    setActing("restore");
    try {
      await onRestore(row);
    } catch {
      /* parent toasts */
    } finally {
      setActing(null);
    }
  }

  const busy = acting !== null;

  // Meta row: "{location} · {date}" — omit empty parts and the whole row if neither.
  const datePart = row.event_date ? formatEventDate(row.event_date) : "";
  const metaParts = [row.location, datePart].filter(Boolean);
  const meta = metaParts.join(" · ");

  const filled = Boolean(row.background_image);

  return (
    <article className="dash-rise group relative flex flex-col rounded-xl border border-[var(--color-brand-border)] bg-[var(--color-brand-surface-raised)] transition-colors hover:border-[var(--color-brand-outline)]">
      <button
        type="button"
        onClick={() => onOpen(row)}
        aria-label={`Open ${row.name}`}
        className="brand-focus block w-full text-left"
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
        </div>

        {/* Body */}
        <div className="p-4 pb-0">
          <div className="flex items-start justify-between gap-3">
            <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--color-brand-ink)]">
              {row.name}
            </h3>
            {row.event && <EventBadge type={row.event as EventType} />}
          </div>

          {meta && (
            <p className="mt-1 truncate text-xs text-[var(--color-brand-muted)]">{meta}</p>
          )}
        </div>
      </button>

      {/* Metrics row — sits outside the open-button (not inside it) so the info
          icon can stopPropagation without living inside a nested <button>. */}
      <div className="flex items-center gap-2 px-4 pb-1 pt-4">
        <div className="grid flex-1 grid-cols-3 gap-2">
          <Metric label="Views" value={row.trackings?.visit ?? 0} />
          <Metric label="WhatsApp" value={row.trackings?.contact ?? 0} />
          <Metric label="Google reviews" value={row.trackings?.review ?? 0} />
        </div>
        <MetricsInfo />
      </div>

      {/* Mark-as-archive control — top-right of the cover, mirroring the StatusPill
          at top-left. Sits outside the open-button (no nested buttons) and above
          it (z-10) so a click archives instead of opening the event. */}
      {canArchive && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setConfirm("archive");
          }}
          disabled={locked}
          title={locked ? "Finish or stop this event's upload first" : "Mark as archive"}
          aria-label="Mark as archive"
          className="group/archive brand-focus absolute right-3 top-2.5 z-10 inline-flex items-center gap-1 rounded-full bg-black/45 px-2 py-1 text-white backdrop-blur-sm transition-colors hover:bg-black/60 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <IconArchive size={13} />
          <span className="max-w-0 overflow-hidden whitespace-nowrap text-[11px] font-medium opacity-0 transition-all duration-200 group-hover/archive:ml-0.5 group-hover/archive:max-w-[110px] group-hover/archive:opacity-100 group-focus-visible/archive:ml-0.5 group-focus-visible/archive:max-w-[110px] group-focus-visible/archive:opacity-100">
            Mark as archive
          </span>
        </button>
      )}

      {/* Expiry countdown strip — between the body and the footer. Danger tint in
          the last week, warning tint before that. Never shown on expired cards. */}
      {warning && (
        <div
          className="mx-4 mb-3 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold"
          style={
            warning.daysLeft <= 7
              ? { color: "var(--color-brand-danger)", background: "var(--color-brand-danger-soft)" }
              : { color: "var(--color-brand-warning)", background: "var(--color-brand-warning-soft)" }
          }
        >
          <IconWarning size={13} className="shrink-0" />
          {warning.label}
        </div>
      )}

      {/* Footer — expired cards get none. Archived cards get Restore / Clear data;
          everything else gets Copy link / Send. */}
      {!isExpired &&
        (isArchived ? (
          (onRestore || onClearData) && (
            <div className="flex gap-2 p-4 pt-0">
              {onRestore && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void doRestore();
                  }}
                  disabled={locked || busy}
                  className="brand-focus inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-[var(--color-brand-navy)] px-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {acting === "restore" ? <Spinner /> : <IconRestore size={15} />}
                  Restore
                </button>
              )}
              {onClearData && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirm("delete");
                  }}
                  disabled={locked || busy}
                  className="brand-focus inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--color-brand-danger)]/30 bg-[var(--color-brand-danger-soft)] px-3 text-sm font-semibold text-[var(--color-brand-danger)] transition-colors hover:border-[var(--color-brand-danger)]/60 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <IconTrash size={15} />
                  Clear data
                </button>
              )}
            </div>
          )
        ) : (
          <div className="flex items-center justify-between gap-2 px-4 pb-4 pt-0">
            {/* Reserved for more info later. */}
            <p className="min-w-0 truncate text-xs text-[var(--color-brand-muted)]">
              {pluralize(row.folder_count ?? 0, "folder")} · {pluralize(row.media_count ?? 0, "photo")}
            </p>
            <ShareMenu copied={copied} onCopy={copy} onSend={send} />
          </div>
        ))}

      {confirm === "archive" && (
        <TypeConfirmModal
          action="archive"
          requireTyping={false}
          busy={acting === "archive"}
          title="Archive this event?"
          description="This will deactivate the gallery and hide it from guests. You can restore it later, within 7 days, before its media is permanently cleared."
          onConfirm={() => void runConfirmed("archive")}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm === "delete" && (
        <TypeConfirmModal
          action="delete"
          busy={acting === "delete"}
          title="Clear this event's data?"
          description="This permanently removes every photo and all face-search data for this event."
          warningText="Only the cover photo is kept. Guests lose the gallery for good — this cannot be undone."
          onConfirm={() => void runConfirmed("delete")}
          onCancel={() => setConfirm(null)}
        />
      )}
    </article>
  );
}

/** Gallery publish state shown as a small pill on the cover. */
const PUBLISH_STATUS: Record<GalleryPublishStatus, { label: string; dot: string }> = {
  published: { label: "Live", dot: "var(--color-brand-success)" },
  unpublished: { label: "Draft", dot: "var(--color-brand-warning)" },
  archived: { label: "Archived", dot: "var(--color-brand-warning)" },
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

function pluralize(n: number, word: string): string {
  return `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-base font-bold tabular-nums text-[var(--color-brand-ink)]">
        {value.toLocaleString()}
      </p>
      <p className="mt-0.5 text-xs leading-tight text-[var(--color-brand-muted)]">{label}</p>
    </div>
  );
}

/** Single shared info affordance for the Views / WhatsApp / Google reviews metrics.
 *  Shown on hover and keyboard focus via a named group, matching the dark-ink
 *  tooltip style used by EventTabStrip. Sits outside the card's open-button so
 *  clicking it never triggers navigation. */
function MetricsInfo() {
  return (
    <div className="group/info relative shrink-0">
      <button
        type="button"
        onClick={(e) => e.stopPropagation()}
        aria-label="What these numbers mean"
        className="brand-focus flex h-6 w-6 items-center justify-center rounded-full text-[var(--color-brand-muted)] transition-colors hover:bg-[var(--color-brand-border)] hover:text-[var(--color-brand-ink)]"
      >
        <IconInfo size={13} />
      </button>
      <div className="pointer-events-none absolute bottom-[calc(100%+8px)] right-0 z-20 w-[224px] rounded-lg bg-[var(--color-brand-ink)] px-3 py-2.5 text-[11.5px] font-medium leading-relaxed text-white opacity-0 shadow-[0_6px_20px_rgba(42,34,24,0.22)] transition-opacity duration-150 group-hover/info:opacity-100 group-focus-within/info:opacity-100">
        <span className="absolute -bottom-[5px] right-[10px] h-2.5 w-2.5 rotate-45 bg-[var(--color-brand-ink)]" />
        <strong className="font-semibold">Views</strong> — guests who opened the gallery ·{" "}
        <strong className="font-semibold">WhatsApp</strong> — clicks on your &quot;Contact
        us&quot; button (opens WhatsApp) · <strong className="font-semibold">Google
        reviews</strong> — clicks on the &quot;Leave a review&quot; button
      </div>
    </div>
  );
}

/** Single "Share" CTA that opens a small menu (Copy link, WhatsApp). Replaces
 *  the old two-button footer. Mirrors CoverBanner's dropdown pattern: a
 *  wrapRef + mousedown listener closes on outside click; Escape also closes. */
function ShareMenu({
  copied,
  onCopy,
  onSend,
}: {
  copied: boolean;
  onCopy: () => void;
  onSend: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative shrink-0" ref={wrapRef}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Share"
        title="Share"
        className="brand-focus flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-brand-border)] text-[var(--color-brand-muted)] transition-colors hover:border-[var(--color-brand-outline)] hover:text-[var(--color-brand-ink)]"
      >
        <IconShare size={15} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-[calc(100%+6px)] right-0 z-20 w-[190px] overflow-hidden rounded-[10px] border border-[var(--color-brand-border)] bg-white shadow-[0_8px_28px_rgba(42,34,24,0.16)]"
        >
          <button
            type="button"
            role="menuitem"
            onClick={(e) => {
              e.stopPropagation();
              onCopy();
            }}
            className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-medium text-[var(--color-brand-ink)] hover:bg-[var(--color-brand-bg)]"
          >
            {copied ? <IconCheck size={14} /> : <IconLink size={14} />}
            {copied ? "Copied" : "Copy link"}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={(e) => {
              e.stopPropagation();
              onSend();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2.5 border-t border-[var(--color-brand-border)] px-3.5 py-2.5 text-left text-[13px] font-medium text-[var(--color-brand-ink)] hover:bg-[var(--color-brand-bg)]"
          >
            <IconWhatsApp size={16} />
            WhatsApp
          </button>
        </div>
      )}
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

function IconInfo({ size = 13 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="11" x2="12" y2="16.5" />
      <circle cx="12" cy="7.5" r=".6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconShare({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 15V4" />
      <path d="M7.5 8.5 12 4l4.5 4.5" />
      <path d="M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6" />
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

/** Archive glyph — box with a downward arrow dropping into it. */
function IconArchive({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
      <path d="M12 11v5m0 0l-2.5-2.5M12 16l2.5-2.5" />
    </svg>
  );
}

/** Restore glyph — counter-clockwise arrow (undo). */
function IconRestore({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 4v5h5" />
      <path d="M4.5 13a7.5 7.5 0 1 0 1.9-6.4L4 9" />
    </svg>
  );
}

function IconTrash({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="4 7 20 7" />
      <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
      <path d="M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function IconWarning({ size = 13, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 3l9.5 17H2.5L12 3z" />
      <line x1="12" y1="10" x2="12" y2="14" />
      <circle cx="12" cy="17" r=".7" fill="currentColor" stroke="none" />
    </svg>
  );
}

function Spinner() {
  return (
    <span className="h-3.5 w-3.5 animate-spin rounded-full border-[2px] border-white/60 border-t-white" />
  );
}
