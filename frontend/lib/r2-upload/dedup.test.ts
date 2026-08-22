import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveDedup, type DedupDecision } from "./dedup.ts";

const BOOKING = "bk_1";

/** The three `File` fields the fingerprint is made of. */
function file(name: string, size: number, lastModified: number) {
  return { name, size, lastModified };
}

/** A media_id exactly as the backend stores it for an uploaded file. */
function mediaId(name: string, size: number, lastModified: number): string {
  return `${BOOKING}__${name}-${size}-${lastModified}`;
}

function decide(
  files: ReturnType<typeof file>[],
  uploaded: string[],
): DedupDecision[] {
  return resolveDedup(BOOKING, files, new Set(uploaded));
}

test("exact fingerprint hit still skips", () => {
  const f = file("IMG_001.jpg", 4_100_000, 1_700_000_000_000);
  const [d] = decide([f], [mediaId("IMG_001.jpg", 4_100_000, 1_700_000_000_000)]);
  assert.equal(d.match, "exact");
  assert.equal(d.ambiguous, false);
  assert.equal(d.id, `${BOOKING}__IMG_001.jpg-4100000-1700000000000`);
});

test("unambiguous fuzzy hit skips: same name + size, drifted mtime", () => {
  // Same photo, re-copied into a new folder — only lastModified moved.
  const f = file("IMG_001.jpg", 4_100_000, 1_800_000_000_000);
  const [d] = decide([f], [mediaId("IMG_001.jpg", 4_100_000, 1_700_000_000_000)]);
  assert.equal(d.match, "fuzzy");
  assert.equal(d.ambiguous, false);
  // Skipped under its OWN id, so a later exact re-selection still lines up.
  assert.equal(d.id, `${BOOKING}__IMG_001.jpg-4100000-1800000000000`);
});

test("fuzzy match is case-insensitive on the filename (inherited from fuzzyKey)", () => {
  const [d] = decide(
    [file("img_001.JPG", 4_100_000, 1_800_000_000_000)],
    [mediaId("IMG_001.jpg", 4_100_000, 1_700_000_000_000)],
  );
  assert.equal(d.match, "fuzzy");
});

test("no hit still uploads: same name, different size", () => {
  const [d] = decide(
    [file("IMG_001.jpg", 4_100_001, 1_800_000_000_000)],
    [mediaId("IMG_001.jpg", 4_100_000, 1_700_000_000_000)],
  );
  assert.equal(d.match, null);
  assert.equal(d.ambiguous, false);
});

test("no hit still uploads: nothing saved for this booking yet", () => {
  const [d] = decide([file("IMG_001.jpg", 4_100_000, 1_800_000_000_000)], []);
  assert.equal(d.match, null);
  assert.equal(d.ambiguous, false);
});

test("ambiguous: two saved photos share the filename+size — upload, don't guess", () => {
  const [d] = decide(
    [file("IMG_001.jpg", 4_100_000, 1_900_000_000_000)],
    [
      mediaId("IMG_001.jpg", 4_100_000, 1_700_000_000_000),
      mediaId("IMG_001.jpg", 4_100_000, 1_750_000_000_000),
    ],
  );
  assert.equal(d.match, null);
  assert.equal(d.ambiguous, true);
});

test("ambiguous: two files in one batch can't both claim the same saved photo", () => {
  const decisions = decide(
    [
      file("IMG_001.jpg", 4_100_000, 1_800_000_000_000),
      file("IMG_001.jpg", 4_100_000, 1_900_000_000_000),
    ],
    [mediaId("IMG_001.jpg", 4_100_000, 1_700_000_000_000)],
  );
  assert.equal(decisions[0].match, "fuzzy");
  assert.equal(decisions[1].match, null);
  assert.equal(decisions[1].ambiguous, true);
});

test("the same file listed twice in one selection is skipped both times", () => {
  // Identical fingerprint = one record, so the second pass re-claims its own
  // candidate rather than colliding with a different file.
  const f = file("IMG_001.jpg", 4_100_000, 1_800_000_000_000);
  const decisions = decide([f, f], [mediaId("IMG_001.jpg", 4_100_000, 1_700_000_000_000)]);
  assert.deepEqual(
    decisions.map((d) => d.match),
    ["fuzzy", "fuzzy"],
  );
  assert.equal(decisions[0].id, decisions[1].id);
});

test("a saved photo matched exactly is never also handed out as a fuzzy match", () => {
  const decisions = decide(
    [
      file("IMG_001.jpg", 4_100_000, 1_700_000_000_000), // exact
      file("IMG_001.jpg", 4_100_000, 1_900_000_000_000), // same name+size
    ],
    [mediaId("IMG_001.jpg", 4_100_000, 1_700_000_000_000)],
  );
  assert.equal(decisions[0].match, "exact");
  assert.equal(decisions[1].match, null);
  assert.equal(decisions[1].ambiguous, false);
});

test("the exact/fuzzy outcome doesn't depend on selection order", () => {
  const fuzzy = file("IMG_001.jpg", 4_100_000, 1_900_000_000_000);
  const exact = file("IMG_001.jpg", 4_100_000, 1_700_000_000_000);
  const uploaded = [mediaId("IMG_001.jpg", 4_100_000, 1_700_000_000_000)];
  const forwards = decide([exact, fuzzy], uploaded);
  const backwards = decide([fuzzy, exact], uploaded);
  assert.equal(forwards[0].match, "exact");
  assert.equal(forwards[1].match, null);
  assert.equal(backwards[0].match, null); // the fuzzy one, listed first
  assert.equal(backwards[1].match, "exact");
});

test("media_ids that don't decode are ignored rather than guessed at", () => {
  const [d] = decide(
    [file("IMG_001.jpg", 4_100_000, 1_800_000_000_000)],
    ["68f0c1a2b3d4e5f60718293a", `${BOOKING}__IMG_001.jpg`],
  );
  assert.equal(d.match, null);
  assert.equal(d.ambiguous, false);
});

test("filenames containing digits and dashes still decode to the right key", () => {
  // parseMediaId anchors on the LAST two numeric groups, so "DSC-2024-07-11"
  // must not lose its trailing chunks to the size/mtime capture.
  const [d] = decide(
    [file("DSC-2024-07-11.jpg", 3_000_000, 1_800_000_000_000)],
    [mediaId("DSC-2024-07-11.jpg", 3_000_000, 1_700_000_000_000)],
  );
  assert.equal(d.match, "fuzzy");
});

test("decisions come back one-per-input, in input order", () => {
  const decisions = decide(
    [
      file("a.jpg", 100, 1), // exact
      file("b.jpg", 200, 9), // fuzzy
      file("c.jpg", 300, 1), // new
    ],
    [mediaId("a.jpg", 100, 1), mediaId("b.jpg", 200, 2)],
  );
  assert.deepEqual(
    decisions.map((d) => d.match),
    ["exact", "fuzzy", null],
  );
  assert.deepEqual(
    decisions.map((d) => d.fingerprint),
    ["a.jpg-100-1", "b.jpg-200-9", "c.jpg-300-1"],
  );
});
