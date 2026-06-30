"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type SettingsItem = {
  label: string;
  href: string;
  /** Reserved-but-not-built sections (e.g. member self-service). */
  soon?: boolean;
};

export type SettingsGroup = {
  heading: string;
  items: SettingsItem[];
};

/**
 * Section map for the Settings area. Groups mirror the three studio data tiers.
 * `Your Account` is reserved for the deferred member self-service sections —
 * the slot is shown (disabled) now so the IA is ready when onboarding lands.
 */
export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    heading: "Studio",
    items: [{ label: "Studio Identity", href: "/dashboard/settings" }],
  },
  {
    heading: "Brand & Delivery",
    items: [
      { label: "Online Presence", href: "/dashboard/settings/online-presence" },
      { label: "Social Links", href: "/dashboard/settings/social-links" },
      { label: "Studio Logo", href: "/dashboard/settings/logo" },
      { label: "Watermark Presets", href: "/dashboard/settings/watermarks" },
    ],
  },
  {
    heading: "Your Account",
    items: [{ label: "Personal Information", href: "#", soon: true }],
  },
];

/** The section label for a pathname, used to build the top-bar breadcrumb. */
export function sectionLabelFor(pathname: string): string | null {
  for (const group of SETTINGS_GROUPS) {
    for (const item of group.items) {
      if (!item.soon && item.href === pathname) return item.label;
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
              const active = !item.soon && pathname === item.href;
              if (item.soon) {
                return (
                  <li key={item.label}>
                    <span
                      className="flex cursor-not-allowed items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-[var(--color-brand-muted)]/60"
                      aria-disabled
                    >
                      {item.label}
                      <span className="rounded-full bg-[var(--color-brand-bg)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-brand-muted)]">
                        Soon
                      </span>
                    </span>
                  </li>
                );
              }
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
