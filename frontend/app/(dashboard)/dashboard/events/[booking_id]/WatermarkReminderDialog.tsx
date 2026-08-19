"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useReminders } from "@/components/dashboard/RemindersProvider";
import { Modal } from "@/components/ui/Modal";
import { IconPalette } from "@/components/ui/icons";

/**
 * Shown before an upload on an event while the studio has no watermark
 * preset. Watermarks apply at delivery render time, so setting one up before
 * uploading means every photo delivered from here on automatically carries
 * the studio's mark.
 *
 * "Skip for now" only closes this one instance — the reminder returns on the
 * next upload attempt — unless "Don't show this again" is checked, in which
 * case the skip is persisted (`dismissed_at`) and it won't return until a
 * preset exists regardless. Mirrors `BrandingReminderDialog`.
 */
export function WatermarkReminderDialog({
  open,
  onSkip,
}: {
  open: boolean;
  /** Skip/Escape/X — the caller commits the upload it originally asked for. */
  onSkip: () => void;
}) {
  const router = useRouter();
  const { dismiss } = useReminders();
  const [dontShowAgain, setDontShowAgain] = useState(false);

  // This dialog stays mounted for the whole event-page lifetime (its `open`
  // prop just toggles), unlike BrandingReminderDialog which remounts fresh
  // per tab visit — so the checkbox is reset here rather than relying on
  // unmount, or a check left over from a prior attempt would silently carry
  // forward into the next one.
  async function handleSkip() {
    if (dontShowAgain) {
      await dismiss("watermark");
    }
    setDontShowAgain(false);
    onSkip();
  }

  function handleSetup() {
    // Nothing to record — preset_count > 0 will close this reminder out
    // honestly once the studio finishes the setup it's headed to.
    router.push("/dashboard/settings/watermarks?new=1");
  }

  return (
    <Modal open={open} onClose={handleSkip} title="Set up your watermark first?" size="sm" dismissOnBackdrop={false}>
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-brand-navy-soft)] text-[var(--color-brand-navy)]">
          <IconPalette size={26} />
        </span>
        <p className="text-sm text-[var(--color-brand-muted)]">
          <strong className="font-semibold text-[var(--color-brand-ink)]">
            Photos you upload now won't carry your studio's mark — watermarking happens at upload time.
          </strong>{" "}
        </p>
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
            onClick={handleSetup}
            className="brand-focus inline-flex h-11 items-center justify-center rounded-lg bg-[var(--color-brand-navy)] text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)] sm:flex-1"
          >
            Set up watermark
          </button>
          <button
            type="button"
            onClick={handleSkip}
            className="brand-focus inline-flex h-11 items-center justify-center rounded-lg border border-[var(--color-brand-border)] px-4 text-sm font-semibold text-[var(--color-brand-ink)] transition-colors hover:bg-[var(--color-brand-hover)] sm:flex-1"
          >
            Skip for now
          </button>
        </div>
      </div>
    </Modal>
  );
}
