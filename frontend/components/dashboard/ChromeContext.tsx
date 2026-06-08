"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Breadcrumb } from "./Topbar";

type ChromeState = {
  customBreadcrumb: Breadcrumb | null;
  setCustomBreadcrumb: (b: Breadcrumb | null) => void;
  locked: boolean;
  setLocked: (next: boolean) => void;
};

const ChromeCtx = createContext<ChromeState>({
  customBreadcrumb: null,
  setCustomBreadcrumb: () => {},
  locked: false,
  setLocked: () => {},
});

export function ChromeProvider({ children }: { children: React.ReactNode }) {
  const [customBreadcrumb, setCustomBreadcrumb] = useState<Breadcrumb | null>(null);
  const [locked, setLocked] = useState(false);

  const value = useMemo<ChromeState>(
    () => ({ customBreadcrumb, setCustomBreadcrumb, locked, setLocked }),
    [customBreadcrumb, locked],
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

/** Page-level helper: lock global chrome (used during long uploads). */
export function usePageLock(locked: boolean) {
  const { setLocked } = useContext(ChromeCtx);
  useEffect(() => {
    setLocked(locked);
    return () => setLocked(false);
  }, [locked, setLocked]);
}
