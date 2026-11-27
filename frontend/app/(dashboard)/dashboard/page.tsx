"use client";

import { useState } from "react";
import type { DlpUsage } from "@/lib/types";
import { isCountBasedPlan, isStorageBasedPlan, getUsageSeverity } from "@/lib/types";
import { useCompany } from "@/lib/useCompany";
import { useChrome } from "@/components/dashboard/ChromeContext";
import { AddEventModal } from "@/components/dashboard/AddEventModal";
import { NeedsAttention } from "@/components/dashboard/home/NeedsAttention";
import { ThisMonth } from "@/components/dashboard/home/ThisMonth";
import { RecentEvents } from "@/components/dashboard/home/RecentEvents";
import { useUpgradeModal } from "@/components/billing/UpgradeModalProvider";
import { WelcomeDialog } from "@/components/onboarding/WelcomeDialog";
import { FirstPurchaseNotice } from "@/components/billing/FirstPurchaseNotice";
import { useAwaitingFirstPayment } from "@/components/billing/useFirstPurchase";
import { IconPlus, IconX, IconWarningCircle, IconGlobe } from "@/components/ui/icons";

/**
 * Dashboard: what needs me today, and how is my studio doing. Three blocks (This
 * month, Needs attention, Recent events), each with its own request, skeleton and
 * error, so a slow or failed one never holds up the others. Managing every event
 * (filters, sort, search, pages, exports) is the Events page.
 */
export default function DashboardHomePage() {
  // Events meter / usage shared via ChromeContext: single fetch for the whole
  // dashboard (Sidebar meter + header pill read the same value).
  const { dlpUsage, dlpLoading } = useChrome();
  const { openUpgradeModal } = useUpgradeModal();
  const company = useCompany();
  const awaitingFirstPayment = useAwaitingFirstPayment();
  // Session-only (not localStorage): the nudge should come back next visit
  // until the studio actually links a Google listing.
  const [gmbNudgeDismissed, setGmbNudgeDismissed] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  // With no events left this still opens Add event: the studio fills it in and
  // pays for this one event from there ("Continue to pay").
  const openCreate = () => setModalOpen(true);

  // Event creation is only ever gated on count-based plans (Free/Event-based)
  // when the event allowance is used up. Storage plans (Monthly/Yearly) can
  // always create events; only uploads are gated (in the upload modal).
  const createBlocked = isCountBasedPlan(dlpUsage?.service_type) && dlpUsage?.remaining === 0;
  const lowRemaining =
    isCountBasedPlan(dlpUsage?.service_type) && dlpUsage?.remaining != null && dlpUsage.remaining > 0 && dlpUsage.remaining <= 2;

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6 sm:py-10">
      {company?.gmb_skipped === true && !company?.google_place_id && !gmbNudgeDismissed && (
        <div className="flex items-start gap-3 rounded-xl border border-[var(--color-brand-border)] bg-[var(--color-brand-surface-raised)] px-4 py-3">
          <IconGlobe className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-brand-muted)]" />
          <div className="flex-1 text-sm">
            <p className="font-semibold text-[var(--color-brand-ink)]">Add your Google listing to collect reviews.</p>
            <p className="mt-0.5 text-xs text-[var(--color-brand-muted)]">
              Clients can leave a review straight from their gallery once it&apos;s linked.
            </p>
          </div>
          <a
            href="/dashboard/settings"
            className="brand-focus shrink-0 text-sm font-semibold text-[var(--color-brand-navy)] underline-offset-2 hover:underline"
          >
            Add it now
          </a>
          <button
            type="button"
            onClick={() => setGmbNudgeDismissed(true)}
            aria-label="Dismiss"
            className="brand-focus flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[var(--color-brand-muted)] hover:bg-[var(--color-brand-border)] hover:text-[var(--color-brand-ink)]"
          >
            <IconX size={13} />
          </button>
        </div>
      )}

      {/* Before the first payment the studio has not run out of anything: it is
          told about its first purchase instead of a used-up limit. */}
      <FirstPurchaseNotice />

      {/* Limit exhausted disclaimer (count-based plans only) */}
      {!dlpLoading && createBlocked && !awaitingFirstPayment && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-[var(--color-brand-danger)]/30 bg-[var(--color-brand-danger-soft)] px-4 py-3 text-sm text-[var(--color-brand-danger)]"
        >
          <IconWarningCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">
            You&apos;ve reached the maximum number of events for your current plan.
          </span>
          <button
            type="button"
            onClick={() => openUpgradeModal({ preset: "event" })}
            className="brand-focus shrink-0 rounded-lg border border-current px-3 py-1 text-xs font-semibold"
          >
            Buy more events
          </button>
        </div>
      )}

      <section className="dash-rise flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold leading-tight text-[var(--color-brand-ink)]">Dashboard</h1>
          <p className="type-body mt-1.5 max-w-lg">What needs you today, and how your studio is doing.</p>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
          <button
            type="button"
            onClick={openCreate}
            className="brand-focus inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--color-brand-navy)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)]"
          >
            <IconPlus />
            Add event
          </button>
          {lowRemaining && <p className="type-meta">{dlpUsage?.remaining} events left</p>}
          <UsagePill usage={dlpUsage} loading={dlpLoading} />
        </div>
      </section>

      <ThisMonth />
      <NeedsAttention />
      <RecentEvents onCreate={openCreate} />

      <AddEventModal open={modalOpen} onClose={() => setModalOpen(false)} />
      <WelcomeDialog />
    </div>
  );
}

function UsagePill({ usage, loading }: { usage: DlpUsage | null; loading: boolean }) {
  if (loading) {
    return <div className="skeleton h-5 w-24 rounded-full" />;
  }
  if (!usage) return null;

  // Count-based plans (Free / Event-based): "{remaining} remaining" (events).
  if (isCountBasedPlan(usage.service_type)) {
    const remaining = usage.remaining ?? 0;
    const isExhausted = remaining === 0;
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold"
        style={
          isExhausted
            ? { color: "var(--color-brand-danger)", background: "var(--color-brand-danger-soft)" }
            : { color: "var(--color-brand-navy)", background: "var(--color-brand-navy-soft)" }
        }
      >
        {isExhausted ? <IconWarningCircle size={12} /> : <CountDot />}
        {remaining} remaining
      </span>
    );
  }

  // Storage-based plans (Monthly / Yearly): "{used}/{limit} GB" with the shared
  // green → orange → red severity. Never framed as "exhausted" — event creation
  // isn't gated here.
  if (isStorageBasedPlan(usage.service_type) && typeof usage.limit === "number") {
    const limit = usage.limit;
    const pct = limit > 0 ? Math.min((usage.used / limit) * 100, 100) : 0;
    const severity = getUsageSeverity(pct);
    const palette =
      severity === "danger"
        ? { color: "var(--color-brand-danger)", background: "var(--color-brand-danger-soft)" }
        : severity === "warning"
          ? { color: "var(--color-brand-warning)", background: "var(--color-brand-warning-soft)" }
          : { color: "var(--color-brand-success)", background: "var(--color-brand-success-soft)" };
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums"
        style={palette}
      >
        <CountDot />
        {usage.used.toFixed(1)} / {limit.toFixed(1)} GB
      </span>
    );
  }

  // Malformed/absent subscription (no plan type or missing limit): bare count.
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={{ color: "var(--color-brand-muted)", background: "var(--color-brand-track)" }}
    >
      <CountDot />
      {usage.used} this month
    </span>
  );
}

function CountDot() {
  return <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />;
}
