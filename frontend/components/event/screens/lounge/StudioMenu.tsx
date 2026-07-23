"use client";

import { useEffect, useRef, useState } from "react";
import type { DeliveryLandingPageData } from "@/lib/types";
import type { ClientTheme } from "@/lib/client-theme";
import { SocialRow, socialLinksFor, ensureHttp, initials } from "./StudioCard";
import { IconCaretDown, IconWhatsApp, IconGlobe, IconOpen } from "@/components/ui/icons";

/**
 * Desktop top-bar studio cluster. The logo and the menu are SEPARATE controls:
 *   - logo            → resets the gallery to the top (smooth-scroll back to
 *                       the cover; never a reload or refetch)
 *   - name + caret    → one combined trigger that opens the studio menu
 *                       (outside-click / Esc to close)
 *
 * The menu holds the studio's ways to get in touch — "Talk to us" (WhatsApp),
 * "Portfolio" (the studio site, only when one is set) and the socials as
 * colored brand chips. Review deliberately lives in its own top-bar action
 * rather than in here, per the two-tier review CTA design.
 */
export function StudioMenu({
  t,
  event,
  contactUrl,
  onContactClick,
  onResetToTop,
  compact = false,
}: {
  t: ClientTheme;
  event: DeliveryLandingPageData;
  contactUrl: string | null;
  onContactClick: () => void;
  onResetToTop: () => void;
  /** Mobile sizing: smaller logo, and the name text hides on narrow phones so
   *  the logo + caret alone still reach the menu. */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const websiteUrl = event.company_website?.trim() ? ensureHttp(event.company_website.trim()) : null;
  const hasSocials = socialLinksFor(event).length > 0;
  const hasMenu = !!contactUrl || !!websiteUrl || hasSocials;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
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
    <div ref={ref} className="relative flex min-w-0 items-center gap-1.5">
      {/* logo alone — back to the top of the gallery */}
      <button
        type="button"
        onClick={onResetToTop}
        aria-label="Back to top of gallery"
        title="Back to top"
        className={`flex shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg font-semibold transition-opacity hover:opacity-80 ${
          compact ? "h-8 w-8 text-[12px]" : "h-9 w-9 text-[13px]"
        }`}
        style={{ background: t.ink, color: t.brand }}
      >
        {event.company_logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.company_logo} alt="" className="h-full w-full object-cover" />
        ) : (
          initials(event.company_name ?? "")
        )}
      </button>

      {/* name + caret — ONE combined menu trigger */}
      {hasMenu ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label="Studio menu"
          aria-expanded={open}
          aria-haspopup="menu"
          className="flex min-w-0 cursor-pointer items-center gap-1 rounded-lg py-1 pl-1.5 pr-1 transition-colors"
          style={{ background: open ? t.sunken : "transparent" }}
        >
          <span
            className={`truncate font-semibold ${compact ? "hidden text-[13px] min-[380px]:inline" : "hidden text-[14px] sm:inline"}`}
            style={{ color: t.text }}
          >
            {event.company_name}
          </span>
          <span style={{ color: t.muted }}>
            <IconCaretDown size={14} style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform 0.2s ease" }} />
          </span>
        </button>
      ) : (
        <span
          className={`truncate font-semibold ${compact ? "hidden text-[13px] min-[380px]:inline" : "hidden text-[13.5px] sm:inline"}`}
          style={{ color: t.text }}
        >
          {event.company_name}
        </span>
      )}

      {open && (
        <div
          role="menu"
          className="popup-pop absolute left-0 top-[calc(100%+10px)] z-50 w-[268px] overflow-hidden rounded-2xl"
          style={{ background: t.card, boxShadow: t.shadow, border: `1px solid ${t.border}` }}
        >
          {/* identity header */}
          <div className="flex items-center gap-3 px-4 pb-3 pt-4">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl text-[13px] font-semibold"
              style={{ background: t.ink, color: t.brand }}
            >
              {event.company_logo_light || event.company_logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={event.company_logo_light || event.company_logo} alt="" className="h-full w-full object-cover" />
              ) : (
                initials(event.company_name ?? "")
              )}
            </span>
            <div className="min-w-0">
              <div className="truncate text-[13.5px] font-bold" style={{ color: t.text }}>
                {event.company_name}
              </div>
              <div className="text-[11px] font-medium" style={{ color: t.faint }}>
                Photography &amp; films
              </div>
            </div>
          </div>

          <div className="h-px" style={{ background: t.border }} />

          {/* actions */}
          <div className="flex flex-col gap-0.5 p-2">
            {contactUrl && (
              <MenuLink
                t={t}
                href={contactUrl}
                onClick={onContactClick}
                onDone={() => setOpen(false)}
                icon={<IconWhatsApp size={16} />}
                label="Talk to us"
                hint="WhatsApp"
              />
            )}
            {websiteUrl && (
              <MenuLink
                t={t}
                href={websiteUrl}
                onDone={() => setOpen(false)}
                icon={<IconGlobe size={16} />}
                label="Portfolio"
                hint="Website"
              />
            )}
          </div>

          {hasSocials && (
            <>
              <div className="h-px" style={{ background: t.border }} />
              <div className="px-4 pb-4 pt-3">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: t.faint }}>
                  Follow along
                </div>
                <SocialRow event={event} size={30} align="start" />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MenuLink({
  t,
  href,
  onClick,
  onDone,
  icon,
  label,
  hint,
}: {
  t: ClientTheme;
  href: string;
  onClick?: () => void;
  onDone: () => void;
  icon: React.ReactNode;
  label: string;
  hint?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      role="menuitem"
      onClick={() => {
        onClick?.();
        onDone();
      }}
      className="menu-row flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors"
      style={{ color: t.text }}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: t.accentWash, color: t.brand }}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold">{label}</span>
        {hint && (
          <span className="block text-[11px] font-medium" style={{ color: t.faint }}>
            {hint}
          </span>
        )}
      </span>
      <span style={{ color: t.faint }}>
        <IconOpen size={13} />
      </span>
    </a>
  );
}

