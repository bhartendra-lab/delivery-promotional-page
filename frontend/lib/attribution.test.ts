import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ATTRIBUTION_STORAGE_KEY,
  ATTRIBUTION_TTL_MS,
  captureAttribution,
  clearStoredAttribution,
  getStoredAttribution,
  recipientFromCookie,
  touchFromPage,
} from "./attribution.ts";

const NOW = Date.UTC(2026, 10, 25, 10, 0, 0);
const RID = "01JD8K3M5N7P9Q1R2S4T6V8W0X";
const memory = (initial: Record<string, string> = {}) => {
  const data = { ...initial };
  return {
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => void (data[k] = v),
    removeItem: (k: string) => void delete data[k],
    data,
  };
};

test("a page with tags keeps the tags, the click id and the path only", () => {
  const s = memory();
  const kept = captureAttribution("?utm_source=whatsapp&utm_medium=campaign&utm_campaign=free-event&gclid=Cj0_abc&email=a@b.in", "/login", "", s, NOW);
  assert.deepEqual(kept, { utm_source: "whatsapp", utm_medium: "campaign", utm_campaign: "free-event", gclid: "Cj0_abc", landing_path: "/login", first_touch_at: NOW });
  assert.ok(!JSON.stringify(s.data).includes("a@b.in"), "other query values are never kept");
  assert.deepEqual(getStoredAttribution(s, NOW + 1000), kept);
});

test("a plain visit keeps nothing", () => {
  const s = memory();
  assert.equal(captureAttribution("", "/login", "", s, NOW), null);
  assert.equal(captureAttribution("?foo=bar", "/login", "theme=dark", s, NOW), null);
  assert.deepEqual(s.data, {});
});

test("first touch wins: a later link does not replace it", () => {
  const s = memory();
  captureAttribution("?utm_source=whatsapp", "/login", "", s, NOW);
  const later = captureAttribution("?utm_source=instagram&gclid=zzz", "/", "", s, NOW + 86_400_000);
  assert.equal(later?.utm_source, "whatsapp");
  assert.equal(later?.gclid, undefined);
  assert.equal(later?.first_touch_at, NOW);
});

test("the tracking link cookie gives the recipient id, and fills in a touch that has none", () => {
  assert.equal(recipientFromCookie(`a=1; vy_acq=${RID}; b=2`), RID);
  assert.equal(recipientFromCookie("vy_acq=not-an-id"), "");
  assert.equal(recipientFromCookie("other=1"), "");
  const s = memory();
  assert.equal(captureAttribution("?utm_source=whatsapp", "/login", "", s, NOW)?.campaign_recipient_id, undefined);
  assert.equal(captureAttribution("", "/onboarding", `vy_acq=${RID}`, s, NOW + 5000)?.campaign_recipient_id, RID);
  assert.equal(getStoredAttribution(s, NOW + 6000)?.campaign_recipient_id, RID);
  // And a cookie alone is a touch.
  assert.equal(touchFromPage("", "/login", `vy_acq=${RID}`, NOW)?.campaign_recipient_id, RID);
});

test("a touch is forgotten after 30 days, and so is a malformed one", () => {
  const s = memory();
  captureAttribution("?utm_source=a", "/login", "", s, NOW);
  assert.ok(getStoredAttribution(s, NOW + ATTRIBUTION_TTL_MS - 1));
  assert.equal(getStoredAttribution(s, NOW + ATTRIBUTION_TTL_MS + 1), null);
  assert.equal(s.data[ATTRIBUTION_STORAGE_KEY], undefined, "an expired touch is removed");
  assert.equal(getStoredAttribution(memory({ [ATTRIBUTION_STORAGE_KEY]: "{not json" }), NOW), null);
  assert.equal(getStoredAttribution(memory({ [ATTRIBUTION_STORAGE_KEY]: '{"utm_source":"x"}' }), NOW), null);
});

test("an over long or odd click id is dropped, and values are capped", () => {
  const long = touchFromPage(`?utm_source=${"x".repeat(300)}&gclid=${"g".repeat(250)}&gbraid=bad%20id!`, "/login", "", NOW);
  assert.equal(long?.utm_source?.length, 100);
  assert.equal(long?.gclid, undefined);
  assert.equal(long?.gbraid, undefined);
});

test("storage that throws, or none at all, never breaks the page", () => {
  const broken = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("full");
    },
    removeItem: () => {
      throw new Error("blocked");
    },
  };
  assert.doesNotThrow(() => captureAttribution("?utm_source=a", "/login", "", broken, NOW));
  assert.equal(getStoredAttribution(broken, NOW), null);
  assert.doesNotThrow(() => clearStoredAttribution(broken));
  assert.equal(captureAttribution("?utm_source=a", "/login", "", null, NOW), null);
});
