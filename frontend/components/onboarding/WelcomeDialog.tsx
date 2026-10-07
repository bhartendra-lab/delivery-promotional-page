"use client";

import { useRef, useState } from "react";
import { useCompany } from "@/lib/useCompany";
import { setCompany } from "@/lib/auth";
import { markWelcomeDialogSeen } from "@/lib/api";
import { useSubscription } from "@/components/billing/SubscriptionProvider";
import { isStorageSnapshot } from "@/lib/billing-types";
import type { SubscriptionSnapshot } from "@/lib/billing-types";
import { formatStorage } from "@/lib/plans";
import { Modal } from "@/components/ui/Modal";
import { IconSparkle } from "@/components/ui/icons";

/**
 * What the studio has to work with, from its plan: "3 events" or "150 GB of
 * storage". Null when the plan can't be read (a member without billing access
 * gets no snapshot), in which case the dialog simply doesn't quote a figure.
 */
function readyToUse(snapshot: SubscriptionSnapshot | null): string | null {
  if (!snapshot) return null;
  if (isStorageSnapshot(snapshot)) {
    return snapshot.storage.limit != null ? `${formatStorage(snapshot.storage.limit)} of storage` : null;
  }
  const remaining = snapshot.remaining;
  if (typeof remaining !== "number" || remaining <= 0) return null;
  return `${remaining} event${remaining === 1 ? "" : "s"}`;
}

/**
 * One-time "you're all set" celebration, mounted on the dashboard home (not
 * the layout) so it never fires while deep-linked into an event page. A studio
 * only reaches the dashboard once it has a plan, so this confirms what it
 * bought rather than promising anything free.
 */
export function WelcomeDialog() {
  const company = useCompany();
  const { snapshot } = useSubscription();
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

  if (!open) return null;

  const ready = readyToUse(snapshot);

  return (
    <Modal open={open} onClose={handleClose} title="You're all set 🎉" size="sm" dismissOnBackdrop={false}>
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-brand-navy-soft)] text-[var(--color-brand-navy)]">
          <IconSparkle size={26} />
        </span>
        <p className="text-sm text-[var(--color-brand-muted)]">
          Your studio is verified and your plan is active.{" "}
          {ready && (
            <>
              You have <strong className="font-semibold text-[var(--color-brand-ink)]">{ready}</strong> ready to
              use.{" "}
            </>
          )}
          Create a gallery, share the QR, and watch the deliveries land.
        </p>
        <button
          type="button"
          onClick={handleClose}
          className="brand-focus mt-2 inline-flex h-11 w-full items-center justify-center rounded-lg bg-[var(--color-brand-navy)] text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)]"
        >
          Create your first event
        </button>
      </div>
    </Modal>
  );
}
