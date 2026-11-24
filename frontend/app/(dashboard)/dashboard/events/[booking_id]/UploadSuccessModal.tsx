"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { getAllGuests } from "@/lib/api";
import type { Guest } from "@/lib/types";
import { galleryUrlFor } from "@/lib/gallery-url";
import { VYAVASTH_BASE_URL } from "@/lib/site-url";
import { galleryInviteMessage } from "@/lib/share-message";
import { readShareLang } from "@/lib/share-lang-store";
import { useCompany } from "@/lib/useCompany";
import { NOTIFY_FIRST_LINE, NOTIFY_LATER_LINE, reachableLine, uploadSuccessHeadline } from "@/lib/upload-success-copy";
import { IconCheck, IconCopy, IconWhatsApp } from "./icons";

/**
 * Shown when an upload run finishes, in place of the old banner (which stays
 * as a component for other uses). It says the gallery is live, offers the same
 * two share actions as Access & Sharing (Copy link, WhatsApp, in the language
 * the studio last chose there), and tells the truth about guest messages:
 * nothing is sent at upload, the first "gallery is live" message goes once the
 * photos finish processing, and later ones go at most once a day (see
 * lib/upload-success-copy.ts for where each fact comes from).
 *
 * The count of people who can be messaged comes from the guest list the
 * dashboard already has an endpoint for; if it cannot be read, that line is
 * simply left out.
 */
export function UploadSuccessModal({
  open,
  onClose,
  bookingId,
  count,
  eventName,
  uniqueIdentifier,
  faceSearchOn,
}: {
  open: boolean;
  onClose: () => void;
  bookingId: string;
  count: number;
  eventName: string;
  uniqueIdentifier?: string;
  faceSearchOn: boolean;
}) {
  const company = useCompany();
  const shareUrl = galleryUrlFor(company, uniqueIdentifier, VYAVASTH_BASE_URL) ?? "";
  const [guests, setGuests] = useState<Guest[] | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getAllGuests(bookingId)
      .then((res) => {
        if (!cancelled) setGuests(res.guests ?? []);
      })
      .catch(() => {
        if (!cancelled) setGuests(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, bookingId]);

  const reachable = reachableLine(guests);

  const copyLink = () => {
    if (!shareUrl) return;
    void navigator.clipboard?.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  const shareWhatsApp = () => {
    if (!shareUrl) return;
    const message = galleryInviteMessage({ eventName, url: shareUrl, faceSearchOn, lang: readShareLang() });
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener");
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Your gallery is live"
      subtitle={uploadSuccessHeadline(count)}
      size="md"
      footer={
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="brand-focus inline-flex h-10 items-center rounded-lg bg-[var(--color-brand-navy)] px-5 text-[13.5px] font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)]"
          >
            Done
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <p className="type-body">The new photos are now part of the gallery your guests open.</p>

        {shareUrl && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={copyLink}
              className="brand-focus inline-flex h-10 items-center gap-1.5 rounded-lg border border-[var(--color-brand-border)] bg-white px-3.5 text-[12.5px] font-semibold text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)]"
            >
              {copied ? <IconCheck size={15} className="text-[var(--color-brand-success)]" /> : <IconCopy size={15} />}
              {copied ? "Copied" : "Copy link"}
            </button>
            <button
              type="button"
              onClick={shareWhatsApp}
              className="brand-focus inline-flex h-10 items-center gap-1.5 rounded-lg px-3.5 text-[12.5px] font-semibold text-white"
              style={{ background: "#1FA855" }}
            >
              <IconWhatsApp size={16} />
              WhatsApp
            </button>
          </div>
        )}

        <div className="rounded-lg border border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] px-4 py-3.5">
          <p className="type-label mb-2">What your guests are told</p>
          <ul className="flex flex-col gap-1.5">
            <li className="type-body">{NOTIFY_FIRST_LINE}</li>
            <li className="type-body">{NOTIFY_LATER_LINE}</li>
            {reachable && <li className="type-body">{reachable}</li>}
          </ul>
        </div>
      </div>
    </Modal>
  );
}
