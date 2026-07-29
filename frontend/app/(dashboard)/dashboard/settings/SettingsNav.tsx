"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type SettingsItem = {
  label: string;
  href: string;
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
      { label: "Studio Identity", href: "/dashboard/settings" },
      { label: "Social Links", href: "/dashboard/settings/social-links" },
      { label: "Watermark Presets", href: "/dashboard/settings/watermarks" },
    ],
  },
  {
    heading: "Your Account",
    items: [
      { label: "Personal Information", href: "/dashboard/settings/personal" },
      { label: "Plan & Billing", href: "/dashboard/settings/billing" },
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

  return (
    <nav className="space-y-6" aria-label="Settings sections">
      {SETTINGS_GROUPS.map((group) => (
        <div key={group.heading}>
          <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-brand-muted)]">
            {group.heading}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = pathname === item.href;
              return (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      active
                        ? "bg-[var(--color-brand-navy-soft)] text-[var(--color-brand-navy)]"
                        : "text-[var(--color-brand-ink)] hover:bg-[var(--color-brand-surface)]"
                    }`}
                  >
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
