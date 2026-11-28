"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { getStoredConsent } from "@/lib/analytics";
import { getCompany } from "@/lib/auth";
import { capturePosthogPageview, initPosthog, setPosthogRecordingFor, syncPosthogIdentity } from "@/lib/posthog";
import { posthogEnabled } from "@/lib/posthog-config";

/**
 * PostHog for the studio dashboard group only (app/(dashboard)/layout.tsx).
 * Renders nothing, and does nothing at all unless NEXT_PUBLIC_POSTHOG_KEY and
 * NEXT_PUBLIC_POSTHOG_HOST are set. The guest gallery routes sit outside this
 * group, so a guest never loads it.
 */
export function PosthogProvider() {
  const pathname = usePathname();

  useEffect(() => {
    if (!posthogEnabled()) return;
    let cancelled = false;
    void initPosthog(getStoredConsent()).then((ph) => {
      if (cancelled || !ph) return;
      setPosthogRecordingFor(pathname);
      syncPosthogIdentity(getCompany()?._id ?? null);
      capturePosthogPageview(pathname);
    });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return null;
}
