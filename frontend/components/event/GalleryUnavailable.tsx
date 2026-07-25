"use client";

import { PLATFORM_SKIN } from "@/lib/client-theme";
import type { DeliveryLandingPageData } from "@/lib/types";
import { AmbientBackdrop } from "./AmbientBackdrop";
import { IconLock, IconWhatsApp } from "@/components/ui/icons";

type Reason = "deactivated" | "expired";

const COPY: Record<Reason, { heading: string; body: (studio: string) => string; messageHint: string }> = {
  deactivated: {
    heading: "Gallery temporarily unavailable",
    body: (studio) => `This gallery has been paused by ${studio}. Please reach out to them directly to restore access.`,
    messageHint: "but it looks unavailable",
  },
  expired: {
    heading: "Gallery link has expired",
    body: (studio) => `This gallery's access window has closed. Please contact ${studio} to request a new link.`,
    messageHint: "but it looks like the link has expired",
  },
};

/**
 * Shown in place of the gallery when it can't be viewed for a known, studio-
 * controlled reason: temporarily deactivated (`booking.is_active === false`)
 * or its access window expired (`booking.gallery_publish_status === "expired"`).
 * Only the heading/body/message copy varies by `reason` — layout, icon, and
 * the WhatsApp CTA are identical. Mirrors the EventNotFound / BrandLoader
 * "trust layer" styling (PLATFORM_SKIN, not the per-event theme) since this is
 * a platform-level gate, not part of the studio's branded experience.
 */
export function GalleryUnavailable({ event, reason }: { event: DeliveryLandingPageData; reason: Reason }) {
  const t = PLATFORM_SKIN;
  const copy = COPY[reason];
  const studioName = event.company_name?.trim() || "the studio";
  const waNumber = (event.company_contact_number || "").replace(/\D/g, "");
  const message = `Hi${event.company_name ? ` ${event.company_name}` : ""}, I'm trying to view my gallery${
    event.event_name ? ` for ${event.event_name}` : ""
  } ${copy.messageHint}. Could you help?`;
  const contactUrl = waNumber ? `https://wa.me/${waNumber}?text=${encodeURIComponent(message)}` : null;

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
        <IconLock size={22} style={{ color: t.brand }} />
      </span>
      <div className="flex flex-col gap-2">
        <h1 className="text-[22px] font-extrabold tracking-tight" style={{ color: t.text }}>
          {copy.heading}
        </h1>
        <p className="max-w-[360px] text-[14px] leading-relaxed" style={{ color: t.muted }}>
          {copy.body(studioName)}
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
