"use client";

import { useState } from "react";
import { IconCheck, IconCopy, IconSparkle } from "@/components/ui/icons";
import { useUpgradeModal } from "./UpgradeModalProvider";
import { useAwaitingFirstPayment, useShowcasedEventCoupon } from "./useFirstPurchase";
import { isFreeFirstEventOffer } from "@/lib/checkout-summary";

/**
 * Shown on the dashboard home and the events tab until the studio's first
 * payment: that events have to be bought first, and the coupon Vyavasth
 * showcases for event purchases, when there is one. Renders nothing once the
 * studio has paid.
 */
export function FirstPurchaseNotice() {
  const awaiting = useAwaitingFirstPayment();
  const { coupon } = useShowcasedEventCoupon(awaiting);
  const { openUpgradeModal } = useUpgradeModal();

  if (!awaiting) return null;
  // While the first event is free, ClaimFreeEventCard is the one card shown.
  if (isFreeFirstEventOffer(coupon)) return null;

  // The headline is written in the database ("Your first event, free!"): add
  // a full stop only when it has no closing punctuation of its own.
  const headline = coupon?.headline?.trim() ?? "";
  const headlineText = headline && !/[.!?]$/.test(headline) ? `${headline}.` : headline;

  // Phones: the words get the full width on their own row, and the code and
  // the button share the row under them. From sm up, one row.
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[var(--color-brand-navy)]/20 bg-[var(--color-brand-navy-soft)] p-4 text-sm text-[var(--color-brand-ink)] sm:flex-row sm:items-center sm:gap-4 sm:px-4 sm:py-3">
      <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/70 text-[var(--color-brand-navy)] ring-1 ring-[var(--color-brand-navy)]/15">
          <IconSparkle size={16} />
        </span>
        <p className="min-w-0 leading-snug">
          {coupon ? (
            <>
              <strong className="block font-semibold sm:inline">{headlineText}</strong>{" "}
              <span className="text-[var(--color-brand-body)]">Buy an event to start creating events.</span>
            </>
          ) : (
            "Buy your first event to start creating events."
          )}
        </p>
      </div>
      <div className="flex items-center gap-2 sm:shrink-0">
        {coupon && <CopyCouponCode code={coupon.code} />}
        <button
          type="button"
          onClick={() => openUpgradeModal({ preset: "event" })}
          className="brand-focus inline-flex h-9 flex-1 items-center justify-center whitespace-nowrap rounded-full bg-[var(--color-brand-navy)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)] sm:flex-none"
        >
          Buy events
        </button>
      </div>
    </div>
  );
}

/** A coupon code the studio taps to copy. Shared with the welcome dialog. */
export function CopyCouponCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard
      ?.writeText(code)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      })
      .catch(() => {});
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? `Copied ${code}` : `Copy code ${code}`}
      className="brand-focus inline-flex h-9 shrink-0 items-center gap-2 rounded-full bg-white px-3 text-[var(--color-brand-navy-deep)] ring-1 ring-[var(--color-brand-navy)]/20 transition-colors hover:bg-[var(--color-brand-hover)]"
    >
      <span className="font-mono text-xs font-bold tracking-[0.12em]">{code}</span>
      <span className="flex items-center gap-1 text-xs font-semibold" aria-live="polite">
        {copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
        {copied ? "Copied" : "Copy"}
      </span>
    </button>
  );
}
