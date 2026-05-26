"use client";

import type { KvData } from "@/lib/types";
import type { Tokens } from "./tokens";
import type { EventTemplate } from "@/lib/event-templates";
import {
  ArrowRight,
  ExtIcon,
  FacebookIcon,
  GlobeIcon,
  IgIcon,
} from "./icons";

type Props = {
  data: KvData;
  tokens: Tokens;
  template: EventTemplate;
};

type SocialLink = {
  icon: React.ReactNode;
  label: string;
  handle: string;
  href: string;
};

/**
 * Divider + italic tagline + city · scope line + social rows + booking
 * card. Reference HTML lines 624–705. Social rows are conditional on the
 * studio providing each link.
 *
 * The booking CTA opens WhatsApp with a pre-filled inquiry message if the
 * studio has a contact number; otherwise falls back to the studio website
 * or instagram.
 */
export function StudioSection({ data, tokens, template }: Props) {
  const studioName = data.company_name ?? "the studio";
  const socials: SocialLink[] = [];

  if (data.company_instagram_link) {
    socials.push({
      icon: <IgIcon s={17} c={tokens.accent} />,
      label: "Instagram",
      handle: handleFromUrl(data.company_instagram_link, "@"),
      href: data.company_instagram_link,
    });
  }
  if (data.company_facebook_link) {
    socials.push({
      icon: <FacebookIcon s={17} c={tokens.accent} />,
      label: "Facebook",
      handle: handleFromUrl(data.company_facebook_link, ""),
      href: data.company_facebook_link,
    });
  }
  if (data.company_website) {
    socials.push({
      icon: <GlobeIcon s={17} c={tokens.accent} />,
      label: "Website",
      handle: stripUrl(data.company_website),
      href: data.company_website,
    });
  }

  const bookingHref = buildBookingHref(data);

  return (
    <section className="px-6 pt-9">
      {/* Divider with studio name */}
      <div className="mb-7 flex items-center gap-3">
        <div
          className="h-px flex-1"
          style={{ background: tokens.border }}
        />
        <span
          className="text-[10px] font-semibold uppercase tracking-[0.12em]"
          style={{ color: tokens.faint }}
        >
          {studioName}
        </span>
        <div
          className="h-px flex-1"
          style={{ background: tokens.border }}
        />
      </div>

      <div className="mb-6 text-center">
        <p
          className="mb-2 italic"
          style={{
            color: tokens.text,
            fontSize: 17,
            fontWeight: 300,
            lineHeight: 1.5,
            letterSpacing: "-0.01em",
          }}
        >
          &ldquo;{template.studioCopy.tagline}&rdquo;
        </p>
        {data.company_address && (
          <p className="text-[12px]" style={{ color: tokens.muted }}>
            {data.company_address}
          </p>
        )}
      </div>

      {socials.length > 0 && (
        <div className="mb-6 flex flex-col gap-2">
          {socials.map((s) => (
            <a
              key={s.label}
              href={s.href}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between rounded-xl px-4 py-3.5 transition-colors"
              style={{
                background: tokens.bgCard,
                border: `1px solid ${tokens.borderHi}`,
                color: tokens.text,
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.borderColor = tokens.muted)
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.borderColor = tokens.borderHi)
              }
            >
              <div className="flex items-center gap-3">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: tokens.bgRaised }}
                >
                  {s.icon}
                </div>
                <div>
                  <div className="text-[14px] font-semibold leading-[1.3]">
                    {s.label}
                  </div>
                  <div
                    className="mt-px text-[12px]"
                    style={{ color: tokens.muted }}
                  >
                    {s.handle}
                  </div>
                </div>
              </div>
              <ExtIcon s={13} c={tokens.faint} />
            </a>
          ))}
        </div>
      )}

      {bookingHref && (
        <div
          className="mb-2 rounded-2xl px-6 py-7 text-center"
          style={{
            background: tokens.bgCard,
            border: `1px solid ${tokens.borderHi}`,
          }}
        >
          <div
            className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: tokens.accent }}
          >
            {template.studioCopy.bookingEyebrow}
          </div>
          <p
            className="mb-2 text-[17px] font-semibold leading-[1.4]"
            style={{ color: tokens.text }}
          >
            {template.studioCopy.bookingTitle}
          </p>
          <p
            className="mb-6 text-[13px] leading-[1.65]"
            style={{ color: tokens.muted }}
          >
            {template.studioCopy.bookingBody}
          </p>
          <a
            href={bookingHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-[10px] px-6 py-3.5 text-[14px] font-bold"
            style={{
              background: tokens.accent,
              color: "#ffffff",
            }}
          >
            Book {studioName}{" "}
            <ArrowRight s={14} c="rgba(255,255,255,0.8)" />
          </a>
        </div>
      )}
    </section>
  );
}

function stripUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function handleFromUrl(url: string, prefix: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop();
    if (last) return `${prefix}${last}`;
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Booking link priority: WhatsApp inquiry (if contact number) → website →
 * Instagram → null (which suppresses the booking card entirely).
 */
function buildBookingHref(data: KvData): string | null {
  if (data.company_contact_number) {
    const digits = data.company_contact_number.replace(/[^\d]/g, "");
    if (digits.length >= 7) {
      const studioName = data.company_name ?? "your studio";
      const message = `Hi ${studioName} — I'd love to talk about photography for an upcoming event.`;
      return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
    }
  }
  if (data.company_website) return data.company_website;
  if (data.company_instagram_link) return data.company_instagram_link;
  return null;
}
