import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  buildTrackingData,
  DEVICE_ID_KEY,
  deviceIdFrom,
  GUEST_EVENT_TYPES,
  makeDeviceId,
  METRIC_SOURCES,
  onceKey,
  optedOutByBrowser,
  poweredByUrl,
} from "./guest-metrics-core.ts";

const memory = () => {
  const data: Record<string, string> = {};
  return { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v), data };
};

test("the six events the backend takes", () => {
  assert.deepEqual([...GUEST_EVENT_TYPES], ["gallery_view", "photo_open", "download", "selfie_search", "share", "powered_by_click"]);
});

test("a device id is random, kept for next time, and never derived from the guest", () => {
  const s = memory();
  const a = deviceIdFrom(s, { randomUUID: () => "11111111-2222-4333-8444-555555555555" });
  assert.equal(a, "11111111-2222-4333-8444-555555555555");
  assert.equal(s.data[DEVICE_ID_KEY], a);
  assert.equal(deviceIdFrom(s, { randomUUID: () => "ffffffff-ffff-4fff-8fff-ffffffffffff" }), a, "the kept one wins");
  assert.match(makeDeviceId(undefined), /^[0-9a-f]{32}$/);
  assert.match(makeDeviceId({ getRandomValues: (b) => b.fill(7) }), /^(07){16}$/);
});

test("storage that throws, or a kept value that is not an id, still gives a fresh id", () => {
  const broken = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("full");
    },
  };
  assert.match(deviceIdFrom(broken, undefined), /^[0-9a-f]{32}$/);
  assert.match(deviceIdFrom(null, undefined), /^[0-9a-f]{32}$/);
  const s = memory();
  s.data[DEVICE_ID_KEY] = "<script>";
  assert.notEqual(deviceIdFrom(s, { randomUUID: () => "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" }), "<script>");
});

test("tracking data is the device id plus a sound count and a known source, nothing else", () => {
  assert.deepEqual(buildTrackingData("dev12345"), { device_id: "dev12345" });
  assert.deepEqual(buildTrackingData("dev12345", { count: 3, source: "viewer" }), { device_id: "dev12345", count: 3, source: "viewer" });
  assert.deepEqual(buildTrackingData("dev12345", { count: 0 }), { device_id: "dev12345" });
  assert.deepEqual(buildTrackingData("dev12345", { count: 99999 }), { device_id: "dev12345" });
  assert.deepEqual(buildTrackingData("dev12345", { count: 1.5 }), { device_id: "dev12345" });
  assert.deepEqual(buildTrackingData("dev12345", { source: "evil" as never }), { device_id: "dev12345" });
  for (const s of METRIC_SOURCES) assert.equal(buildTrackingData("dev12345", { source: s }).source, s);
});

test("a view and a selfie search count once per session; the rest count every time", () => {
  assert.equal(onceKey("e-1", "gallery_view"), "vy_gm:e-1:gallery_view");
  assert.equal(onceKey("e-1", "selfie_search"), "vy_gm:e-1:selfie_search");
  for (const t of ["photo_open", "download", "share", "powered_by_click"] as const) assert.equal(onceKey("e-1", t), null);
});

test("Do Not Track and Global Privacy Control are honoured", () => {
  assert.equal(optedOutByBrowser({ doNotTrack: "1" }), true);
  assert.equal(optedOutByBrowser({ globalPrivacyControl: true }), true);
  assert.equal(optedOutByBrowser({ doNotTrack: "0" }), false);
  assert.equal(optedOutByBrowser({}), false);
  assert.equal(optedOutByBrowser(undefined), false);
});

test("the Powered by Vyavasth link is tagged, and keeps what was already on it", () => {
  assert.equal(poweredByUrl("https://vyavasth.in"), "https://vyavasth.in/?utm_source=gallery&utm_medium=referral");
  const u = new URL(poweredByUrl("https://vyavasth.in/studios?ref=ABC"));
  assert.equal(u.searchParams.get("ref"), "ABC");
  assert.equal(u.searchParams.get("utm_source"), "gallery");
  assert.equal(u.searchParams.get("utm_medium"), "referral");
});

test("no third-party script or tracker is loaded anywhere on the guest gallery", () => {
  const root = new URL("..", import.meta.url).pathname;
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(tsx?|jsx?)$/.test(name) && !name.endsWith(".test.ts")) files.push(p);
    }
  };
  for (const d of ["app/(client)", "app/e", "components/event"]) walk(join(root, d));
  assert.ok(files.length > 20, "found the guest files");
  const banned = /posthog|googletagmanager|GoogleTagManager|gtag\(|fbq\(|connect\.facebook|@next\/third-parties|lib\/analytics["'/]/;
  for (const f of files) assert.doesNotMatch(readFileSync(f, "utf8"), banned, f);
  // The guest metrics talk to our own API only.
  const runtime = readFileSync(join(root, "lib/guest-metrics.ts"), "utf8");
  assert.doesNotMatch(runtime, /https?:\/\//);
});
