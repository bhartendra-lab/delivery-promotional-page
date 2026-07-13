"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getDlpUsage } from "@/lib/api";
import type { DlpUsage } from "@/lib/types";
import type { Breadcrumb } from "./Topbar";

type ChromeState = {
  customBreadcrumb: Breadcrumb | null;
  setCustomBreadcrumb: (b: Breadcrumb | null) => void;
  locked: boolean;
  setLocked: (next: boolean) => void;
  /** Page-injected node rendered top-right in the Topbar (e.g. the LivePill). */
  topbarExtra: React.ReactNode;
  setTopbarExtra: (node: React.ReactNode) => void;
  /**
   * Delivery-landing-page usage (events meter / usage pill). Fetched once for
   * the whole dashboard so the Sidebar meter and the page header pill share a
   * single source of truth — no racing duplicate fetches.
   */
  dlpUsage: DlpUsage | null;
  dlpLoading: boolean;
  /**
   * Re-fetch usage and update the shared value. Used by live-changing flows
   * (e.g. storage-plan uploads) so the sidebar meter and any open upload modal
   * reflect the current number without a full reload. Returns the fresh value
   * (or null on error) so callers can act on it immediately.
   */
  refreshDlpUsage: () => Promise<DlpUsage | null>;
};

const ChromeCtx = createContext<ChromeState>({
  customBreadcrumb: null,
  setCustomBreadcrumb: () => {},
  locked: false,
  setLocked: () => {},
  topbarExtra: null,
  setTopbarExtra: () => {},
  dlpUsage: null,
  dlpLoading: true,
  refreshDlpUsage: async () => null,
});

export function ChromeProvider({ children }: { children: React.ReactNode }) {
  const [customBreadcrumb, setCustomBreadcrumb] = useState<Breadcrumb | null>(null);
  const [locked, setLocked] = useState(false);
  const [topbarExtra, setTopbarExtra] = useState<React.ReactNode>(null);
  const [dlpUsage, setDlpUsage] = useState<DlpUsage | null>(null);
  const [dlpLoading, setDlpLoading] = useState(true);

  useEffect(() => {
    // `dlpLoading` starts true, so we only flip it false once the fetch
    // settles — keeping all setState calls inside async callbacks.
    getDlpUsage()
      .then(setDlpUsage)
      .catch(() => setDlpUsage(null))
      .finally(() => setDlpLoading(false));
  }, []);

  const refreshDlpUsage = useCallback(async () => {
    try {
      const fresh = await getDlpUsage();
      setDlpUsage(fresh);
      return fresh;
    } catch {
      // Keep the last-known value on a transient failure rather than blanking
      // the meter; return null so callers know the refresh didn't land.
      return null;
    }
  }, []);

  const value = useMemo<ChromeState>(
    () => ({
      customBreadcrumb,
      setCustomBreadcrumb,
      locked,
      setLocked,
      topbarExtra,
      setTopbarExtra,
      dlpUsage,
      dlpLoading,
      refreshDlpUsage,
    }),
    [customBreadcrumb, locked, topbarExtra, dlpUsage, dlpLoading, refreshDlpUsage],
  );

  return <ChromeCtx.Provider value={value}>{children}</ChromeCtx.Provider>;
}

export function useChrome() {
  return useContext(ChromeCtx);
}

/** Page-level helper: declare the breadcrumb for the current page. */
export function usePageBreadcrumb(items: Breadcrumb | null) {
  const { setCustomBreadcrumb } = useContext(ChromeCtx);
  const key = items ? JSON.stringify(items) : "";
  useEffect(() => {
    setCustomBreadcrumb(items);
    return () => setCustomBreadcrumb(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/** Page-level helper: lock global chrome (used during active uploads). */
export function usePageLock(locked: boolean) {
  const { setLocked } = useContext(ChromeCtx);
  useEffect(() => {
    setLocked(locked);
    return () => setLocked(false);
  }, [locked, setLocked]);
}

/** Page-level helper: inject a node into the Topbar's top-right cluster. */
export function usePageTopbarExtra(node: React.ReactNode) {
  const { setTopbarExtra } = useContext(ChromeCtx);
  useEffect(() => {
    setTopbarExtra(node);
    return () => setTopbarExtra(null);
  }, [node, setTopbarExtra]);
}
