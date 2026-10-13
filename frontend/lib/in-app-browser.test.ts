import { test } from "node:test";
import assert from "node:assert/strict";
import { canContinueInApp, detectInAppBrowser, escapeUrl, shouldAutoEscape } from "./in-app-browser.ts";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1";
const IPHONE_INSTAGRAM =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 337.0.0.29.118 (iPhone14,5; iOS 17_5; en_IN)";
const IPHONE_WEBVIEW =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const ANDROID_SAMSUNG =
  "Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36";
const ANDROID_FACEBOOK =
  "Mozilla/5.0 (Linux; Android 13; SM-A546E Build/TP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/470.0.0.0;]";
const ANDROID_WEBVIEW =
  "Mozilla/5.0 (Linux; Android 12; RMX3085 Build/SP1A.210812.016; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0.6422.165 Mobile Safari/537.36";
const DESKTOP_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

test("a real browser is never taken for an in-app one", () => {
  for (const ua of [IPHONE_SAFARI, IPHONE_CHROME, ANDROID_CHROME, ANDROID_SAMSUNG, DESKTOP_CHROME]) {
    assert.equal(detectInAppBrowser(ua), null);
  }
});

test("a named app is recognised on both platforms", () => {
  assert.deepEqual(detectInAppBrowser(IPHONE_INSTAGRAM), { app: "Instagram", platform: "ios" });
  assert.deepEqual(detectInAppBrowser(ANDROID_FACEBOOK), { app: "Facebook", platform: "android" });
});

test("an unnamed web view is still an in-app browser", () => {
  assert.deepEqual(detectInAppBrowser(IPHONE_WEBVIEW), { app: null, platform: "ios" });
  assert.deepEqual(detectInAppBrowser(ANDROID_WEBVIEW), { app: null, platform: "android" });
});

test("a gallery saved to the iPhone home screen is not a web view", () => {
  assert.equal(detectInAppBrowser(IPHONE_WEBVIEW, true), null);
});

test("escapeUrl builds the platform's way out and keeps the path and query", () => {
  const href = "https://deliver.vyavasth.in/event/abc-123?ref=wa#top";
  assert.equal(
    escapeUrl(href, "android"),
    "intent://deliver.vyavasth.in/event/abc-123?ref=wa#Intent;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end",
  );
  assert.equal(escapeUrl(href, "ios"), "x-safari-https://deliver.vyavasth.in/event/abc-123?ref=wa");
  assert.equal(escapeUrl(href, "other"), null);
  assert.equal(escapeUrl("not a url", "ios"), null);
});

test("the escape fires unasked on iPhone, and on Android only inside a named app", () => {
  assert.equal(shouldAutoEscape({ app: "Instagram", platform: "ios" }), true);
  assert.equal(shouldAutoEscape({ app: null, platform: "ios" }), true);
  assert.equal(shouldAutoEscape({ app: "Facebook", platform: "android" }), true);
  assert.equal(shouldAutoEscape({ app: null, platform: "android" }), false);
});

test("only an iPhone Guest is held at the gate", () => {
  assert.equal(canContinueInApp({ app: "Instagram", platform: "ios" }), false);
  assert.equal(canContinueInApp({ app: "Instagram", platform: "android" }), true);
});
