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
  FALLBACK_VALIDITY_BASE_DAYS,
  FALLBACK_VALIDITY_EXTENSION_OPTIONS,
  validityOptionsOf,
  validityBaseDaysOf,
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
  assert.equal(lines.length, 8);
  assert.equal(lines[0], "Each event can hold up to 25,000 photos at a time.");
  assert.equal(lines[2], "Need more room? Add 2,500 photos to an event for ₹75. Capacity is added in blocks of 2,500.");
});

test("payPerEventTerms: how long an event lives and what extending it costs, from the plan", () => {
  // A plans API that predates validity extensions: the fallbacks, which mirror
  // what the API charges.
  const fallback = payPerEventTerms(eventPlan());
  assert.equal(fallback[4], "Each event stays live for 3 months from the day you create it. Unused events never expire.");
  assert.equal(
    fallback[5],
    "Need it for longer? Before an event closes, you or your Client can extend it: 3 months for ₹199, 6 months for ₹299 or 12 months for ₹499, GST included. The time is added to the date the event was due to close.",
  );
  assert.equal(fallback[6], "We email you 7 days before an event closes, and message your Clients on WhatsApp with their own link to extend it.");
  assert.equal(
    fallback[7],
    "When an event closes, guests can no longer open it and its photos are deleted. A closed event cannot be extended. Extensions are not refundable.",
  );

  // Edited on the Service: both lines follow, with no deploy.
  const edited = payPerEventTerms(
    eventPlan({ validity_base_days: 45, validity_extension_options: [{ months: 6, price: 249.5 }, { months: 1, price: 99 }] }),
  );
  assert.equal(edited[4], "Each event stays live for 45 days from the day you create it. Unused events never expire.");
  assert.ok(edited[5].includes("you or your Client can extend it: 1 month for ₹99 or 6 months for ₹249.50, GST included."));
  const single = payPerEventTerms(eventPlan({ validity_base_days: 30, validity_extension_options: [{ months: 3, price: 199 }] }));
  assert.equal(single[4], "Each event stays live for 1 month from the day you create it. Unused events never expire.");
  assert.ok(single[5].includes("can extend it: 3 months for ₹199, GST included."));
});

test("validityOptionsOf / validityBaseDaysOf: the plan's own figures when usable, the fallback otherwise", () => {
  assert.deepEqual(FALLBACK_VALIDITY_EXTENSION_OPTIONS, [
    { months: 3, price: 199 },
    { months: 6, price: 299 },
    { months: 12, price: 499 },
  ]);
  assert.equal(FALLBACK_VALIDITY_BASE_DAYS, 90);
  for (const plan of [null, undefined, eventPlan(), eventPlan({ validity_extension_options: [] }), eventPlan({ validity_extension_options: null })]) {
    assert.deepEqual(validityOptionsOf(plan), FALLBACK_VALIDITY_EXTENSION_OPTIONS);
    assert.equal(validityBaseDaysOf(plan), 90);
  }
  // Sorted, with an unusable entry and a repeated period dropped.
  assert.deepEqual(
    validityOptionsOf(
      eventPlan({
        validity_extension_options: [
          { months: 12, price: 400 },
          { months: 1, price: 99 },
          { months: 1, price: 50 },
          { months: 0, price: 10 },
          { months: 2.5, price: 10 },
          { months: 6, price: 0 },
        ],
      }),
    ),
    [{ months: 1, price: 99 }, { months: 12, price: 400 }],
  );
  // The fallback is never handed out by reference, so a caller cannot edit it.
  validityOptionsOf(null)[0].price = 1;
  assert.equal(FALLBACK_VALIDITY_EXTENSION_OPTIONS[0].price, 199);
  assert.equal(validityBaseDaysOf(eventPlan({ validity_base_days: 120 })), 120);
  assert.equal(validityBaseDaysOf(eventPlan({ validity_base_days: 0 })), 90);
});

test("payPerEventTerms: the offer line appears only for a live offer, and only when asked for", () => {
  const until = Date.UTC(2026, 11, 31, 12);
  const live = eventPlan({ first_purchase_offer: { bonus_events: 1, valid_until: until } });
  const lines = payPerEventTerms(live);
  assert.equal(lines.length, 9);
  assert.equal(
    lines[8],
    "First purchase offer for new studios: buy at least 1 event and get 1 free. One time per studio, whatever number of events you buy. Offer valid till 31 Dec 2026.",
  );
  // No end date: the sentence about validity is left out, not left dangling.
  const openEnded = payPerEventTerms(eventPlan({ first_purchase_offer: { bonus_events: 2, valid_until: null } }));
  assert.equal(
    openEnded[8],
    "First purchase offer for new studios: buy at least 1 event and get 2 free. One time per studio, whatever number of events you buy.",
  );
  // A studio that cannot get the offer is not told about it.
  assert.equal(payPerEventTerms(live, { includeOffer: false }).length, 8);
});

test("payPerEventTerms: no em dashes in copy a studio reads", () => {
  const live = eventPlan({ first_purchase_offer: { bonus_events: 1, valid_until: 1 } });
  for (const line of payPerEventTerms(live)) assert.doesNotMatch(line, /[\u2013\u2014]/, line);
});

test("formatCount / formatOfferDate", () => {
  assert.equal(formatCount(20000), "20,000");
  assert.equal(formatCount(500), "500");
  // 31 Dec 2026, 23:30 IST is still the 31st in India, whatever zone the code runs in.
  assert.equal(formatOfferDate(Date.UTC(2026, 11, 31, 18, 0)), "31 Dec 2026");
});
