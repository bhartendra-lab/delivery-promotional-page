"use client";

import { useState, type ReactNode } from "react";

/**
 * The guest's picture inside an avatar circle, or the surface's own fallback
 * (their initial). One component for the three lounge surfaces so they agree.
 *
 * A picture that fails to load shows the fallback instead of a broken image:
 * a selfie can be deleted after matching, and a profile face is replaced when
 * the guest scans again. The failure is remembered per URL, so a new picture
 * gets its own chance to load.
 */
export function GuestPhoto({ url, alt = "", fallback }: { url: string | null; alt?: string; fallback: ReactNode }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!url || failedUrl === url) return <>{fallback}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={alt} className="h-full w-full object-cover" onError={() => setFailedUrl(url)} />
  );
}
