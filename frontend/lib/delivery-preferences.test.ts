import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DELIVERY_PREFERENCE_DEFAULTS,
  changedPreferenceKeys,
  normalizeDeliveryPreferences,
  resolveDeliveryPreferenceFields,
  type ArchiveTier,
  type DeliveryPreferences,
} from "./delivery-preferences.ts";

const prefs = (over: Partial<DeliveryPreferences> = {}): DeliveryPreferences => ({
  ...DELIVERY_PREFERENCE_DEFAULTS,
  ...over,
});

const keys = (value: DeliveryPreferences, archiveTier: ArchiveTier | null) =>
  resolveDeliveryPreferenceFields(value, { archiveTier }).map((f) => f.key);

const archiveRow = (value: DeliveryPreferences, archiveTier: ArchiveTier | null) =>
  resolveDeliveryPreferenceFields(value, { archiveTier }).find(
    (f) => f.key === "archive_download_access",
  );

/* ── Which rows show at all ──────────────────────────────────────────────── */

test("a QHD-only event shows no archive download row — there is nothing to govern", () => {
  assert.deepEqual(keys(prefs(), null), ["allow_download"]);
  // Even with the preference set to its most permissive value: no unwatermarked
  // copy exists, so the control would govern nothing.
  assert.deepEqual(keys(prefs({ archive_download_access: "all_guests" }), null), [
    "allow_download",
  ]);
});

test("downloads switched off hides the archive row, whatever the tier", () => {
  // `allow_download: false` is the master switch and overrides archive access
  // outright (see the endpoint's authorisation order), so offering the finer
  // control underneath it would be offering a setting with no effect.
  for (const tier of ["4096", "original"] as ArchiveTier[]) {
    assert.deepEqual(keys(prefs({ allow_download: false }), tier), ["allow_download"]);
  }
});

test("an archive event with downloads on shows both rows, in order", () => {
  for (const tier of ["4096", "original"] as ArchiveTier[]) {
    assert.deepEqual(keys(prefs(), tier), ["allow_download", "archive_download_access"]);
  }
});

test("the allow_download row is never hidden", () => {
  for (const tier of [null, "4096", "original"] as (ArchiveTier | null)[]) {
    for (const allow of [true, false]) {
      assert.ok(keys(prefs({ allow_download: allow }), tier).includes("allow_download"));
    }
  }
});

/* ── What the archive row is called ──────────────────────────────────────── */

test("the archive row is named after the tier this event actually has", () => {
  assert.equal(archiveRow(prefs(), "4096")?.label, "Cinema 4K downloads");
  assert.equal(archiveRow(prefs(), "original")?.label, "Original file downloads");
});

test("no surface calls a Cinema 4K file an original, or vice versa", () => {
  // The reason the label is tier-specific rather than a generic
  // "Full-resolution": a 4096px re-encode is not the studio's negative, and a
  // studio must not come away believing it has handed over one or the other.
  const cinema = archiveRow(prefs(), "4096")!;
  const cinemaCopy = [cinema.label, cinema.description, ...cinema.options!.map((o) => o.description)].join(" ");
  assert.ok(!/original/i.test(cinemaCopy), "Cinema 4K copy must never say 'original'");
  assert.ok(/Cinema 4K/.test(cinemaCopy));

  const original = archiveRow(prefs(), "original")!;
  const originalCopy = [original.label, original.description, ...original.options!.map((o) => o.description)].join(" ");
  assert.ok(!/Cinema 4K|4096/.test(originalCopy), "original-tier copy must never say 'Cinema 4K'");
  assert.ok(/original camera files|Original file/.test(originalCopy));
});

test("the permissive option states the consequence bluntly, at both tiers", () => {
  // A studio must not enable this believing it is the same file at a larger
  // size — these copies carry no watermark.
  for (const tier of ["4096", "original"] as ArchiveTier[]) {
    const allGuests = archiveRow(prefs(), tier)!.options!.find((o) => o.value === "all_guests")!;
    assert.match(allGuests.description, /unwatermarked/);
    assert.match(allGuests.description, /appear in/);
  }
});

test("the archive row offers exactly the three access states", () => {
  assert.deepEqual(
    archiveRow(prefs(), "original")!.options!.map((o) => o.value),
    ["host_only", "all_guests", "none"],
  );
});

test("an omitted context hides the archive row rather than guessing a tier", () => {
  assert.deepEqual(
    resolveDeliveryPreferenceFields(prefs()).map((f) => f.key),
    ["allow_download"],
  );
});

/* ── Normalisation ───────────────────────────────────────────────────────── */

test("normalizeDeliveryPreferences: absent values fall back to the defaults", () => {
  assert.deepEqual(normalizeDeliveryPreferences(undefined), DELIVERY_PREFERENCE_DEFAULTS);
  assert.deepEqual(normalizeDeliveryPreferences({}), DELIVERY_PREFERENCE_DEFAULTS);
  assert.equal(normalizeDeliveryPreferences({}).archive_download_access, "host_only");
});

test("normalizeDeliveryPreferences: an out-of-enum value resolves to host_only", () => {
  // A `typeof` check alone passes any string, and an unrecognised one would
  // fall off the end of every switch that reads it — which for an access
  // control must not mean "open".
  for (const bogus of ["everyone", "ALL_GUESTS", "", "host only"]) {
    const resolved = normalizeDeliveryPreferences({
      archive_download_access: bogus as never,
    });
    assert.equal(resolved.archive_download_access, "host_only");
  }
});

test("normalizeDeliveryPreferences: valid values survive", () => {
  assert.equal(
    normalizeDeliveryPreferences({ archive_download_access: "all_guests" }).archive_download_access,
    "all_guests",
  );
  assert.equal(
    normalizeDeliveryPreferences({ allow_download: false }).allow_download,
    false,
  );
});

test("changedPreferenceKeys: reports every differing key", () => {
  assert.deepEqual(changedPreferenceKeys(prefs(), prefs()), []);
  assert.deepEqual(
    changedPreferenceKeys(prefs({ archive_download_access: "none" }), prefs()),
    ["archive_download_access"],
  );
  assert.deepEqual(
    changedPreferenceKeys(
      prefs({ allow_download: false, archive_download_access: "none" }),
      prefs(),
    ),
    ["allow_download", "archive_download_access"],
  );
});
