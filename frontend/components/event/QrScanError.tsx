"use client";

import { PLATFORM_SKIN } from "@/lib/client-theme";
import { AmbientBackdrop } from "./AmbientBackdrop";
import { IconQrCode, IconWhatsApp } from "@/components/ui/icons";

type Props = {
  variant: "not-found" | "not-assigned";
  /** Studio name (not-assigned only) — the QR resolved to a real company. */
  studioName?: string | null;
  /** Digits-only studio phone (not-assigned only) — drives the WhatsApp CTA. */
  phone?: string | null;
};

/**
 * Landing screen for a scanned/printed reusable QR that can't route yet.
 *  - "not-found": the QR doesn't exist (deleted or misprinted). No studio to
 *    attribute it to, so generic copy and no contact button.
 *  - "not-assigned": a real studio QR that isn't pointed at a live event yet.
 *    Shows a "Contact studio on WhatsApp" button when the studio has a phone.
 *
 * Mirrors `EventNotFound` / `GalleryUnavailable` exactly: the Vyavasth
 * PLATFORM_SKIN trust layer (not a per-event theme), AmbientBackdrop, centered
 * icon + heading + body.
 */
export function QrScanError({ variant, studioName, phone }: Props) {
  const t = PLATFORM_SKIN;
  const studio = studioName?.trim() || "the studio";
  const waNumber = (phone || "").replace(/\D/g, "");

  const heading = variant === "not-found" ? "This QR code isn’t valid" : "QR not linked yet";
  const body =
    variant === "not-found"
      ? "This QR doesn’t match any event. It may have been removed, or the printed code was mis-scanned. Please check with your studio."
      : `${studio} hasn’t pointed this QR at a live gallery yet. Please check back shortly, or reach out to them directly.`;

  const message = `Hi${studioName ? ` ${studioName}` : ""}, I scanned your QR code but it doesn't seem to be linked to a gallery yet. Could you help?`;
  const contactUrl =
    variant === "not-assigned" && waNumber ? `https://wa.me/${waNumber}?text=${encodeURIComponent(message)}` : null;

  return (
    <div
      className="relative isolate flex min-h-[100dvh] flex-col items-center justify-center gap-5 px-6 text-center"
      style={{ background: t.bg, fontFamily: t.font }}
    >
      <AmbientBackdrop a={t.cover[0]} b={t.cover[1]} />
      <span
        className="flex h-14 w-14 items-center justify-center rounded-full"
        style={{ background: t.accentWash }}
        aria-hidden
      >
        <IconQrCode size={22} style={{ color: t.brand }} />
      </span>
      <div className="flex flex-col gap-2">
        <h1 className="text-[22px] font-extrabold tracking-tight" style={{ color: t.text }}>
          {heading}
        </h1>
        <p className="max-w-[360px] text-[14px] leading-relaxed" style={{ color: t.muted }}>
          {body}
        </p>
      </div>
      {contactUrl && (
        <a
          href={contactUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-flex h-11 items-center gap-2 rounded-full px-6 text-[14px] font-bold transition-colors"
          style={{ background: t.brand, color: t.onBrand }}
        >
          <IconWhatsApp size={16} />
          Contact studio on WhatsApp
        </a>
      )}
    </div>
  );
}
