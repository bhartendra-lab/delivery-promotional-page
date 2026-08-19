"use client";

import { useRef, useState } from "react";
import { useCompany } from "@/lib/useCompany";
import { setCompany } from "@/lib/auth";
import { markWelcomeDialogSeen } from "@/lib/api";
import { useSubscription } from "@/components/billing/SubscriptionProvider";
import { isStorageSnapshot } from "@/lib/billing-types";
import { useUpgradeModal } from "@/components/billing/UpgradeModalProvider";
import { Modal } from "@/components/ui/Modal";
import { IconSparkle } from "@/components/ui/icons";

const FALLBACK_FREE_EVENTS = 2;

/**
 * One-time "you're all set" celebration, mounted on the dashboard home (not
 * the layout) so it never fires while deep-linked into an event page.
 */
export function WelcomeDialog() {
  const company = useCompany();
  const { snapshot } = useSubscription();
  const { openUpgradeModal } = useUpgradeModal();
  const seenRef = useRef(false);
  const [dismissed, setDismissed] = useState(false);

  const open =
    !!company &&
    company.onboarding_required === true &&
    company.onboarding_completed_at != null &&
    company.welcome_dialog_seen_at == null &&
    !dismissed;

  async function markSeen() {
    // A ref guard (not just component state) so Escape, the X, and a button
    // click racing each other only ever fire one POST.
    if (seenRef.current) return;
    seenRef.current = true;
    try {
      const res = await markWelcomeDialogSeen();
      setCompany(res.company);
    } catch {
      // Network failure — don't nag again this session; optimistically write
      // the flag locally. If it never actually saved server-side, the next
      // dashboard mount will see welcome_dialog_seen_at still null there and
      // this component will simply not render (dismissed/company mismatch
      // aside) until a future successful call catches it up.
      if (company) setCompany({ ...company, welcome_dialog_seen_at: Date.now() });
    }
  }

  function handleClose() {
    setDismissed(true);
    void markSeen();
  }

  function handleUpgrade() {
    setDismissed(true);
    void markSeen();
    openUpgradeModal();
  }

  if (!open) return null;

  const freeEvents =
    snapshot && !isStorageSnapshot(snapshot) && typeof snapshot.limit === "number"
      ? snapshot.limit
      : FALLBACK_FREE_EVENTS;

  return (
    <Modal open={open} onClose={handleClose} title="You're all set 🎉" size="sm" dismissOnBackdrop={false}>
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-brand-navy-soft)] text-[var(--color-brand-navy)]">
          <IconSparkle size={26} />
        </span>
        <p className="text-sm text-[var(--color-brand-muted)]">
          Your studio is verified. You&apos;ve got{" "}
          <strong className="font-semibold text-[var(--color-brand-ink)]">
            {freeEvents} free event{freeEvents === 1 ? "" : "s"} with unlimited storage
          </strong>{" "}
          to try everything out — create a gallery, share the QR, and watch the deliveries land.
        </p>
        <div className="mt-2 flex w-full flex-col gap-3 sm:flex-row-reverse">
          <button
            type="button"
            onClick={handleUpgrade}
            className="brand-focus inline-flex h-11 items-center justify-center rounded-lg bg-[var(--color-brand-navy)] text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)] sm:flex-1"
          >
            Upgrade plan
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="brand-focus inline-flex h-11 items-center justify-center rounded-lg border border-[var(--color-brand-border)] px-4 text-sm font-semibold text-[var(--color-brand-ink)] transition-colors hover:bg-[var(--color-brand-hover)] sm:flex-1"
          >
            Start with free events
          </button>
        </div>
      </div>
    </Modal>
  );
}
