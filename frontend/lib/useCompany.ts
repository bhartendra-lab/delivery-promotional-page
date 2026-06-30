"use client";

import { useSyncExternalStore } from "react";
import type { Company } from "./types";
import { subscribeCompany, getCompanySnapshot } from "./auth";

/**
 * Reactive, SSR-safe read of the cached company (server snapshot is null).
 * Lives in its own client module so the `react` import never reaches
 * lib/auth.ts, which is pulled into server components via lib/api.ts.
 */
export function useCompany(): Company | null {
  return useSyncExternalStore(subscribeCompany, getCompanySnapshot, () => null);
}
