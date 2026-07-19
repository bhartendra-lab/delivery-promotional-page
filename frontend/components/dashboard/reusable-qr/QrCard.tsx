"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import type { AssignedEventSummary, GalleryPublishStatus, QrCode } from "@/lib/types";
import { downloadImage } from "@/lib/media-actions";
import { formatCreatedAt } from "@/components/dashboard/shared";
import { TypeConfirmModal } from "@/app/(dashboard)/dashboard/events/[booking_id]/TypeConfirmModal";
import { IconDownload, IconTrash } from "@/app/(dashboard)/dashboard/events/[booking_id]/icons";
import { LinkEventModal } from "./LinkEventModal";

/**
 * F1b — one QR card, laid out as a three-zone horizontal row: QR thumbnail ·
 * details (colour identity + the linked event) · a right-anchored action rail.
 * The details split into two side-by-side columns once the card itself is wide
 * enough (a `@container` query, not a viewport one) so the row fills its width
 * instead of clustering on the left; it stacks on narrow cards and on mobile.
 * Download pulls the public `qr_image_url` directly (no proxy). Link/Change
 * opens the picker; Delete is always visible (never hover-only) and typed-confirmed.
 */
export function QrCard({
  qr,
  onLinked,
  onUnlink,
  onDelete,
  notify,
}: {
  qr: QrCode;
  onLinked: (qrUniqueId: string, assigned: AssignedEventSummary) => void;
  /** Clears the link server-side + patches the card; throws on failure (confirm stays open). */
  onUnlink: (qr: QrCode) => Promise<void>;
  /** Deletes server-side + removes the card; throws on failure (modal stays open). */
  onDelete: (qr: QrCode) => Promise<void>;
  notify: (message: string, type?: "success" | "error") => void;
}) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [confirmingUnlink, setConfirmingUnlink] = useState(false);
  const [unlinking, setUnlinking] = useState(false);

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

  async function confirmUnlink() {
    setUnlinking(true);
    try {
      await onUnlink(qr);
      setConfirmingUnlink(false);
    } catch {
      /* parent toasts; leave the inline confirm open so the studio can retry */
    } finally {
      setUnlinking(false);
    }
  }

  return (
    <article className="dash-rise @container rounded-xl border border-[var(--color-brand-border)] bg-[var(--color-brand-surface-raised)] transition-colors hover:border-[var(--color-brand-outline)]">
      <div className="flex flex-col gap-4 p-4 @md:flex-row @md:items-stretch @md:gap-5">
        {/* QR thumbnail on a faint tint of its own colour. */}
        <div
          className="flex aspect-square w-24 shrink-0 items-center justify-center self-start rounded-lg p-2.5 @md:h-32 @md:w-32 @md:self-center"
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

        {/* Details — colour identity + current link. They sit side by side
            once the card is wide enough (container query) and stack otherwise. */}
        <div className="flex min-w-0 flex-1 flex-col gap-4 @3xl:flex-row @3xl:items-stretch @3xl:gap-6">
          {/* QR identity */}
          <div className="flex flex-col justify-center gap-1.5 @3xl:w-44 @3xl:shrink-0">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-muted)]">
              Reusable QR
            </p>
            <span className="inline-flex items-center gap-2">
              <span
                className="h-4 w-4 shrink-0 rounded-full ring-1 ring-black/10"
                style={{ background: qr.color_code }}
                aria-hidden
              />
              <span className="font-mono text-[13px] font-medium uppercase text-[var(--color-brand-ink)]">
                {qr.color_code}
              </span>
            </span>
            <p className="text-[12px] text-[var(--color-brand-muted)]">
              Created {formatCreatedAt(qr.createdAt)}
            </p>
          </div>

          {/* Linked event — grows to fill; divider on the left when the
              columns are side by side, on top when they stack. */}
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 border-t border-[var(--color-brand-border)] pt-4 @3xl:border-l @3xl:border-t-0 @3xl:pl-6 @3xl:pt-0">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-muted)]">
              Linked event
            </p>
            {assigned ? (
              <div className="flex min-w-0 flex-col gap-2">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="h-11 w-[68px] shrink-0 rounded-md ring-1 ring-black/5"
                    style={
                      assigned.background_image
                        ? { backgroundImage: `url(${assigned.background_image})`, backgroundSize: "cover", backgroundPosition: "center" }
                        : { backgroundImage: "repeating-linear-gradient(45deg, #C9AFA0 0 10px, #9E8475 10px 20px)" }
                    }
                    aria-hidden
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-[var(--color-brand-ink)]">
                      {assigned.name}
                    </span>
                    <StatusBadge status={assigned.gallery_publish_status} isActive={assigned.is_active} />
                  </span>
                </div>
                {!confirmingUnlink ? (
                  <button
                    type="button"
                    onClick={() => setConfirmingUnlink(true)}
                    className="brand-focus inline-flex w-fit items-center text-[11.5px] font-semibold text-[var(--color-brand-muted)] hover:text-[var(--color-brand-danger)]"
                  >
                    Unlink
                  </button>
                ) : (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[#F0D9B5] bg-[var(--color-brand-warning-soft)] px-2.5 py-1.5 text-[11.5px] text-[var(--color-brand-warning)]">
                    Unlink from &ldquo;{assigned.name}&rdquo;?
                    <button
                      type="button"
                      disabled={unlinking}
                      onClick={() => void confirmUnlink()}
                      className="brand-focus rounded-md bg-[var(--color-brand-navy)] px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-[var(--color-brand-navy-deep)] disabled:opacity-60"
                    >
                      {unlinking ? "Working…" : "Confirm"}
                    </button>
                    <button
                      type="button"
                      disabled={unlinking}
                      onClick={() => setConfirmingUnlink(false)}
                      className="brand-focus text-[11px] font-semibold text-[var(--color-brand-muted)] hover:text-[var(--color-brand-ink)] disabled:opacity-60"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-dashed border-[var(--color-brand-outline)] px-2.5 py-1 text-[12px] font-medium text-[var(--color-brand-muted)]">
                  Not linked yet
                </span>
                <span className="text-[12px] text-[var(--color-brand-muted)]">
                  Point this QR at whichever event is live.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Action rail — anchored to the right on wide cards, stacked below on mobile. */}
        <div className="flex shrink-0 flex-col gap-2 border-t border-[var(--color-brand-border)] pt-4 @md:w-40 @md:justify-center @md:border-l @md:border-t-0 @md:pl-5 @md:pt-0">
          <button
            type="button"
            onClick={() => setLinkOpen(true)}
            className="brand-focus inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--color-brand-navy)] px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)]"
          >
            {assigned ? "Change event" : "Link event"}
          </button>
          <button
            type="button"
            onClick={() => void download()}
            disabled={downloading}
            className="brand-focus inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--color-brand-border)] bg-white px-3 text-[13px] font-medium text-[var(--color-brand-ink)] transition-colors hover:border-[var(--color-brand-outline)] disabled:opacity-60"
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
            className="brand-focus inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-transparent px-3 text-[13px] font-medium text-[var(--color-brand-danger)] transition-colors hover:border-[var(--color-brand-danger)]/30 hover:bg-[var(--color-brand-danger-soft)]"
          >
            <IconTrash size={15} />
            Delete
          </button>
        </div>
      </div>

      {linkOpen &&
        createPortal(
          <LinkEventModal
            qr={qr}
            onClose={() => setLinkOpen(false)}
            onLinked={(uid, a) => {
              onLinked(uid, a);
              setLinkOpen(false);
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
                ? `This QR is currently linked to “${assigned.name}”. If you've already printed it, it will stop working once deleted. The event itself is not affected.`
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
 *  colour logic, but as a small inline chip under the linked event name. */
function StatusBadge({ status, isActive }: { status?: GalleryPublishStatus; isActive?: boolean }) {
  // A published-but-paused gallery reads as "Deactivated" (still counts as live
  // for linking, but the studio should know it's paused).
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
