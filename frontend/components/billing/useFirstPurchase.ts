"use client";

import { useEffect, useState } from "react";
import { needsPlan } from "@/lib/auth";
import { useCompany } from "@/lib/useCompany";
import { getBillingPlans } from "@/lib/billing";
import { eventPlanOf, firstPurchaseOfferOf, type FirstPurchaseOffer } from "@/lib/plans";
import { useChrome } from "@/components/dashboard/ChromeContext";
import { useSubscription } from "./SubscriptionProvider";

/**
 * True while the studio has not made its first payment: it can use the
 * dashboard but cannot create an event.
 *
 * The cached company decides, and the usage meter can overrule it. A payment
 * made in the upgrade modal re-reads the meter at once, while the cached
 * company only catches up on the next navigation; without the meter the
 * first-purchase notice would stay on screen over a plan that is already paid.
 */
export function useAwaitingFirstPayment(): boolean {
  const company = useCompany();
  const { dlpUsage } = useChrome();
  if (!company || !needsPlan(company)) return false;
  if (dlpUsage && !(dlpUsage.service_type === "Free" && dlpUsage.limit === 0)) return false;
  return true;
}

/**
 * The first-purchase offer as this studio would get it. `ready` is false until
 * the plan and the subscription have both answered, so a caller that must not
 * change its wording after it appears (the welcome dialog) can wait for it.
 *
 * `offer` follows the two conditions used everywhere else: the offer is live,
 * and the API says this studio would get it. A member without billing access
 * has no subscription snapshot and so is never shown the offer.
 *
 * Nothing about the offer is kept here: the bonus and its end date come from
 * the Event-based Service through the plans API, which sends no offer at all
 * once it is switched off or outside its dates. The plans are asked for again
 * each time a page that shows the offer opens (not useEventPlan's one request
 * per session), so a change made in the database is on screen at the next
 * page the studio opens.
 */
export function useFirstPurchaseOffer(enabled = true): { offer: FirstPurchaseOffer | null; ready: boolean } {
  const { snapshot, loading } = useSubscription();
  const [liveOffer, setLiveOffer] = useState<FirstPurchaseOffer | null>(null);
  const [planLoaded, setPlanLoaded] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    getBillingPlans()
      .then((res) => {
        if (!cancelled) setLiveOffer(firstPurchaseOfferOf(eventPlanOf(res.plans)));
      })
      .catch(() => {
        /* No plans, no offer: the caller falls back to its plain wording. */
      })
      .finally(() => {
        if (!cancelled) setPlanLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return {
    offer: liveOffer && snapshot?.first_purchase_offer_eligible === true ? liveOffer : null,
    ready: planLoaded && !loading,
  };
}
