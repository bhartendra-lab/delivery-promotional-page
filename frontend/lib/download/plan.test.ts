import { test } from "node:test";
import assert from "node:assert/strict";
import {
  alertCopy,
  dedupeName,
  formatBytes,
  LARGE_DOWNLOAD_BYTES,
  MAX_BATCHES,
  packBatches,
  planDownload,
  sanitiseFilename,
  type AlertId,
  type DownloadTier,
  type PlanItem,
  type PlanSource,
} from "./plan.ts";
import {
  MEMORY_ZIP_CAP_DESKTOP,
  MEMORY_ZIP_CAP_MOBILE,
  probeSaveCapability,
  isIOSFrom,
  isMobileFrom,
  type SaveCapability,
} from "./capability.ts";

const MB = 1024 * 1024;
const GB = 1024 * MB;

/** N photos of `bytes` each, all carrying an archive copy of `archiveBytes`. */
function sources(
  count: number,
  {
    bytes = 2 * MB,
    archiveBytes = null as number | null,
    variant = "original" as "4096" | "original",
  } = {},
): PlanSource[] {
  return Array.from({ length: count }, (_, i) => ({
    mediaId: `m${i}`,
    url: `https://media.example/${i}.jpg`,
    name: `IMG_${i}.jpg`,
    bytes,
    ...(archiveBytes == null
      ? {}
      : { archiveVariant: variant, archiveBytes }),
  }));
}

function plan(
  items: PlanSource[],
  {
    tier = "2560" as DownloadTier,
    capability = "memoryZip" as SaveCapability,
    memoryCap = MEMORY_ZIP_CAP_MOBILE,
  } = {},
) {
  return planDownload({ items, tier, capability, memoryCap });
}

const alertIds = (p: { alerts: { id: AlertId }[] }) => p.alerts.map((a) => a.id);

/* ── Method selection ────────────────────────────────────────────────────── */

test("planDownload: the directory picker wins outright, at any size", () => {
  const huge = plan(sources(3000, { bytes: 25 * MB }), { capability: "directory" });
  assert.equal(huge.method, "directory");
  assert.equal(huge.canProceed, true);
  assert.equal(huge.batches.length, 1);
});

test("planDownload: streamZip wins outright, at any size", () => {
  const huge = plan(sources(3000, { bytes: 25 * MB }), { capability: "streamZip" });
  assert.equal(huge.method, "streamZip");
  assert.equal(huge.canProceed, true);
  assert.equal(huge.batches.length, 1);
});

test("planDownload: directory and streamZip never produce batchedZip or blocked, whatever the size", () => {
  // The regression guard for the two no-limit rules: peak memory on both paths
  // is bounded by construction, so a size rule there would be arbitrary.
  for (const capability of ["directory", "streamZip"] as SaveCapability[]) {
    for (const count of [1, 40, 3000]) {
      for (const bytes of [1 * MB, 50 * MB, 200 * MB]) {
        const p = plan(sources(count, { bytes }), { capability });
        assert.equal(p.method, capability);
        assert.equal(p.batches.length, 1);
      }
    }
  }
});

test("planDownload: memoryZip under the cap is a single in-memory ZIP", () => {
  const p = plan(sources(40, { bytes: 2 * MB })); // 80 MB
  assert.equal(p.method, "memoryZip");
  assert.equal(p.batches.length, 1);
  assert.equal(p.canProceed, true);
});

test("planDownload: a selection summing to exactly the cap is one batch, not two", () => {
  const p = plan(sources(3, { bytes: 100 * MB }), { memoryCap: 300 * MB });
  assert.equal(p.totalBytes, 300 * MB);
  assert.equal(p.method, "memoryZip");
  assert.equal(p.batches.length, 1);
});

test("planDownload: one byte over the cap splits into parts", () => {
  const p = plan(
    [
      ...sources(3, { bytes: 100 * MB }),
      { mediaId: "x", url: "https://media.example/x.jpg", name: "x.jpg", bytes: 1 },
    ],
    { memoryCap: 300 * MB },
  );
  assert.equal(p.method, "batchedZip");
  assert.equal(p.batches.length, 2);
});

test("planDownload: a guest's ~40 archive photos on iOS is four parts, NOT blocked", () => {
  // The case the old tier gate wrongly blocked, and the main reason for the
  // size rule. ~1 GB of originals on a phone: four clicks, and it works.
  const p = plan(sources(40, { bytes: 2 * MB, archiveBytes: 25 * MB }), {
    tier: "original",
    capability: "memoryZip",
    memoryCap: MEMORY_ZIP_CAP_MOBILE,
  });
  assert.equal(p.totalBytes, 1000 * MB);
  assert.equal(p.method, "batchedZip");
  assert.equal(p.batches.length, 4);
  assert.equal(p.canProceed, true);
});

test("planDownload: a whole gallery at archive tier on a phone is blocked", () => {
  const p = plan(sources(3000, { bytes: 2 * MB, archiveBytes: 25 * MB }), {
    tier: "original",
    memoryCap: MEMORY_ZIP_CAP_MOBILE,
  });
  assert.equal(p.method, "blocked");
  assert.equal(p.canProceed, false);
  assert.deepEqual(alertIds(p).slice(0, 1), ["TOO_LARGE_FOR_DEVICE"]);
});

test("planDownload: the size rule bounds the WEB tier too, not just archive", () => {
  // 3,000 × 800 KB ≈ 2.3 GB. This used to be an unbounded single in-memory ZIP
  // on a phone; it is now eight parts, right at the ceiling.
  const atCeiling = plan(sources(3000, { bytes: 800 * 1024 }), { memoryCap: MEMORY_ZIP_CAP_MOBILE });
  assert.equal(atCeiling.method, "batchedZip");
  assert.ok(atCeiling.batches.length <= MAX_BATCHES);
  // Push the same web-tier gallery past the ceiling and it blocks — the rule
  // does not care that these are 2560px copies.
  const past = plan(sources(3000, { bytes: 1.5 * MB }), { memoryCap: MEMORY_ZIP_CAP_MOBILE });
  assert.equal(past.method, "blocked");
});

test("planDownload: exactly MAX_BATCHES parts is allowed; one more is blocked", () => {
  const cap = 300 * MB;
  const atLimit = plan(sources(MAX_BATCHES, { bytes: cap }), { memoryCap: cap });
  assert.equal(atLimit.batches.length, MAX_BATCHES);
  assert.equal(atLimit.method, "batchedZip");

  const overLimit = plan(sources(MAX_BATCHES + 1, { bytes: cap }), { memoryCap: cap });
  assert.equal(overLimit.method, "blocked");
});

/* ── The rule that must never come back ──────────────────────────────────── */

test("planDownload never reads the tier when choosing a method", () => {
  // The regression guard for the design error the size rule replaced. Same
  // sizes, three tiers, identical method — every time, at every capability.
  const cases: { count: number; bytes: number; memoryCap: number }[] = [
    { count: 40, bytes: 2 * MB, memoryCap: MEMORY_ZIP_CAP_MOBILE },
    { count: 40, bytes: 25 * MB, memoryCap: MEMORY_ZIP_CAP_MOBILE },
    { count: 3000, bytes: 25 * MB, memoryCap: MEMORY_ZIP_CAP_MOBILE },
    { count: 200, bytes: 8 * MB, memoryCap: MEMORY_ZIP_CAP_DESKTOP },
  ];
  for (const { count, bytes, memoryCap } of cases) {
    for (const capability of ["directory", "streamZip", "memoryZip"] as SaveCapability[]) {
      // Each tier is given the SAME per-item byte count for the tier it will
      // actually use, so any difference in outcome can only come from the tier.
      const web = plan(sources(count, { bytes }), { tier: "2560", capability, memoryCap });
      const hi = plan(sources(count, { bytes: 1, archiveBytes: bytes, variant: "4096" }), {
        tier: "4096",
        capability,
        memoryCap,
      });
      const orig = plan(sources(count, { bytes: 1, archiveBytes: bytes }), {
        tier: "original",
        capability,
        memoryCap,
      });
      assert.equal(hi.method, web.method, `4096 diverged at ${capability}/${count}×${bytes}`);
      assert.equal(orig.method, web.method, `original diverged at ${capability}/${count}×${bytes}`);
      assert.equal(hi.batches.length, web.batches.length);
      assert.equal(orig.batches.length, web.batches.length);
    }
  }
});

/* ── Alerts: fires when it should, and not when it shouldn't ─────────────── */

test("alerts: TOO_LARGE_FOR_DEVICE only on a blocked plan", () => {
  const blocked = plan(sources(3000, { bytes: 25 * MB }), { memoryCap: MEMORY_ZIP_CAP_MOBILE });
  assert.ok(alertIds(blocked).includes("TOO_LARGE_FOR_DEVICE"));
  const fine = plan(sources(10, { bytes: 2 * MB }));
  assert.ok(!alertIds(fine).includes("TOO_LARGE_FOR_DEVICE"));
  // …and never on a capability that has no size limit at all.
  const big = plan(sources(3000, { bytes: 25 * MB }), { capability: "directory" });
  assert.ok(!alertIds(big).includes("TOO_LARGE_FOR_DEVICE"));
});

test("alerts: SPLIT_INTO_PARTS only on batchedZip, carrying the part count", () => {
  const split = plan(sources(40, { bytes: 25 * MB }), { memoryCap: MEMORY_ZIP_CAP_MOBILE });
  const alert = split.alerts.find((a) => a.id === "SPLIT_INTO_PARTS");
  assert.ok(alert);
  assert.equal(alert.count, split.batches.length);
  assert.equal(alert.severity, "warning");
  const single = plan(sources(10, { bytes: 2 * MB }));
  assert.ok(!alertIds(single).includes("SPLIT_INTO_PARTS"));
});

test("alerts: FOLDER_PERMISSION only on the directory method", () => {
  assert.ok(
    alertIds(plan(sources(5), { capability: "directory" })).includes("FOLDER_PERMISSION"),
  );
  for (const capability of ["streamZip", "memoryZip"] as SaveCapability[]) {
    assert.ok(!alertIds(plan(sources(5), { capability })).includes("FOLDER_PERMISSION"));
  }
});

test("alerts: LARGE_DOWNLOAD keys off 500 MB and nothing else", () => {
  const under = plan(sources(1, { bytes: LARGE_DOWNLOAD_BYTES }), { capability: "directory" });
  assert.ok(!alertIds(under).includes("LARGE_DOWNLOAD"), "exactly 500 MB is not yet 'large'");
  const over = plan(sources(1, { bytes: LARGE_DOWNLOAD_BYTES + 1 }), { capability: "directory" });
  assert.ok(alertIds(over).includes("LARGE_DOWNLOAD"));
});

test("alerts: DEGRADED_ITEMS only when the archive tier can't serve some items", () => {
  const mixed = [
    ...sources(3, { bytes: 2 * MB, archiveBytes: 20 * MB }),
    ...sources(2, { bytes: 2 * MB }).map((s, i) => ({ ...s, mediaId: `legacy${i}` })),
  ];
  const p = plan(mixed, { tier: "original" });
  const alert = p.alerts.find((a) => a.id === "DEGRADED_ITEMS");
  assert.ok(alert);
  assert.equal(alert.count, 2);
  assert.equal(alert.severity, "info");
  // Never at the web tier — there is nothing to degrade to.
  assert.ok(!alertIds(plan(mixed, { tier: "2560" })).includes("DEGRADED_ITEMS"));
  // Nor when every item has the requested archive tier.
  assert.ok(
    !alertIds(plan(sources(3, { archiveBytes: 20 * MB }), { tier: "original" })).includes(
      "DEGRADED_ITEMS",
    ),
  );
});

test("alerts: ordered blocking → warning → info", () => {
  const p = plan(sources(3000, { bytes: 2 * MB, archiveBytes: 25 * MB }), {
    tier: "original",
    memoryCap: MEMORY_ZIP_CAP_MOBILE,
  });
  const ranks = p.alerts.map((a) => ["blocking", "warning", "info"].indexOf(a.severity));
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
});

test("alertCopy: TOO_LARGE_FOR_DEVICE differs only in wording between iOS and not", () => {
  const p = plan(sources(3000, { bytes: 25 * MB }), { memoryCap: MEMORY_ZIP_CAP_MOBILE });
  const alert = p.alerts.find((a) => a.id === "TOO_LARGE_FOR_DEVICE");
  assert.ok(alert);
  const ios = alertCopy(alert, { ios: true });
  const other = alertCopy(alert, { ios: false });
  assert.notEqual(ios, other);
  // The id, condition and severity are identical — only the sentence moves.
  assert.equal(alert.severity, "blocking");
  // Never tell an iPhone user to install another browser: they are all WebKit.
  assert.ok(!/chrome|edge|firefox/i.test(ios));
  assert.match(other, /Chrome or Edge/);
  assert.match(ios, /iPhone or iPad/);
});

test("alertCopy: interpolates the count for every alert that has one", () => {
  assert.match(alertCopy({ id: "SPLIT_INTO_PARTS", severity: "warning", count: 4 }, { ios: false }), /4 parts/);
  assert.match(alertCopy({ id: "DEGRADED_ITEMS", severity: "info", count: 12 }, { ios: false }), /^12 photos/);
  assert.match(alertCopy({ id: "SKIPPING_EXISTING", severity: "info", count: 7 }, { ios: false }), /^7 photos/);
});

/* ── Batch packing ───────────────────────────────────────────────────────── */

const item = (bytes: number, id = "x"): PlanItem => ({
  mediaId: id,
  url: `https://media.example/${id}.jpg`,
  needsArchiveUrl: false,
  name: `${id}.jpg`,
  folderName: "",
  bytes,
  degraded: false,
});

test("packBatches: an item larger than the cap gets exactly one batch to itself — and terminates", () => {
  // The infinite-loop guard. Without the `batch.length > 0` condition this
  // closes an empty batch forever and the tab hangs.
  const batches = packBatches([item(500 * MB, "big")], 300 * MB);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].length, 1);
  assert.equal(batches[0][0].mediaId, "big");
});

test("packBatches: several oversized items each get their own batch, and it terminates", () => {
  const batches = packBatches([item(500 * MB, "a"), item(400 * MB, "b"), item(700 * MB, "c")], 300 * MB);
  assert.equal(batches.length, 3);
  assert.deepEqual(batches.map((b) => b.length), [1, 1, 1]);
});

test("packBatches: exact byte boundaries — a batch fills to the cap before rolling over", () => {
  const batches = packBatches([item(100 * MB, "a"), item(100 * MB, "b"), item(100 * MB, "c"), item(1, "d")], 300 * MB);
  assert.equal(batches.length, 2);
  assert.deepEqual(batches[0].map((i) => i.mediaId), ["a", "b", "c"]);
  assert.deepEqual(batches[1].map((i) => i.mediaId), ["d"]);
});

test("packBatches: packs by bytes, not by count", () => {
  // Ten tiny files and one big one: the big one must not sit with the ten
  // merely because a count-based rule would allow it.
  const items = [...Array.from({ length: 10 }, (_, i) => item(1 * MB, `t${i}`)), item(295 * MB, "big")];
  const batches = packBatches(items, 300 * MB);
  assert.equal(batches.length, 2);
  assert.equal(batches[0].length, 10);
  assert.deepEqual(batches[1].map((i) => i.mediaId), ["big"]);
});

test("packBatches: an empty list packs to no batches", () => {
  assert.deepEqual(packBatches([], 300 * MB), []);
});

/* ── Degraded items ──────────────────────────────────────────────────────── */

test("planDownload: degraded items are kept, sized from the web copy, and pointed at it", () => {
  const p = plan(
    [
      { mediaId: "a", url: "https://m/a.jpg", name: "a.jpg", bytes: 2 * MB, archiveVariant: "original", archiveBytes: 30 * MB },
      { mediaId: "b", url: "https://m/b.jpg", name: "b.jpg", bytes: 3 * MB },
    ],
    { tier: "original" },
  );
  assert.equal(p.items.length, 2, "a degraded item is never silently dropped");
  assert.equal(p.degradedCount, 1);
  const [a, b] = p.items;
  assert.equal(a.degraded, false);
  assert.equal(a.bytes, 30 * MB);
  assert.equal(a.needsArchiveUrl, true, "an archive item still needs its URL minted");
  assert.equal(b.degraded, true);
  assert.equal(b.bytes, 3 * MB, "a degraded item is sized from the copy it will actually get");
  assert.equal(b.needsArchiveUrl, false);
  assert.equal(b.url, "https://m/b.jpg");
});

test("planDownload: an item whose archive is a DIFFERENT tier is degraded", () => {
  // A booking never offers both archive tiers, but a photo re-uploaded across
  // a settings change can carry the other one. Asking for "original" must not
  // hand back a 4096 file and call it an original.
  const p = plan(sources(1, { archiveBytes: 20 * MB, variant: "4096" }), { tier: "original" });
  assert.equal(p.degradedCount, 1);
  assert.equal(p.items[0].needsArchiveUrl, false);
});

test("planDownload: media with no recorded size contributes 0 rather than NaN", () => {
  const p = plan([{ mediaId: "a", url: "https://m/a.jpg", name: "a.jpg" }]);
  assert.equal(p.totalBytes, 0);
  assert.equal(p.method, "memoryZip");
});

test("planDownload: an empty selection cannot proceed", () => {
  const p = plan([]);
  assert.equal(p.canProceed, false);
  assert.equal(p.items.length, 0);
});

/* ── Filenames ───────────────────────────────────────────────────────────── */

test("sanitiseFilename: strips path separators and the reserved set", () => {
  assert.equal(sanitiseFilename("a/b\\c:d*e?f\"g<h>i|j.jpg"), "a_b_c_d_e_f_g_h_i_j.jpg");
});

test("sanitiseFilename: strips control characters", () => {
  assert.equal(sanitiseFilename("ph oto.jpg"), "ph_o_to.jpg");
});

test("sanitiseFilename: trims trailing dots and spaces — Windows rejects them", () => {
  assert.equal(sanitiseFilename("photo.jpg."), "photo.jpg");
  assert.equal(sanitiseFilename("photo.jpg   "), "photo.jpg");
  assert.equal(sanitiseFilename("photo.jpg . . "), "photo.jpg");
  // A LEADING dot is a legitimate name and is left alone.
  assert.equal(sanitiseFilename(".hidden.jpg"), ".hidden.jpg");
});

test("sanitiseFilename: an empty result falls back, and the fallback is sanitised too", () => {
  assert.equal(sanitiseFilename("", "media-42"), "media-42");
  assert.equal(sanitiseFilename("   ", "media-42"), "media-42");
  assert.equal(sanitiseFilename("...", "media-42"), "media-42");
  assert.equal(sanitiseFilename("", "a/b"), "a_b", "the fallback is sanitised too");
  assert.equal(sanitiseFilename("", "..."), "photo", "a fallback that survives nothing still names the file");
  assert.equal(sanitiseFilename(null as unknown as string), "photo");
  // Replacement characters are a real name, not an empty one — no fallback.
  assert.equal(sanitiseFilename("///", "media-42"), "___");
});

test("sanitiseFilename: caps the length", () => {
  assert.equal(sanitiseFilename("x".repeat(400)).length, 180);
});

test("dedupeName: a collision becomes ' (2)', then ' (3)'", () => {
  const taken = new Set<string>();
  assert.equal(dedupeName(taken, "DSC_4821.jpg"), "DSC_4821.jpg");
  assert.equal(dedupeName(taken, "DSC_4821.jpg"), "DSC_4821 (2).jpg");
  assert.equal(dedupeName(taken, "DSC_4821.jpg"), "DSC_4821 (3).jpg");
  // Case-insensitively, because the filesystems that matter are.
  assert.equal(dedupeName(taken, "dsc_4821.JPG"), "dsc_4821 (4).JPG");
});

test("dedupeName: an extensionless name still dedupes", () => {
  const taken = new Set<string>();
  assert.equal(dedupeName(taken, "photo"), "photo");
  assert.equal(dedupeName(taken, "photo"), "photo (2)");
});

test("planDownload: the same filename in DIFFERENT folders is left alone", () => {
  // The whole reason folderName is mirrored: two DSC_4821.jpg from two folders
  // are two files, and renaming one would be wrong.
  const p = plan([
    { mediaId: "a", url: "https://m/a.jpg", name: "DSC_4821.jpg", folderName: "Haldi" },
    { mediaId: "b", url: "https://m/b.jpg", name: "DSC_4821.jpg", folderName: "Sangeet" },
    { mediaId: "c", url: "https://m/c.jpg", name: "DSC_4821.jpg", folderName: "Haldi" },
  ]);
  assert.deepEqual(p.items.map((i) => `${i.folderName}/${i.name}`), [
    "Haldi/DSC_4821.jpg",
    "Sangeet/DSC_4821.jpg",
    "Haldi/DSC_4821 (2).jpg",
  ]);
});

test("planDownload: a folder name with a path separator can't escape the target", () => {
  const p = plan([
    { mediaId: "a", url: "https://m/a.jpg", name: "a.jpg", folderName: "../../etc" },
  ]);
  assert.equal(p.items[0].folderName, ".._.._etc");
});

/* ── Capability probe ────────────────────────────────────────────────────── */

test("probeSaveCapability: directory wins when both pickers exist", () => {
  assert.equal(
    probeSaveCapability({ showDirectoryPicker: () => {}, showSaveFilePicker: () => {} }),
    "directory",
  );
});

test("probeSaveCapability: streamZip when only the save picker exists", () => {
  assert.equal(probeSaveCapability({ showSaveFilePicker: () => {} }), "streamZip");
});

test("probeSaveCapability: memoryZip when neither exists", () => {
  assert.equal(probeSaveCapability({}), "memoryZip");
  // A non-function property (a polyfill stub, an extension's marker) is not a
  // picker and must not be treated as one.
  assert.equal(probeSaveCapability({ showDirectoryPicker: true }), "memoryZip");
});

test("probeSaveCapability: no window (SSR) is memoryZip", () => {
  assert.equal(probeSaveCapability(undefined), "memoryZip");
  assert.equal(probeSaveCapability(null), "memoryZip");
});

test("isIOSFrom: every iOS device, including an iPad pretending to be a Mac", () => {
  assert.equal(isIOSFrom("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", 5), true);
  assert.equal(isIOSFrom("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)", 5), true);
  // iPadOS 13+ desktop-mode UA: a Macintosh with a touchscreen is an iPad.
  assert.equal(isIOSFrom("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5), true);
  // A real Mac has no touch points.
  assert.equal(isIOSFrom("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0), false);
  assert.equal(isIOSFrom("Mozilla/5.0 (Linux; Android 14; Pixel 8)", 5), false);
  assert.equal(isIOSFrom("Mozilla/5.0 (Windows NT 10.0; Win64; x64)", 0), false);
});

test("isMobileFrom: the Client Hints answer wins over the UA string", () => {
  assert.equal(isMobileFrom("Mozilla/5.0 (Windows NT 10.0)", true), true);
  assert.equal(isMobileFrom("Mozilla/5.0 (Linux; Android 14)", false), false);
  // No Client Hints: fall back to the UA.
  assert.equal(isMobileFrom("Mozilla/5.0 (Linux; Android 14)", undefined), true);
  assert.equal(isMobileFrom("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)", undefined), true);
  assert.equal(isMobileFrom("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", undefined), false);
});

/* ── Formatting ──────────────────────────────────────────────────────────── */

test("formatBytes: readable at every scale, and safe on nonsense", () => {
  assert.equal(formatBytes(0), "0 MB");
  assert.equal(formatBytes(-1), "0 MB");
  assert.equal(formatBytes(NaN), "0 MB");
  assert.equal(formatBytes(12 * 1024), "12 KB");
  assert.equal(formatBytes(1.5 * MB), "1.5 MB");
  assert.equal(formatBytes(820 * MB), "820 MB");
  assert.equal(formatBytes(1.4 * GB), "1.4 GB");
  assert.equal(formatBytes(75 * GB), "75 GB");
});
