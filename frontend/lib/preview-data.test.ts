import { test } from "node:test";
import assert from "node:assert/strict";
import { applyDraft, previewGuestSession, readPreviewMessage, toGuestMedia, PREVIEW_MESSAGE_SOURCE } from "./preview-data.ts";
import type { DeliveryLandingPageData, MediaItem } from "./types";

const event = { delivery_landing_page_id: "d", booking_id: "b", company_id: "c", style_variant: "Ivory & Rose", custom_message: "Hello", include_company_branding: true, event_name: "Aanya & Rohan" } as DeliveryLandingPageData;

test("the preview guest is signed in with the full gallery and has nothing left to answer", () => {
  const s = previewGuestSession();
  assert.equal(s.guest_type, "host");
  assert.equal(s.guest_sub_type, null);
  assert.ok(s.name && s.name !== "Guest", "a real name, so the name prompt never rises");
  assert.equal(s.selfie_id, null);
  assert.equal(s.is_client, false);
});

test("studio media becomes guest media, with the likes it really has and none of them the viewer's", () => {
  const item = { _id: "m1", url: "u", type: "image", booking_id: "b", custom_folder_ids: ["f1"], createdAt: "2026-11-01", likes_count: 3, thumbnail_url: "t", width: 800, height: 600, media_id: "b__a" } as MediaItem;
  const g = toGuestMedia(item);
  assert.deepEqual(g, { _id: "m1", media_id: "b__a", url: "u", type: "image", custom_folder_ids: ["f1"], createdAt: "2026-11-01", likes_count: 3, liked_by_me: false, thumbnail_url: "t", width: 800, height: 600 });
  const bare = toGuestMedia({ _id: "m2", url: "u2", type: "image", booking_id: "b", custom_folder_ids: undefined as unknown as string[], createdAt: "x" } as MediaItem);
  assert.equal(bare.media_id, "m2", "falls back to the row id");
  assert.deepEqual(bare.custom_folder_ids, []);
  assert.equal("thumbnail_url" in bare, false);
});

test("the draft is laid over the real payload and nothing else changes", () => {
  const out = applyDraft(event, { style_variant: "Midnight", custom_message: "New text" });
  assert.equal(out.style_variant, "Midnight");
  assert.equal(out.custom_message, "New text");
  assert.equal(out.include_company_branding, true);
  assert.equal(out.event_name, "Aanya & Rohan");
  assert.equal(applyDraft(event, null), event);
  // An empty message is a real answer (it hides the block), not "no draft".
  assert.equal(applyDraft(event, { custom_message: "" }).custom_message, "");
  assert.equal(applyDraft(event, { include_company_branding: false }).include_company_branding, false);
});

test("messages are accepted only from the same origin, in our shape, with values of the right type", () => {
  const origin = "https://deliver.vyavasth.in";
  const draft = { source: PREVIEW_MESSAGE_SOURCE, type: "draft", draft: { style_variant: "Midnight", custom_message: "Hi", include_company_branding: false, evil: "x" } };
  assert.deepEqual(readPreviewMessage({ origin, data: draft }, origin), { source: PREVIEW_MESSAGE_SOURCE, type: "draft", draft: { style_variant: "Midnight", custom_message: "Hi", include_company_branding: false } });
  assert.equal(readPreviewMessage({ origin: "https://evil.example", data: draft }, origin), null, "another origin");
  assert.equal(readPreviewMessage({ origin, data: { ...draft, source: "someone-else" } }, origin), null, "another source");
  assert.equal(readPreviewMessage({ origin, data: "hello" }, origin), null);
  assert.equal(readPreviewMessage({ origin, data: null }, origin), null);
  assert.deepEqual(readPreviewMessage({ origin, data: { source: PREVIEW_MESSAGE_SOURCE, type: "ready" } }, origin), { source: PREVIEW_MESSAGE_SOURCE, type: "ready" });
  assert.deepEqual(readPreviewMessage({ origin, data: { source: PREVIEW_MESSAGE_SOURCE, type: "draft", draft: { style_variant: 5 } } }, origin), { source: PREVIEW_MESSAGE_SOURCE, type: "draft", draft: {} });
});
