"use client";

import { PLATFORM_SKIN } from "@/lib/client-theme";
import { AmbientBackdrop } from "./AmbientBackdrop";

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
        <QrIcon color={t.brand} />
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
          <WhatsAppIcon />
          Contact studio on WhatsApp
        </a>
      )}
    </div>
  );
}

function QrIcon({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3.5" y="3.5" width="6" height="6" rx="1.2" />
      <rect x="14.5" y="3.5" width="6" height="6" rx="1.2" />
      <rect x="3.5" y="14.5" width="6" height="6" rx="1.2" />
      <path d="M14.5 14.5h2.5v2.5M20.5 14.5v.01M14.5 20.5h.01M17 20.5h3.5V17" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.74.46 3.43 1.32 4.93L2 22l5.27-1.38a9.9 9.9 0 0 0 4.76 1.21h.01c5.46 0 9.91-4.45 9.91-9.92C21.95 6.45 17.5 2 12.04 2Zm5.8 14.06c-.24.68-1.4 1.3-1.93 1.37-.5.07-1.12.1-1.8-.11-.42-.13-.95-.3-1.64-.59-2.88-1.24-4.76-4.13-4.9-4.32-.14-.19-1.17-1.56-1.17-2.97 0-1.41.74-2.1 1-2.39.26-.28.57-.36.76-.36.19 0 .38 0 .54.01.18.01.41-.07.64.49.24.57.81 1.98.88 2.13.07.14.12.31.02.5-.1.19-.15.31-.3.48-.14.16-.3.36-.43.49-.14.14-.29.29-.13.57.17.28.74 1.22 1.59 1.97 1.1.97 2.02 1.27 2.3 1.42.28.14.45.12.61-.07.17-.19.71-.83.9-1.11.19-.28.38-.23.64-.14.26.1 1.66.78 1.94.93.28.14.47.21.54.33.07.12.07.68-.17 1.36Z" />
    </svg>
  );
}
