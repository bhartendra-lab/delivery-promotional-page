import { test } from "node:test";
import assert from "node:assert/strict";
import { photoCountBucket, planKindOf, uploadTierWord } from "./analytics-params.ts";

test("photo counts become buckets, never the exact number", () => {
  assert.equal(photoCountBucket(0), "1-50");
  assert.equal(photoCountBucket(1), "1-50");
  assert.equal(photoCountBucket(50), "1-50");
  assert.equal(photoCountBucket(51), "51-200");
  assert.equal(photoCountBucket(200), "51-200");
  assert.equal(photoCountBucket(500), "201-500");
  assert.equal(photoCountBucket(1000), "501-1000");
  assert.equal(photoCountBucket(2000), "1001-2000");
  assert.equal(photoCountBucket(2001), "2000+");
  assert.equal(photoCountBucket(Number.NaN), "1-50");
});

test("plans and tiers are fixed words", () => {
  assert.deepEqual(["Free", "Event-based", "Monthly", "Yearly", undefined, "x"].map((s) => planKindOf(s)), ["free", "event_based", "monthly", "yearly", "unknown", "unknown"]);
  assert.deepEqual(["2560", "4096", "original"].map(uploadTierWord), ["hd", "4k", "original"]);
});
