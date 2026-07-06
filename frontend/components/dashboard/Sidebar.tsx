"use client";

import { useCallback, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import type { DlpUsage } from "@/lib/types";
import { useChrome } from "./ChromeContext";
import { AccountMenu } from "./AccountMenu";

const SIDEBAR_W_EXPANDED = 240;
const SIDEBAR_W_COLLAPSED = 88;
const LS_COLLAPSED = "sidebar_collapsed";
const COLLAPSE_EVENT = "sidebar:collapsed-change";

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
  const { dlpUsage, dlpLoading } = useChrome();

  const activeId =
    NAV_ITEMS.slice()
      .sort((a, b) => b.href.length - a.href.length)
      .find((item) => pathname === item.href || pathname.startsWith(item.href + "/"))
      ?.id ?? null;

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
      {/* Logo + collapse toggle.
          Expanded: the toggle gets its own fixed slot (shrink-0) and the
          wordmark lives in a min-w-0 box, so the logo can never grow into the
          toggle — no overlap at any width.
          Collapsed: the toggle cross-fades in over the icon on hover/focus. */}
      <div
        className={`group flex items-center ${
          collapsed ? "relative justify-center px-3 py-4" : "justify-between gap-2 px-4 py-4"
        }`}
        style={{ minHeight: 64 }}
      >
        {collapsed ? (
          <>
            <img
              src="/vyavasth-icon.svg"
              alt="Vyavasth"
              height={22}
              className="transition-opacity duration-150 group-hover:opacity-0 group-focus-within:opacity-0"
            />
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              title="Expand sidebar"
              aria-label="Expand sidebar"
              className="brand-focus absolute inset-0 m-auto flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-brand-muted)] opacity-0 transition-opacity duration-150 hover:bg-[var(--color-brand-surface)] hover:text-[var(--color-brand-ink)] group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
            >
              <IconSidebar size={16} />
            </button>
          </>
        ) : (
          <>
            <span className="flex min-w-0 flex-1 items-center overflow-hidden">
              <img src="/vyavasth-full-logo.svg" alt="Vyavasth" height={22} />
            </span>
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
              className="brand-focus inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--color-brand-muted)] hover:bg-[var(--color-brand-surface)] hover:text-[var(--color-brand-ink)]"
            >
              <IconSidebar size={15} />
            </button>
          </>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex-1 pt-3">
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

      {/* Footer: events meter + account chip (identity + Settings + Sign out) */}
      <div className={`border-t border-[var(--color-brand-border)] ${collapsed ? "px-2.5 py-3" : "px-3.5 py-3"}`}>
        {!collapsed && <EventsMeter usage={dlpUsage} loading={dlpLoading} />}
        <AccountMenu variant={collapsed ? "icon" : "chip"} />
      </div>
    </aside>
  );
}

function getCollapsedSnapshot(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(LS_COLLAPSED) === "1";
}

function subscribeCollapsed(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  // `storage` covers other tabs; the custom event covers same-tab toggles.
  window.addEventListener("storage", onChange);
  window.addEventListener(COLLAPSE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(COLLAPSE_EVENT, onChange);
  };
}

export function useSidebarCollapsed(): [boolean, (next: boolean) => void] {
  // Read straight from the store (server snapshot is `false`) so the value is
  // correct during render rather than corrected by an effect after paint.
  const collapsed = useSyncExternalStore(subscribeCollapsed, getCollapsedSnapshot, () => false);

  const setCollapsed = useCallback((next: boolean) => {
    try {
      localStorage.setItem(LS_COLLAPSED, next ? "1" : "0");
    } catch {
      // ignore
    }
    if (typeof window !== "undefined") window.dispatchEvent(new Event(COLLAPSE_EVENT));
  }, []);

  return [collapsed, setCollapsed];
}

/**
 * Live events meter (replaces the old hardcoded storage block). Driven by the
 * shared `getDlpUsage` value from ChromeContext.
 *  - Pre-Paid → "{used} / {limit}" with a progress bar (danger when ≤2 left).
 *  - Post-Paid → "{used}" + "this month", no bar.
 *  - null / Monthly / One-Time / no data → "{used ?? 0}", no bar.
 *  - Loading → skeleton; fetch error (no usage) → hidden.
 */
function EventsMeter({ usage, loading }: { usage: DlpUsage | null; loading: boolean }) {
  if (loading) {
    return <div className="skeleton mb-1.5 h-[58px] rounded-md" />;
  }
  // Fetch error → hide the meter entirely (don't crash).
  if (!usage) return null;

  const used = usage.used ?? 0;

  // Pre-Paid: value "{used} / {limit}" + progress bar.
  if (usage.service_type === "Pre-Paid" && typeof usage.limit === "number") {
    const limit = usage.limit;
    const remaining = usage.remaining ?? Math.max(limit - used, 0);
    const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
    const low = remaining <= 2;
    return (
      <div className="mb-1.5 rounded-md border border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] px-3 py-2.5">
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-[11.5px] font-semibold text-[var(--color-brand-ink)]">Events</span>
          <span className="text-[11px] tabular-nums text-[var(--color-brand-muted)]">
            {used} / {limit}
          </span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-[#F2F0EB]">
          <div
            className="h-full rounded-full"
            style={{
              width: `${pct}%`,
              background: low ? "var(--color-brand-danger)" : "var(--color-brand-navy)",
            }}
          />
        </div>
        <p className="mt-1 text-[10.5px] text-[var(--color-brand-muted)]">{remaining} left</p>
      </div>
    );
  }

  // Post-Paid → "this month" caption; everything else → bare count. No bar.
  const caption = usage.service_type === "Post-Paid" ? "this month" : null;
  return (
    <div className="mb-1.5 rounded-md border border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] px-3 py-2.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[11.5px] font-semibold text-[var(--color-brand-ink)]">Events</span>
        <span className="text-[11px] tabular-nums text-[var(--color-brand-muted)]">{used}</span>
      </div>
      {caption && <p className="mt-1 text-[10.5px] text-[var(--color-brand-muted)]">{caption}</p>}
    </div>
  );
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

function IconSidebar({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="4" width="18" height="16" rx="1.5" />
      <line x1="9" y1="4" x2="9" y2="20" />
    </svg>
  );
}

