/**
 * What a failed download looked like, in a shape worth emailing.
 *
 * The download code decides nothing here — it only describes. Who is told, and
 * how, belongs to the surface that owns the download: the guest gallery reports
 * failures to the team, the studio dashboard does not.
 *
 * `describeBrowser` and `describeDevice` read the user agent, which
 * `capability.ts` forbids for anything that changes behaviour. That rule is
 * intact: these only produce words for a human reading a failure report.
 *
 * No aliased imports — this module is unit-tested under `node --test`.
 */

import { detectInAppBrowser } from "../in-app-browser.ts";

export type DownloadFailure = {
  /** One photo, or a multi-photo run through the pre-flight modal. */
  kind: "single" | "bulk";
  /**
   * Where it went wrong:
   *  - `prepare`  the selection could not be resolved, nothing was fetched
   *  - `run`      the whole run threw
   *  - `partial`  the run finished but some photos could not be fetched
   *  - `save`     a single photo could not be fetched or handed to the browser
   */
  stage: "prepare" | "run" | "partial" | "save";
  /** The thrown error, already flattened by `describeError`. */
  error?: string;
  /** Distinct per-photo reasons from a run that lost some of its photos. */
  reasons?: string[];
  method?: string;
  tier?: string;
  total?: number;
  saved?: number;
  failed?: number;
  skipped?: number;
};

/** Most distinct per-photo reasons worth carrying: past a handful they repeat. */
export const MAX_FAILURE_REASONS = 5;

/** Add a reason to a bounded, de-duplicated list. */
export function noteFailureReason(reasons: string[], reason: string): void {
  if (reasons.length >= MAX_FAILURE_REASONS || reasons.includes(reason)) return;
  reasons.push(reason);
}

/** Flatten anything thrown into `"Name: message"`. */
export function describeError(err: unknown): string {
  if (err instanceof Error) return err.message ? `${err.name}: ${err.message}` : err.name;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err) ?? String(err);
  } catch {
    return String(err);
  }
}

const version = (ua: string, pattern: RegExp): string => {
  const match = pattern.exec(ua);
  return match?.[1] ? ` ${match[1].replace(/_/g, ".")}` : "";
};

/**
 * Pure. The browser a user agent belongs to, in-app browsers first: a gallery
 * link opened from WhatsApp or Instagram runs inside that app's own web view,
 * which announces itself on top of the real engine's tokens and is the likeliest
 * place for a download to go wrong.
 */
export function describeBrowser(ua: string): string {
  const inApp = detectInAppBrowser(ua);
  if (inApp?.app) return inApp.app === "Google app" ? "Google app browser" : `${inApp.app} in-app browser`;

  if (/CriOS/i.test(ua)) return `Chrome (iOS)${version(ua, /CriOS\/([\d.]+)/i)}`;
  if (/FxiOS/i.test(ua)) return `Firefox (iOS)${version(ua, /FxiOS\/([\d.]+)/i)}`;
  if (/EdgiOS|EdgA|Edg\//i.test(ua)) return `Edge${version(ua, /Edg(?:iOS|A)?\/([\d.]+)/i)}`;
  if (/SamsungBrowser/i.test(ua)) return `Samsung Internet${version(ua, /SamsungBrowser\/([\d.]+)/i)}`;
  if (/MiuiBrowser/i.test(ua)) return `Mi Browser${version(ua, /MiuiBrowser\/([\d.]+)/i)}`;
  if (/UCBrowser/i.test(ua)) return `UC Browser${version(ua, /UCBrowser\/([\d.]+)/i)}`;
  if (/OPR\/|OPT\//i.test(ua)) return `Opera${version(ua, /OP[RT]\/([\d.]+)/i)}`;
  // Any other app's embedded web view, which we can't put a name to.
  if (inApp?.platform === "android") return `Android in-app browser (WebView)${version(ua, /Chrome\/([\d.]+)/i)}`;
  if (inApp?.platform === "ios") return "iOS in-app browser (WebView)";
  if (/Firefox\//i.test(ua)) return `Firefox${version(ua, /Firefox\/([\d.]+)/i)}`;
  if (/Chrome\//i.test(ua)) return `Chrome${version(ua, /Chrome\/([\d.]+)/i)}`;
  if (/Safari\//i.test(ua)) return `Safari${version(ua, /Version\/([\d.]+)/i)}`;
  return "Unknown browser";
}

/**
 * Pure. The phone (or computer) a user agent belongs to. `model` is the Client
 * Hints answer where the browser offers one: Chrome on Android has frozen the
 * model in its user agent to the letter "K", so the hint is the only way to
 * learn the handset there.
 */
export function describeDevice(ua: string, maxTouchPoints = 0, model?: string): string {
  if (/iPhone|iPod/i.test(ua)) return `iPhone, iOS${version(ua, /OS (\d+(?:_\d+)*)/i)}`;
  // iPadOS 13+ reports a desktop Mac user agent; a Mac with a touchscreen is
  // the giveaway (see `isIOSFrom`).
  if (/iPad/i.test(ua) || (/Macintosh/i.test(ua) && maxTouchPoints > 1)) {
    return `iPad, iPadOS${version(ua, /OS (\d+(?:_\d+)*)/i)}`;
  }
  if (/Android/i.test(ua)) {
    const fromUa = /Android [\d.]+; ([^;)]+?)(?: Build\/[^;)]*)?[;)]/i.exec(ua)?.[1]?.trim();
    const handset = model?.trim() || (fromUa && fromUa !== "K" ? fromUa : "");
    return `${handset || "Android phone"}, Android${version(ua, /Android ([\d.]+)/i)}`;
  }
  if (/Windows/i.test(ua)) return "Windows computer";
  if (/Macintosh/i.test(ua)) return "Mac";
  if (/CrOS/i.test(ua)) return "Chromebook";
  if (/Linux/i.test(ua)) return "Linux computer";
  return "Unknown device";
}
