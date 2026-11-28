"use client";

import { IconArrowRight, IconSparkle } from "@/components/ui/icons";
import { isFreeFirstEventOffer } from "@/lib/checkout-summary";
import { useAwaitingFirstPayment, useShowcasedEventCoupon } from "./useFirstPurchase";

/**
 * The first thing a new Studio sees on the dashboard while the first event
 * is free (the exclusive offer at 100% off, FIRSTONUS): one card, one button.
 * "Claim my free event" opens Add event as the celebration sheet
 * (AddEventModal `celebrate`), where the event is created for free.
 *
 * Renders nothing once the Studio has paid, or when no free-event offer is
 * on; FirstPurchaseNotice covers every other unpaid case.
 */
export function ClaimFreeEventCard({ onClaim }: { onClaim: () => void }) {
  const awaiting = useAwaitingFirstPayment();
  const { coupon } = useShowcasedEventCoupon(awaiting);
  if (!awaiting || !isFreeFirstEventOffer(coupon)) return null;

  return (
    <section
      aria-label="Your free first event"
      className="dash-rise relative overflow-hidden rounded-2xl bg-[linear-gradient(125deg,#2b140d_0%,#5a2416_40%,#9b482e_75%,#c25a3a_100%)] px-5 py-6 text-white shadow-[0_18px_40px_-18px_rgba(43,20,13,0.7)] sm:px-8 sm:py-8"
    >
      <span aria-hidden className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-[radial-gradient(closest-side,rgba(255,227,163,0.5),transparent)] exclusive-pulse" />
      <span aria-hidden className="exclusive-twinkle pointer-events-none absolute right-8 top-6 text-[#f6c66a]">✦</span>
      <span aria-hidden className="exclusive-twinkle pointer-events-none absolute bottom-6 right-24 text-xs text-[#f6c66a] [animation-delay:1.1s]">✦</span>

      <span className="relative inline-flex items-center gap-1.5 rounded-full bg-[linear-gradient(180deg,#ffe3a3,#f6c66a_55%,#d99a2b)] px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#2b140d]">
        <IconSparkle size={12} />
        Exclusive
      </span>
      <h2 className="relative mt-3 font-[family-name:var(--font-display,inherit)] text-[28px] font-bold leading-[1.1] sm:text-4xl">
        {coupon?.headline || "Your first event, free"}
      </h2>
      <p className="relative mt-2 max-w-md text-sm leading-relaxed text-white/80 sm:text-[15px]">
        {coupon?.subline || "Create your first gallery now. No payment needed."}
      </p>
      <button
        type="button"
        onClick={onClaim}
        className="brand-focus relative mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white px-6 text-[15px] font-extrabold text-[#2b140d] shadow-[0_10px_26px_rgba(246,198,106,0.35)] transition-transform hover:-translate-y-0.5 sm:w-auto"
      >
        {coupon?.cta_label || "Claim my free event"}
        <IconArrowRight size={16} />
      </button>
    </section>
  );
}
