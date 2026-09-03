import { test } from "node:test";
import assert from "node:assert/strict";
import { planArchivePartQueue, archiveMetadataFor } from "./archive.ts";

// Only the pure planners are unit tested here — same convention as the backend
// (planDeletions, planMarkMigrated) and as dedup.test.ts. The surrounding
// upload machinery does real fetch/IndexedDB/canvas work and is exercised
// against a dev environment instead.

const MIB = 1024 * 1024;

/* ── planArchivePartQueue — resume mid-file ────────────────────────────── */

test("planArchivePartQueue: a fresh file has every part pending", () => {
  const { partCount, pending } = planArchivePartQueue({
    fileSize: 56 * MIB,
    partSize: 8 * MIB,
    completedParts: [],
  });
  assert.equal(partCount, 7);
  assert.deepEqual(pending, [1, 2, 3, 4, 5, 6, 7]);
});

test("planArchivePartQueue: three of seven parts stored resumes at part four", () => {
  const { partCount, pending } = planArchivePartQueue({
    fileSize: 56 * MIB,
    partSize: 8 * MIB,
    completedParts: [1, 2, 3],
  });
  assert.equal(partCount, 7);
  assert.equal(pending[0], 4, "must resume at the next missing part, not restart the file");
  assert.deepEqual(pending, [4, 5, 6, 7]);
});

test("planArchivePartQueue: parts land out of order, so gaps are filled by NUMBER not position", () => {
  // Several parts are in flight at once, so a stored list of [1, 4, 5] is
  // entirely normal. Resuming at 6 here would silently lose parts 2 and 3 and
  // the completion would fail (or worse, assemble short).
  const { pending } = planArchivePartQueue({
    fileSize: 56 * MIB,
    partSize: 8 * MIB,
    completedParts: [1, 4, 5],
  });
  assert.deepEqual(pending, [2, 3, 6, 7]);
});

test("planArchivePartQueue: a fully uploaded file has nothing pending", () => {
  const { pending } = planArchivePartQueue({
    fileSize: 56 * MIB,
    partSize: 8 * MIB,
    completedParts: [1, 2, 3, 4, 5, 6, 7],
  });
  assert.deepEqual(pending, []);
});

test("planArchivePartQueue: a trailing partial part still counts as a part", () => {
  const { partCount, pending } = planArchivePartQueue({
    fileSize: 25 * MIB, // 8 + 8 + 8 + 1
    partSize: 8 * MIB,
    completedParts: [],
  });
  assert.equal(partCount, 4);
  assert.deepEqual(pending, [1, 2, 3, 4]);
});

test("planArchivePartQueue: a file smaller than one part is a single part", () => {
  assert.deepEqual(
    planArchivePartQueue({ fileSize: 100, partSize: 8 * MIB, completedParts: [] }),
    { partCount: 1, pending: [1] },
  );
});

test("planArchivePartQueue: stored part numbers beyond the file are ignored, not trusted", () => {
  // A stale record from a run whose part size differed must not shrink the
  // queue for the current geometry.
  const { partCount, pending } = planArchivePartQueue({
    fileSize: 16 * MIB,
    partSize: 8 * MIB,
    completedParts: [1, 9, 99],
  });
  assert.equal(partCount, 2);
  assert.deepEqual(pending, [2]);
});

/* ── archiveMetadataFor — what create-media carries ────────────────────── */

test("archiveMetadataFor: a 2560 run carries no archive fields at all", () => {
  assert.deepEqual(
    archiveMetadataFor({ variant: "2560", archiveUrl: undefined, archiveSize: undefined }),
    {},
  );
  // Even if an archive URL somehow survived a tier change, "2560" wins.
  assert.deepEqual(
    archiveMetadataFor({ variant: "2560", archiveUrl: "https://cold/x", archiveSize: 10 }),
    {},
  );
});

test("archiveMetadataFor: a failed archive upload omits the fields WHOLESALE, so the row is written exactly as a 2560 row", () => {
  // This is the contract the whole archive failure path depends on: uploadOne
  // clears archiveUrl, and the photo is still delivered.
  assert.deepEqual(
    archiveMetadataFor({ variant: "original", archiveUrl: undefined, archiveSize: 78_643_200 }),
    {},
    "a size without a URL must never be recorded — it would meter bytes for an object that isn't there",
  );
  assert.deepEqual(archiveMetadataFor({ variant: "4096", archiveUrl: "" }), {});
});

test("archiveMetadataFor: a successful 4096 archive carries url, variant, size and checksum", () => {
  assert.deepEqual(
    archiveMetadataFor({
      variant: "4096",
      archiveUrl: "https://cold-media.vyavasth.in/companies/c1/event-media-archive/b1/n-a.jpg",
      archiveSize: 7_340_032,
      archiveChecksum: "sha256-tree-8MiB-v1:abc",
    }),
    {
      archive_url: "https://cold-media.vyavasth.in/companies/c1/event-media-archive/b1/n-a.jpg",
      archive_variant: "4096",
      archive_size: 7_340_032,
      archive_checksum: "sha256-tree-8MiB-v1:abc",
    },
  );
});

test("archiveMetadataFor: a missing checksum or size drops just that field, not the archive", () => {
  assert.deepEqual(
    archiveMetadataFor({ variant: "original", archiveUrl: "https://cold/x", archiveSize: 12 }),
    { archive_url: "https://cold/x", archive_variant: "original", archive_size: 12 },
  );
  assert.deepEqual(
    archiveMetadataFor({ variant: "original", archiveUrl: "https://cold/x" }),
    { archive_url: "https://cold/x", archive_variant: "original" },
  );
});

test("archiveMetadataFor: archive bytes are never folded into `size` — they are their own field", () => {
  const out = archiveMetadataFor({
    variant: "original",
    archiveUrl: "https://cold/x",
    archiveSize: 78_643_200,
  });
  assert.ok(!("size" in out), "archive_size must never leak into the delivery copy's `size`");
});

// ---- Regression: the archive fact must travel on the RECORD, not on the
// engine's live run state.
//
// What broke in production: `create-media` can be flushed on a LATER MOUNT
// (useUploadEngine calls resumePendingMetadata for uploaded-but-unsaved rows).
// At that point the engine has no active run — `variant` has reset to its
// "2560" default and the in-memory size/checksum maps are empty — so every
// archive that had already landed on B2 was silently omitted from the payload.
// 67 objects, 1.04 GB, were paid for with no Media document pointing at them.
// These cases pin the contract that fixed it. ----

test("archiveMetadataFor: a persisted record yields full metadata with nothing else in memory", () => {
  // Exactly the shape flushOneMetadataChunk now passes: all four off the record.
  const record = {
    archiveVariant: "original" as const,
    archiveUrl: "https://cold-media.vyavasth.in/companies/c1/event-media-archive/b1/ab12-SHU00042.JPG",
    archiveSize: 18_874_368,
    archiveChecksum: "sha256-abc",
  };
  assert.deepEqual(
    archiveMetadataFor({
      variant: record.archiveVariant,
      archiveUrl: record.archiveUrl,
      archiveSize: record.archiveSize,
      archiveChecksum: record.archiveChecksum,
    }),
    {
      archive_url: record.archiveUrl,
      archive_variant: "original",
      archive_size: 18_874_368,
      archive_checksum: "sha256-abc",
    },
  );
});

test("archiveMetadataFor: an absent variant omits the archive rather than half-recording it", () => {
  // A URL with no variant is the exact state the bug produced. Recording a
  // URL without its variant would be worse than omitting both.
  assert.deepEqual(
    archiveMetadataFor({ variant: undefined, archiveUrl: "https://cold/x.JPG", archiveSize: 12 }),
    {},
  );
});

test("archiveMetadataFor: size and checksum are optional — a record missing them still records the URL", () => {
  assert.deepEqual(
    archiveMetadataFor({ variant: "4096", archiveUrl: "https://cold/x.jpg" }),
    { archive_url: "https://cold/x.jpg", archive_variant: "4096" },
  );
});
