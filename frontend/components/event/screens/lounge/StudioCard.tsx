"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { DeliveryLandingPageData } from "@/lib/types";
import type { ClientTheme } from "@/lib/client-theme";
import { SOCIAL_PLATFORMS, SOCIAL_PLATFORM_BY_KEY, type SocialPlatformKey } from "@/lib/social-platforms";
import { SocialChip } from "./SocialIcons";

export function ensureHttp(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

export function initials(name: string): string {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "·";
}

export type StudioLink = { platform: SocialPlatformKey; label: string; url: string };

/** The studio's social and portal links in display order. Shared so callers
 *  can ask whether any exist (e.g. whether a menu is worth opening) without
 *  duplicating the legacy-field fallbacks. */
export function socialLinksFor(event: DeliveryLandingPageData): StudioLink[] {
  const sl = event.company_social_links ?? {};
  // Legacy single-platform fields exist for these two only, on pages published
  // before `social_links`. No other platform has (or gets) a fallback.
  const legacy: Partial<Record<SocialPlatformKey, string>> = {
    instagram: event.company_instagram_link,
    facebook: event.company_facebook_link,
  };
  return SOCIAL_PLATFORMS.flatMap(({ key, label }) => {
    const raw = sl[key] ?? legacy[key];
    return raw ? [{ platform: key, label, url: ensureHttp(raw) }] : [];
  });
}

/**
 * One studio link. Pointer devices get the bare chip with a label that appears
 * on hover AND on keyboard focus (the chip has no visible text, so without it a
 * keyboard Guest tabs through unlabelled circles). Touch devices have no hover
 * state, so they get a labelled pill instead. The styling and the
 * pointer/touch split live in globals.css (`.social-link`, `.social-pill`).
 */
function SocialLink({
  t,
  link,
  size,
  variant,
}: {
  t: ClientTheme;
  link: StudioLink;
  size: number;
  variant: "chip" | "pill";
}) {
  const brand = SOCIAL_PLATFORM_BY_KEY[link.platform].brand;
  if (variant === "pill") {
    return (
      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={link.label}
        className="social-pill flex min-h-[44px] shrink-0 cursor-pointer items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3.5 text-[12.5px] font-semibold"
        style={{ background: t.card, border: `1px solid ${t.border}`, color: t.text, "--social-brand": brand } as CSSProperties}
      >
        <SocialChip platform={link.platform} size={28} />
        <span className="whitespace-nowrap">{link.label}</span>
        <span aria-hidden style={{ color: t.faint }}>↗</span>
      </a>
    );
  }
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={link.label}
      className="social-link flex cursor-pointer rounded-full"
      style={{ "--social-brand": brand } as CSSProperties}
    >
      <SocialChip platform={link.platform} size={size} />
      {/* ink/onInk is the theme's guaranteed-contrast pairing, so the label
          reads on every style variant, dark ones included. */}
      <span
        aria-hidden
        className="social-label rounded-full px-2.5 py-1.5 text-[11.5px] font-semibold"
        style={{ background: t.ink, color: t.onInk, "--social-label-bg": t.ink } as CSSProperties}
      >
        {link.label} ↗
      </span>
    </a>
  );
}

/** Shows the touch row's right-edge fade only while there is more to scroll to,
 *  so two pills that fit never sit under a fade. */
function useOverflowFade(ref: React.RefObject<HTMLDivElement | null>): boolean {
  const [fade, setFade] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setFade(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    // The observer's initial callback seeds it — no synchronous setState here.
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    el.addEventListener("scroll", update, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", update);
    };
  }, [ref]);
  return fade;
}

/**
 * The studio's socials and portals (shared by the top-bar studio menu, the
 * studio card and the gallery outro, so they stay consistent). Both layouts
 * render and CSS shows one: chips with hover labels where the device can hover,
 * one horizontally scrolling row of labelled pills where it cannot — one line
 * tall however many links the Studio has. The hidden layout is display:none, so
 * no link is announced twice.
 */
export function SocialRow({
  t,
  event,
  size = 32,
  align = "center",
}: {
  t: ClientTheme;
  event: DeliveryLandingPageData;
  size?: number;
  align?: "center" | "start";
}) {
  const links = socialLinksFor(event);
  const touchRef = useRef<HTMLDivElement>(null);
  const fade = useOverflowFade(touchRef);
  if (links.length === 0) return null;
  return (
    <>
      <div className={`social-row-pointer w-full flex-wrap gap-2 pt-1 ${align === "center" ? "justify-center" : "justify-start"}`}>
        {links.map((l) => (
          <SocialLink key={l.platform} t={t} link={l} size={size} variant="chip" />
        ))}
      </div>
      <div ref={touchRef} className="social-row-touch w-full pt-1" data-fade={fade ? "true" : undefined}>
        {/* mx-auto centres the pills while they fit; once they overflow it
            resolves to 0 and the row scrolls from its start. */}
        <div className={`flex w-max gap-2 ${align === "center" ? "mx-auto" : ""}`}>
          {links.map((l) => (
            <SocialLink key={l.platform} t={t} link={l} size={size} variant="pill" />
          ))}
        </div>
      </div>
    </>
  );
}

/**
 * The studio's contact + review hub — logo/name, "Leave a Google review"
 * (the standing CTA per gallery), Contact us, and socials. A distinct content
 * card (not nav chrome), so it keeps its own header even though the desktop
 * top bar also carries the studio identity for navigation.
 *
 * Not currently mounted anywhere in the gallery. Kept correct regardless: with
 * reviews off, or no contact number, the action stack collapses rather than
 * leaving an empty button area behind.
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
      {(reviewUrl || contactUrl || socialLinksFor(event).length > 0) && (
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
        <SocialRow t={t} event={event} />
      </div>
      )}
    </div>
  );
}
