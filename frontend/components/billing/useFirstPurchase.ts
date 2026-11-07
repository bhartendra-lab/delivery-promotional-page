"use client";

import { useEffect, useState } from "react";
import { needsPlan } from "@/lib/auth";
import { useCompany } from "@/lib/useCompany";
import { getPublicCoupons } from "@/lib/billing";
import type { PublicCoupon } from "@/lib/billing";
import { useChrome } from "@/components/dashboard/ChromeContext";

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
 * The first coupon Vyavasth showcases for event purchases ("Your first event is
 * on us", with its code), for a studio that has not paid yet. `ready` is false
 * until the public list has answered, so a caller that must not change its
 * wording after it appears (the welcome dialog) can wait for it.
 *
 * Nothing is kept here: the coupon, its headline and its code come from
 * GET /billing/coupons/public, asked again each time a page that shows it
 * opens, so a change in the database is on screen at the next page. Whether
 * this studio may use it is checkout's to say ("Offers for you" there only
 * lists coupons it can use); callers show this only while it has not paid.
 */
export function useShowcasedEventCoupon(enabled = true): { coupon: PublicCoupon | null; ready: boolean } {
  const [coupon, setCoupon] = useState<PublicCoupon | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    getPublicCoupons()
      .then((res) => {
        if (!cancelled) setCoupon(res.coupons.find((c) => c.audience === "event" && c.headline) ?? null);
      })
      .catch(() => {
        /* No coupon: the caller falls back to its plain wording. */
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { coupon, ready: loaded };
}
