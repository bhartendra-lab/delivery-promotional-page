import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { enterPreviewMode, leavePreviewMode, isPreviewMode } from "./preview-mode.ts";
import { previewGuestFetch, type PreviewMediaReader } from "./preview-guest-api.ts";

const noMedia: PreviewMediaReader = async () => {
  throw new Error("the studio media read must not be called here");
};

afterEach(() => leavePreviewMode());

test("preview mode is a flag on this page only, off by default", () => {
  assert.equal(isPreviewMode(), false);
  enterPreviewMode({ bookingId: "b1" });
  assert.equal(isPreviewMode(), true);
  leavePreviewMode();
  assert.equal(isPreviewMode(), false);
});

test("the session is a signed in Host with a name", async () => {
  enterPreviewMode({ bookingId: "b1" });
  const res = await previewGuestFetch<{ guest: { guest_type: string; name: string } }>("/deliverables/get-guest-session", {}, noMedia);
  assert.equal(res.guest.guest_type, "host");
  assert.equal(res.guest.name, "Preview");
});

test("every write is answered locally and says nothing was recorded, whatever the endpoint", async () => {
  enterPreviewMode({ bookingId: "b1" });
  const writes = [
    "/deliverables/like-photo",
    "/deliverables/unlike-photo",
    "/deliverables/like-photos",
    "/deliverables/record-social-visit",
    "/deliverables/catch-guest-behavior",
    "/deliverables/update-guest-sub-type",
    "/deliverables/save-intake",
    "/deliverables/validate-selfie",
    "/deliverables/search-selfie",
    "/deliverables/archive-download-urls/b1",
    "/deliverables/report-download-failure",
    "/deliverables/verify-family-passcode",
    "/deliverables/friend-finder",
    "/collections/b1",
  ];
  for (const path of writes) {
    const res = await previewGuestFetch<{ message: string }>(path, { method: "POST", body: "{}" }, noMedia);
    assert.match(res.message, /nothing was recorded/i, path);
  }
});

test("My Photos and Liked are honestly empty for the preview guest, without any network call", async () => {
  enterPreviewMode({ bookingId: "b1" });
  const prevFetch = globalThis.fetch;
  let called = 0;
  globalThis.fetch = (async () => {
    called += 1;
    throw new Error("the preview must not call the network for this");
  }) as typeof fetch;
  try {
    assert.deepEqual(await previewGuestFetch("/deliverables/get-media/b1?mine=true", {}, noMedia), { media: [], total: 0 });
    assert.deepEqual(await previewGuestFetch("/deliverables/get-media/b1?only_liked=true", {}, noMedia), { media: [], total: 0 });
    assert.equal(called, 0);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("the gallery reads the studio's own photos, in the guest shape, in capture order, with no downloads on offer", async () => {
  enterPreviewMode({ bookingId: "b1" });
  const calls: Array<[string, unknown]> = [];
  const readMedia: PreviewMediaReader = async (bookingId, opts) => {
    calls.push([bookingId, opts]);
    return {
      media: [{ _id: "m1", url: "u", type: "image", booking_id: "b1", custom_folder_ids: ["f1"], createdAt: "2026-11-01", likes_count: 2 }],
      customFolders: [{ _id: "f1", name: "Haldi", booking_id: "b1", createdAt: "2026-11-01", visibility: "private" }],
      folderCounts: { f1: 1 },
      total: 1,
    } as never;
  };
  const res = await previewGuestFetch<{ media: Array<{ _id: string; liked_by_me: boolean }>; customFolders: unknown[]; archive_access: boolean; total: number }>(
    "/deliverables/get-media/b1?custom_folder_id=f1&skip=0&limit=60",
    {},
    readMedia,
  );
  assert.deepEqual(calls, [["b1", { customFolderId: "f1", sort: "captured", skip: 0, limit: 60 }]]);
  assert.equal(res.media[0]._id, "m1");
  assert.equal(res.media[0].liked_by_me, false);
  assert.equal(res.customFolders.length, 1, "a full access guest sees every folder, private ones included");
  assert.equal(res.archive_access, false);
  assert.equal(res.total, 1);
});
