import { test } from "node:test";
import assert from "node:assert/strict";
import { collectionCsv, csvFileName, filenamesLine, istStamp, parseAlbumSize, railTarget } from "./studio.ts";
import type { CuratorItem } from "./types.ts";

const BOOKING = "6aca63cd6b91447c7145e699";
const item = (over: Partial<CuratorItem>): CuratorItem => ({
  _id: "m1",
  media_id: `${BOOKING}__DSC_4821.JPG-2048-1700000000000`,
  url: "u",
  type: "image",
  custom_folder_ids: [],
  createdAt: "",
  ...over,
});

test("filenames: the stored original name, else the one in the media id, comma separated", () => {
  const line = filenamesLine(
    [item({ filename: "DSC_0001.jpg" }), item({ filename: null }), item({ filename: "  " })],
    BOOKING,
  );
  assert.equal(line, "DSC_0001.jpg, DSC_4821.JPG, DSC_4821.JPG");
  assert.equal(filenamesLine([], BOOKING), "");
});

test("the CSV: one row per photo, who added it, when, in India's time", () => {
  const csv = collectionCsv(
    [
      item({
        filename: 'Mehndi, "close".jpg',
        primary_folder_id: "f1",
        collection_refs: [
          { collection_id: "other", added_by_name: "X", added_by_me: false, added_at: 1 },
          { collection_id: "c1", added_by_name: "Manish", added_by_me: false, added_at: Date.UTC(2026, 9, 26, 8, 35) },
        ],
      }),
      item({ filename: "b.jpg", custom_folder_ids: ["f2"], collection_refs: [] }),
    ],
    { collectionId: "c1", bookingId: BOOKING, folderName: (id) => ({ f1: "Haldi", f2: "Wedding" })[id ?? ""] ?? "Other" },
  );
  assert.equal(
    csv,
    ['Filename,Folder,Added by,Added at', '"Mehndi, ""close"".jpg",Haldi,Manish,2026-10-26 14:05', "b.jpg,Wedding,,"].join("\n"),
  );
  assert.equal(istStamp(null), "");
});

test("the CSV's file name is safe on every disk", () => {
  assert.equal(csvFileName("Priya & Rahul", "Calendar: 2027"), "Priya & Rahul - Calendar 2027.csv");
  assert.equal(csvFileName("", ""), "collection.csv");
});

test("album size: a whole number from 1 to 5,000, or empty to clear it", () => {
  assert.deepEqual(parseAlbumSize("250"), { ok: true, value: 250 });
  assert.deepEqual(parseAlbumSize(" 1,200 "), { ok: true, value: 1200 });
  assert.deepEqual(parseAlbumSize(""), { ok: true, value: null });
  assert.equal(parseAlbumSize("0").ok, false);
  assert.equal(parseAlbumSize("5001").ok, false);
  assert.equal(parseAlbumSize("12.5").ok, false);
  assert.equal(railTarget({ count: 182, target_count: 250 }), "182 of 250");
  assert.equal(railTarget({ count: 182, target_count: null }), null);
});
