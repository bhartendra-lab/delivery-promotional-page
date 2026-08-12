"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { IconX } from "@/components/ui/icons";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

type Size = "sm" | "md" | "lg";

const SIZE_CLASSES: Record<Size, string> = {
  sm: "sm:max-w-md",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
};

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** sm ≈ max-w-md, md ≈ max-w-lg (default), lg ≈ max-w-2xl — desktop only. */
  size?: Size;
  /** Defaults true. Set false for the welcome dialog — Escape and the X still close it. */
  dismissOnBackdrop?: boolean;
  /** Optional left-side header control, e.g. a Back button in a multi-step flow. */
  headerLeading?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
};

/**
 * Shared modal primitive: full-screen sheet under 640px (sticky
 * header/footer, scrolling body), centered card at 640px+. Every new dialog
 * in this app should build on this rather than a bespoke overlay.
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  size = "md",
  dismissOnBackdrop = true,
  headerLeading,
  footer,
  children,
}: ModalProps) {
  const titleId = useId();
  const subtitleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Read through a ref (kept current every render) rather than depending on
  // `onClose` directly in the effect below. Every caller passes an inline
  // callback that's a new function identity on every render of that caller
  // — if the focus-trap effect depended on it, typing into any field inside
  // the modal (a normal controlled-input re-render) would tear the effect
  // down and re-run it on every keystroke, which re-focuses the first
  // focusable element in the dialog and yanks focus out of whatever the
  // user was typing into.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusables = panel?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    if (focusables && focusables.length > 0) {
      focusables[0].focus();
    } else {
      panel?.focus();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const current = panel?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (!current || current.length === 0) return;
      const list = Array.from(current);
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
      previouslyFocused.current?.focus();
    };
    // Deliberately excludes `onClose` — see onCloseRef above. This effect
    // should only run on a real open/close transition.
  }, [open]);

  if (!open) return null;
  // SSR-guarded: no DOM to portal into during server rendering. Every
  // consumer's `open` starts false until client-side data (a fetched
  // company/subscription/reminder status, or direct user interaction)
  // flips it, so this never costs a visible first-paint frame in practice.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center sm:p-4">
      <button
        type="button"
        aria-label="Close dialog"
        tabIndex={-1}
        onClick={dismissOnBackdrop ? onClose : undefined}
        className={`modal-fade absolute inset-0 hidden bg-[var(--color-brand-ink)]/40 backdrop-blur-sm sm:block ${
          dismissOnBackdrop ? "cursor-pointer" : "cursor-default"
        }`}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle ? subtitleId : undefined}
        tabIndex={-1}
        className={`modal-pop modal-slide-up relative flex w-full flex-1 flex-col bg-[var(--color-brand-bg)] sm:flex-none sm:rounded-2xl sm:border sm:border-[var(--color-brand-border)] sm:shadow-[0_24px_60px_rgba(42,34,24,0.18)] sm:max-h-[85vh] ${SIZE_CLASSES[size]}`}
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[var(--color-brand-border)] bg-[var(--color-brand-surface)] px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))] sm:static sm:rounded-t-2xl sm:px-7 sm:py-5">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {headerLeading}
            <div className="min-w-0">
              <h2 id={titleId} className="text-xl font-bold text-[var(--color-brand-ink)]">
                {title}
              </h2>
              {subtitle && (
                <p id={subtitleId} className="mt-0.5 text-sm text-[var(--color-brand-muted)]">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="brand-focus flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--color-brand-muted)] transition-colors hover:bg-[var(--color-brand-border)] hover:text-[var(--color-brand-ink)]"
            aria-label="Close"
          >
            <IconX size={16} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">{children}</div>

        {footer && (
          <footer className="sticky bottom-0 z-10 border-t border-[var(--color-brand-border)] bg-[var(--color-brand-surface)] px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:static sm:rounded-b-2xl sm:px-7 sm:py-5">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
