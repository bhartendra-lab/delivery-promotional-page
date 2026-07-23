"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getDlpUsage, recalculateStudioStorage } from "@/lib/api";
import type { DlpUsage } from "@/lib/types";
import type { Breadcrumb } from "./Topbar";

type ChromeState = {
  customBreadcrumb: Breadcrumb | null;
  setCustomBreadcrumb: (b: Breadcrumb | null) => void;
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
  /**
   * True while a storage re-walk kicked off by an upload transition (pause,
   * cancel, completion) is still settling. Nothing waits on this — it only
   * drives a quiet "syncing…" note on the usage meter, so the upload UI can
   * hand off to its resting state the instant the engine says it's done.
   */
  storageSyncing: boolean;
  /**
   * Re-walk the studio's R2 usage and refresh the shared meter. Safe to call
   * from anywhere (event page, floating upload indicator); overlapping calls
   * are ref-counted so the "syncing…" note clears only once the last settles.
   * Never throws — a failed recalculation must not strand a UI transition.
   */
  settleStorage: () => Promise<void>;
  /**
   * The single app-wide scroll container (the `<main>` under the locked
   * Topbar/Sidebar chrome). Pages read its scroll position via
   * `useScrollCollapsed` instead of listening on `window`, since the window
   * itself never scrolls in this layout.
   */
  mainRef: React.RefObject<HTMLElement | null>;
};

const ChromeCtx = createContext<ChromeState>({
  customBreadcrumb: null,
  setCustomBreadcrumb: () => {},
  topbarExtra: null,
  setTopbarExtra: () => {},
  dlpUsage: null,
  dlpLoading: true,
  refreshDlpUsage: async () => null,
  storageSyncing: false,
  settleStorage: async () => {},
  mainRef: { current: null },
});

export function ChromeProvider({ children }: { children: React.ReactNode }) {
  const [customBreadcrumb, setCustomBreadcrumb] = useState<Breadcrumb | null>(null);
  const [topbarExtra, setTopbarExtra] = useState<React.ReactNode>(null);
  const [dlpUsage, setDlpUsage] = useState<DlpUsage | null>(null);
  const [dlpLoading, setDlpLoading] = useState(true);
  const [storageSyncing, setStorageSyncing] = useState(false);
  const settleDepth = useRef(0);
  const mainRef = useRef<HTMLElement | null>(null);

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

  const settleStorage = useCallback(async () => {
    settleDepth.current += 1;
    setStorageSyncing(true);
    try {
      try {
        await recalculateStudioStorage();
      } catch (err) {
        console.warn("[storage] recalculate-studio-storage failed", err);
      }
      await refreshDlpUsage();
    } finally {
      settleDepth.current -= 1;
      if (settleDepth.current <= 0) {
        settleDepth.current = 0;
        setStorageSyncing(false);
      }
    }
  }, [refreshDlpUsage]);

  const value = useMemo<ChromeState>(
    () => ({
      customBreadcrumb,
      setCustomBreadcrumb,
      topbarExtra,
      setTopbarExtra,
      dlpUsage,
      dlpLoading,
      refreshDlpUsage,
      storageSyncing,
      settleStorage,
      mainRef,
    }),
    [customBreadcrumb, topbarExtra, dlpUsage, dlpLoading, refreshDlpUsage, storageSyncing, settleStorage],
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

/** Page-level helper: inject a node into the Topbar's top-right cluster. */
export function usePageTopbarExtra(node: React.ReactNode) {
  const { setTopbarExtra } = useContext(ChromeCtx);
  useEffect(() => {
    setTopbarExtra(node);
    return () => setTopbarExtra(null);
  }, [node, setTopbarExtra]);
}

/**
 * Page-level helper: true once the shared `<main>` scroll container has been
 * scrolled past `threshold`. Drives the collapsing-header / locked-toolbar
 * scroll animation on the Dashboard and Events list pages — the window itself
 * never scrolls in this layout, so pages read `main`'s scrollTop instead.
 */
export function useScrollCollapsed(threshold = 18): boolean {
  const { mainRef } = useContext(ChromeCtx);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const onScroll = () => setCollapsed(el.scrollTop > threshold);
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [mainRef, threshold]);
  return collapsed;
}
