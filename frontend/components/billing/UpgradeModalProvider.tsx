"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getBillingPlans, getBillingProfile } from "@/lib/billing";
import type { Plan } from "@/lib/plans";
import type { BillingProfile } from "@/lib/billing-types";
import { UpgradeModal } from "./UpgradeModal";

type OpenOptions = { preset?: "event" | "storage" };

const UpgradeModalCtx = createContext<{ openUpgradeModal: (opts?: OpenOptions) => void }>({
  openUpgradeModal: () => {},
});

function isBillingComplete(profile: BillingProfile | null): boolean {
  return Boolean(profile?.legal_name && profile.billing_address && profile.place_of_supply_state);
}

/**
 * Owns the plan-catalog + billing-profile fetch and open/close state for the
 * single in-app upgrade modal — any dashboard page can trigger it via
 * `useUpgradeModal().openUpgradeModal()` (e.g. a 402 on event creation, or
 * the "Upgrade plan" button in billing settings) without re-fetching either.
 */
export function UpgradeModalProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<"event" | "storage" | undefined>(undefined);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [billingProfile, setBillingProfile] = useState<BillingProfile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const openUpgradeModal = useCallback((opts?: OpenOptions) => {
    setPreset(opts?.preset);
    setOpen(true);
  }, []);

  const loadCatalog = useCallback(() => {
    setLoadFailed(false);
    Promise.all([getBillingPlans(), getBillingProfile().catch(() => null)])
      .then(([plansRes, profileRes]) => {
        setPlans(plansRes.plans);
        setBillingProfile(profileRes?.billing ?? null);
        setLoaded(true);
      })
      .catch(() => {
        // Un-swallowed (previously a silent .catch(() => {})) — UpgradeModal
        // now renders a retryable error here instead of the generic
        // "We're updating our pricing" message, which was indistinguishable
        // from a genuinely empty catalog.
        setLoadFailed(true);
      });
  }, []);

  // Lazy-load on first open. `loadCatalog` is also called directly (not via
  // this effect) from UpgradeModal's Retry button, since that's a one-shot
  // user-triggered action rather than a state-driven re-fetch.
  useEffect(() => {
    if (!open || loaded || loadFailed) return;
    loadCatalog();
  }, [open, loaded, loadFailed, loadCatalog]);

  const value = useMemo(() => ({ openUpgradeModal }), [openUpgradeModal]);

  return (
    <UpgradeModalCtx.Provider value={value}>
      {children}
      <UpgradeModal
        open={open}
        onClose={() => setOpen(false)}
        plans={plans}
        preset={preset}
        loaded={loaded}
        loadFailed={loadFailed}
        onRetryLoad={loadCatalog}
        billingComplete={loaded ? isBillingComplete(billingProfile) : null}
      />
    </UpgradeModalCtx.Provider>
  );
}

export function useUpgradeModal() {
  return useContext(UpgradeModalCtx);
}
