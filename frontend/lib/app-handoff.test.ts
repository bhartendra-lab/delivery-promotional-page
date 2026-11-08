import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIntentUrl, buildPlayUrl, fallbackTarget, handoffPlatform, handoffUrl, installRoute, itmsServicesUrl, shouldOfferAppHandoff } from "./app-handoff.ts";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const ANDROID_TABLET = "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const WA_IOS = `${IPHONE.replace(" Safari/604.1", "")} WhatsApp/24.1`;
const DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const MAC = IPAD_DESKTOP_UA;

const env = { enabled: true, appStoreId: "123", playPackage: "in.vyavasth.gallery" };
const live = { is_active: true, gallery_publish_status: "published" };
const offer = (over: Partial<Parameters<typeof shouldOfferAppHandoff>[0]>) =>
  shouldOfferAppHandoff({ ua: IPHONE, maxTouchPoints: 5, env, event: live, sessionChoice: null, ...over });

const TABLE: [string, Partial<Parameters<typeof shouldOfferAppHandoff>[0]>, boolean][] = [
  ["iPhone Safari", {}, true],
  ["iPhone in WhatsApp's browser", { ua: WA_IOS }, true],
  ["iPadOS (desktop UA, touch)", { ua: IPAD_DESKTOP_UA, maxTouchPoints: 5 }, true],
  ["Android Chrome", { ua: ANDROID, uaMobile: true }, true],
  ["Android tablet", { ua: ANDROID_TABLET, uaMobile: false }, true],
  ["Windows desktop: never", { ua: DESKTOP, maxTouchPoints: 0, uaMobile: false }, false],
  ["Mac desktop: never", { ua: MAC, maxTouchPoints: 0 }, false],
  ["switch off", { env: { ...env, enabled: false } }, false],
  ["no App Store id on iOS", { env: { ...env, appStoreId: null } }, false],
  ["no Play package on Android", { ua: ANDROID, env: { ...env, playPackage: null } }, false],
  ["Android, direct APK, no Play listing", { ua: ANDROID, env: { enabled: true, androidApkUrl: "https://cdn.example/app.apk" } }, true],
  ["iOS, Ad Hoc manifest, no App Store", { env: { enabled: true, iosManifestUrl: "https://cdn.example/manifest.plist" } }, true],
  ["iOS with only an APK: not offered", { env: { enabled: true, androidApkUrl: "https://cdn.example/app.apk" } }, false],
  ["already chose this session", { sessionChoice: "browser" }, false],
  ["paused gallery", { event: { is_active: false } }, false],
  ["expired gallery", { event: { gallery_publish_status: "expired" } }, false],
];
for (const [name, over, want] of TABLE) test(`shouldOfferAppHandoff: ${name}`, () => assert.equal(offer(over), want));

test("handoffPlatform", () => {
  assert.equal(handoffPlatform({ ua: IPHONE, maxTouchPoints: 5 }), "ios");
  assert.equal(handoffPlatform({ ua: ANDROID, maxTouchPoints: 5 }), "android");
  assert.equal(handoffPlatform({ ua: DESKTOP, maxTouchPoints: 0 }), null);
});

test("buildPlayUrl carries the install referrer, encoded", () => {
  assert.equal(
    buildPlayUrl("in.vyavasth.gallery", "priya-rahul"),
    "https://play.google.com/store/apps/details?id=in.vyavasth.gallery&referrer=vy_uid%3Dpriya-rahul%26utm_source%3Dgallery",
  );
});

test("buildIntentUrl opens the app, else Play with the referrer", () => {
  const url = buildIntentUrl("in.vyavasth.gallery", "abc");
  assert.ok(url.startsWith("intent://e/abc#Intent;scheme=https;host=open.vyavasth.in;package=in.vyavasth.gallery;S.browser_fallback_url="));
  assert.ok(url.endsWith(";end"));
  const fallback = decodeURIComponent(url.split("S.browser_fallback_url=")[1].replace(/;end$/, ""));
  assert.equal(fallback, buildPlayUrl("in.vyavasth.gallery", "abc"));
});

test("handoff link and fallback targets", () => {
  assert.equal(handoffUrl("abc"), "https://open.vyavasth.in/e/abc?src=web");
  assert.equal(handoffUrl("abc", ""), "https://open.vyavasth.in/e/abc");
  assert.equal(fallbackTarget({ platform: "ios", uid: "abc", env, galleryBase: "https://deliver.vyavasth.in" }), "https://apps.apple.com/app/id123");
  assert.equal(fallbackTarget({ platform: "android", uid: "abc", env, galleryBase: "x" }), buildPlayUrl("in.vyavasth.gallery", "abc"));
  assert.equal(fallbackTarget({ platform: null, uid: "abc", env, galleryBase: "https://deliver.vyavasth.in/" }), "https://deliver.vyavasth.in/event/abc");
});

test("installRoute: direct install wins over the store, per platform", () => {
  const both = { ...env, androidApkUrl: "https://cdn.example/app.apk" };
  assert.equal(installRoute("android", both), "direct");
  assert.equal(installRoute("ios", both), "store");
  assert.equal(installRoute("android", env), "store");
  assert.equal(installRoute(null, both), null);
  assert.equal(installRoute("ios", { enabled: true, iosManifestUrl: "https://m" }), "direct");
});

test("buildIntentUrl in direct mode falls back to the APK", () => {
  const url = buildIntentUrl("in.vyavasth.gallery", "abc", "https://cdn.example/app.apk");
  const fallback = decodeURIComponent(url.split("S.browser_fallback_url=")[1].replace(/;end$/, ""));
  assert.equal(fallback, "https://cdn.example/app.apk");
});

test("itmsServicesUrl encodes the manifest", () => {
  assert.equal(itmsServicesUrl("https://cdn.example/m.plist?v=1"), "itms-services://?action=download-manifest&url=https%3A%2F%2Fcdn.example%2Fm.plist%3Fv%3D1");
});

test("fallbackTarget in direct mode sends Android to the gallery, not Play", () => {
  const direct = { ...env, androidApkUrl: "https://cdn.example/app.apk" };
  assert.equal(fallbackTarget({ platform: "android", uid: "abc", env: direct, galleryBase: "https://deliver.vyavasth.in" }), "https://deliver.vyavasth.in/event/abc");
});
