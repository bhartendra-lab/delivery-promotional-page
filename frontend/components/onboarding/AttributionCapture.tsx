"use client";

import { useEffect } from "react";
import { captureAttributionFromPage } from "@/lib/attribution-storage";

/**
 * Notes where this visitor came from (utm tags, ad click ids, the campaign
 * link cookie) on every dashboard page load, so sign up can send it to the
 * backend once. Dashboard layout only: the guest gallery never has it. Renders
 * nothing; reads window.location so the layout does not wait on Suspense.
 */
export function AttributionCapture() {
  useEffect(() => {
    captureAttributionFromPage();
  }, []);
  return null;
}
