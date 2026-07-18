"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import type { AssignedEventSummary, GalleryPublishStatus, QrCode } from "@/lib/types";
import { downloadImage } from "@/lib/media-actions";
import { TypeConfirmModal } from "@/app/(dashboard)/dashboard/events/[booking_id]/TypeConfirmModal";
import { IconDownload, IconTrash } from "@/app/(dashboard)/dashboard/events/[booking_id]/icons";
import { AssignEventModal } from "./AssignEventModal";

/**
 * F1b — one full-width QR card. Cover-fronted like `EventCard` (a QR is a
 * visual/physical asset), but laid out as a horizontal row on tablet/desktop and
 * stacked on mobile. Download pulls the public `qr_image_url` directly (no
 * proxy). Assign/Change opens the picker; Delete is always visible (never
 * hover-only) and typed-confirmed.
 */
export function QrCard({
  qr,
  onAssigned,
  onDelete,
  notify,
}: {
  qr: QrCode;
  onAssigned: (qrUniqueId: string, assigned: AssignedEventSummary) => void;
  /** Deletes server-side + removes the card; throws on failure (modal stays open). */
  onDelete: (qr: QrCode) => Promise<void>;
  notify: (message: string, type?: "success" | "error") => void;
}) {
  const [assignOpen, setAssignOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const assigned = qr.assigned_event;

  async function download() {
    setDownloading(true);
    try {
      await downloadImage(qr.qr_image_url, qrFilename(qr));
    } catch {
      notify("Couldn't download the QR image.", "error");
    } finally {
      setDownloading(false);
    }
  }

  async function confirmDelete() {
    setDeleting(true);
    try {
      await onDelete(qr);
      setDeleteOpen(false);
    } catch {
      /* parent toasts; leave the modal open so the studio can retry */
    } finally {
      setDeleting(false);
    }
  }

  return (
    <article className="dash-rise flex flex-col gap-4 rounded-xl border border-[var(--color-brand-border)] bg-[var(--color-brand-surface-raised)] p-4 transition-colors hover:border-[var(--color-brand-outline)] sm:flex-row sm:items-center">
      {/* QR thumbnail on a faint tint of its own colour. */}
      <div
        className="flex aspect-square w-full shrink-0 items-center justify-center rounded-lg p-3 sm:h-32 sm:w-32"
        style={{ background: tint(qr.color_code, 0.1) }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qr.qr_image_url}
          alt={`QR code in ${qr.color_code}`}
          className="h-full w-full object-contain"
          loading="lazy"
        />
      </div>

      {/* Details + actions */}
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {/* Colour */}
          <span className="inline-flex items-center gap-2">
            <span
              className="h-4 w-4 shrink-0 rounded-full ring-1 ring-black/10"
              style={{ background: qr.color_code }}
              aria-hidden
            />
            <span className="font-mono text-[12.5px] uppercase text-[var(--color-brand-muted)]">
              {qr.color_code}
            </span>
          </span>

          {/* Assigned-event summary, or empty state */}
          {assigned ? (
            <span className="inline-flex min-w-0 items-center gap-2">
              <span
                className="h-7 w-10 shrink-0 rounded-md ring-1 ring-black/5"
                style={
                  assigned.background_image
                    ? { backgroundImage: `url(${assigned.background_image})`, backgroundSize: "cover", backgroundPosition: "center" }
                    : { backgroundImage: "repeating-linear-gradient(45deg, #C9AFA0 0 10px, #9E8475 10px 20px)" }
                }
                aria-hidden
              />
              <span className="min-w-0">
                <span className="block truncate text-[13.5px] font-semibold text-[var(--color-brand-ink)]">
                  {assigned.name}
                </span>
                <StatusBadge status={assigned.gallery_publish_status} isActive={assigned.is_active} />
              </span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-[var(--color-brand-outline)] px-2.5 py-1 text-[12px] font-medium text-[var(--color-brand-muted)]">
              Not assigned yet
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setAssignOpen(true)}
            className="brand-focus inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--color-brand-navy)] px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)]"
          >
            {assigned ? "Change event" : "Assign event"}
          </button>
          <button
            type="button"
            onClick={() => void download()}
            disabled={downloading}
            className="brand-focus inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--color-brand-border)] bg-white px-3 text-[13px] font-medium text-[var(--color-brand-ink)] transition-colors hover:border-[var(--color-brand-outline)] disabled:opacity-60"
          >
            {downloading ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-[2px] border-[var(--color-brand-border)] border-t-[var(--color-brand-navy)]" />
            ) : (
              <IconDownload size={14} />
            )}
            Download
          </button>
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            title="Delete QR"
            aria-label="Delete QR"
            className="brand-focus inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-brand-danger)]/30 bg-[var(--color-brand-danger-soft)] text-[var(--color-brand-danger)] transition-colors hover:border-[var(--color-brand-danger)]/60"
          >
            <IconTrash size={15} />
          </button>
        </div>
      </div>

      {assignOpen &&
        createPortal(
          <AssignEventModal
            qr={qr}
            onClose={() => setAssignOpen(false)}
            onAssigned={(uid, a) => {
              onAssigned(uid, a);
              setAssignOpen(false);
            }}
          />,
          document.body,
        )}

      {deleteOpen &&
        createPortal(
          <TypeConfirmModal
            action="delete"
            busy={deleting}
            title="Delete this QR?"
            description={
              assigned
                ? `This QR is currently assigned to “${assigned.name}”. If you've already printed it, it will stop working once deleted. The event itself is not affected.`
                : "If you've already printed this QR, it will stop working once deleted."
            }
            warningText="This can't be undone — you'll need to generate and print a new QR to replace it."
            onConfirm={() => void confirmDelete()}
            onCancel={() => setDeleteOpen(false)}
          />,
          document.body,
        )}
    </article>
  );
}

/** Live / Deactivated / Archived / Expired badge — mirrors EventCard's StatusPill
 *  colour logic, but as a small inline chip under the assigned event name. */
function StatusBadge({ status, isActive }: { status?: GalleryPublishStatus; isActive?: boolean }) {
  // A published-but-paused gallery reads as "Deactivated" (still counts as live
  // for assignment, but the studio should know it's paused).
  const state: { label: string; color: string } =
    status === "expired"
      ? { label: "Expired", color: "var(--color-brand-muted)" }
      : status === "archived"
        ? { label: "Archived", color: "var(--color-brand-warning)" }
        : isActive === false
          ? { label: "Deactivated", color: "var(--color-brand-warning)" }
          : { label: "Live", color: "var(--color-brand-success)" };
  return (
    <span className="mt-0.5 inline-flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--color-brand-muted)]">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: state.color }} aria-hidden />
      {state.label}
    </span>
  );
}

/** Slugged download filename: `qr-<event-or-colour>-<id8>.png`. */
function qrFilename(qr: QrCode): string {
  const base = qr.assigned_event?.name || qr.color_code.replace("#", "");
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "qr";
  return `qr-${slug}-${qr.unique_id.slice(0, 8)}.png`;
}

/** Faint translucent wash of a hex colour (handles #RGB and #RRGGBB). */
function tint(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return "var(--color-brand-bg)";
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
