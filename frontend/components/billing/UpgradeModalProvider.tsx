"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getBillingPlans } from "@/lib/billing";
import type { Plan } from "@/lib/plans";
import { UpgradeModal } from "./UpgradeModal";

type OpenOptions = {
  preset?: "event" | "storage";
  /** A coupon to apply as the modal opens (the first visit's free event). */
  coupon?: string;
};

const UpgradeModalCtx = createContext<{ openUpgradeModal: (opts?: OpenOptions) => void }>({
  openUpgradeModal: () => {},
});

/**
 * Owns the plan-catalog fetch and open/close state for the
 * single in-app upgrade modal — any dashboard page can trigger it via
 * `useUpgradeModal().openUpgradeModal()` (e.g. a 402 on event creation, or
 * the "Upgrade plan" button in billing settings) without re-fetching either.
 */
export function UpgradeModalProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<"event" | "storage" | undefined>(undefined);
  const [coupon, setCoupon] = useState<string | undefined>(undefined);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const openUpgradeModal = useCallback((opts?: OpenOptions) => {
    setPreset(opts?.preset);
    setCoupon(opts?.coupon);
    setOpen(true);
  }, []);

  const loadCatalog = useCallback(() => {
    setLoadFailed(false);
    getBillingPlans()
      .then((plansRes) => {
        setPlans(plansRes.plans);
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-then-setState is the documented React pattern for effects
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
        initialCoupon={coupon}
        loaded={loaded}
        loadFailed={loadFailed}
        onRetryLoad={loadCatalog}
      />
    </UpgradeModalCtx.Provider>
  );
}

export function useUpgradeModal() {
  return useContext(UpgradeModalCtx);
}
