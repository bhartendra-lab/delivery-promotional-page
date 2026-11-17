"use client";

import { useEffect, useState } from "react";
import {
  GTM_ID,
  OPEN_CONSENT_EVENT,
  getStoredConsent,
  setConsent,
  type ConsentChoice,
} from "@/lib/analytics";

/**
 * Cookie consent banner for the studio dashboard. Renders nothing unless
 * analytics is configured. Both choices carry equal weight; nothing is tracked
 * until "Accept".
 */
export function ConsentBanner() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!GTM_ID) return;
    // Defer so the first client render matches the server HTML.
    const t = window.setTimeout(() => setOpen(getStoredConsent() === null), 0);
    const reopen = () => setOpen(true);
    window.addEventListener(OPEN_CONSENT_EVENT, reopen);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener(OPEN_CONSENT_EVENT, reopen);
    };
  }, []);

  if (!GTM_ID || !open) return null;

  const choose = (choice: ConsentChoice) => {
    setConsent(choice);
    setOpen(false);
  };

  const btn =
    "brand-focus inline-flex h-10 flex-1 items-center justify-center rounded-full border px-4 text-[13px] font-semibold transition-colors";

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Cookie preferences"
      className="fixed bottom-4 left-4 right-4 z-[60] rounded-2xl border border-[var(--color-brand-border)] bg-[var(--color-brand-surface-raised)] p-4 shadow-lg sm:right-auto sm:max-w-[440px]"
    >
      <p className="m-0 mb-3.5 text-[13px] leading-relaxed text-[var(--color-brand-ink)]">
        We use cookies to measure how Vyavasth is used and to show our ads on other platforms.
        Declining changes nothing about how the dashboard works.{" "}
        <a
          href="https://vyavasth.in/cookie-policy"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--color-brand-navy-deep)] underline underline-offset-2"
        >
          Cookie Policy
        </a>
      </p>
      <div className="flex gap-2.5">
        <button
          type="button"
          onClick={() => choose("denied")}
          className={`${btn} border-[var(--color-brand-outline)] text-[var(--color-brand-ink)] hover:bg-[var(--color-brand-hover)]`}
        >
          Decline
        </button>
        <button
          type="button"
          onClick={() => choose("granted")}
          className={`${btn} border-[var(--color-brand-navy)] bg-[var(--color-brand-navy)] text-white hover:bg-[var(--color-brand-navy-deep)]`}
        >
          Accept
        </button>
      </div>
    </div>
  );
}
