// lib/offer-urgency.ts — how an exclusive offer's validity is worded. PURE.
// The end date comes from the API (valid_until); nothing here is a figure of
// its own. No dashes in user-facing copy.

import { formatOfferDate } from "./plans.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Days left, counting today: 1 on the last day, 0 once it has ended. */
export function offerDaysLeft(validUntil: number, now: number): number {
  if (validUntil < now) return 0;
  return Math.max(1, Math.ceil((validUntil - now) / DAY_MS));
}

/**
 * The exclusive offer's validity, as two parts: the urgent one ("Only 5 days
 * left") and the date ("Ends 13 Dec 2026"). Null without an end date.
 */
export function exclusiveValidity(validUntil: number | null | undefined, now: number): { urgency: string; ends: string } | null {
  if (validUntil == null) return null;
  const days = offerDaysLeft(validUntil, now);
  const ends = `Ends ${formatOfferDate(validUntil)}`;
  if (days <= 1) return { urgency: "Last day today", ends };
  if (days <= 31) return { urgency: `Only ${days} days left`, ends };
  return { urgency: "Limited time", ends };
}
