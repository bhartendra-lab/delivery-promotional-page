"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCompany } from "@/lib/useCompany";
import { needsPlan, setCompany, PLAN_STEP_PATH } from "@/lib/auth";
import { markWelcomeDialogSeen } from "@/lib/api";
import { useSubscription } from "@/components/billing/SubscriptionProvider";
import { useFirstPurchaseOffer } from "@/components/billing/useFirstPurchase";
import { isStorageSnapshot } from "@/lib/billing-types";
import type { SubscriptionSnapshot } from "@/lib/billing-types";
import { formatOfferDate, formatStorage, offerLine } from "@/lib/plans";
import { Modal } from "@/components/ui/Modal";
import { IconSparkle } from "@/components/ui/icons";

/**
 * What the studio has to work with, from its plan: "3 free events", "5 events"
 * or "150 GB of storage". Null when the plan can't be read (a member without
 * billing access gets no snapshot), in which case the dialog simply doesn't
 * quote a figure.
 */
function readyToUse(snapshot: SubscriptionSnapshot | null): string | null {
  if (!snapshot) return null;
  if (isStorageSnapshot(snapshot)) {
    return snapshot.storage.limit != null ? `${formatStorage(snapshot.storage.limit)} of storage` : null;
  }
  const remaining = snapshot.remaining;
  if (typeof remaining !== "number" || remaining <= 0) return null;
  const free = snapshot.service?.service_type === "Free" ? "free " : "";
  return `${remaining} ${free}event${remaining === 1 ? "" : "s"}`;
}

/**
 * One-time dialog a studio sees on the dashboard right after onboarding,
 * mounted on the dashboard home (not the layout) so it never fires while
 * deep-linked into an event page.
 *
 * Two versions, decided by whether the studio can create an event yet:
 *  - It can (the Free plan gave it events at signup, or it has already paid):
 *    a "you're all set" note quoting what it has.
 *  - It cannot (no free events, nothing paid): an invitation to buy, with the
 *    first-purchase offer when this studio would get it. "Not now" leaves the
 *    studio on the dashboard, where FirstPurchaseNotice keeps the offer in view.
 */
export function WelcomeDialog() {
  const router = useRouter();
  const company = useCompany();
  const { snapshot } = useSubscription();
  const seenRef = useRef(false);
  const [dismissed, setDismissed] = useState(false);

  const due =
    !!company &&
    company.onboarding_required === true &&
    company.onboarding_completed_at != null &&
    company.welcome_dialog_seen_at == null &&
    !dismissed;
  const unpaid = !!company && needsPlan(company);
  const { offer, ready: offerReady } = useFirstPurchaseOffer(due && unpaid);
  // The buy version waits for the offer to be known, so its wording and button
  // never change in front of the studio.
  const open = due && (!unpaid || offerReady);

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

  function choosePlan() {
    handleClose();
    router.push(PLAN_STEP_PATH);
  }

  if (!open) return null;

  if (unpaid) {
    return (
      <Modal open={open} onClose={handleClose} title="Your studio is ready 🎉" size="sm" dismissOnBackdrop={false}>
        <div className="flex flex-col items-center gap-4 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-brand-navy-soft)] text-[var(--color-brand-navy)]">
            <IconSparkle size={26} />
          </span>
          <p className="text-sm text-[var(--color-brand-muted)]">
            Your studio is verified. Buy your first event to create a gallery, share the QR, and watch the
            deliveries land.
          </p>
          {offer && (
            <div className="w-full rounded-lg bg-[var(--color-brand-navy-soft)] px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-brand-navy)]">
                First purchase offer
              </p>
              <p className="mt-1 text-base font-bold text-[var(--color-brand-ink)]">{offerLine(offer)}</p>
              {offer.valid_until != null && (
                <p className="mt-0.5 text-xs text-[var(--color-brand-muted)]">
                  Valid till {formatOfferDate(offer.valid_until)}
                </p>
              )}
            </div>
          )}
          <div className="mt-2 flex w-full flex-col gap-2">
            <button
              type="button"
              onClick={choosePlan}
              className="brand-focus inline-flex h-11 w-full items-center justify-center rounded-lg bg-[var(--color-brand-navy)] text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)]"
            >
              {offer ? offerLine(offer) : "Buy events"}
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="brand-focus inline-flex h-11 w-full items-center justify-center rounded-lg border border-[var(--color-brand-border)] text-sm font-semibold text-[var(--color-brand-ink)] transition-colors hover:bg-[var(--color-brand-hover)]"
            >
              Not now
            </button>
          </div>
          <p className="text-xs text-[var(--color-brand-muted)]">
            You can look around and finish your profile first. Events can be created after your first purchase.
          </p>
        </div>
      </Modal>
    );
  }

  const ready = readyToUse(snapshot);
  const onFreePlan = snapshot?.service?.service_type === "Free";

  return (
    <Modal open={open} onClose={handleClose} title="You're all set 🎉" size="sm" dismissOnBackdrop={false}>
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-brand-navy-soft)] text-[var(--color-brand-navy)]">
          <IconSparkle size={26} />
        </span>
        <p className="text-sm text-[var(--color-brand-muted)]">
          {onFreePlan ? "Your studio is verified." : "Your studio is verified and your plan is active."}{" "}
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
