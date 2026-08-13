"use client";

import Link from "next/link";
import { IconWarningCircle } from "@/components/ui/icons";
import type { SubscriptionSnapshot } from "@/lib/billing-types";

const formatDate = (ms: number) =>
  new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(ms));

type Tone = "neutral" | "warning" | "danger";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "border-[var(--color-brand-border)] bg-[var(--color-brand-surface-raised)] text-[var(--color-brand-ink)]",
  warning: "border-[var(--color-brand-warning)]/30 bg-[var(--color-brand-warning-soft)] text-[var(--color-brand-warning)]",
  danger: "border-[var(--color-brand-danger)]/30 bg-[var(--color-brand-danger-soft)] text-[var(--color-brand-danger)]",
};

type BannerContent = {
  tone: Tone;
  message: string;
  ctaLabel: string;
  /** "app" banners render everywhere (via <SubscriptionBanner scope="app" />); "settings" only within billing settings. */
  scope: "app" | "settings";
};

function contentFor(snapshot: SubscriptionSnapshot | null): BannerContent | null {
  if (!snapshot) return null;

  switch (snapshot.status) {
    case "active":
      if (snapshot.cancel_at_period_end && snapshot.current_period_end) {
        return {
          tone: "warning",
          message: `Auto-renew is off. You have access until ${formatDate(snapshot.current_period_end)}.`,
          ctaLabel: "Turn auto-renew back on",
          scope: "settings",
        };
      }
      return null;
    case "pending_payment":
      return {
        tone: "neutral",
        message: "A payment is being confirmed. This usually takes a few seconds.",
        ctaLabel: "Check status",
        scope: "settings",
      };
    case "past_due": {
      const graceLine = snapshot.grace_until
        ? `We'll keep retrying until ${formatDate(snapshot.grace_until)}`
        : "We'll keep retrying over the next few days";
      return {
        tone: "warning",
        message: `We couldn't take your renewal payment. ${graceLine} — update your payment method to avoid interruption.`,
        ctaLabel: "Fix payment",
        scope: "app",
      };
    }
    case "suspended": {
      const deleteLine = snapshot.delete_at
        ? `permanently deleted on ${formatDate(snapshot.delete_at)}`
        : "permanently deleted soon";
      return {
        tone: "danger",
        message: `Your studio is read-only. All galleries are archived and will be ${deleteLine}. Renew now to restore everything.`,
        ctaLabel: "Renew now",
        scope: "app",
      };
    }
    case "cancelled": {
      const dateLine = snapshot.current_period_end ? ` on ${formatDate(snapshot.current_period_end)}` : "";
      return {
        tone: "warning",
        message: `Your plan ends${dateLine}. After that your galleries are archived and deleted 7 days later.`,
        ctaLabel: "Turn auto-renew back on",
        scope: "app",
      };
    }
    case "expired":
      return {
        tone: "danger",
        message: "Your subscription has ended. Choose a plan to start again.",
        ctaLabel: "Choose a plan",
        scope: "app",
      };
    default:
      return null;
  }
}

export function SubscriptionBanner({
  snapshot,
  scope,
}: {
  snapshot: SubscriptionSnapshot | null;
  scope: "app" | "settings";
}) {
  const content = contentFor(snapshot);
  if (!content) return null;
  // "app" scope also covers everything "settings"-only would show, since the
  // settings page renders both; an "app"-scope banner rendered elsewhere only
  // shows entries tagged scope:"app".
  if (scope === "app" && content.scope !== "app") return null;

  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 text-sm ${TONE_CLASSES[content.tone]}`}
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
