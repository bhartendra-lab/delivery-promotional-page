"use client";

import { useEffect, useState } from "react";
import { getBillingPlans } from "@/lib/billing";
import { eventPlanOf, type Plan } from "@/lib/plans";

/** One request for the whole session: the catalog only changes when we edit it. */
let cached: Promise<Plan | null> | null = null;

function loadEventPlan(): Promise<Plan | null> {
  if (!cached) {
    cached = getBillingPlans()
      .then((res) => eventPlanOf(res.plans))
      .catch(() => {
        // Don't remember a failure: the next caller should try again.
        cached = null;
        return null;
      });
  }
  return cached;
}

/**
 * The pay-per-event plan: where the photo-cap terms and the first-purchase
 * offer live, and the `service_id` a capacity purchase is made against. Null
 * until it loads (and if the request fails).
 */
export function useEventPlan(enabled = true): Plan | null {
  const [plan, setPlan] = useState<Plan | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void loadEventPlan().then((p) => {
      if (!cancelled) setPlan(p);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return plan;
}
