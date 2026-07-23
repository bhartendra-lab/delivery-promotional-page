"use client";

import { useCallback, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import type { DlpUsage } from "@/lib/types";
import { isCountBasedPlan, isStorageBasedPlan, getUsageSeverity } from "@/lib/types";
import { useChrome } from "./ChromeContext";
import { AccountMenu } from "./AccountMenu";

const SIDEBAR_W_EXPANDED = 240;
const SIDEBAR_W_COLLAPSED = 80;
const LS_COLLAPSED = "sidebar_collapsed";
const COLLAPSE_EVENT = "sidebar:collapsed-change";

type NavItem = { id: string; label: string; href: string; Icon: React.FC<{ size?: number; className?: string }> };

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", href: "/dashboard", Icon: IconHome },
  { id: "events", label: "Events", href: "/dashboard/events", Icon: IconCalendar },
  { id: "reusable-qr", label: "Reusable QR", href: "/dashboard/reusable-qr", Icon: IconQrCode },
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
          toggle — no overlap at any width. The wordmark is a plain <a> (not
          next/link) so a click forces a full page reload, not a soft nav.
          Collapsed: icon on top, toggle always visible below it — no
          hover-only reveal, since that never surfaces on touch devices. */}
      <div
        className={
          collapsed
            ? "flex flex-col items-center justify-center gap-1 px-2 py-1.5"
            : "flex items-center justify-between gap-2 px-4 py-3"
        }
        style={{ minHeight: collapsed ? 46 : 52 }}
      >
        {collapsed ? (
          <>
            <a
              href="/dashboard"
              onClick={attemptNav}
              aria-label="Vyavasth — go to dashboard"
              className="brand-focus flex items-center justify-center rounded-md p-1"
            >
              <img src="/vyavasth-icon.svg" alt="Vyavasth" style={{ height: 40, width: "auto" }} />
            </a>
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              title="Expand sidebar"
              aria-label="Expand sidebar"
              className="brand-focus flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-brand-muted)] hover:bg-[var(--color-brand-surface)] hover:text-[var(--color-brand-ink)]"
            >
              <IconSidebar size={14} />
            </button>
          </>
        ) : (
          <>
            <a
              href="/dashboard"
              onClick={attemptNav}
              aria-label="Vyavasth — go to dashboard"
              className="brand-focus flex min-w-0 flex-1 items-center overflow-hidden rounded-md"
            >
              <img src="/vyavasth-full-logo.svg" alt="Vyavasth" height={18} />
            </a>
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
      <nav className={`flex-1 pt-2 ${collapsed ? "w-[72px] px-1" : "w-[240px] px-3"}`}>
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
                className={`my-1 flex flex-col items-center justify-center gap-1.5 rounded-xl px-1 py-3.5 no-underline transition-colors ${
                  active
                    ? "bg-[var(--color-brand-navy-soft)] text-[var(--color-brand-navy)] font-medium"
                    : "text-[var(--color-brand-ink)] hover:bg-[var(--color-brand-surface)]/60 font-normal"
                } ${locked ? "pointer-events-none opacity-50" : ""}`}
              >
                {/* YouTube keeps icons at 24px in collapsed mode */}
                <Icon 
                  size={24} 
                  className={active ? "text-[var(--color-brand-navy)]" : "text-[var(--color-brand-muted)]"} 
                />
                <span className="max-w-[64px] truncate text-center text-[10px] leading-tight">
                  {item.label}
                </span>
              </Link>
            );
          }

          return (
            <Link
              key={item.id}
              href={item.href}
              onClick={attemptNav}
              aria-current={active ? "page" : undefined}
              className={`my-0.5 flex h-10 items-center gap-6 rounded-xl px-3 no-underline transition-colors ${
                active
                  ? "bg-[var(--color-brand-navy-soft)] font-medium text-[var(--color-brand-navy)]"
                  : "font-normal text-[var(--color-brand-ink)] hover:bg-[var(--color-brand-surface)]/60"
              } ${locked ? "pointer-events-none opacity-50" : ""}`}
            >
              {/* YouTube uses 24px icons and a 24px (gap-6) spacing to the label */}
              <Icon 
                size={24} 
                className={active ? "text-[var(--color-brand-navy)]" : "text-[var(--color-brand-muted)]"} 
              />
              <span className="truncate text-[14px] leading-none">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer: usage meter + account chip (identity + Settings + Sign out) */}
      <div className={`border-t border-[var(--color-brand-border)] ${collapsed ? "px-2 py-3" : "px-3.5 py-3"}`}>
        {collapsed ? (
          <CollapsedUsageMeter usage={dlpUsage} loading={dlpLoading} />
        ) : (
          <EventsMeter usage={dlpUsage} loading={dlpLoading} />
        )}
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
 * Live usage meter, driven by the shared `getDlpUsage` value from ChromeContext.
 *  - Count-based (Free / Event-based) → "Events {used}/{limit}" bar, red at ≤2 left.
 *  - Storage-based (Monthly / Yearly) → "Storage {used}/{limit} GB" bar,
 *    green < 70% → orange ≥ 70% → red ≥ 90%.
 *  - null service type / no limit / no data → bare "{used}" count, no bar.
 *  - Loading → skeleton; fetch error (no usage) → hidden.
 */
function EventsMeter({ usage, loading }: { usage: DlpUsage | null; loading: boolean }) {
  if (loading) {
    return <div className="skeleton mb-1.5 h-[58px] rounded-md" />;
  }
  // Fetch error → hide the meter entirely (don't crash).
  if (!usage) return null;

  const used = usage.used ?? 0;

  // Count-based: "Events {used} / {limit}" + progress bar (danger when ≤2 left).
  if (isCountBasedPlan(usage.service_type) && typeof usage.limit === "number") {
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

  // Storage-based: "Storage {used} / {limit} GB" + green → orange → red bar.
  if (isStorageBasedPlan(usage.service_type) && typeof usage.limit === "number") {
    const limit = usage.limit;
    const remaining = usage.remaining ?? Math.max(limit - used, 0);
    const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
    const severity = getUsageSeverity(pct);
    const barColor =
      severity === "danger"
        ? "var(--color-brand-danger)"
        : severity === "warning"
          ? "var(--color-brand-warning)"
          : "var(--color-brand-success)";
    return (
      <div className="mb-1.5 rounded-md border border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] px-3 py-2.5">
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-[11.5px] font-semibold text-[var(--color-brand-ink)]">Storage</span>
          <span className="text-[11px] tabular-nums text-[var(--color-brand-muted)]">
            {used.toFixed(1)} / {limit.toFixed(1)} GB
          </span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-[#F2F0EB]">
          <div
            className="h-full rounded-full"
            style={{ width: `${pct}%`, background: barColor }}
          />
        </div>
        <p className="mt-1 text-[10.5px] text-[var(--color-brand-muted)]">
          {remaining.toFixed(1)} GB left
        </p>
      </div>
    );
  }

  // Malformed/absent subscription → bare count, no bar.
  return (
    <div className="mb-1.5 rounded-md border border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] px-3 py-2.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[11.5px] font-semibold text-[var(--color-brand-ink)]">Events</span>
        <span className="text-[11px] tabular-nums text-[var(--color-brand-muted)]">{used}</span>
      </div>
    </div>
  );
}

/**
 * Collapsed-rail counterpart to `EventsMeter`: a small ring showing percent
 * filled (green/orange/red for storage plans, navy/red for count plans) with
 * the used value printed underneath. Same data, same severity thresholds —
 * just compact enough for the 96px rail.
 */
function CollapsedUsageMeter({ usage, loading }: { usage: DlpUsage | null; loading: boolean }) {
  if (loading) {
    return <div className="skeleton mx-auto mb-2 h-[26px] w-[26px] rounded-full" />;
  }
  if (!usage) return null;

  const used = usage.used ?? 0;
  const R = 9;
  const CIRC = 2 * Math.PI * R;

  let pct = 0;
  let ringColor = "var(--color-brand-navy)";
  let valueLabel = `${used}`;

  if (isCountBasedPlan(usage.service_type) && typeof usage.limit === "number") {
    const limit = usage.limit;
    const remaining = usage.remaining ?? Math.max(limit - used, 0);
    pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
    ringColor = remaining <= 2 ? "var(--color-brand-danger)" : "var(--color-brand-navy)";
    valueLabel = `${used}/${limit}`;
  } else if (isStorageBasedPlan(usage.service_type) && typeof usage.limit === "number") {
    const limit = usage.limit;
    pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
    const severity = getUsageSeverity(pct);
    ringColor =
      severity === "danger"
        ? "var(--color-brand-danger)"
        : severity === "warning"
          ? "var(--color-brand-warning)"
          : "var(--color-brand-success)";
    valueLabel = `${used.toFixed(1)}GB`;
  }

  return (
    <div className="mb-1.5 flex flex-col items-center gap-1 rounded-md border border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] py-2" title={`Storage: ${valueLabel}`}>
      <svg width="26" height="26" viewBox="0 0 24 24" className="-rotate-90">
        <circle cx="12" cy="12" r={R} fill="none" stroke="var(--color-brand-border)" strokeWidth="3" />
        <circle
          cx="12"
          cy="12"
          r={R}
          fill="none"
          stroke={ringColor}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={CIRC - (pct / 100) * CIRC}
        />
      </svg>
      <span className="text-[9px] font-semibold tabular-nums tracking-tight text-[var(--color-brand-muted)]">{valueLabel}</span>
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

function IconQrCode({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3.5" y="3.5" width="6" height="6" rx="1.2" />
      <rect x="14.5" y="3.5" width="6" height="6" rx="1.2" />
      <rect x="3.5" y="14.5" width="6" height="6" rx="1.2" />
      <path d="M14.5 14.5h2.5v2.5M20.5 14.5v.01M14.5 20.5h.01M17 20.5h3.5V17" />
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

