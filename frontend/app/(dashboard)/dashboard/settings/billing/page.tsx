"use client";

import { useEffect, useState } from "react";
import { SectionHeading, Card, FetchError } from "../SettingsUI";
import { IconCreditCard, IconReceipt } from "@/components/ui/icons";
import { useSubscription } from "@/components/billing/SubscriptionProvider";
import { useUpgradeModal } from "@/components/billing/UpgradeModalProvider";
import { SubscriptionBanner } from "@/components/billing/SubscriptionBanner";
import { PlanStatusCard } from "@/components/billing/PlanStatusCard";
import { UsageMeter } from "@/components/billing/UsageMeter";
import { InvoiceList } from "@/components/billing/InvoiceList";
import { ConfirmingPayment } from "@/components/billing/ConfirmingPayment";
import { listInvoices, cancelSubscription, resumeSubscription, ApiError } from "@/lib/billing";
import type { Invoice } from "@/lib/billing-types";
import { isStorageBasedPlan } from "@/lib/types";
import { BillingDetailsCard } from "./BillingDetailsCard";

const formatDate = (ms: number) =>
  new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(ms));

export default function BillingSettingsPage() {
  const { snapshot, loading, hasBillingAccess, refresh } = useSubscription();
  const { openUpgradeModal } = useUpgradeModal();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [invoicesError, setInvoicesError] = useState<string | null>(null);

  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [autoRenewBusy, setAutoRenewBusy] = useState(false);
  const [autoRenewError, setAutoRenewError] = useState<string | null>(null);
  const [resumeFlow, setResumeFlow] = useState<"idle" | "confirming">("idle");

  useEffect(() => {
    if (!hasBillingAccess) return;
    listInvoices()
      .then((res) => setInvoices(res.invoices))
      .catch((err) => setInvoicesError(err instanceof Error ? err.message : "Couldn't load invoices."))
      .finally(() => setInvoicesLoading(false));
  }, [hasBillingAccess]);

  // §7.3 — 403 hides billing UI silently; it is not an error state.
  if (!loading && !hasBillingAccess) {
    return (
      <div className="space-y-6">
        <SectionHeading
          title="Plan & Billing"
          description="Manage your subscription, usage, and invoices."
        />
        <p className="text-sm text-[var(--color-brand-muted)]">
          Only your studio&apos;s admin or billing contact can view this page.
        </p>
      </div>
    );
  }

  const isRecurring = isStorageBasedPlan(snapshot?.service?.service_type);
  const canCancel = isRecurring && snapshot?.status === "active" && !snapshot.cancel_at_period_end;
  const canResume = isRecurring && (snapshot?.status === "active" || snapshot?.status === "cancelled") && snapshot?.cancel_at_period_end;

  async function handleCancel() {
    setAutoRenewBusy(true);
    setAutoRenewError(null);
    try {
      await cancelSubscription();
      await refresh();
      setCancelConfirmOpen(false);
    } catch (err) {
      setAutoRenewError(err instanceof ApiError ? err.message : "Couldn't turn off auto-renew.");
    } finally {
      setAutoRenewBusy(false);
    }
  }

  async function handleResume() {
    setAutoRenewBusy(true);
    setAutoRenewError(null);
    try {
      const res = await resumeSubscription();
      const { openCheckout } = await import("@/lib/razorpay");
      setResumeFlow("confirming");
      await openCheckout({
        keyId: res.key_id,
        subscriptionId: res.razorpay_subscription_id,
        description: "Resume auto-renew",
        onSuccess: () => {
          /* ConfirmingPayment below handles the rest via polling */
        },
        onDismiss: () => {
          setResumeFlow("idle");
        },
      });
    } catch (err) {
      setResumeFlow("idle");
      setAutoRenewError(err instanceof ApiError ? err.message : "Couldn't resume auto-renew.");
    } finally {
      setAutoRenewBusy(false);
    }
  }

  if (resumeFlow === "confirming") {
    return (
      <div className="space-y-6">
        <SectionHeading title="Plan & Billing" description="Manage your subscription, usage, and invoices." />
        <ConfirmingPayment
          purpose="resume"
          targetServiceId={snapshot?.service?._id ?? ""}
          before={snapshot}
          onGoToDashboard={() => setResumeFlow("idle")}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Plan & Billing"
        description="Manage your subscription, usage, and invoices."
      />

      <SubscriptionBanner snapshot={snapshot} scope="settings" />

      <Card title="Current plan" icon={<IconCreditCard size={15} />}>
        <div className="grid gap-4 sm:grid-cols-2">
          <PlanStatusCard snapshot={snapshot} loading={loading} />
          <div>
            <UsageMeter snapshot={snapshot} loading={loading} />
            {snapshot?.current_period_end && (
              <p className="mt-1.5 text-xs text-[var(--color-brand-muted)]">
                Resets {formatDate(snapshot.current_period_end)}
              </p>
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => openUpgradeModal()}
            className="brand-focus inline-flex h-10 items-center justify-center rounded-lg bg-[var(--color-brand-navy)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)]"
          >
            Upgrade plan
          </button>

          {canCancel && (
            <button
              type="button"
              onClick={() => setCancelConfirmOpen(true)}
              className="brand-focus text-sm font-medium text-[var(--color-brand-muted)] underline-offset-2 hover:underline"
            >
              Turn off auto-renew
            </button>
          )}
          {canResume && (
            <button
              type="button"
              onClick={handleResume}
              disabled={autoRenewBusy}
              className="brand-focus text-sm font-medium text-[var(--color-brand-navy)] underline-offset-2 hover:underline disabled:opacity-60"
            >
              {autoRenewBusy ? "Starting…" : "Turn auto-renew back on"}
            </button>
          )}
        </div>

        {autoRenewError && (
          <p role="alert" className="mt-3 text-sm text-[var(--color-brand-danger)]">
            {autoRenewError}
          </p>
        )}

        {canResume && (
          <p className="mt-2 text-xs text-[var(--color-brand-muted)]">
            You&apos;ve already paid through{" "}
            {snapshot?.current_period_end ? formatDate(snapshot.current_period_end) : "your current period"} — we&apos;ll
            just re-arm the auto-renew for after that. Nothing is charged today.
          </p>
        )}
      </Card>

      <BillingDetailsCard />

      <Card title="Invoices" icon={<IconReceipt size={15} />}>
        {invoicesError ? <FetchError message={invoicesError} /> : <InvoiceList invoices={invoices} loading={invoicesLoading} />}
      </Card>

      {cancelConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-brand-ink)]/30 p-4">
          <div className="w-full max-w-md rounded-xl border border-[var(--color-brand-border)] bg-[var(--color-brand-surface-raised)] p-6">
            <h3 className="text-lg font-bold text-[var(--color-brand-ink)]">Turn off auto-renew?</h3>
            <p className="mt-2 text-sm text-[var(--color-brand-muted)]">
              Your plan stays active until{" "}
              <strong>{snapshot?.current_period_end ? formatDate(snapshot.current_period_end) : "your renewal date"}</strong>.
              After that your dashboard becomes read-only and your galleries are archived — and permanently deleted 7
              days later.
            </p>
            {autoRenewError && (
              <p role="alert" className="mt-2 text-sm text-[var(--color-brand-danger)]">
                {autoRenewError}
              </p>
            )}
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setCancelConfirmOpen(false)}
                className="brand-focus inline-flex h-10 items-center justify-center rounded-lg border border-[var(--color-brand-border)] px-4 text-sm font-semibold text-[var(--color-brand-ink)]"
              >
                Keep auto-renew
              </button>
              <button
                type="button"
                disabled={autoRenewBusy}
                onClick={handleCancel}
                className="brand-focus inline-flex h-10 items-center justify-center rounded-lg bg-[var(--color-brand-danger)] px-4 text-sm font-semibold text-white disabled:opacity-60"
              >
                {autoRenewBusy ? "Turning off…" : "Turn it off"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
