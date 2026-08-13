"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useReminders } from "@/components/dashboard/RemindersProvider";
import type { BrandingCheckpoints } from "@/lib/types";
import { Modal } from "@/components/ui/Modal";
import { IconCheck, IconShieldCheck } from "@/components/ui/icons";

const ROWS: { key: keyof BrandingCheckpoints; label: string; why: string }[] = [
  {
    key: "google_business",
    label: "Google Business Integration",
    why: "Powers the review link guests see on your gallery.",
  },
  {
    key: "studio_logo",
    label: "Studio Logo",
    why: "Shown on every delivery page and in the guest lounge.",
  },
  {
    key: "business_email",
    label: "Business Email (Verified)",
    why: "Lets guests reach a confirmed, real studio address.",
  },
  {
    key: "social_links",
    label: "Social Links",
    why: "Gives guests an easy way to follow and tag your studio.",
  },
];

/**
 * Pre-share branding checklist — mounted only while Access & Sharing is the
 * active tab (see AccessSharingTab), so it fires on tab entry, never on a
 * deep link into another tab. Reads every checkpoint from the server
 * (`useReminders`); nothing here is recomputed from `useCompany()`.
 *
 * "Skip for now" only closes this instance — it remounts (and re-nags) on
 * the next tab visit — unless "Don't show this again" is checked, which
 * persists the dismiss (`dismissed_at`) so it won't return even if the
 * checkpoints stay incomplete. Mirrors `WatermarkReminderDialog`.
 */
export function BrandingReminderDialog() {
  const router = useRouter();
  const { status, dismiss } = useReminders();
  // Ref guard so Escape, the X, and Skip racing each other only ever fire
  // one handleSkip call — mirrors WelcomeDialog#markSeen / WatermarkReminderDialog.
  const skippedRef = useRef(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  // Closes this instance without persisting anything — the only escape hatch
  // available when the checkbox isn't checked, since `status.branding.
  // should_show` doesn't change on its own. Needs no reset effect: this
  // component remounts fresh (useState(false) again) every time Access &
  // Sharing becomes the active tab, unlike WatermarkReminderDialog which
  // stays mounted for the whole event-page lifetime.
  const [locallyDismissed, setLocallyDismissed] = useState(false);

  const open = !!status?.branding.should_show && !locallyDismissed;

  async function handleSkip() {
    if (skippedRef.current) return;
    skippedRef.current = true;
    if (dontShowAgain) {
      await dismiss("branding");
    } else {
      setLocallyDismissed(true);
    }
  }

  function handleGoToSettings() {
    const cp = status?.branding.checkpoints;
    if (!cp) return;
    // Business Email lives on Studio Identity even though the brief doesn't
    // say where it routes — folded into this branch since that's the tab
    // it's actually verified on (confirmed by the requester).
    const identityIncomplete = !cp.google_business || !cp.studio_logo || !cp.business_email;
    if (identityIncomplete) {
      const logoOnlyOutstanding = !cp.studio_logo && cp.google_business && cp.business_email;
      router.push(logoOnlyOutstanding ? "/dashboard/settings#studio-logo" : "/dashboard/settings");
    } else {
      // Only reachable when social_links is the sole outstanding checkpoint.
      router.push("/dashboard/settings/social-links");
    }
  }

  if (!status) return null;
  const checkpoints = status.branding.checkpoints;

  return (
    <Modal open={open} onClose={handleSkip} title="Complete your branding before you share this gallery" size="sm" dismissOnBackdrop={false}>
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-brand-navy-soft)] text-[var(--color-brand-navy)]">
          <IconShieldCheck size={26} />
        </span>
        <p className="text-sm text-[var(--color-brand-muted)]">
          The gallery's lounge page shows your studio&apos;s branding — every guest who opens this link sees a fully set-up studio.
        </p>

        <ul className="w-full space-y-2.5">
          {ROWS.map((row) => (
            <li key={row.key} className="flex items-start gap-2.5 text-left">
              {checkpoints[row.key] ? (
                <span
                  className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-success)]/15 text-[var(--color-brand-success)]"
                  aria-hidden
                >
                  <IconCheck size={10} weight="bold" />
                </span>
              ) : (
                <span
                  className="mt-0.5 h-4 w-4 shrink-0 rounded-full border-[1.5px] border-[var(--color-brand-border)]"
                  aria-hidden
                />
              )}
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[var(--color-brand-ink)]">{row.label}</span>
                <span className="block text-xs text-[var(--color-brand-muted)]">{row.why}</span>
              </span>
            </li>
          ))}
        </ul>

        <label className="flex items-center gap-1.5 text-xs text-[var(--color-brand-muted)]">
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={(e) => setDontShowAgain(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-[var(--color-brand-border)] text-[var(--color-brand-navy)] accent-[var(--color-brand-navy)]"
          />
          Don&apos;t show this again
        </label>

        <div className="mt-2 flex w-full flex-col gap-3 sm:flex-row-reverse">
          <button
            type="button"
            onClick={handleGoToSettings}
            className="brand-focus inline-flex h-11 flex-1 items-center justify-center rounded-lg bg-[var(--color-brand-navy)] text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)]"
          >
            Complete Branding
          </button>
          <button
            type="button"
            onClick={handleSkip}
            className="brand-focus inline-flex h-11 flex-1 items-center justify-center rounded-lg border border-[var(--color-brand-border)] px-4 text-sm font-semibold text-[var(--color-brand-ink)] transition-colors hover:bg-[var(--color-brand-hover)]"
          >
            Skip for now
          </button>
        </div>
      </div>
    </Modal>
  );
}
