"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { clearToken, clearCompany, getCompany, setCompany, isAuthenticated } from "@/lib/auth";
import { getCompanyDetails } from "@/lib/api";
import type { Company } from "@/lib/types";
import { Logo } from "@/components/ui/Logo";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [company, setCompanyState] = useState<Company | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
      return;
    }
    const cached = getCompany();
    if (cached) {
      setCompanyState(cached);
      setReady(true);
    } else {
      getCompanyDetails()
        .then((res) => {
          setCompany(res.company);
          setCompanyState(res.company);
        })
        .catch(() => {/* non-fatal */})
        .finally(() => setReady(true));
    }
  }, [router, pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  if (!ready) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[var(--color-brand-bg)]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[var(--color-brand-border)] border-t-[var(--color-brand-navy)]" />
          <p className="text-sm text-[var(--color-brand-muted)]">Loading your studio…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-brand-bg)] text-[var(--color-brand-ink)]">
      <header className="sticky top-0 z-40 border-b border-[var(--color-brand-border)] bg-[var(--color-brand-bg)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Logo size={52} />

          <div className="flex items-center gap-2">
            <a
              href="https://wa.me/918929163903"
              target="_blank"
              rel="noreferrer"
              className="hidden h-9 items-center gap-1.5 rounded-lg border border-[var(--color-brand-border)] bg-[var(--color-brand-surface)] px-3 text-xs font-medium text-[var(--color-brand-muted)] transition-colors hover:border-[var(--color-brand-outline)] hover:text-[var(--color-brand-ink)] sm:inline-flex"
            >
              <HelpIcon className="h-3.5 w-3.5" />
              Support
            </a>

            <div ref={menuRef} className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="brand-focus flex h-9 items-center gap-2 rounded-lg border border-[var(--color-brand-border)] bg-[var(--color-brand-surface)] px-2.5 text-sm font-medium text-[var(--color-brand-ink)] transition-colors hover:border-[var(--color-brand-outline)]"
                aria-expanded={menuOpen}
                aria-haspopup="menu"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-navy)] text-[10px] font-bold text-white">
                  {company?.name?.[0]?.toUpperCase() ?? "S"}
                </span>
                <span className="hidden max-w-[120px] truncate text-xs sm:inline">
                  {company?.name ?? "Studio"}
                </span>
                <ChevronDown
                  className={`h-3 w-3 shrink-0 text-[var(--color-brand-muted)] transition-transform ${
                    menuOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-1.5 w-48 origin-top-right rounded-xl border border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] p-1 shadow-[0_4px_12px_rgba(42,34,24,0.10)] dash-rise"
                >
                  <a
                    href="/dashboard/settings"
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[var(--color-brand-ink)] transition-colors hover:bg-[var(--color-brand-surface)]"
                  >
                    <SettingsIcon className="h-4 w-4 text-[var(--color-brand-muted)]" />
                    Studio settings
                  </a>
                  <div className="my-1 border-t border-[var(--color-brand-border)]" />
                  <button
                    type="button"
                    onClick={() => {
                      clearToken();
                      clearCompany();
                      router.replace("/login");
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[var(--color-brand-ink)] transition-colors hover:bg-[var(--color-brand-surface)]"
                  >
                    <LogoutIcon className="h-4 w-4 text-[var(--color-brand-muted)]" />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}

function HelpIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9.5 9.5a2.5 2.5 0 015 0c0 1.5-2.5 2-2.5 3.5M12 17v.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LogoutIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M14 7V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h7a2 2 0 002-2v-2M10 12h11M18 8l3 4-3 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
