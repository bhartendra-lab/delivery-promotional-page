"use client";

import { useEffect } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export function Drawer({ open, onClose, title, subtitle, children, footer }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close drawer"
        onClick={onClose}
        className="drawer-fade absolute inset-0 bg-[var(--color-brand-ink)]/30 backdrop-blur-sm"
      />
      <div className="drawer-slide relative ml-auto flex h-full w-full flex-col bg-[var(--color-brand-bg)] sm:max-w-xl">
        <header className="flex items-start justify-between border-b border-[var(--color-brand-border)] bg-[var(--color-brand-surface)] px-5 py-4 sm:px-7 sm:py-5">
          <div>
            <h2 className="text-xl font-bold text-[var(--color-brand-ink)]">{title}</h2>
            {subtitle && (
              <p className="mt-0.5 text-sm text-[var(--color-brand-muted)]">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="brand-focus flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-brand-muted)] transition-colors hover:bg-[var(--color-brand-border)] hover:text-[var(--color-brand-ink)]"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
          {children}
        </div>

        {footer && (
          <footer className="border-t border-[var(--color-brand-border)] bg-[var(--color-brand-surface)] px-5 py-4 sm:px-7 sm:py-5">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
