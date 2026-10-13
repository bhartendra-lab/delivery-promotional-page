import { test } from "node:test";
import assert from "node:assert/strict";
import { describeBrowser, describeDevice, describeError, noteFailureReason } from "./failure.ts";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1";
const IPHONE_INSTAGRAM =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 337.0.0.29.118 (iPhone14,5; iOS 17_5; en_IN)";
const IPHONE_WEBVIEW =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const ANDROID_CHROME_FROZEN =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const ANDROID_SAMSUNG =
  "Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36";
const ANDROID_WEBVIEW =
  "Mozilla/5.0 (Linux; Android 12; RMX3085 Build/SP1A.210812.016; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0.6422.165 Mobile Safari/537.36";
const IPAD_AS_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";

test("describeBrowser names the real browser on iPhone", () => {
  assert.equal(describeBrowser(IPHONE_SAFARI), "Safari 17.5");
  assert.equal(describeBrowser(IPHONE_CHROME), "Chrome (iOS) 126.0.6478.54");
});

test("describeBrowser puts an in-app browser ahead of the engine it wraps", () => {
  assert.equal(describeBrowser(IPHONE_INSTAGRAM), "Instagram in-app browser");
  assert.equal(describeBrowser(IPHONE_WEBVIEW), "iOS in-app browser (WebView)");
  assert.equal(describeBrowser(ANDROID_WEBVIEW), "Android in-app browser (WebView) 125.0.6422.165");
});

test("describeBrowser tells Samsung Internet from the Chrome token it carries", () => {
  assert.equal(describeBrowser(ANDROID_SAMSUNG), "Samsung Internet 25.0");
  assert.equal(describeBrowser(ANDROID_CHROME_FROZEN), "Chrome 126.0.0.0");
});

test("describeDevice reads the iOS version and tells an iPad from a Mac", () => {
  assert.equal(describeDevice(IPHONE_SAFARI), "iPhone, iOS 17.5.1");
  assert.equal(describeDevice(IPAD_AS_MAC, 5), "iPad, iPadOS");
  assert.equal(describeDevice(IPAD_AS_MAC, 0), "Mac");
});

test("describeDevice does not trust the iOS version Apple froze at 18", () => {
  const frozen = (rest: string) =>
    `Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) ${rest}`;
  // Safari 26+ keeps counting in "Version/", which is the real iOS version.
  assert.equal(describeDevice(frozen("Version/27.2 Mobile/15E148 Safari/604.1")), "iPhone, iOS 27.2");
  // Safari 18 on a real iOS 18.7 says so itself.
  assert.equal(describeDevice(frozen("Version/18.7 Mobile/15E148 Safari/604.1")), "iPhone, iOS 18.7");
  // Chrome on iOS has no such number: the token is only a floor.
  assert.equal(describeDevice(frozen("CriOS/140.0.0.0 Mobile/15E148 Safari/604.1")), "iPhone, iOS 18.7 or later");
});

test("describeDevice prefers the Client Hints model over a frozen user agent", () => {
  assert.equal(describeDevice(ANDROID_CHROME_FROZEN), "Android phone, Android 10");
  assert.equal(describeDevice(ANDROID_CHROME_FROZEN, 5, "Pixel 8"), "Pixel 8, Android 10");
  assert.equal(describeDevice(ANDROID_SAMSUNG), "SAMSUNG SM-A546E, Android 13");
  assert.equal(describeDevice(ANDROID_WEBVIEW), "RMX3085, Android 12");
});

test("describeError flattens whatever was thrown", () => {
  assert.equal(describeError(new TypeError("Load failed")), "TypeError: Load failed");
  assert.equal(describeError("HTTP 403"), "HTTP 403");
  assert.equal(describeError({ code: 7 }), '{"code":7}');
});

test("noteFailureReason keeps a short list of distinct reasons", () => {
  const reasons: string[] = [];
  for (const r of ["a", "a", "b", "c", "d", "e", "f"]) noteFailureReason(reasons, r);
  assert.deepEqual(reasons, ["a", "b", "c", "d", "e"]);
});
