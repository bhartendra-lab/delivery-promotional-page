import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMediaMetadataRow, type MetadataRowRecord } from "./metadata-row.ts";

const BASE: MetadataRowRecord = {
  id: "bk_1__IMG_001.jpg-4100000-1700000000000",
  customFolderId: "folder_1",
  filename: "IMG_001.jpg",
  fileLastModified: 1_700_000_000_000,
  publicUrl: "https://cdn.example/view.jpg",
};

test("minimal record: required fields, file time as the capture time", () => {
  const row = buildMediaMetadataRow(BASE, {});
  assert.deepEqual(row, {
    url: "https://cdn.example/view.jpg",
    type: "image",
    custom_folder_id: "folder_1",
    media_id: "bk_1__IMG_001.jpg-4100000-1700000000000",
    filename: "IMG_001.jpg",
    captured_at: new Date(1_700_000_000_000).toISOString(),
    captured_at_source: "file_time",
  });
});

test("full 4K record: every field, in the engine's key order", () => {
  const row = buildMediaMetadataRow(
    {
      ...BASE,
      width: 2560,
      height: 1706,
      capturedAt: 1_699_000_000_000,
      capturedAtSource: "exif",
      thumbnailUrl: "https://cdn.example/thumb.jpg",
      archiveVariant: "4096",
      archiveUrl: "https://b2.example/archive.jpg",
      archiveSize: 8_000_000,
    },
    { size: 812_345, thumbnailSize: 41_000 },
  );
  assert.deepEqual(Object.keys(row), [
    "url",
    "type",
    "custom_folder_id",
    "media_id",
    "filename",
    "width",
    "height",
    "size",
    "captured_at",
    "captured_at_source",
    "thumbnail_url",
    "thumbnail_size",
    "archive_url",
    "archive_variant",
    "archive_size",
  ]);
  assert.equal(row.captured_at, new Date(1_699_000_000_000).toISOString());
  assert.equal(row.captured_at_source, "exif");
  assert.equal(row.size, 812_345);
  assert.equal(row.thumbnail_size, 41_000);
  assert.equal(row.archive_variant, "4096");
});

test("original record carries the checksum", () => {
  const row = buildMediaMetadataRow(
    {
      ...BASE,
      archiveVariant: "original",
      archiveUrl: "https://b2.example/orig.CR3.jpg",
      archiveSize: 4_100_000,
      archiveChecksum: "sha256-tree-8MiB-v1:abc",
    },
    {},
  );
  assert.equal(row.archive_variant, "original");
  assert.equal(row.archive_size, 4_100_000);
  assert.equal(row.archive_checksum, "sha256-tree-8MiB-v1:abc");
});

test("thumbnail_size is omitted when the thumbnail URL is absent", () => {
  const row = buildMediaMetadataRow(BASE, { size: 10, thumbnailSize: 5 });
  assert.equal("thumbnail_url" in row, false);
  assert.equal("thumbnail_size" in row, false);
  assert.equal(row.size, 10);
});

test("thumbnail_url without a known size sends the url alone", () => {
  const row = buildMediaMetadataRow({ ...BASE, thumbnailUrl: "t" }, {});
  assert.equal(row.thumbnail_url, "t");
  assert.equal("thumbnail_size" in row, false);
});

test("width/height of 0 are kept (only null/undefined omit)", () => {
  const row = buildMediaMetadataRow({ ...BASE, width: 0, height: 0 }, { size: 0 });
  assert.equal(row.width, 0);
  assert.equal(row.height, 0);
  assert.equal(row.size, 0);
});

test("archive fields are omitted wholesale without an archive URL", () => {
  const row = buildMediaMetadataRow(
    { ...BASE, archiveVariant: "4096", archiveSize: 9, archiveChecksum: "x" },
    {},
  );
  for (const k of ["archive_url", "archive_variant", "archive_size", "archive_checksum"]) {
    assert.equal(k in row, false, k);
  }
});

test("no capture fields when neither capture time nor file time is usable", () => {
  const row = buildMediaMetadataRow({ ...BASE, fileLastModified: 0 }, {});
  assert.equal("captured_at" in row, false);
  assert.equal("captured_at_source" in row, false);
});

/* SES-01: where the photo came from. Both fields come last, and both are
 * omitted when the record has none, so a pre-SES-01 record's row is unchanged. */

test("session and camera ride at the end of the row", () => {
  const row = buildMediaMetadataRow(
    {
      ...BASE,
      uploadSessionId: "6aca63cd6b91447c7145e6a1",
      cameraMake: "Canon",
      cameraModel: "Canon EOS R6m2",
      cameraSerial: "032021000123",
    },
    {},
  );
  const keys = Object.keys(row);
  assert.deepEqual(keys.slice(-2), ["upload_session_id", "camera"]);
  assert.equal(row.upload_session_id, "6aca63cd6b91447c7145e6a1");
  assert.deepEqual(row.camera, { make: "Canon", model: "Canon EOS R6m2", serial: "032021000123" });
});

test("a camera without a serial, and a session without a camera", () => {
  const noSerial = buildMediaMetadataRow({ ...BASE, cameraMake: "SONY", cameraModel: "ILCE-7M4" }, {});
  assert.deepEqual(noSerial.camera, { make: "SONY", model: "ILCE-7M4" });
  assert.equal("upload_session_id" in noSerial, false);
  const noCamera = buildMediaMetadataRow({ ...BASE, uploadSessionId: "s1" }, {});
  assert.equal(noCamera.upload_session_id, "s1");
  assert.equal("camera" in noCamera, false);
});

test("a record from before SES-01 builds exactly the row it always did", () => {
  const row = buildMediaMetadataRow(BASE, {});
  assert.equal("upload_session_id" in row, false);
  assert.equal("camera" in row, false);
});
