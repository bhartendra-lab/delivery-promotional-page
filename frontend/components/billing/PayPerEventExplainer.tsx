"use client";

import { useEffect, useState } from "react";
import { getBillingPlans } from "@/lib/billing";
import { isStorageSnapshot } from "@/lib/billing-types";
import type { SubscriptionSnapshot } from "@/lib/billing-types";
import { eventPlanOf, firstPurchaseOfferOf, offerLine } from "@/lib/plans";
import type { Plan } from "@/lib/plans";
import { PhotoLimitTermsLink } from "./PhotoLimitTerms";

/**
 * "How pay per event works", on Plan & Billing for a studio on the
 * pay-per-event (or legacy Free) plan. Never rendered for a storage-plan
 * studio, which has no events to buy and no photo limit.
 *
 * The offer line follows the same two conditions as everywhere else: the offer
 * is live, and the API says this studio would get it.
 */
export function PayPerEventExplainer({ snapshot }: { snapshot: SubscriptionSnapshot | null }) {
  const countBased = !!snapshot && !isStorageSnapshot(snapshot);
  const [eventPlan, setEventPlan] = useState<Plan | null>(null);

  useEffect(() => {
    if (!countBased) return;
    let cancelled = false;
    getBillingPlans()
      .then((res) => {
        if (!cancelled) setEventPlan(eventPlanOf(res.plans));
      })
      .catch(() => {
        /* The block still reads correctly without the plan: the terms fall back to their defaults. */
      });
    return () => {
      cancelled = true;
    };
  }, [countBased]);

  if (!countBased) return null;

  const liveOffer = firstPurchaseOfferOf(eventPlan);
  const offer = liveOffer && snapshot.first_purchase_offer_eligible === true ? liveOffer : null;

  return (
    <div className="mt-5 rounded-lg bg-[var(--color-brand-bg)] px-4 py-3.5">
      <p className="text-sm font-semibold text-[var(--color-brand-ink)]">How pay per event works</p>
      <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-[var(--color-brand-muted)]">
        <li>Buy events as you need them. Each event stays live for 3 months.</li>
        <li>
          Upload unlimited photos. <PhotoLimitTermsLink eventPlan={eventPlan} showOffer={Boolean(offer)} />
        </li>
        {offer && <li>First purchase offer: {offerLine(offer).toLowerCase()}.</li>}
      </ul>
    </div>
  );
}
