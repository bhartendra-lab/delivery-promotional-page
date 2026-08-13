"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSettingsMaybe } from "./SettingsContext";
import {
  IconBuilding,
  IconShareNetwork,
  IconImages,
  IconUser,
  IconCreditCard,
  IconCaretDown,
  type IconProps,
} from "@/components/ui/icons";

export type SettingsItem = {
  label: string;
  href: string;
  Icon: React.FC<IconProps>;
};

export type SettingsGroup = {
  heading: string;
  items: SettingsItem[];
};

/**
 * Section map for the Settings area. Studio Identity merges what used to be
 * three separate routes (Studio Identity, Online Presence, Studio Logo) into
 * one tab, since they're all facets of the same "how the studio shows up"
 * concern. Your Account holds the two studio-owner-level sections.
 */
export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    heading: "Brand & Delivery",
    items: [
      { label: "Studio Identity", href: "/dashboard/settings", Icon: IconBuilding },
      { label: "Social Links", href: "/dashboard/settings/social-links", Icon: IconShareNetwork },
      { label: "Watermark Presets", href: "/dashboard/settings/watermarks", Icon: IconImages },
    ],
  },
  {
    heading: "Your Account",
    items: [
      { label: "Personal Information", href: "/dashboard/settings/personal", Icon: IconUser },
      { label: "Plan & Billing", href: "/dashboard/settings/billing", Icon: IconCreditCard },
    ],
  },
];

/** The section label for a pathname, used to build the top-bar breadcrumb. */
export function sectionLabelFor(pathname: string): string | null {
  for (const group of SETTINGS_GROUPS) {
    for (const item of group.items) {
      if (item.href === pathname) return item.label;
    }
  }
  return null;
}

/**
 * Guards switching between Settings sections while the active one has
 * unsaved edits. Shared by both the desktop list (`SettingsNav`) and the
 * mobile popover (`SettingsMobileNav`) so the confirm-before-leaving
 * behaviour can't drift between the two renderings of the same nav.
 *
 * The returned click handler expects a real `<a href>` (via next/link) —
 * open-in-new-tab, right-click, etc. keep working; it only intercepts a
 * plain click, which fires before Next's own navigation and can cleanly
 * cancel it. Deliberately does NOT try to guard navigation away from
 * Settings entirely (Sidebar/Topbar links to other dashboard areas, browser
 * back/forward) — there's no supported App Router API for that, and
 * reliably cancelling a popstate means fighting the router's own history
 * state. beforeunload (see SettingsChrome) covers tab close/reload instead.
 */
function useSettingsNavGuard() {
  const pathname = usePathname();
  const router = useRouter();
  const settings = useSettingsMaybe();
  const isDirty = settings?.isDirty ?? false;

  function handleNavClick(e: React.MouseEvent, href: string) {
    if (href === pathname || !isDirty) return;
    e.preventDefault();
    if (window.confirm("You have unsaved changes. Leave without saving?")) {
      router.push(href);
    }
  }

  return { pathname, handleNavClick };
}

export function SettingsNav() {
  const { pathname, handleNavClick } = useSettingsNavGuard();

  return (
    <nav className="space-y-9" aria-label="Settings sections">
      {SETTINGS_GROUPS.map((group) => (
        <div key={group.heading}>
          <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-brand-muted)]">
            {group.heading}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = pathname === item.href;
              const Icon = item.Icon;
              return (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    onClick={(e) => handleNavClick(e, item.href)}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2.5 rounded-pill px-3 py-2 text-sm font-medium transition-colors ${
                      active
                        ? "bg-[var(--color-brand-navy-soft)] text-[var(--color-brand-navy)]"
                        : "text-[var(--color-brand-ink)] hover:bg-[var(--color-brand-hover)]"
                    }`}
                  >
                    <Icon size={19} className={active ? "text-[var(--color-brand-navy)]" : "text-[var(--color-brand-muted)]"} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/**
 * Mobile counterpart to `SettingsNav` — the desktop list of 5 links stacked
 * above the page content costs too much vertical space on a phone (two
 * group headings plus five rows before any actual settings are visible).
 * Collapses to a single-line trigger showing the current section; tapping
 * it opens a popover with the same grouped items, closing on selection,
 * outside click, or Escape — the same interaction shape as `SortDropdown`
 * elsewhere in the app, so section-switching doesn't introduce a new
 * pattern for users to learn.
 *
 * Not sticky: the section trigger and the per-page `SaveBar` would both
 * want `sticky top-0` within the same mobile scroll column, and neither
 * has a stacking context that lets them coexist there without one
 * overlapping the other. Letting the trigger scroll away with the page is
 * the simpler, safer default — switching sections is already one scroll-up
 * away via the trigger, not something needed mid-scroll.
 */
export function SettingsMobileNav() {
  const { pathname, handleNavClick } = useSettingsNavGuard();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = SETTINGS_GROUPS.flatMap((g) => g.items).find((item) => item.href === pathname);
  const CurrentIcon = current?.Icon;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
        className="brand-focus flex w-full items-center gap-2.5 rounded-field border border-[var(--color-brand-border)] bg-[var(--color-brand-surface-raised)] px-3.5 py-3"
      >
        {CurrentIcon && <CurrentIcon size={19} className="shrink-0 text-[var(--color-brand-navy)]" />}
        <span className="flex-1 truncate text-left text-sm font-semibold text-[var(--color-brand-ink)]">
          {current?.label ?? "Settings"}
        </span>
        <IconCaretDown
          size={14}
          className={`shrink-0 text-[var(--color-brand-muted)] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <nav
          aria-label="Settings sections"
          className="dash-rise absolute inset-x-0 z-30 mt-1.5 overflow-hidden rounded-card border border-[var(--color-brand-border)] bg-[var(--color-brand-surface-raised)] p-2 shadow-[0_14px_44px_rgba(42,34,24,0.18)]"
        >
          {SETTINGS_GROUPS.map((group) => (
            <div key={group.heading} className="mb-1 last:mb-0">
              <p className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-brand-muted)]">
                {group.heading}
              </p>
              <ul>
                {group.items.map((item) => {
                  const active = pathname === item.href;
                  const Icon = item.Icon;
                  return (
                    <li key={item.label}>
                      <Link
                        href={item.href}
                        onClick={(e) => {
                          setOpen(false);
                          handleNavClick(e, item.href);
                        }}
                        aria-current={active ? "page" : undefined}
                        className={`flex items-center gap-2.5 rounded-pill px-2.5 py-2.5 text-sm font-medium transition-colors ${
                          active
                            ? "bg-[var(--color-brand-navy-soft)] text-[var(--color-brand-navy)]"
                            : "text-[var(--color-brand-ink)] hover:bg-[var(--color-brand-hover)]"
                        }`}
                      >
                        <Icon
                          size={19}
                          className={active ? "text-[var(--color-brand-navy)]" : "text-[var(--color-brand-muted)]"}
                        />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      )}
    </div>
  );
}
