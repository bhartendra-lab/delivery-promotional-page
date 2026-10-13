/**
 * In-app browsers: detecting one, and getting a Guest out of it.
 *
 * A gallery link tapped inside Instagram, Facebook and the like opens in that
 * app's own web view rather than in Safari or Chrome. Downloads are the first
 * thing to break there (a saved file is accepted and then silently dropped),
 * and the camera often isn't reachable either, so the gallery tries to move the
 * Guest to a real browser as soon as it loads.
 *
 * Nothing in a link or a QR code can choose the browser; it can only be done
 * from the page, after the fact, and by two unrelated mechanisms:
 *
 *  - Android: an `intent://` URL asks the system to open the page in the
 *    Guest's default browser. Documented and dependable in the big apps, but a
 *    bare web view that doesn't understand the scheme replaces the page with an
 *    error — so it is only fired automatically for apps known to handle it.
 *  - iOS: Apple offers no supported way out. `x-safari-https://` opens Safari
 *    on iOS 17+, is undocumented, and does nothing at all where an app or an
 *    older iOS ignores it. Best effort, which is why a screen with manual steps
 *    always follows.
 *
 * No aliased imports — this module is unit-tested under `node --test`.
 */

export type InAppBrowser = {
  /** The host app, or null for a web view we can't put a name to. */
  app: string | null;
  platform: "ios" | "android" | "other";
};

const NAMED_APPS: [RegExp, string][] = [
  [/Instagram/i, "Instagram"],
  [/FBAN|FBAV|FB_IAB/i, "Facebook"],
  [/WhatsApp/i, "WhatsApp"],
  [/Snapchat/i, "Snapchat"],
  [/\bLine\//i, "LINE"],
  [/LinkedInApp/i, "LinkedIn"],
  [/Twitter/i, "X"],
  [/GSA\//i, "Google app"],
];

function platformOf(ua: string): InAppBrowser["platform"] {
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

/**
 * Pure. The in-app browser a user agent belongs to, or null for a real one.
 *
 * `standalone` is a gallery saved to the iPhone home screen: it carries the
 * same Safari-less user agent as a web view, and is nothing of the kind.
 */
export function detectInAppBrowser(ua: string, standalone = false): InAppBrowser | null {
  const platform = platformOf(ua);
  for (const [pattern, app] of NAMED_APPS) if (pattern.test(ua)) return { app, platform };
  // Any other app's embedded web view. Android marks one with "; wv"; on iOS a
  // WKWebView is recognisable by having no "Safari/" token at all.
  if (/; wv\)/i.test(ua)) return { app: null, platform: "android" };
  if (platform === "ios" && !standalone && !/Safari\//i.test(ua)) return { app: null, platform: "ios" };
  return null;
}

/**
 * Pure. The URL that asks the device to reopen `href` in a real browser, or
 * null where there is no such mechanism (or `href` isn't a plain web URL).
 */
export function escapeUrl(href: string, platform: InAppBrowser["platform"]): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const scheme = url.protocol.slice(0, -1);
  const rest = `${url.host}${url.pathname}${url.search}`;
  if (platform === "android") {
    // No `package`: naming Chrome would dead-end a Guest who uses Samsung
    // Internet or has Chrome disabled. The system picks their default browser.
    return `intent://${rest}#Intent;scheme=${scheme};action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end`;
  }
  if (platform === "ios") return `x-safari-${scheme}://${rest}`;
  return null;
}

/**
 * Pure. Whether to fire the escape without being asked. On iOS an ignored
 * scheme costs nothing, so always. On Android only inside a named app: those
 * hand `intent://` to the system, where an unknown web view may show an error
 * page in place of the gallery.
 */
export function shouldAutoEscape(browser: InAppBrowser): boolean {
  if (browser.platform === "ios") return true;
  return browser.platform === "android" && browser.app !== null;
}

/**
 * Pure. Whether the Guest may carry on where they are. Not on iPhone: a
 * download there fails without an error, so letting them through only moves
 * the disappointment to the end of the visit.
 */
export function canContinueInApp(browser: InAppBrowser): boolean {
  return browser.platform !== "ios";
}
