"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getMyReferrals } from "@/lib/api";
import type { MyReferrals } from "@/lib/referral";
import { REFERRALS_PATH } from "@/lib/notifications";
import { referralInviteCopy, referralOfferOf, type ReferralOffer } from "@/lib/event-pay";
import { IconGift } from "@/components/ui/icons";

/**
 * The studio's referral standing for the Add event modal, fetched once per
 * open. `offer` is null until it loads, and stays null when there is nothing
 * to invite with (see referralOfferOf). `me` is kept for the referee coupon.
 * A failed fetch only hides the invitation: it never blocks creating an event.
 */
export function useReferralStanding(enabled: boolean): { me: MyReferrals | null; offer: ReferralOffer | null; loaded: boolean } {
  const [me, setMe] = useState<MyReferrals | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    getMyReferrals()
      .then((res) => {
        if (!cancelled) setMe(res);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { me, offer: referralOfferOf(me), loaded };
}

/**
 * Beside "Continue to pay" on a pay per event plan: the studio is about to pay
 * for an event, so the cheaper way is offered right there. Opens Settings >
 * Refer a Studio.
 */
export function ReferralPayNudge({ offer, onNavigate }: { offer: ReferralOffer; onNavigate: () => void }) {
  const copy = referralInviteCopy(offer);
  return (
    <Link
      href={REFERRALS_PATH}
      onClick={onNavigate}
      className="group brand-focus inline-flex min-h-11 items-center gap-2.5 rounded-lg border border-[var(--color-brand-warning)]/35 bg-[var(--color-brand-warning-soft)] px-3 py-1.5 text-left transition-colors hover:border-[var(--color-brand-warning)]/60"
    >
      <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-[var(--color-brand-warning)] shadow-sm">
        <span aria-hidden className="fx-ring-ping absolute inset-0 rounded-full bg-[var(--color-brand-warning)]/25" />
        <IconGift size={15} className="relative" />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-[12.5px] font-semibold text-[var(--color-brand-ink)]">{copy.short}</span>
        <span className="text-[11.5px] font-medium text-[var(--color-brand-muted)] group-hover:text-[var(--color-brand-ink)]">
          {copy.cta} <span aria-hidden>→</span>
        </span>
      </span>
    </Link>
  );
}

/**
 * On a storage plan: a warm card in the Add event modal inviting the studio to
 * refer, with the days its plan would gain. Opens Settings > Refer a Studio.
 */
export function ReferralAdCard({ offer, onNavigate }: { offer: ReferralOffer; onNavigate: () => void }) {
  const copy = referralInviteCopy(offer);
  return (
    <aside
      aria-label="Refer a studio"
      className="fx-rise relative overflow-hidden rounded-xl border border-[var(--color-brand-warning)]/30 bg-gradient-to-br from-[var(--color-brand-warning-soft)] via-white to-[var(--color-brand-navy-soft)] p-4"
    >
      <span
        aria-hidden
        className="fx-glow-pulse pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-[var(--color-brand-warning)]/20 blur-2xl"
      />
      <div className="relative flex items-start gap-3.5">
        <span className="fx-float flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-[var(--color-brand-warning)] shadow-sm">
          <IconGift size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-brand-warning)]">Refer and earn</p>
          <p className="mt-0.5 text-[15px] font-bold leading-snug text-[var(--color-brand-ink)]">{copy.title}</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--color-brand-muted)]">{copy.body}</p>
          <Link
            href={REFERRALS_PATH}
            onClick={onNavigate}
            className="brand-focus mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--color-brand-navy)] px-3.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)]"
          >
            {copy.cta} <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </aside>
  );
}
