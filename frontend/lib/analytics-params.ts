/**
 * The parameter values the dashboard's GA4 events send, as pure functions so
 * they can be tested. NOTHING here (or in any trackEvent call) may carry
 * personal data: no names, phones, emails, event or couple names. Only fixed
 * words and buckets.
 */

/** How many photos, as a bucket (never the exact count). */
export function photoCountBucket(count: number): string {
  const n = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  if (n <= 50) return "1-50";
  if (n <= 200) return "51-200";
  if (n <= 500) return "201-500";
  if (n <= 1000) return "501-1000";
  if (n <= 2000) return "1001-2000";
  return "2000+";
}

/** The plan an event was created under, as a fixed word. */
export function planKindOf(serviceType: string | null | undefined): "free" | "event_based" | "monthly" | "yearly" | "unknown" {
  switch (serviceType) {
    case "Free":
      return "free";
    case "Event-based":
      return "event_based";
    case "Monthly":
      return "monthly";
    case "Yearly":
      return "yearly";
    default:
      return "unknown";
  }
}

/** The upload quality tier as a fixed word. */
export function uploadTierWord(variant: string): "hd" | "4k" | "original" {
  return variant === "4096" ? "4k" : variant === "original" ? "original" : "hd";
}
