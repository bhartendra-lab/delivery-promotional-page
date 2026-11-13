import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPresignFile } from "./presign-file.ts";

const REC = { filename: "IMG_001.jpg", customFolderId: "folder_1" };

test("the exact object the engine sends, key order included", () => {
  const file = buildPresignFile(REC, "2560", true);
  assert.deepEqual(file, {
    filename: "IMG_001.jpg",
    content_type: "image/jpeg",
    custom_folder_id: "folder_1",
    with_thumbnail: true,
    variant: "2560",
  });
  assert.deepEqual(Object.keys(file), [
    "filename",
    "content_type",
    "custom_folder_id",
    "with_thumbnail",
    "variant",
  ]);
  assert.equal(
    JSON.stringify(file),
    '{"filename":"IMG_001.jpg","content_type":"image/jpeg","custom_folder_id":"folder_1","with_thumbnail":true,"variant":"2560"}',
  );
});

test("with_thumbnail is always sent, false when there is no thumbnail", () => {
  const file = buildPresignFile(REC, "4096", false);
  assert.equal(file.with_thumbnail, false);
  assert.equal("with_thumbnail" in file, true);
});

test("variant is sent on every tier, original included", () => {
  for (const v of ["2560", "4096", "original"] as const) {
    assert.equal(buildPresignFile(REC, v, true).variant, v);
  }
});

test("only the record's filename and folder are read", () => {
  const file = buildPresignFile(
    { ...REC, ...({ id: "x", status: "compressed" } as object) } as typeof REC,
    "2560",
    true,
  );
  assert.deepEqual(Object.keys(file).length, 5);
});
