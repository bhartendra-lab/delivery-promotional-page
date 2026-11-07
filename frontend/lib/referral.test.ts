import { test } from "node:test";
import assert from "node:assert/strict";
import {
  REFERRAL_STORAGE_KEY,
  REFERRAL_TTL_MS,
  normalizeReferralCode,
  getStoredReferral,
  storeReferral,
  clearStoredReferral,
  captureReferralFromUrl,
  rewardForMyPlanSentence,
  referralStatusLabel,
  whatsappShareUrl,
  referralBonusDaysLine,
} from "./referral.ts";

function memoryStore() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

const T0 = Date.UTC(2026, 10, 7);

test("normalizeReferralCode: trims and uppercases; refuses what cannot be a code", () => {
  assert.equal(normalizeReferralCode(" pixl7k2q "), "PIXL7K2Q");
  assert.equal(normalizeReferralCode("A"), null);
  assert.equal(normalizeReferralCode("has space"), null);
  assert.equal(normalizeReferralCode(null), null);
});

test("captureReferralFromUrl: keeps ?ref= normalised, ignores a page without it", () => {
  const store = memoryStore();
  assert.equal(captureReferralFromUrl("?next=/dashboard", store, T0), null);
  assert.deepEqual(captureReferralFromUrl("?ref=pixl7k2q&next=/x", store, T0), { code: "PIXL7K2Q", captured_at: T0 });
  assert.deepEqual(JSON.parse(store.map.get(REFERRAL_STORAGE_KEY)!), { code: "PIXL7K2Q", captured_at: T0 });
});

test("storeReferral: first touch wins until it expires", () => {
  const store = memoryStore();
  storeReferral("FIRST234", store, T0);
  assert.equal(storeReferral("SECOND23", store, T0 + 1000)?.code, "FIRST234");
  // 30 days later the first one is gone and a new link is kept.
  assert.equal(getStoredReferral(store, T0 + REFERRAL_TTL_MS + 1), null);
  assert.equal(storeReferral("SECOND23", store, T0 + REFERRAL_TTL_MS + 1)?.code, "SECOND23");
});

test("getStoredReferral: a malformed or expired entry is dropped", () => {
  const store = memoryStore();
  store.setItem(REFERRAL_STORAGE_KEY, "not json");
  assert.equal(getStoredReferral(store, T0), null);
  store.setItem(REFERRAL_STORAGE_KEY, JSON.stringify({ code: "x", captured_at: T0 }));
  assert.equal(getStoredReferral(store, T0), null);
  assert.equal(store.map.has(REFERRAL_STORAGE_KEY), false);
  store.setItem(REFERRAL_STORAGE_KEY, JSON.stringify({ code: "GOOD1234", captured_at: T0 }));
  assert.equal(getStoredReferral(store, T0 + REFERRAL_TTL_MS)?.code, "GOOD1234", "exactly 30 days is still kept");
});

test("storage that throws never breaks anything", () => {
  const broken = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
    removeItem: () => {
      throw new Error("blocked");
    },
  };
  assert.equal(getStoredReferral(broken, T0), null);
  assert.equal(storeReferral("GOOD1234", broken, T0), null);
  assert.doesNotThrow(() => clearStoredReferral(broken));
  assert.equal(getStoredReferral(null, T0), null);
});

test("clearStoredReferral: forgets it", () => {
  const store = memoryStore();
  storeReferral("GOOD1234", store, T0);
  clearStoredReferral(store);
  assert.equal(getStoredReferral(store, T0), null);
});

test("copy: reward sentence, list labels, share link", () => {
  assert.equal(rewardForMyPlanSentence({ type: "event_credit", quantity: 1 }), "You get 1 free event for every studio that joins with your code and pays.");
  assert.equal(rewardForMyPlanSentence({ type: "validity_days", quantity: 7 }), "Your plan runs 7 days longer for every studio that joins with your code and pays.");
  assert.equal(rewardForMyPlanSentence(null), null);
  assert.equal(referralStatusLabel("rewarded"), "Paid, reward added");
  assert.equal(referralStatusLabel("reward_saved"), "Reward saved until your plan is active");
  assert.equal(referralStatusLabel("joined"), "Joined");
  const link = "https://deliver.vyavasth.in/login?ref=PIX%2B7K2Q";
  assert.equal(whatsappShareUrl(`Join me: ${link}`, link), `https://wa.me/?text=${encodeURIComponent(`Join me: ${link}`)}`);
  assert.equal(whatsappShareUrl(null, link), `https://wa.me/?text=${encodeURIComponent(link)}`);
  for (const text of [rewardForMyPlanSentence({ type: "pending", quantity: null }), referralStatusLabel("reward_saved")]) {
    assert.doesNotMatch(text ?? "", /[–—]/);
  }
});

test("referralBonusDaysLine: says the autopay date does not move, only on autopay", () => {
  assert.equal(referralBonusDaysLine(7, true), "Includes 7 bonus days from referrals. Your autopay date does not change.");
  assert.equal(referralBonusDaysLine(7, false), "Includes 7 bonus days from referrals.");
  assert.equal(referralBonusDaysLine(1, false), "Includes 1 bonus day from referrals.");
  assert.equal(referralBonusDaysLine(0, true), null);
  assert.equal(referralBonusDaysLine(undefined, true), null);
});
