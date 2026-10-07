import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildStorageTiers,
  nearestAvailableIndex,
  yearlySavingsPercent,
  formatStorage,
  formatInr,
  firstPurchaseOfferOf,
  offerLine,
  freeEventsLabel,
  photoCapTermsOf,
  payPerEventTerms,
  formatCount,
  formatOfferDate,
  FALLBACK_PHOTO_CAP,
  FALLBACK_PHOTO_CAP_ADDON_SIZE,
  FALLBACK_PHOTO_CAP_ADDON_PRICE,
  type Plan,
} from "./plans.ts";

function monthly(gb: number, price: number, overrides: Partial<Plan> = {}): Plan {
  return {
    _id: `m-${gb}`,
    service_type: "Monthly",
    billing_interval: "monthly",
    storage_limit: gb,
    price,
    ...overrides,
  };
}

function yearly(gb: number, price: number, overrides: Partial<Plan> = {}): Plan {
  return {
    _id: `y-${gb}`,
    service_type: "Yearly",
    billing_interval: "yearly",
    storage_limit: gb,
    price,
    ...overrides,
  };
}

test("buildStorageTiers: unsorted input comes back ascending by storage_limit", () => {
  const tiers = buildStorageTiers([monthly(300, 3600), monthly(75, 900), monthly(150, 1800)]);
  assert.deepEqual(
    tiers.map((t) => t.storage_limit),
    [75, 150, 300],
  );
});

test("buildStorageTiers: duplicate storage_limit across Monthly+Yearly merges into one tier", () => {
  const tiers = buildStorageTiers([monthly(150, 1800), yearly(150, 18000)]);
  assert.equal(tiers.length, 1);
  assert.equal(tiers[0].monthly?._id, "m-150");
  assert.equal(tiers[0].yearly?._id, "y-150");
});

test("buildStorageTiers: a tier with only Monthly gets yearly: null", () => {
  const tiers = buildStorageTiers([monthly(150, 1800)]);
  assert.equal(tiers.length, 1);
  assert.equal(tiers[0].monthly?._id, "m-150");
  assert.equal(tiers[0].yearly, null);
});

test("buildStorageTiers: plans missing price or storage_limit are excluded", () => {
  const noPrice: Plan = { _id: "no-price", service_type: "Monthly", storage_limit: 150 };
  const noStorage: Plan = { _id: "no-storage", service_type: "Monthly", price: 1800 };
  const zeroPrice = monthly(150, 0, { _id: "zero-price" });
  const tiers = buildStorageTiers([noPrice, noStorage, zeroPrice, monthly(75, 900)]);
  assert.equal(tiers.length, 1);
  assert.equal(tiers[0].storage_limit, 75);
});

test("buildStorageTiers: a plan missing billing_interval still lands via intervalOf(service_type)", () => {
  const plan: Plan = { _id: "m-75-no-interval", service_type: "Monthly", storage_limit: 75, price: 900 };
  const tiers = buildStorageTiers([plan]);
  assert.equal(tiers[0].monthly?._id, "m-75-no-interval");
});

test("nearestAvailableIndex: prefers the lower tier on a tie", () => {
  const tiers = buildStorageTiers([
    monthly(75, 900),
    monthly(150, 1800),
    yearly(300, 27000), // no monthly twin
    monthly(600, 6000),
  ]);
  // index 2 (300GB) has no monthly plan; 150GB (index 1) and 600GB (index 3)
  // are equidistant — the lower tier wins.
  assert.equal(nearestAvailableIndex(tiers, 2, "monthly"), 1);
});

test("nearestAvailableIndex: returns `from` when nothing is available", () => {
  const tiers = buildStorageTiers([yearly(150, 18000)]);
  assert.equal(nearestAvailableIndex(tiers, 0, "monthly"), 0);
});

test("yearlySavingsPercent: plan's worked example", () => {
  const tier = { storage_limit: 150, monthly: monthly(150, 1800), yearly: yearly(150, 18000) };
  assert.equal(yearlySavingsPercent(tier), 17);
});

test("yearlySavingsPercent: null when yearly is not actually cheaper", () => {
  const tier = { storage_limit: 150, monthly: monthly(150, 1800), yearly: yearly(150, 999999) };
  assert.equal(yearlySavingsPercent(tier), null);
});

test("yearlySavingsPercent: null when either side is missing", () => {
  assert.equal(yearlySavingsPercent({ storage_limit: 150, monthly: null, yearly: yearly(150, 18000) }), null);
  assert.equal(yearlySavingsPercent({ storage_limit: 150, monthly: monthly(150, 1800), yearly: null }), null);
});

test("formatStorage: GB stays GB, TB rounds/formats", () => {
  assert.equal(formatStorage(75), "75 GB");
  assert.equal(formatStorage(1024), "1 TB");
  assert.equal(formatStorage(1536), "1.5 TB");
});

test("formatInr: lakh grouping, not western thousands grouping", () => {
  assert.equal(formatInr(180000), "₹1,80,000");
});

/* ── Pay per event: first-purchase offer and photo cap ────────────────────── */

function eventPlan(overrides: Partial<Plan> = {}): Plan {
  return { _id: "event", service_type: "Event-based", event_unit_price: 499, ...overrides };
}

test("firstPurchaseOfferOf: null unless the API sent a live offer with a bonus", () => {
  assert.equal(firstPurchaseOfferOf(null), null);
  assert.equal(firstPurchaseOfferOf(eventPlan()), null);
  assert.equal(firstPurchaseOfferOf(eventPlan({ first_purchase_offer: null })), null);
  assert.equal(firstPurchaseOfferOf(eventPlan({ first_purchase_offer: { bonus_events: 0, valid_until: null } })), null);
  assert.deepEqual(firstPurchaseOfferOf(eventPlan({ first_purchase_offer: { bonus_events: 1, valid_until: 123 } })), {
    bonus_events: 1,
    valid_until: 123,
  });
});

test("offerLine / freeEventsLabel: the bonus comes from the offer, never a fixed 1", () => {
  assert.equal(offerLine({ bonus_events: 1, valid_until: null }), "Buy 1 event, get 1 free");
  assert.equal(offerLine({ bonus_events: 2, valid_until: null }), "Buy 1 event, get 2 free");
  assert.equal(freeEventsLabel(1), "1 free event");
  assert.equal(freeEventsLabel(2), "2 free events");
});

test("photoCapTermsOf: API figures win; the named fallbacks fill only what is missing", () => {
  assert.deepEqual(photoCapTermsOf(null), {
    cap: FALLBACK_PHOTO_CAP,
    addonSize: FALLBACK_PHOTO_CAP_ADDON_SIZE,
    addonPrice: FALLBACK_PHOTO_CAP_ADDON_PRICE,
  });
  assert.deepEqual(photoCapTermsOf(eventPlan({ photo_cap: 30000, photo_cap_addon_size: 2500, photo_cap_addon_price: 75 })), {
    cap: 30000,
    addonSize: 2500,
    addonPrice: 75,
  });
  // A block that adds nothing is never offered.
  assert.equal(photoCapTermsOf(eventPlan({ photo_cap_addon_size: 0 })).addonSize, FALLBACK_PHOTO_CAP_ADDON_SIZE);
});

test("payPerEventTerms: every figure comes from the plan", () => {
  const lines = payPerEventTerms(eventPlan({ photo_cap: 25000, photo_cap_addon_size: 2500, photo_cap_addon_price: 75 }));
  assert.equal(lines.length, 5);
  assert.equal(lines[0], "Each event can hold up to 25,000 photos and videos at a time.");
  assert.equal(lines[2], "Need more room? Add 2,500 photos to an event for ₹75. Capacity is added in blocks of 2,500.");
});

test("payPerEventTerms: the offer line appears only for a live offer, and only when asked for", () => {
  const until = Date.UTC(2026, 11, 31, 12);
  const live = eventPlan({ first_purchase_offer: { bonus_events: 1, valid_until: until } });
  const lines = payPerEventTerms(live);
  assert.equal(lines.length, 6);
  assert.equal(
    lines[5],
    "First purchase offer for new studios: buy at least 1 event and get 1 free. One time per studio, whatever number of events you buy. Offer valid till 31 Dec 2026.",
  );
  // No end date: the sentence about validity is left out, not left dangling.
  const openEnded = payPerEventTerms(eventPlan({ first_purchase_offer: { bonus_events: 2, valid_until: null } }));
  assert.equal(
    openEnded[5],
    "First purchase offer for new studios: buy at least 1 event and get 2 free. One time per studio, whatever number of events you buy.",
  );
  // A studio that cannot get the offer is not told about it.
  assert.equal(payPerEventTerms(live, { includeOffer: false }).length, 5);
});

test("payPerEventTerms: no em dashes in copy a studio reads", () => {
  const live = eventPlan({ first_purchase_offer: { bonus_events: 1, valid_until: 1 } });
  for (const line of payPerEventTerms(live)) assert.equal(line.includes("\u2014"), false, line);
});

test("formatCount / formatOfferDate", () => {
  assert.equal(formatCount(20000), "20,000");
  assert.equal(formatCount(500), "500");
  // 31 Dec 2026, 23:30 IST is still the 31st in India, whatever zone the code runs in.
  assert.equal(formatOfferDate(Date.UTC(2026, 11, 31, 18, 0)), "31 Dec 2026");
});
