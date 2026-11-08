/**
 * Pure. "Continue in the app" or "Continue in browser" (the guest app,
 * Phase 8). Every phone or tablet visitor is asked; desktops never are.
 *
 * Choosing the app goes through the neutral handoff domain
 * (open.vyavasth.in). iOS opens an installed app from a universal link only
 * when the tap goes to a DIFFERENT domain from the current page, and the
 * gallery lives on deliver.vyavasth.in and on studios' own domains — so a link
 * to /e/<uid> on the handoff host is what lets Safari hand over. When the app
 * is not installed, that page sends the guest to the right store.
 *
 * Uses the two sanctioned UA reads from download/capability.ts. Here they DO
 * decide behaviour, deliberately: whether to offer the app is a question about
 * the device, and a wrong answer only costs one extra choice.
 *
 * No aliased imports: tested under node --test.
 */
import { isIOSFrom, isMobileFrom } from "./download/capability.ts";

export const HANDOFF_HOST = "open.vyavasth.in";
export const SESSION_KEY_PREFIX = "vy-app-handoff:";

/**
 * `androidApkUrl` / `iosManifestUrl`: DIRECT INSTALL, the stopgap until the
 * app is in the stores. Android downloads the APK from our CDN; iOS installs
 * an Ad Hoc build through an itms-services manifest (which needs a paid Apple
 * account and the device registered, so it stays unset until then). When set,
 * direct install wins over the store: remove them once the listings are live.
 */
export type HandoffEnv = {
  enabled: boolean;
  appStoreId?: string | null;
  playPackage?: string | null;
  androidApkUrl?: string | null;
  iosManifestUrl?: string | null;
};
export const APP_PACKAGE = "in.vyavasth.gallery";

/** How "Continue in the app" gets the app onto this phone. */
export type InstallRoute = "store" | "direct";
export function installRoute(platform: HandoffPlatform | null, env: HandoffEnv): InstallRoute | null {
  if (platform === "android") return env.androidApkUrl ? "direct" : env.playPackage ? "store" : null;
  if (platform === "ios") return env.iosManifestUrl ? "direct" : env.appStoreId ? "store" : null;
  return null;
}
export type HandoffPlatform = "ios" | "android";

/** The phone/tablet platform, or null for a desktop (never asked). */
export function handoffPlatform({ ua, uaMobile, maxTouchPoints }: { ua: string; uaMobile?: boolean; maxTouchPoints: number }): HandoffPlatform | null {
  if (isIOSFrom(ua, maxTouchPoints)) return "ios";
  if (/Android/i.test(ua) && isMobileFrom(ua, uaMobile ?? undefined)) return "android";
  // Android tablets report no "Mobi" but do say Android.
  if (/Android/i.test(ua)) return "android";
  return null;
}

export function shouldOfferAppHandoff({
  ua,
  uaMobile,
  maxTouchPoints,
  env,
  event,
  sessionChoice,
}: {
  ua: string;
  uaMobile?: boolean;
  maxTouchPoints: number;
  env: HandoffEnv;
  event: { is_active?: boolean; gallery_publish_status?: string };
  /** What this browser session already chose for this event, if anything. */
  sessionChoice: string | null;
}): boolean {
  if (!env.enabled) return false;
  if (sessionChoice) return false;
  if (event.is_active === false || event.gallery_publish_status === "expired") return false;
  return installRoute(handoffPlatform({ ua, uaMobile, maxTouchPoints }), env) !== null;
}

export const handoffUrl = (uid: string, src = "web") => `https://${HANDOFF_HOST}/e/${encodeURIComponent(uid)}${src ? `?src=${src}` : ""}`;

export const appStoreUrl = (appStoreId: string) => `https://apps.apple.com/app/id${appStoreId}`;

/** Play with the install referrer the app reads on first launch (vy_uid). */
export function buildPlayUrl(pkg: string, uid: string): string {
  const referrer = encodeURIComponent(`vy_uid=${uid}&utm_source=gallery`);
  return `https://play.google.com/store/apps/details?id=${encodeURIComponent(pkg)}&referrer=${referrer}`;
}

/** Opens the app at this event when installed, else `fallback` (default:
 *  Play with the referrer; in direct mode, the APK, which starts its download). */
export function buildIntentUrl(pkg: string, uid: string, fallback: string = buildPlayUrl(pkg, uid)): string {
  return `intent://e/${encodeURIComponent(uid)}#Intent;scheme=https;host=${HANDOFF_HOST};package=${pkg};S.browser_fallback_url=${encodeURIComponent(fallback)};end`;
}

/** iOS over-the-air install of an Ad Hoc build (manifest must be https). */
export const itmsServicesUrl = (manifestUrl: string) => `itms-services://?action=download-manifest&url=${encodeURIComponent(manifestUrl)}`;

/** Where the fallback page /e/<uid> sends a visitor the app did not catch. */
export function fallbackTarget({ platform, uid, env, galleryBase }: { platform: HandoffPlatform | null; uid: string; env: HandoffEnv; galleryBase: string }): string {
  // Direct install: the gallery itself offers the download and the steps.
  const route = installRoute(platform, env);
  if (route === "store" && platform === "ios" && env.appStoreId) return appStoreUrl(env.appStoreId);
  if (route === "store" && platform === "android" && env.playPackage) return buildPlayUrl(env.playPackage, uid);
  return `${galleryBase.replace(/\/$/, "")}/event/${encodeURIComponent(uid)}`;
}
