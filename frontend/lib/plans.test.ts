import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildStorageTiers,
  nearestAvailableIndex,
  yearlySavingsPercent,
  formatStorage,
  formatInr,
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
