"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconChevronRight, IconBell, IconHelp } from "@/components/ui/icons";
import { useChrome } from "./ChromeContext";
import { AccountMenu } from "./AccountMenu";

export type Breadcrumb = {
  label: string;
  href?: string;
}[];

export function Topbar({ breadcrumb }: { breadcrumb: Breadcrumb }) {
  const pathname = usePathname();
  const { topbarExtra } = useChrome();

  const dashActive = pathname === "/dashboard";
  const eventsActive = pathname.startsWith("/dashboard/events");

  return (
    <header
      className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--color-brand-border)] bg-white px-4 py-3 sm:px-10 sm:py-3.5"
      style={{ minHeight: 56 }}
    >
      {/* Mobile-only quick nav (sidebar is hidden < md) */}
      <nav className="flex items-center gap-1 md:hidden">
        <Link
          href="/dashboard"
          aria-current={dashActive ? "page" : undefined}
          className={`rounded-md px-2 py-1 text-[12px] font-semibold ${
            dashActive
              ? "bg-[var(--color-brand-navy-soft)] text-[var(--color-brand-navy)]"
              : "text-[var(--color-brand-muted)]"
          }`}
        >
          Dashboard
        </Link>
        <Link
          href="/dashboard/events"
          aria-current={eventsActive ? "page" : undefined}
          className={`rounded-md px-2 py-1 text-[12px] font-semibold ${
            eventsActive
              ? "bg-[var(--color-brand-navy-soft)] text-[var(--color-brand-navy)]"
              : "text-[var(--color-brand-muted)]"
          }`}
        >
          Events
        </Link>
      </nav>

      <div className="hidden items-center gap-1.5 text-[12.5px] text-[var(--color-brand-muted)] md:flex">
        {breadcrumb.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <IconChevronRight size={12} />}
            {crumb.href ? (
              <Link
                href={crumb.href}
                className={
                  i === breadcrumb.length - 1
                    ? "font-semibold text-[var(--color-brand-ink)]"
                    : "hover:text-[var(--color-brand-ink)]"
                }
              >
                {crumb.label}
              </Link>
            ) : (
              <span
                className={
                  i === breadcrumb.length - 1 ? "font-semibold text-[var(--color-brand-ink)]" : ""
                }
              >
                {crumb.label}
              </span>
            )}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2">
        {/* Page-injected pill (LivePill) — desktop only; mobile shows it inline
            beneath the tab strip to avoid a cramped, overflowing header. */}
        {topbarExtra && (
          <div className="mr-1 hidden items-center md:flex">{topbarExtra}</div>
        )}
        <button
          type="button"
          title="Notifications"
          className="brand-focus relative flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-brand-muted)] hover:text-[var(--color-brand-ink)]"
        >
          <IconBell size={16} />
          <span
            className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[var(--color-brand-navy)] ring-[1.5px] ring-white"
            aria-hidden
          />
        </button>
        <a
          href="https://wa.me/917581072329"
          target="_blank"
          rel="noreferrer"
          title="Help"
          className="brand-focus flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-brand-muted)] hover:text-[var(--color-brand-ink)]"
        >
          <IconHelp size={16} />
        </a>
        {/* Account menu — mobile only; on desktop the identity + account actions
            live in the sidebar footer chip, so there's no double identity. */}
        <div className="flex items-center gap-2 md:hidden">
          <span className="h-[18px] w-px bg-[var(--color-brand-border)]" aria-hidden />
          <AccountMenu variant="avatar" />
        </div>
      </div>
    </header>
  );
}
