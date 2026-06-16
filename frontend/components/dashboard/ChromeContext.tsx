"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Breadcrumb } from "./Topbar";

type ChromeState = {
  customBreadcrumb: Breadcrumb | null;
  setCustomBreadcrumb: (b: Breadcrumb | null) => void;
  locked: boolean;
  setLocked: (next: boolean) => void;
  /** Page-injected node rendered top-right in the Topbar (e.g. the LivePill). */
  topbarExtra: React.ReactNode;
  setTopbarExtra: (node: React.ReactNode) => void;
};

const ChromeCtx = createContext<ChromeState>({
  customBreadcrumb: null,
  setCustomBreadcrumb: () => {},
  locked: false,
  setLocked: () => {},
  topbarExtra: null,
  setTopbarExtra: () => {},
});

export function ChromeProvider({ children }: { children: React.ReactNode }) {
  const [customBreadcrumb, setCustomBreadcrumb] = useState<Breadcrumb | null>(null);
  const [locked, setLocked] = useState(false);
  const [topbarExtra, setTopbarExtra] = useState<React.ReactNode>(null);

  const value = useMemo<ChromeState>(
    () => ({
      customBreadcrumb,
      setCustomBreadcrumb,
      locked,
      setLocked,
      topbarExtra,
      setTopbarExtra,
    }),
    [customBreadcrumb, locked, topbarExtra],
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
