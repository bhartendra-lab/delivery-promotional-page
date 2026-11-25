// lib/guest-metrics.ts — the guest gallery's own metrics, in the browser.
// The rules are in lib/guest-metrics-core.ts. Fire and forget: it never throws,
// never waits, and never runs in the Gallery Design preview.

import { trackEvent } from "./api";
import { buildTrackingData, deviceIdFrom, onceKey, optedOutByBrowser, type GuestEventType, type MetricData } from "./guest-metrics-core.ts";
import { isPreviewMode } from "./preview-mode.ts";

function local(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
function session(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Counts one thing a guest did in the gallery `uid` (its link slug). */
export function recordGalleryEvent(uid: string, type: GuestEventType, data: MetricData = {}): void {
  try {
    if (typeof window === "undefined" || !uid) return;
    if (isPreviewMode()) return; // the studio looking at its own draft is not a guest
    if (optedOutByBrowser(navigator as Navigator & { globalPrivacyControl?: boolean })) return;
    const once = onceKey(uid, type);
    if (once) {
      const s = session();
      if (s?.getItem(once)) return;
      s?.setItem(once, "1");
    }
    const deviceId = deviceIdFrom(local(), typeof crypto === "undefined" ? undefined : crypto);
    void trackEvent(uid, type, buildTrackingData(deviceId, data));
  } catch {
    /* metrics must never break the gallery */
  }
}
