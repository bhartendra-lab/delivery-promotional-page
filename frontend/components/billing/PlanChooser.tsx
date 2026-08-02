"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Plan, StorageTier } from "@/lib/plans";
import {
  buildStorageTiers,
  eventPlanOf,
  formatInr,
  formatStorage,
  nearestAvailableIndex,
  planForTier,
  planLabel,
  yearlySavingsPercent,
} from "@/lib/plans";
import { isStorageBasedPlan } from "@/lib/types";
import type { SubscriptionSnapshot } from "@/lib/billing-types";
import { isStorageSnapshot } from "@/lib/billing-types";
import { StorageSlider } from "./StorageSlider";
import { EventQuantity } from "./EventQuantity";
import { StorageIcon } from "@/app/(dashboard)/dashboard/settings/SettingsUI";
import { IconCalendar, IconCheck, IconArrowLeft } from "@/components/ui/icons";

export type Mode = "event" | "storage";
export type Interval = "monthly" | "yearly";

export type PlanChooserSelection =
  | { mode: "event"; plan: Plan; quantity: number }
  | { mode: "storage"; plan: Plan; isDowngrade: boolean };

/** UI-only heuristic for CTA copy — the server (decideProrationMode) is the
 *  sole source of truth for the actual charge/branch. */
function looksLikeDowngrade(current: Plan, target: Plan): boolean {
  if (current._id === target._id) return false;
  if (current.service_type === target.service_type) {
    return (target.price ?? 0) < (current.price ?? 0);
  }
  if (current.service_type === "Yearly" && target.service_type === "Monthly") return true;
  return false;
}

function findTierIndexForPlan(tiers: StorageTier[], planId: string): number {
  return tiers.findIndex((t) => t.monthly?._id === planId || t.yearly?._id === planId);
}

export function PlanChooser({
  plans,
  currentSnapshot,
  initialPlanId,
  initialQuantity,
  initialMode,
  onContinue,
  continueLabel = "Continue →",
  variant = "tabs",
}: {
  plans: Plan[];
  currentSnapshot: SubscriptionSnapshot | null;
  initialPlanId?: string | null;
  initialQuantity?: number;
  /** Forces which tab/card opens first (e.g. a 402 from event creation should open on "event"). */
  initialMode?: Mode;
  onContinue: (selection: PlanChooserSelection) => void;
  continueLabel?: string;
  /**
   * "cards" renders the two-screen pricing-model picker (upgrade modal).
   * "tabs" keeps the legacy pill strip (the standalone /checkout deep-link
   * page, which usually arrives with a plan already chosen). Defaults to
   * "tabs" so /checkout stays exactly as it behaves today.
   */
  variant?: "tabs" | "cards";
}) {
  const eventPlan = useMemo(() => eventPlanOf(plans), [plans]);
  const tiers = useMemo(() => buildStorageTiers(plans), [plans]);
  const currentServiceType = currentSnapshot?.service?.service_type ?? null;
  // Single derived boolean every branch below reasons about — a storage-plan
  // studio must never encounter any trace of pay-per-event (total
  // suppression), and this is the one place that decision is made.
  const eventOptionAvailable = Boolean(eventPlan) && !isStorageBasedPlan(currentServiceType);
  const hasStorage = tiers.length > 0;
  const bothAvailable = eventOptionAvailable && hasStorage;

  const currentTierIndex = useMemo(() => {
    if (!currentSnapshot?.service?._id || !isStorageSnapshot(currentSnapshot)) return null;
    const idx = findTierIndexForPlan(tiers, currentSnapshot.service._id);
    return idx >= 0 ? idx : null;
  }, [currentSnapshot, tiers]);

  const initialFromDeepLink = useMemo(() => {
    if (!initialPlanId) return null;
    if (eventPlan?._id === initialPlanId) return { mode: "event" as Mode };
    const idx = findTierIndexForPlan(tiers, initialPlanId);
    if (idx >= 0) {
      const interval: Interval = tiers[idx].yearly?._id === initialPlanId ? "yearly" : "monthly";
      return { mode: "storage" as Mode, tierIndex: idx, interval };
    }
    return null;
  }, [initialPlanId, eventPlan, tiers]);

  // Clamped so a caller forcing initialMode="event" (e.g. AddEventModal's
  // blanket 402 handler) can never land a storage-plan studio on event-mode
  // content — silently falls back to storage, no error, no empty panel.
  const [mode, setMode] = useState<Mode>(() => {
    const requested = initialMode ?? initialFromDeepLink?.mode ?? (eventOptionAvailable ? "event" : "storage");
    return requested === "event" && !eventOptionAvailable ? "storage" : requested;
  });
  // Screen 1 (pricing-model cards) vs screen 2 (details) in "cards" variant
  // only, skipped when just one model is available. This used to be a
  // useState verdict frozen at mount (`modeConfirmed`) — if `plans` (and
  // therefore `bothAvailable`) arrived after the first render, the frozen
  // "storage-only" verdict never re-evaluated and screen 1 was skipped even
  // once both models turned out to be available. `userPickedMode` is the
  // only state; whether to show the cards is derived fresh every render, so
  // it can never go stale regardless of when the catalog actually loads.
  const [userPickedMode, setUserPickedMode] = useState(false);
  const showPricingModelCards = variant === "cards" && bothAvailable && !userPickedMode;
  const [qty, setQty] = useState(initialQuantity ?? 1);
  const [interval, setInterval_] = useState<Interval>(
    () =>
      initialFromDeepLink?.interval ??
      (currentSnapshot?.service?.service_type === "Yearly"
        ? "yearly"
        : currentSnapshot?.service?.service_type === "Monthly"
          ? "monthly"
          : tiers.some((t) => (yearlySavingsPercent(t) ?? 0) > 0)
            ? "yearly"
            : "monthly"),
  );
  const [tierIndex, setTierIndex] = useState(
    () => initialFromDeepLink?.tierIndex ?? currentTierIndex ?? Math.min(1, Math.max(0, tiers.length - 1)),
  );
  // Same class of bug as modeConfirmed above: `interval`/`tierIndex` seed
  // once at mount from `tiers`/`currentSnapshot`, which are wrong if the
  // catalog or subscription snapshot hasn't loaded yet. Re-seed whenever
  // they change, but only until the studio actually touches the interval
  // toggle or the slider — after that their choice must stick.
  const [userAdjustedTier, setUserAdjustedTier] = useState(false);
  useEffect(() => {
    if (userAdjustedTier || initialFromDeepLink) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- re-seeds from late-loading catalog/snapshot data until the studio touches the controls
    setInterval_(
      currentSnapshot?.service?.service_type === "Yearly"
        ? "yearly"
        : currentSnapshot?.service?.service_type === "Monthly"
          ? "monthly"
          : tiers.some((t) => (yearlySavingsPercent(t) ?? 0) > 0)
            ? "yearly"
            : "monthly",
    );
    setTierIndex(currentTierIndex ?? Math.min(1, Math.max(0, tiers.length - 1)));
  }, [tiers, currentSnapshot, currentTierIndex, initialFromDeepLink, userAdjustedTier]);
  const [movedNote, setMovedNote] = useState<string | null>(null);
  const movedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (movedTimer.current) clearTimeout(movedTimer.current);
  }, []);

  function handleIntervalChange(next: Interval) {
    setUserAdjustedTier(true);
    const nextIndex = nearestAvailableIndex(tiers, tierIndex, next);
    if (nextIndex !== tierIndex) {
      setTierIndex(nextIndex);
      setMovedNote(`Moved to the closest ${next} plan.`);
      if (movedTimer.current) clearTimeout(movedTimer.current);
      movedTimer.current = setTimeout(() => setMovedNote(null), 4000);
    }
    setInterval_(next);
  }

  function handleTierIndexChange(next: number) {
    setUserAdjustedTier(true);
    setTierIndex(next);
  }

  if (!eventOptionAvailable && !hasStorage) {
    console.warn(
      "PlanChooser: nothing purchasable — no Event-based plan and no storage tiers in this catalog.",
    );
    return (
      <p className="text-sm text-[var(--color-brand-muted)]">
        We&apos;re updating our pricing. Contact support to change your plan.
      </p>
    );
  }

  if (showPricingModelCards) {
    return (
      <PricingModelCards
        eventPlan={eventPlan!}
        tiers={tiers}
        selectedMode={mode}
        onSelect={(m) => {
          setMode(m);
          setUserPickedMode(true);
        }}
      />
    );
  }

  const tier = tiers[tierIndex];
  const activeStoragePlan = tier ? planForTier(tier, interval) : null;
  const maxSavings = tiers.length ? Math.max(0, ...tiers.map((t) => yearlySavingsPercent(t) ?? 0)) : 0;
  const isCurrentStoragePlan =
    activeStoragePlan != null && activeStoragePlan._id === currentSnapshot?.service?._id;
  const downgrade =
    activeStoragePlan && currentSnapshot?.service
      ? looksLikeDowngrade(
          { _id: currentSnapshot.service._id, service_type: currentSnapshot.service.service_type } as Plan,
          activeStoragePlan,
        )
      : false;

  return (
    <div className="flex flex-col gap-6">
      {variant === "tabs" && eventOptionAvailable && hasStorage && (
        <div
          role="tablist"
          aria-label="Plan type"
          className="inline-flex w-fit items-center gap-1 rounded-full border border-[var(--color-brand-border)] bg-[var(--color-brand-surface)] p-1"
        >
          {(["event", "storage"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`brand-focus rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                mode === m ? "bg-[var(--color-brand-navy)] text-white" : "text-[var(--color-brand-muted)]"
              }`}
            >
              {m === "event" ? "Pay per event" : "Storage plan"}
            </button>
          ))}
        </div>
      )}

      {/* Nothing to go back to for a storage-only studio — the pricing-model
          screen never existed for them, so no back affordance either. */}
      {variant === "cards" && bothAvailable && (
        <button
          type="button"
          onClick={() => setUserPickedMode(false)}
          className="brand-focus inline-flex w-fit items-center gap-1.5 text-xs font-medium text-[var(--color-brand-muted)] hover:text-[var(--color-brand-ink)]"
        >
          <IconArrowLeft size={12} />
          Pricing model
        </button>
      )}

      {mode === "event" && eventPlan && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-[var(--color-brand-muted)]">
            {formatInr(eventPlan.event_unit_price ?? 0)} per event · GST included
          </p>
          <div>
            <p className="mb-2 text-sm font-semibold text-[var(--color-brand-ink)]">How many events?</p>
            <EventQuantity quantity={qty} onChange={setQty} />
          </div>
          <div className="flex items-baseline justify-between rounded-lg bg-[var(--color-brand-bg)] px-4 py-3">
            <span className="text-sm text-[var(--color-brand-muted)]">
              {qty} event{qty === 1 ? "" : "s"} × {formatInr(eventPlan.event_unit_price ?? 0)}
            </span>
            <span className="text-lg font-bold tabular-nums text-[var(--color-brand-ink)]">
              {formatInr(qty * (eventPlan.event_unit_price ?? 0))}
            </span>
          </div>
          <p className="-mt-2 text-xs text-[var(--color-brand-muted)]">
            Final total with any discounts is shown at the next step.
          </p>
          <button
            type="button"
            onClick={() => onContinue({ mode: "event", plan: eventPlan, quantity: qty })}
            className="brand-focus inline-flex h-11 items-center justify-center rounded-lg bg-[var(--color-brand-navy)] text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)]"
          >
            {continueLabel}
          </button>
        </div>
      )}

      {mode === "storage" && hasStorage && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-[var(--color-brand-ink)]">Pick a storage tier</p>
            <div
              role="tablist"
              aria-label="Billing interval"
              className="inline-flex items-center gap-1 rounded-full border border-[var(--color-brand-border)] bg-[var(--color-brand-surface)] p-1"
            >
              {(["monthly", "yearly"] as Interval[]).map((iv) => (
                <button
                  key={iv}
                  type="button"
                  role="tab"
                  aria-selected={interval === iv}
                  onClick={() => handleIntervalChange(iv)}
                  className={`brand-focus flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
                    interval === iv ? "bg-[var(--color-brand-navy)] text-white" : "text-[var(--color-brand-muted)]"
                  }`}
                >
                  {iv === "monthly" ? "Monthly" : "Yearly"}
                  {iv === "yearly" && maxSavings > 0 && (
                    <span className="rounded-full bg-[var(--color-brand-navy-soft)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-brand-navy-deep)]">
                      Save {maxSavings}%
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <StorageSlider
            tiers={tiers}
            index={tierIndex}
            interval={interval}
            onChange={handleTierIndexChange}
            currentTierIndex={currentTierIndex}
          />
          {movedNote && (
            <p className="text-xs text-[var(--color-brand-muted)]" aria-live="polite">
              {movedNote}
            </p>
          )}

          {activeStoragePlan && (
            <div className="flex flex-col gap-1 rounded-lg bg-[var(--color-brand-bg)] px-4 py-3">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-[var(--color-brand-muted)]">
                  {planLabel(activeStoragePlan)} · {formatStorage(tier.storage_limit)}
                </span>
                <span className="text-lg font-bold tabular-nums text-[var(--color-brand-ink)]">
                  {formatInr(activeStoragePlan.price ?? 0)}
                  <span className="text-sm font-normal text-[var(--color-brand-muted)]">
                    /{interval === "monthly" ? "mo" : "yr"}
                  </span>
                </span>
              </div>
              {isCurrentStoragePlan ? (
                <span className="text-xs font-semibold text-[var(--color-brand-navy)]">Current plan</span>
              ) : downgrade ? (
                <span className="text-xs text-[var(--color-brand-muted)]">Takes effect at renewal — no charge now.</span>
              ) : currentSnapshot?.service ? (
                <span className="text-xs text-[var(--color-brand-muted)]">
                  Including GST
                </span>
              ) : null}
            </div>
          )}

          <button
            type="button"
            disabled={!activeStoragePlan || isCurrentStoragePlan}
            onClick={() =>
              activeStoragePlan &&
              onContinue({ mode: "storage", plan: activeStoragePlan, isDowngrade: downgrade })
            }
            className="brand-focus inline-flex h-11 items-center justify-center rounded-lg bg-[var(--color-brand-navy)] text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isCurrentStoragePlan ? "Current plan" : downgrade ? "Schedule change" : continueLabel}
          </button>
        </div>
      )}
    </div>
  );
}

/** Screen 1 of the "cards" variant — only ever rendered when both pricing
 *  models are genuinely available (see `bothAvailable` above). */
function PricingModelCards({
  eventPlan,
  tiers,
  selectedMode,
  onSelect,
}: {
  eventPlan: Plan;
  tiers: StorageTier[];
  selectedMode: Mode;
  onSelect: (mode: Mode) => void;
}) {
  const largestTier = tiers[tiers.length - 1];
  const cheapestMonthly = tiers
    .map((t) => t.monthly?.price ?? t.yearly?.price ?? null)
    .filter((p): p is number => p != null)
    .sort((a, b) => a - b)[0];
  const maxSavings = tiers.length ? Math.max(0, ...tiers.map((t) => yearlySavingsPercent(t) ?? 0)) : 0;

  function onKeyDown(e: React.KeyboardEvent) {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    onSelect(selectedMode === "event" ? "storage" : "event");
  }

  const cardBase =
    "brand-focus relative flex flex-col rounded-xl border p-5 text-left transition-colors";
  const cardIdle = "border-[var(--color-brand-border)] bg-[var(--color-brand-surface)] hover:border-[var(--color-brand-outline)]";
  const cardSelected = "border-[var(--color-brand-navy)] ring-1 ring-[var(--color-brand-navy)] bg-[var(--color-brand-navy-soft)]";

  return (
    <div role="radiogroup" aria-label="Pricing model" className="grid gap-4 sm:grid-cols-2">
      <button
        type="button"
        role="radio"
        aria-checked={selectedMode === "event"}
        onClick={() => onSelect("event")}
        onKeyDown={onKeyDown}
        className={`${cardBase} ${selectedMode === "event" ? cardSelected : cardIdle}`}
      >
        <IconCalendar className="text-[var(--color-brand-navy)]" />
        <p className="mt-3 text-base font-bold text-[var(--color-brand-ink)]">Pay per event</p>
        <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--color-brand-ink)]">
          {formatInr(eventPlan.event_unit_price ?? 0)}
          <span className="text-sm font-normal text-[var(--color-brand-muted)]"> / event</span>
        </p>
        <ul className="mt-3 space-y-1.5 text-xs text-[var(--color-brand-muted)]">
          <li className="flex items-center gap-1.5">
            <IconCheck size={11} className="shrink-0 text-[var(--color-brand-navy)]" />
            Unlimited storage on every event
          </li>
          <li className="flex items-center gap-1.5">
            <IconCheck size={11} className="shrink-0 text-[var(--color-brand-navy)]" />
            Each event stays live for 3 months
          </li>
          <li className="flex items-center gap-1.5">
            <IconCheck size={11} className="shrink-0 text-[var(--color-brand-navy)]" />
            No monthly commitment
          </li>
        </ul>
      </button>

      <button
        type="button"
        role="radio"
        aria-checked={selectedMode === "storage"}
        onClick={() => onSelect("storage")}
        onKeyDown={onKeyDown}
        className={`${cardBase} ${selectedMode === "storage" ? cardSelected : cardIdle}`}
      >
        {maxSavings > 0 && (
          <span className="absolute right-3 top-3 rounded-full bg-[var(--color-brand-navy-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--color-brand-navy-deep)]">
            Save up to {maxSavings}% yearly
          </span>
        )}
        <StorageIcon />
        <p className="mt-3 text-base font-bold text-[var(--color-brand-ink)]">Storage plan</p>
        <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--color-brand-ink)]">
          From {formatInr(cheapestMonthly ?? 0)}
          <span className="text-sm font-normal text-[var(--color-brand-muted)]"> / month</span>
        </p>
        <ul className="mt-3 space-y-1.5 text-xs text-[var(--color-brand-muted)]">
          <li className="flex items-center gap-1.5">
            <IconCheck size={11} className="shrink-0 text-[var(--color-brand-navy)]" />
            Unlimited events
          </li>
          <li className="flex items-center gap-1.5">
            <IconCheck size={11} className="shrink-0 text-[var(--color-brand-navy)]" />
            Upto {formatStorage(largestTier.storage_limit)} of storage
          </li>
          <li className="flex items-center gap-1.5">
            <IconCheck size={11} className="shrink-0 text-[var(--color-brand-navy)]" />
            Cancel any time
          </li>
        </ul>
      </button>
    </div>
  );
}
