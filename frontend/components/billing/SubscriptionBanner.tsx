"use client";

import Link from "next/link";
import { IconWarningCircle } from "@/components/ui/icons";
import type { SubscriptionSnapshot } from "@/lib/billing-types";
import { subscriptionBannerContent, type BannerTone } from "@/lib/subscription-status";

const TONE_CLASSES: Record<BannerTone, string> = {
  neutral: "border-[var(--color-brand-border)] bg-[var(--color-brand-surface-raised)] text-[var(--color-brand-ink)]",
  warning: "border-[var(--color-brand-warning)]/30 bg-[var(--color-brand-warning-soft)] text-[var(--color-brand-warning)]",
  danger: "border-[var(--color-brand-danger)]/30 bg-[var(--color-brand-danger-soft)] text-[var(--color-brand-danger)]",
};

export function SubscriptionBanner({
  snapshot,
  scope,
  className,
}: {
  snapshot: SubscriptionSnapshot | null;
  scope: "app" | "settings";
  /** Outer gutter/spacing, e.g. the page padding a call site outside a
   *  padded container needs. Omit when the call site already provides its
   *  own padding (like the settings page column) to avoid doubling up. */
  className?: string;
}) {
  const content = subscriptionBannerContent(snapshot);
  if (!content) return null;
  // "app" scope also covers everything "settings"-only would show, since the
  // settings page renders both; an "app"-scope banner rendered elsewhere only
  // shows entries tagged scope:"app".
  if (scope === "app" && content.scope !== "app") return null;

  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 text-sm ${TONE_CLASSES[content.tone]} ${className ?? ""}`}
      role={content.tone === "danger" ? "alert" : undefined}
    >
      <IconWarningCircle size={16} className="shrink-0" />
      <span className="flex-1">{content.message}</span>
      <Link
        href="/dashboard/settings/billing"
        className="brand-focus shrink-0 rounded-lg border border-current px-3 py-1.5 text-xs font-semibold"
      >
        {content.ctaLabel}
      </Link>
    </div>
  );
}
