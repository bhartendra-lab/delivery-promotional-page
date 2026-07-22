"use client";

import type { DeliveryLandingPageData } from "@/lib/types";
import type { ClientTheme } from "@/lib/client-theme";
import { SocialChip, type SocialPlatform } from "./SocialIcons";

export function ensureHttp(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

export function initials(name: string): string {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "·";
}

/** The studio's social links in display order. Shared so callers can ask
 *  whether any exist (e.g. whether a menu is worth opening) without
 *  duplicating the legacy-field fallbacks. */
export function socialLinksFor(event: DeliveryLandingPageData): { label: SocialPlatform; url: string }[] {
  const sl = event.company_social_links ?? {};
  return [
    (sl.instagram ?? event.company_instagram_link) && { label: "Instagram", url: ensureHttp(sl.instagram ?? event.company_instagram_link ?? "") },
    (sl.facebook ?? event.company_facebook_link) && { label: "Facebook", url: ensureHttp(sl.facebook ?? event.company_facebook_link ?? "") },
    sl.youtube && { label: "YouTube", url: ensureHttp(sl.youtube) },
    sl.vimeo && { label: "Vimeo", url: ensureHttp(sl.vimeo) },
    sl.pinterest && { label: "Pinterest", url: ensureHttp(sl.pinterest) },
    sl.x && { label: "X", url: ensureHttp(sl.x) },
  ].filter(Boolean) as { label: SocialPlatform; url: string }[];
}

/**
 * The studio's socials as colored brand chips (shared by the top-bar studio
 * menu, the home studio card and the gallery outro, so all three stay
 * consistent). Each chip keeps an accessible name via `aria-label` since the
 * glyph itself is decorative.
 */
export function SocialRow({
  event,
  size = 32,
  align = "center",
}: {
  event: DeliveryLandingPageData;
  size?: number;
  align?: "center" | "start";
}) {
  const links = socialLinksFor(event);
  if (links.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-2 pt-1 ${align === "center" ? "justify-center" : "justify-start"}`}>
      {links.map((l) => (
        <a
          key={l.label}
          href={l.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={l.label}
          title={l.label}
          className="group/social flex cursor-pointer"
        >
          <SocialChip platform={l.label} size={size} />
        </a>
      ))}
    </div>
  );
}

/**
 * The studio's contact + review hub — logo/name, "Leave a Google review"
 * (the standing CTA per gallery), Contact us, and socials. A distinct content
 * card (not nav chrome), so it keeps its own header even though the desktop
 * top bar also carries the studio identity for navigation.
 */
export function StudioCard({
  t,
  event,
  reviewUrl,
  contactUrl,
  onReviewClick,
  onContactClick,
  animationDelay,
}: {
  t: ClientTheme;
  event: DeliveryLandingPageData;
  reviewUrl: string | null;
  contactUrl: string | null;
  onReviewClick: () => void;
  onContactClick: () => void;
  animationDelay?: string;
}) {
  return (
    <div
      className="lounge-rise lounge-card flex flex-col gap-3.5 rounded-2xl p-4"
      style={{ background: t.card, border: `1px solid ${t.border}`, animationDelay }}
    >
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl" style={{ background: t.ink, color: t.brand }}>
          {event.company_logo_light || event.company_logo ? (
            // Avatar sits on a dark chip (t.ink), so prefer the light logo.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={event.company_logo_light || event.company_logo} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-[13px] font-semibold">{initials(event.company_name ?? "")}</span>
          )}
        </span>
        <div>
          <div className="text-[14px] font-semibold" style={{ color: t.text }}>{event.company_name}</div>
          {/* No studio-tagline field exists on the event yet, so this stays a
              de-emphasised default (lighter weight + faint) until one lands. */}
          <div className="text-[11px] font-medium" style={{ color: t.faint }}>Photography &amp; films</div>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {reviewUrl && (
          <a href={reviewUrl} target="_blank" rel="noopener noreferrer" onClick={onReviewClick} className="flex items-center justify-center rounded-full py-3 text-[13px] font-semibold" style={{ background: t.brand, color: t.onBrand }}>
            Leave us a Google review ↗
          </a>
        )}
        {contactUrl && (
          <a href={contactUrl} target="_blank" rel="noopener noreferrer" onClick={onContactClick} className="flex items-center justify-center rounded-full py-2.5 text-[13px] font-semibold" style={{ border: `1.5px solid ${t.border}`, color: t.text }}>
            Contact us
          </a>
        )}
        <SocialRow event={event} />
      </div>
    </div>
  );
}
