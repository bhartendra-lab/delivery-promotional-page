"use client";

import { offerLine } from "@/lib/plans";
import { IconSparkle } from "@/components/ui/icons";
import { useUpgradeModal } from "./UpgradeModalProvider";
import { useAwaitingFirstPayment, useFirstPurchaseOffer } from "./useFirstPurchase";

/**
 * Shown on the dashboard home and the events tab until the studio's first
 * payment: why "Add event" reads "Buy more events", and the first-purchase
 * offer when this studio would get it. Renders nothing once the studio has paid.
 */
export function FirstPurchaseNotice() {
  const awaiting = useAwaitingFirstPayment();
  const { offer } = useFirstPurchaseOffer(awaiting);
  const { openUpgradeModal } = useUpgradeModal();

  if (!awaiting) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--color-brand-navy)]/20 bg-[var(--color-brand-navy-soft)] px-4 py-3 text-sm text-[var(--color-brand-ink)]">
      <IconSparkle size={16} className="shrink-0 text-[var(--color-brand-navy)]" />
      <span className="min-w-0 flex-1">
        {offer ? (
          <>
            <strong className="font-semibold">{offerLine(offer)}</strong> on your first purchase. Buy an event to
            start creating events.
          </>
        ) : (
          "Buy your first event to start creating events."
        )}
      </span>
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
