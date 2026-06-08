"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { clearToken, clearCompany, getCompany } from "@/lib/auth";
import type { Company } from "@/lib/types";

const SIDEBAR_W_EXPANDED = 240;
const SIDEBAR_W_COLLAPSED = 88;
const LS_COLLAPSED = "sidebar_collapsed";

type NavItem = { id: string; label: string; href: string; Icon: React.FC<{ size?: number; className?: string }> };

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", href: "/dashboard", Icon: IconHome },
  { id: "events", label: "Events", href: "/dashboard/events", Icon: IconCalendar },
];

export function Sidebar({
  collapsed,
  setCollapsed,
  locked = false,
}: {
  collapsed: boolean;
  setCollapsed: (next: boolean) => void;
  /** When true, nav links are disabled (e.g. upload in progress). */
  locked?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [company, setCompany] = useState<Company | null>(null);

  useEffect(() => {
    setCompany(getCompany());
  }, []);

  const activeId =
    NAV_ITEMS.slice()
      .sort((a, b) => b.href.length - a.href.length)
      .find((item) => pathname === item.href || pathname.startsWith(item.href + "/"))
      ?.id ?? null;

  function signOut() {
    clearToken();
    clearCompany();
    router.replace("/login");
  }

  function attemptNav(e: React.MouseEvent<HTMLAnchorElement>) {
    if (locked) {
      e.preventDefault();
      window.alert("Upload in progress — please wait or cancel before leaving this page.");
    }
  }

  return (
    <aside
      className="sticky top-0 z-30 hidden shrink-0 flex-col self-start border-r border-[var(--color-brand-border)] bg-white md:flex"
      style={{
        width: collapsed ? SIDEBAR_W_COLLAPSED : SIDEBAR_W_EXPANDED,
        height: "100vh",
        transition: "width 200ms ease",
      }}
    >
      {/* Logo + collapse toggle */}
      <div
        className={`flex items-center border-b border-[var(--color-brand-border)] ${
          collapsed ? "justify-center px-3 py-5" : "justify-between px-4 py-4"
        }`}
        style={{ minHeight: 64 }}
      >
        {collapsed ? (
          <img src="/vyavasth-icon.svg" alt="Vyavasth" height={26} />
        ) : (
          <>
            <img src="/vyavasth-full-logo.svg" alt="Vyavasth" height={26} />
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              title="Collapse sidebar"
              className="brand-focus inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--color-brand-border)] text-[var(--color-brand-muted)] hover:text-[var(--color-brand-ink)]"
            >
              <IconSidebar size={15} />
            </button>
          </>
        )}
      </div>

      {/* Search */}
      <div className={collapsed ? "px-2.5 pb-1 pt-3" : "px-3.5 pb-1 pt-3"}>
        {collapsed ? (
          <button
            type="button"
            title="Search"
            className="brand-focus flex w-full items-center justify-center rounded-md border border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] py-2.5 text-[var(--color-brand-muted)] hover:border-[var(--color-brand-outline)]"
          >
            <IconSearch size={16} />
          </button>
        ) : (
          <div className="flex items-center gap-2 rounded-md border border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] px-2.5 py-1.5">
            <IconSearch size={14} className="text-[var(--color-brand-muted)]" />
            <input
              type="search"
              placeholder="Search…"
              className="min-w-0 flex-1 bg-transparent text-[12.5px] text-[var(--color-brand-ink)] outline-none placeholder:text-[var(--color-brand-muted)]/80"
            />
            <span className="rounded-sm border border-[var(--color-brand-border)] px-1 py-0.5 font-mono text-[10px] text-[#B5ADA4]">
              ⌘K
            </span>
          </div>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex-1 pt-3.5">
        {NAV_ITEMS.map((item) => {
          const active = item.id === activeId;
          const Icon = item.Icon;
          if (collapsed) {
            return (
              <Link
                key={item.id}
                href={item.href}
                onClick={attemptNav}
                aria-current={active ? "page" : undefined}
                className={`mx-2.5 my-0.5 flex flex-col items-center gap-1.5 rounded-lg px-1.5 py-3 text-[11px] font-semibold no-underline ${
                  active
                    ? "bg-[var(--color-brand-navy-soft)] text-[var(--color-brand-navy)]"
                    : "text-[var(--color-brand-ink)] hover:bg-[var(--color-brand-surface)]/60"
                } ${locked ? "pointer-events-none opacity-50" : ""}`}
              >
                <Icon size={22} className={active ? "text-[var(--color-brand-navy)]" : "text-[var(--color-brand-muted)]"} />
                <span>{item.label}</span>
              </Link>
            );
          }
          return (
            <Link
              key={item.id}
              href={item.href}
              onClick={attemptNav}
              aria-current={active ? "page" : undefined}
              className={`mx-2.5 my-0.5 flex items-center gap-2.5 rounded-md px-3 py-2 text-[13.5px] no-underline ${
                active
                  ? "bg-[var(--color-brand-navy-soft)] font-semibold text-[var(--color-brand-navy)]"
                  : "font-medium text-[var(--color-brand-ink)] hover:bg-[var(--color-brand-surface)]/60"
              } ${locked ? "pointer-events-none opacity-50" : ""}`}
            >
              <Icon size={17} className={active ? "text-[var(--color-brand-navy)]" : "text-[var(--color-brand-muted)]"} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer: storage + settings */}
      <div className={`border-t border-[var(--color-brand-border)] ${collapsed ? "px-2.5 py-3" : "px-3.5 py-3"}`}>
        {!collapsed && (
          <div className="mb-1.5 rounded-md border border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] px-3 py-2.5">
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-[11.5px] font-semibold text-[var(--color-brand-ink)]">Storage</span>
              <span className="text-[11px] tabular-nums text-[var(--color-brand-muted)]">342 / 500 GB</span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-[#F2F0EB]">
              <div
                className="h-full rounded-full bg-[var(--color-brand-navy)]"
                style={{ width: "68%" }}
              />
            </div>
          </div>
        )}
        {collapsed ? (
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              title="Expand sidebar"
              className="brand-focus w-full rounded-md border border-[var(--color-brand-border)] py-2.5 text-[var(--color-brand-muted)] hover:text-[var(--color-brand-ink)]"
            >
              <IconSidebar size={18} className="mx-auto" />
            </button>
            <Link
              href="/dashboard/settings"
              onClick={attemptNav}
              title="Settings"
              className={`brand-focus block w-full rounded-md border border-[var(--color-brand-border)] py-2.5 text-center text-[var(--color-brand-muted)] hover:text-[var(--color-brand-ink)] ${
                locked ? "pointer-events-none opacity-50" : ""
              }`}
            >
              <IconGear size={18} className="mx-auto" />
            </Link>
            <button
              type="button"
              onClick={signOut}
              title="Sign out"
              className="brand-focus w-full rounded-md border border-[var(--color-brand-border)] py-2.5 text-[var(--color-brand-muted)] hover:text-[var(--color-brand-ink)]"
            >
              <IconLogout size={16} className="mx-auto" />
            </button>
          </div>
        ) : (
          <>
            <Link
              href="/dashboard/settings"
              onClick={attemptNav}
              className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium text-[var(--color-brand-ink)] no-underline hover:bg-[var(--color-brand-surface)]/60 ${
                locked ? "pointer-events-none opacity-50" : ""
              }`}
            >
              <IconGear size={16} className="text-[var(--color-brand-muted)]" />
              <span>Settings</span>
            </Link>
            <button
              type="button"
              onClick={signOut}
              className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-[13px] font-medium text-[var(--color-brand-ink)] hover:bg-[var(--color-brand-surface)]/60"
            >
              <IconLogout size={16} className="text-[var(--color-brand-muted)]" />
              <span>Sign out</span>
            </button>
            {company && (
              <p className="mt-1.5 truncate px-3 text-[10.5px] text-[var(--color-brand-muted)]">
                {company.name}
              </p>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

export function useSidebarCollapsed(): [boolean, (next: boolean) => void] {
  const [collapsed, setCollapsedState] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_COLLAPSED);
      if (stored === "1") setCollapsedState(true);
    } catch {
      // ignore
    }
  }, []);

  const setCollapsed = (next: boolean) => {
    setCollapsedState(next);
    try {
      localStorage.setItem(LS_COLLAPSED, next ? "1" : "0");
    } catch {
      // ignore
    }
  };

  return [collapsed, setCollapsed];
}

/* ── Phosphor-style icons ───────────────────────────────────────── */

function IconHome({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z" />
    </svg>
  );
}

function IconCalendar({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3.5" y="5" width="17" height="15" rx="1.5" />
      <line x1="3.5" y1="9.5" x2="20.5" y2="9.5" />
      <line x1="8" y1="3" x2="8" y2="6" />
      <line x1="16" y1="3" x2="16" y2="6" />
    </svg>
  );
}

function IconSearch({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="11" cy="11" r="7" />
      <line x1="16" y1="16" x2="21" y2="21" />
    </svg>
  );
}

function IconSidebar({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="4" width="18" height="16" rx="1.5" />
      <line x1="9" y1="4" x2="9" y2="20" />
    </svg>
  );
}

function IconGear({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}

function IconLogout({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M14 7V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h7a2 2 0 002-2v-2M10 12h11M18 8l3 4-3 4" />
    </svg>
  );
}
