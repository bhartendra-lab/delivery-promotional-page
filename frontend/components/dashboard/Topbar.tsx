"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useChrome } from "./ChromeContext";
import { ActiveUploadsIndicator } from "./ActiveUploadsIndicator";
import { AccountMenu } from "./AccountMenu";

export type Breadcrumb = {
  label: string;
  href?: string;
}[];

export function Topbar({ breadcrumb }: { breadcrumb: Breadcrumb }) {
  const pathname = usePathname();
  const { topbarExtra, locked } = useChrome();

  const dashActive = pathname === "/dashboard";
  const eventsActive = pathname.startsWith("/dashboard/events");

  return (
    <header
      className="flex items-center justify-between gap-3 border-b border-[var(--color-brand-border)] bg-white px-4 py-3 sm:px-10 sm:py-3.5"
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
            {i > 0 && <IconCaretRight size={12} />}
            {crumb.href && !locked ? (
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
                className={`${
                  i === breadcrumb.length - 1
                    ? "font-semibold text-[var(--color-brand-ink)]"
                    : ""
                }${locked && crumb.href ? " opacity-50" : ""}`}
              >
                {crumb.label}
              </span>
            )}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <ActiveUploadsIndicator />
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
          href="https://wa.me/918929163903"
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

function IconCaretRight({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}

function IconBell({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}

function IconHelp({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.5V14" />
      <circle cx="12" cy="17" r=".7" fill="currentColor" />
    </svg>
  );
}
