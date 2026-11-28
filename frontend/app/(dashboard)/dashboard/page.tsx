"use client";

import { useEffect, useState } from "react";
import { isCountBasedPlan } from "@/lib/types";
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

  // `?buy=events` (or `?buy=storage`): opened from a link that means "buy now",
  // e.g. an old /checkout?onboarding=1 link. Opens the purchase modal once and
  // takes the flag off the address, so a reload does not open it again.
  useEffect(() => {
    const buy = new URLSearchParams(window.location.search).get("buy");
    if (buy !== "events" && buy !== "storage") return;
    openUpgradeModal({ preset: buy === "storage" ? "storage" : "event" });
    window.history.replaceState(null, "", window.location.pathname);
  }, [openUpgradeModal]);

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
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-7">
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
            href="/dashboard/settings/google"
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

      {/* One short row: the page name and its one action. The plan's event or
          storage allowance is on the sidebar card (and in the banner above
          when it has run out), so it is not repeated here. */}
      <section className="dash-rise flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold leading-tight text-[var(--color-brand-ink)]">Dashboard</h1>
        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={openCreate}
            className="brand-focus inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--color-brand-navy)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)]"
          >
            <IconPlus />
            Add event
          </button>
          {lowRemaining && <p className="type-meta order-first">{dlpUsage?.remaining} events left</p>}
        </div>
      </section>

      <ThisMonth />
      <NeedsAttention />
      <RecentEvents />

      <AddEventModal open={modalOpen} onClose={() => setModalOpen(false)} />
      <WelcomeDialog />
    </div>
  );
}
