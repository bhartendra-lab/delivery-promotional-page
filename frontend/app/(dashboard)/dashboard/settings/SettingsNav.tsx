"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSettingsMaybe } from "./SettingsContext";
import {
  IconBuilding,
  IconShareNetwork,
  IconImages,
  IconUser,
  IconCreditCard,
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

export function SettingsNav() {
  const pathname = usePathname();
  const router = useRouter();
  const settings = useSettingsMaybe();
  const isDirty = settings?.isDirty ?? false;

  // Guards switching between Settings sections while the active one has
  // unsaved edits. Link still renders a real <a href> (open-in-new-tab,
  // right-click, etc. keep working) — this only intercepts a plain click,
  // which fires before Next's own navigation and can cleanly cancel it.
  // Deliberately does NOT try to guard navigation away from Settings
  // entirely (Sidebar/Topbar links to other dashboard areas, browser
  // back/forward) — there's no supported App Router API for that, and
  // reliably cancelling a popstate means fighting the router's own history
  // state. beforeunload (see SettingsChrome) covers tab close/reload instead.
  function handleNavClick(e: React.MouseEvent, href: string) {
    if (href === pathname || !isDirty) return;
    e.preventDefault();
    if (window.confirm("You have unsaved changes. Leave without saving?")) {
      router.push(href);
    }
  }

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
