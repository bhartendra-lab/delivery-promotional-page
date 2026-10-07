"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { payPerEventTerms, type Plan } from "@/lib/plans";

/**
 * The pay-per-event terms behind every "T&C apply" in the app: the plan
 * chooser, Plan & Billing, and the upload dialog's photo-limit panel.
 *
 * Every figure comes from the Event-based plan (lib/plans#payPerEventTerms,
 * the same text the pricing page renders). `showOffer` is false for a studio
 * that cannot get the first-purchase offer, so it is never told about one.
 */
export function PhotoLimitTerms({
  open,
  onClose,
  eventPlan,
  showOffer = false,
}: {
  open: boolean;
  onClose: () => void;
  eventPlan: Plan | null | undefined;
  showOffer?: boolean;
}) {
  const lines = payPerEventTerms(eventPlan, { includeOffer: showOffer });
  return (
    <Modal open={open} onClose={onClose} title="Pay per event: terms" size="md">
      <ul className="flex list-disc flex-col gap-2.5 pl-5 text-sm leading-relaxed text-[var(--color-brand-ink)] marker:text-[var(--color-brand-muted)]">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </Modal>
  );
}

/**
 * A small "T&C apply" text button that opens the terms. Owns its own open
 * state, so a caller only has to place it. `onOpenChange` lets a host dialog
 * with its own Escape handling (the upload dialog) stand down while it is up.
 */
export function PhotoLimitTermsLink({
  eventPlan,
  showOffer = false,
  label = "T&C apply",
  className = "",
  onOpenChange,
}: {
  eventPlan: Plan | null | undefined;
  showOffer?: boolean;
  label?: string;
  className?: string;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const set = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          // Often sits inside a clickable card or row.
          e.stopPropagation();
          set(true);
        }}
        className={`brand-focus rounded-sm text-xs font-medium text-[var(--color-brand-navy)] underline underline-offset-2 hover:text-[var(--color-brand-navy-deep)] ${className}`}
      >
        {label}
      </button>
      <PhotoLimitTerms open={open} onClose={() => set(false)} eventPlan={eventPlan} showOffer={showOffer} />
    </>
  );
}
