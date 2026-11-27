import { test } from "node:test";
import assert from "node:assert/strict";
import { MISSING_OBJECT_NOTE, missingMediaIdsFrom, requeuedForUpload } from "./missing-objects.ts";
import type { UploadRecord } from "./types.ts";

test("missingMediaIdsFrom: reads the ids of a MEDIA_OBJECT_MISSING refusal", () => {
  const body = { success: false, message: "An uploaded file was not found in storage", code: "MEDIA_OBJECT_MISSING", missing_media_ids: ["b__a.jpg-1-2", "b__c.jpg-3-4"] };
  assert.deepEqual(missingMediaIdsFrom(body), ["b__a.jpg-1-2", "b__c.jpg-3-4"]);
});

test("missingMediaIdsFrom: null for anything that names nothing (older backend, other codes, junk)", () => {
  // The 422 the backend sent before it named the rows: no code, no ids.
  assert.equal(missingMediaIdsFrom({ success: false, message: "An uploaded file was not found in storage" }), null);
  assert.equal(missingMediaIdsFrom({ code: "FOLDER_NOT_FOUND", missing_folder_ids: ["f"] }), null);
  assert.equal(missingMediaIdsFrom({ code: "MEDIA_OBJECT_MISSING", missing_media_ids: [] }), null);
  assert.equal(missingMediaIdsFrom({ code: "MEDIA_OBJECT_MISSING", missing_media_ids: [1, "", null] }), null);
  assert.equal(missingMediaIdsFrom({ code: "MEDIA_OBJECT_MISSING" }), null);
  assert.equal(missingMediaIdsFrom("Request failed: 422"), null);
  assert.equal(missingMediaIdsFrom(null), null);
});

test("requeuedForUpload: keeps identity, folder and watermark; drops every trace of the old upload", () => {
  const uploaded: UploadRecord = {
    id: "b__a.jpg-1-2",
    bookingId: "b",
    fingerprint: "a.jpg-1-2",
    customFolderId: "haldi",
    folderName: "haldi",
    filename: "a.jpg",
    fileSize: 1,
    fileLastModified: 2,
    status: "uploaded",
    publicUrl: "https://media.example/x-a.jpg",
    key: "companies/c/event-media/b/x-a.jpg",
    thumbnailUrl: "https://media.example/x-a.jpg.thumb.jpg",
    width: 2560,
    height: 1706,
    capturedAt: 5,
    capturedAtSource: "exif",
    archiveVariant: "4096",
    archiveUrl: "https://cold.example/x-a.jpg",
    archiveSize: 9,
    archiveChecksum: "abc",
    archiveKey: "companies/c/event-media-archive/b/x-a.jpg",
    uploadId: "mp1",
    partSize: 8,
    completedParts: [{ n: 1, etag: "e" }],
    uploadSessionId: "s1",
    cameraMake: "Sony",
    dedupeMatch: "exact",
    watermark: false,
    attempts: 3,
    lastError: "old",
    updatedAt: 1,
  };
  assert.deepEqual(requeuedForUpload(uploaded, 99), {
    id: "b__a.jpg-1-2",
    bookingId: "b",
    fingerprint: "a.jpg-1-2",
    customFolderId: "haldi",
    folderName: "haldi",
    filename: "a.jpg",
    fileSize: 1,
    fileLastModified: 2,
    watermark: false,
    status: "pending",
    attempts: 0,
    lastError: MISSING_OBJECT_NOTE,
    updatedAt: 99,
  });
});

test("requeuedForUpload: no watermark choice recorded stays unrecorded", () => {
  const rec = { id: "i", bookingId: "b", fingerprint: "f", customFolderId: "c", folderName: "n", filename: "f", fileSize: 1, fileLastModified: 1, status: "uploaded", attempts: 0, updatedAt: 0 } satisfies UploadRecord;
  assert.equal("watermark" in requeuedForUpload(rec, 1), false);
});
