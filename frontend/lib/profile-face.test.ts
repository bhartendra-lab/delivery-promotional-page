import test from "node:test";
import assert from "node:assert/strict";
import { guestPhotoUrl, profileFaceServed } from "./profile-face.ts";

const SELFIE = "https://media/companies/c/event-media/b/n-selfie.jpeg";
const FACE = "https://media/companies/c/event-media/b/profile-g-1a2b3c4d.webp?v=2";

test("backend switch off (no key): the selfie, exactly as before", () => {
  assert.equal(profileFaceServed({ selfie_url: SELFIE }), false);
  assert.equal(guestPhotoUrl({ selfie_url: SELFIE }), SELFIE);
  assert.equal(guestPhotoUrl({ selfie_url: null }), null);
  assert.equal(guestPhotoUrl({}), null);
});

test("switch on: the profile face, and never the selfie", () => {
  assert.equal(profileFaceServed({ profile_face_url: FACE }), true);
  assert.equal(guestPhotoUrl({ profile_face_url: FACE, selfie_url: SELFIE }), FACE);
});

test("switch on, no face found yet: initials, even with a selfie on file", () => {
  assert.equal(profileFaceServed({ profile_face_url: null, selfie_url: SELFIE }), true);
  assert.equal(guestPhotoUrl({ profile_face_url: null, selfie_url: SELFIE }), null);
});

test("a blank URL is no picture; an undefined key reads as not served", () => {
  assert.equal(guestPhotoUrl({ profile_face_url: "  " }), null);
  assert.equal(guestPhotoUrl({ selfie_url: "" }), null);
  assert.equal(profileFaceServed({ profile_face_url: undefined, selfie_url: SELFIE }), false);
  assert.equal(guestPhotoUrl({ profile_face_url: undefined, selfie_url: SELFIE }), SELFIE);
  assert.equal(guestPhotoUrl(null), null);
});
