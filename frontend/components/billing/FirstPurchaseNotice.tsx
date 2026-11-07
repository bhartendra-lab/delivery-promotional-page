"use client";

import { useState } from "react";
import { IconCheck, IconCopy, IconSparkle } from "@/components/ui/icons";
import { useUpgradeModal } from "./UpgradeModalProvider";
import { useAwaitingFirstPayment, useShowcasedEventCoupon } from "./useFirstPurchase";

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

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--color-brand-navy)]/20 bg-[var(--color-brand-navy-soft)] px-4 py-3 text-sm text-[var(--color-brand-ink)]">
      <IconSparkle size={16} className="shrink-0 text-[var(--color-brand-navy)]" />
      <span className="min-w-0 flex-1">
        {coupon ? (
          <>
            <strong className="font-semibold">{coupon.headline}</strong>. Buy an event to start creating events.
          </>
        ) : (
          "Buy your first event to start creating events."
        )}
      </span>
      {coupon && <CopyCouponCode code={coupon.code} />}
      <button
        type="button"
        onClick={() => openUpgradeModal({ preset: "event" })}
        className="brand-focus shrink-0 rounded-lg bg-[var(--color-brand-navy)] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)]"
      >
        Buy events
      </button>
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
      className="brand-focus inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-3 py-1.5 text-[var(--color-brand-navy-deep)] ring-1 ring-[var(--color-brand-navy)]/20 transition-colors hover:bg-[var(--color-brand-hover)]"
    >
      <span className="font-mono text-xs font-bold tracking-[0.12em]">{code}</span>
      <span className="flex items-center gap-1 text-xs font-semibold" aria-live="polite">
        {copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
        {copied ? "Copied" : "Copy"}
      </span>
    </button>
  );
}
