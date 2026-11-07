"use client";

import { useEffect } from "react";
import { captureReferralFromUrl } from "@/lib/referral";

/**
 * Keeps a `?ref=` code from whatever dashboard page a link lands on (/login,
 * /auth/callback, /onboarding, ...), so onboarding can attach it later. Reads
 * window.location rather than useSearchParams: it renders nothing and must
 * not make the layout it sits in wait on a Suspense boundary.
 */
export function ReferralCapture() {
  useEffect(() => {
    captureReferralFromUrl();
  }, []);
  return null;
}
