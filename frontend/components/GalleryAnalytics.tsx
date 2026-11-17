"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { GALLERY_GA_ID, sendGalleryPageView } from "@/lib/gallery-analytics";

/**
 * Cookieless, identifier-free page-view counting for guest gallery pages. See
 * lib/gallery-analytics.ts for exactly what is and is not collected. Renders
 * nothing, loads no third-party script, and stores nothing on the guest's
 * device, so there is no consent banner.
 */
export function GalleryAnalytics() {
  const pathname = usePathname();

  useEffect(() => {
    if (GALLERY_GA_ID && pathname) sendGalleryPageView(pathname);
  }, [pathname]);

  return null;
}
