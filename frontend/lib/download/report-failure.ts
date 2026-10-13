/**
 * Guest gallery → team: "this Guest's download just failed".
 *
 * `POST /deliverables/report-download-failure` emails the team. The backend
 * takes the Guest's identity from their token, so nothing here says who they
 * are — this only describes the browser, the phone and the failure.
 *
 * Fire-and-forget by design, like `reportBug`: it never throws and never
 * rejects, so a reporting failure can't break the very flow that's already
 * failing. Identical failures are de-duped within a short window so a Guest
 * tapping "try again" doesn't send the same mail five times.
 */

import { guestFetch } from "@/lib/guest-api";
import { saveCapability } from "./capability";
import { describeBrowser, describeDevice, type DownloadFailure } from "./failure";

const DEDUPE_MS = 30_000;
const recent = new Map<string, number>();

/**
 * Whether the page is on its way out. A navigation kills every request still
 * in flight, and each one rejects with the same "Load failed" a real network
 * failure would — so a Guest who merely left mid-download looked exactly like
 * a Guest whose download broke. Anything that fails while leaving is noise.
 */
let leaving = false;
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    leaving = true;
  });
  // Restored from the back/forward cache: the page is live again.
  window.addEventListener("pageshow", () => {
    leaving = false;
  });
}

/** Long enough for `pagehide` to land when the failure was the navigation's doing. */
const SETTLE_MS = 400;

type HintedNavigator = Navigator & {
  userAgentData?: {
    getHighEntropyValues?: (hints: string[]) => Promise<{ model?: string }>;
  };
  connection?: { effectiveType?: string; saveData?: boolean };
  deviceMemory?: number;
};

/** The handset model from Client Hints, where the browser offers it. */
async function hintedModel(nav: HintedNavigator): Promise<string | undefined> {
  try {
    return (await nav.userAgentData?.getHighEntropyValues?.(["model"]))?.model || undefined;
  } catch {
    return undefined;
  }
}

function counts(failure: DownloadFailure): string | undefined {
  const parts = (
    [
      ["total", failure.total],
      ["saved", failure.saved],
      ["failed", failure.failed],
      ["skipped", failure.skipped],
    ] as const
  )
    .filter(([, n]) => typeof n === "number")
    .map(([label, n]) => `${label} ${n}`);
  return parts.length ? parts.join(" · ") : undefined;
}

export async function reportDownloadFailure(uid: string, failure: DownloadFailure): Promise<void> {
  try {
    if (typeof window === "undefined") return;
    await new Promise((resolve) => window.setTimeout(resolve, SETTLE_MS));
    if (leaving) return;
    const key = `${failure.kind}|${failure.stage}|${failure.error ?? failure.reasons?.join(",") ?? ""}`;
    const now = Date.now();
    const prev = recent.get(key);
    if (prev && now - prev < DEDUPE_MS) return;
    recent.set(key, now);

    const nav = window.navigator as HintedNavigator;
    const ua = nav.userAgent ?? "";
    const network = [
      nav.onLine === false ? "offline" : "online",
      nav.connection?.effectiveType,
      nav.connection?.saveData ? "data saver on" : undefined,
    ]
      .filter(Boolean)
      .join(", ");

    await guestFetch(uid, "/deliverables/report-download-failure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: failure.kind === "single" ? "Single photo" : "Multiple photos",
        stage: failure.stage,
        error: failure.error,
        reasons: failure.reasons,
        // A single photo has no planned method; say what this browser can do
        // instead, which is what decides the method for a bulk run.
        method: failure.method ?? `(browser supports: ${saveCapability()})`,
        tier: failure.tier,
        counts: counts(failure),
        browser: describeBrowser(ua),
        device: describeDevice(ua, nav.maxTouchPoints ?? 0, await hintedModel(nav)),
        network,
        device_memory: nav.deviceMemory ? `${nav.deviceMemory} GB` : undefined,
        page_url: window.location?.href,
      }),
      // Survive a page unload (the Guest gives up and leaves after the failure).
      keepalive: true,
    });
  } catch {
    // Reporting must never surface to the Guest.
  }
}
