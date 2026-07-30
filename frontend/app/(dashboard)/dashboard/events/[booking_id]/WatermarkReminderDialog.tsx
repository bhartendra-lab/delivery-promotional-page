"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { useReminders } from "@/components/dashboard/RemindersProvider";
import { Modal } from "@/components/ui/Modal";
import { IconPalette } from "@/components/ui/icons";

/**
 * Shown before the first upload on an event when the studio has no watermark
 * preset yet and hasn't dismissed this nudge. Watermarks apply at delivery
 * render time, so setting one up before uploading means every photo
 * delivered from here on automatically carries the studio's mark.
 */
export function WatermarkReminderDialog({
  open,
  onSkip,
}: {
  open: boolean;
  /** Called once the skip is settled (dismiss always resolves — see useReminders) — the caller commits the upload it originally asked for. */
  onSkip: () => void;
}) {
  const router = useRouter();
  const { dismiss } = useReminders();
  // Ref guard so Escape, the X, and the Skip button racing each other only
  // ever fire one dismiss call — mirrors WelcomeDialog#markSeen.
  const skippedRef = useRef(false);

  async function handleSkip() {
    if (skippedRef.current) return;
    skippedRef.current = true;
    await dismiss("watermark");
    onSkip();
  }

  function handleSetup() {
    // Deliberately not dismissed — the studio is going to complete it, and
    // preset_count > 0 will close this reminder out honestly once they do.
    router.push("/dashboard/settings/watermarks?new=1");
  }

  return (
    <Modal open={open} onClose={handleSkip} title="Set up your watermark first?" size="sm" dismissOnBackdrop={false}>
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-brand-navy-soft)] text-[var(--color-brand-navy)]">
          <IconPalette size={26} />
        </span>
        <p className="text-sm text-[var(--color-brand-muted)]">
          Watermarks are applied when photos are delivered, not when they&apos;re uploaded. Set one
          up now and{" "}
          <strong className="font-semibold text-[var(--color-brand-ink)]">
            every photo you deliver carries your studio&apos;s mark automatically
          </strong>{" "}
          — no need to redo anything already uploaded.
        </p>
        <div className="mt-2 flex w-full flex-col gap-3 sm:flex-row-reverse">
          <button
            type="button"
            onClick={handleSetup}
            className="brand-focus inline-flex h-11 flex-1 items-center justify-center rounded-lg bg-[var(--color-brand-navy)] text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)]"
          >
            Set up watermark
          </button>
          <button
            type="button"
            onClick={handleSkip}
            className="brand-focus inline-flex h-11 flex-1 items-center justify-center rounded-lg border border-[var(--color-brand-border)] px-4 text-sm font-semibold text-[var(--color-brand-ink)] transition-colors hover:bg-[var(--color-brand-surface)]"
          >
            Skip for now
          </button>
        </div>
      </div>
    </Modal>
  );
}
