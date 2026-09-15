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

const keys = (value: DeliveryPreferences, ...archiveTiers: ArchiveTier[]) =>
  resolveDeliveryPreferenceFields(value, { archiveTiers }).map((f) => f.key);

const archiveRow = (value: DeliveryPreferences, ...archiveTiers: ArchiveTier[]) =>
  resolveDeliveryPreferenceFields(value, { archiveTiers }).find(
    (f) => f.key === "archive_download_access",
  );

/* ── Which rows show at all ──────────────────────────────────────────────── */

test("a HD-only event shows no archive download row — there is nothing to govern", () => {
  assert.deepEqual(keys(prefs()), ["allow_download", "show_google_review"]);
  // Even with the preference set to its most permissive value: no unwatermarked
  // copy exists, so the control would govern nothing.
  assert.deepEqual(keys(prefs({ archive_download_access: "all_guests" })), ["allow_download", "show_google_review"]);
});

test("downloads switched off hides the archive row, whatever the tier", () => {
  // `allow_download: false` is the master switch and overrides archive access
  // outright (see the endpoint's authorisation order), so offering the finer
  // control underneath it would be offering a setting with no effect.
  for (const tier of ["4096", "original"] as ArchiveTier[]) {
    assert.deepEqual(keys(prefs({ allow_download: false }), tier), ["allow_download", "show_google_review"]);
  }
});

test("an archive event with downloads on shows both rows, in order", () => {
  for (const tier of ["4096", "original"] as ArchiveTier[]) {
    assert.deepEqual(keys(prefs(), tier), ["allow_download", "archive_download_access", "show_google_review"]);
  }
});

test("the allow_download row is never hidden", () => {
  for (const tiers of [[], ["4096"], ["original"], ["original", "4096"]] as ArchiveTier[][]) {
    for (const allow of [true, false]) {
      assert.ok(keys(prefs({ allow_download: allow }), ...tiers).includes("allow_download"));
    }
  }
});

/* ── What the archive row is called ──────────────────────────────────────── */

test("the archive row is named after the tier this event actually has", () => {
  assert.equal(archiveRow(prefs(), "4096")?.label, "4K downloads");
  assert.equal(archiveRow(prefs(), "original")?.label, "Original file downloads");
});

test("no surface calls a 4K file an original, or vice versa", () => {
  // The reason the label is tier-specific rather than a generic
  // "Full-resolution": a 4096px re-encode is not the studio's original file, and a
  // studio must not come away believing it has handed over one or the other.
  const cinema = archiveRow(prefs(), "4096")!;
  const cinemaCopy = [cinema.label, cinema.description, ...cinema.options!.map((o) => o.description)].join(" ");
  assert.ok(!/original/i.test(cinemaCopy), "4K copy must never say 'original'");
  assert.ok(/4K/.test(cinemaCopy));

  const original = archiveRow(prefs(), "original")!;
  const originalCopy = [original.label, original.description, ...original.options!.map((o) => o.description)].join(" ");
  assert.ok(!/4K|4096/.test(originalCopy), "original-tier copy must never say '4K'");
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

test("an event that MIXES upload tiers names both, and calls the row by the generic name", () => {
  // The tier is chosen per upload run, so one event can hold original files
  // from one run and 4K from another. Naming the row after either alone
  // would tell the studio something false about half their photos.
  const row = archiveRow(prefs(), "original", "4096")!;
  assert.equal(row.label, "Full-resolution downloads");
  const copy = [row.description, ...row.options!.map((o) => o.description)].join(" ");
  assert.match(copy, /4K and original files/);
});

test("a mixed event still shows the row, and a HD-only one still hides it", () => {
  assert.deepEqual(keys(prefs(), "original", "4096"), [
    "allow_download",
    "archive_download_access",
    "show_google_review",
  ]);
  assert.deepEqual(keys(prefs()), ["allow_download", "show_google_review"]);
});

test("an omitted context hides the archive row rather than guessing a tier", () => {
  assert.deepEqual(
    resolveDeliveryPreferenceFields(prefs()).map((f) => f.key),
    ["allow_download", "show_google_review"],
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

/* ── Surfaces ────────────────────────────────────────────────────────────── */

test("the gallery surface never shows the required visit row", () => {
  // The link is chosen Studio-wide and overridden per event on Access &
  // Sharing — offering it in the gear modal too would be two places to
  // change one thing.
  assert.ok(!keys(prefs(), "original").includes("require_social_visit"));
});

test("the access surface shows only the required visit row", () => {
  assert.deepEqual(
    resolveDeliveryPreferenceFields(prefs(), { archiveTiers: ["original"] }, "access").map((f) => f.key),
    ["require_social_visit"],
  );
});

test("the required visit row names the Studio's platform", () => {
  const row = resolveDeliveryPreferenceFields(
    prefs(),
    { archiveTiers: [], requiredVisitLabel: "WedMeGood" },
    "access",
  )[0];
  assert.equal(row.label, "Ask Guests to open WedMeGood");
  assert.match(row.description, /WedMeGood page/);
});

/* ── The review row and the company-wide switch ──────────────────────────── */

const reviewRow = (value: DeliveryPreferences, googleReviewEnabledGlobally?: boolean) =>
  resolveDeliveryPreferenceFields(value, { archiveTiers: [], googleReviewEnabledGlobally }).find(
    (f) => f.key === "show_google_review",
  );

test("the review row is live while the company switch is on or has never been set", () => {
  assert.equal(reviewRow(prefs(), true)?.locked, undefined);
  // A company cached before the switch shipped has no value, and absent is ON.
  assert.equal(reviewRow(prefs(), undefined)?.locked, undefined);
});

test("the company switch off locks the row OFF and says why — it is not hidden", () => {
  for (const eventValue of [true, false]) {
    const row = reviewRow(prefs({ show_google_review: eventValue }), false);
    assert.ok(row, "the row must still render");
    assert.deepEqual(row.locked, { value: false, note: "Turned off for every gallery in Settings." });
  }
});

/* ── New preferences on old events ───────────────────────────────────────── */

test("an event created before the new preferences reads both as on", () => {
  const resolved = normalizeDeliveryPreferences({ allow_download: false, archive_download_access: "none" });
  assert.equal(resolved.require_social_visit, true);
  assert.equal(resolved.show_google_review, true);
});
