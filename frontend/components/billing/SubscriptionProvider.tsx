"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getSubscription, ApiError } from "@/lib/billing";
import type { SubscriptionSnapshot } from "@/lib/billing-types";

type SubscriptionState = {
  snapshot: SubscriptionSnapshot | null;
  loading: boolean;
  /**
   * False when GET /billing/subscription returned 403 — the caller is
   * neither admin nor billing_user. Hide all billing UI in this case; do NOT
   * show an error. Don't gate on a cached `role`/`billing_user` instead —
   * the Google-SSO login response carries only a token, so a cached role
   * isn't reliably available on every auth path. Probing the endpoint and
   * treating 403 as "no access" is correct on both paths.
   */
  hasBillingAccess: boolean;
  refresh: () => Promise<SubscriptionSnapshot | null>;
};

const SubscriptionCtx = createContext<SubscriptionState>({
  snapshot: null,
  loading: true,
  hasBillingAccess: true,
  refresh: async () => null,
});

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<SubscriptionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasBillingAccess, setHasBillingAccess] = useState(true);

  const load = useCallback(async () => {
    try {
      const fresh = await getSubscription();
      setSnapshot(fresh);
      setHasBillingAccess(true);
      return fresh;
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setHasBillingAccess(false);
        setSnapshot(null);
        return null;
      }
      if (err instanceof ApiError && err.status === 404) {
        // No subscription on record — not an error state.
        setHasBillingAccess(true);
        setSnapshot(null);
        return null;
      }
      // Transient failure — keep the last-known snapshot rather than blanking it.
      return null;
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const value = useMemo<SubscriptionState>(
    () => ({ snapshot, loading, hasBillingAccess, refresh: load }),
    [snapshot, loading, hasBillingAccess, load],
  );

  return <SubscriptionCtx.Provider value={value}>{children}</SubscriptionCtx.Provider>;
}

export function useSubscription() {
  return useContext(SubscriptionCtx);
}
