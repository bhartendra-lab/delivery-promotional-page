import { test } from "node:test";
import assert from "node:assert/strict";
import { describeGuestAccess, REGENERATE_PASSCODE_CONFIRM, type GuestAccessDescription } from "./guest-access-copy.ts";

const ARGS = { faceSearchOn: true, hasPublicPhotos: true, everyPhotoPublic: false, fullAccessRedundant: false };
const strings = (d: GuestAccessDescription) => [d.summary, d.tooltip, d.passcode, d.guestsNote];

test("1. face search on, some folders private: their own photos plus public folders; the passcode shows everything", () => {
  const d = describeGuestAccess(ARGS);
  assert.equal(d.case, "face_search");
  assert.match(d.summary, /photos they appear in and your public folders/);
  assert.match(d.summary, /passcode shows every photo/);
  assert.match(d.passcode, /unlocks every photo/);
  assert.match(d.guestsNote, /Other guests see the photos they appear in and your public folders/);
});

test("1b. face search on and nothing public: only their own photos", () => {
  const d = describeGuestAccess({ ...ARGS, hasPublicPhotos: false });
  assert.equal(d.case, "face_search");
  assert.doesNotMatch(strings(d).join(" "), /public folder/);
  assert.match(d.summary, /photos they appear in/);
});

test("2. face search off, some public: the public folders; the passcode shows everything", () => {
  const d = describeGuestAccess({ ...ARGS, faceSearchOn: false });
  assert.equal(d.case, "public_only");
  assert.match(d.summary, /Guests see your public folders/);
  assert.match(d.passcode, /not just the public folders/);
  assert.doesNotMatch(strings(d).join(" "), /selfie/i);
});

test("3. nothing public and face search off: guests need the passcode", () => {
  const d = describeGuestAccess({ ...ARGS, faceSearchOn: false, hasPublicPhotos: false });
  assert.equal(d.case, "passcode_only");
  assert.match(d.summary, /need the passcode to see any photos/);
  assert.match(d.passcode, /cannot see any photos without it/);
  assert.match(d.guestsNote, /nothing until they enter the passcode/);
});

test("4. every photo public and nothing left for the passcode to control: not needed for viewing", () => {
  const d = describeGuestAccess({ ...ARGS, everyPhotoPublic: true, fullAccessRedundant: true });
  assert.equal(d.case, "all_public");
  assert.match(d.summary, /every guest already sees all photos/);
  assert.match(d.passcode, /Not needed to view photos/);
  assert.match(d.guestsNote, /Full access options are hidden/);
});

test("4b. every photo public but full-resolution downloads are family only: the passcode controls just that", () => {
  const d = describeGuestAccess({ ...ARGS, everyPhotoPublic: true, fullAccessRedundant: false });
  assert.equal(d.case, "all_public");
  assert.match(d.passcode, /only lets family download the full-resolution files/);
  assert.doesNotMatch(d.passcode, /Not needed/);
  assert.doesNotMatch(d.guestsNote, /hidden/);
  assert.match(d.tooltip, /still decides who can download/);
});

test("all public wins over face search, but a selfie is still mentioned when it is on", () => {
  const on = describeGuestAccess({ ...ARGS, everyPhotoPublic: true, fullAccessRedundant: true });
  const off = describeGuestAccess({ ...ARGS, faceSearchOn: false, everyPhotoPublic: true, fullAccessRedundant: true });
  assert.equal(on.case, "all_public");
  assert.match(on.tooltip, /selfie/);
  assert.doesNotMatch(off.tooltip, /selfie/);
});

test("the four strings never contradict: a 'need the passcode' case never says guests already see photos, and the reverse", () => {
  for (const faceSearchOn of [true, false]) {
    for (const hasPublicPhotos of [true, false]) {
      for (const everyPhotoPublic of [true, false]) {
        for (const fullAccessRedundant of [true, false]) {
          // Impossible inputs: every photo public implies some photo is public.
          if (everyPhotoPublic && !hasPublicPhotos) continue;
          // Redundant implies every photo is public.
          if (fullAccessRedundant && !everyPhotoPublic) continue;
          const d = describeGuestAccess({ faceSearchOn, hasPublicPhotos, everyPhotoPublic, fullAccessRedundant });
          const all = strings(d).join(" ");
          if (d.case === "passcode_only") assert.doesNotMatch(all, /already sees?|every guest sees/i);
          if (d.case !== "all_public") assert.doesNotMatch(all, /already public|already sees/i);
          for (const s of strings(d)) {
            assert.ok(s.length > 0);
            assert.doesNotMatch(s, /in-lounge|lounge/i, "no internal jargon");
            assert.doesNotMatch(s, /[–—]/, "no en or em dash");
          }
        }
      }
    }
  }
});

test("the passcode regenerate confirm says what really happens and uses no dash", () => {
  assert.match(REGENERATE_PASSCODE_CONFIRM, /current passcode stops working/);
  assert.match(REGENERATE_PASSCODE_CONFIRM, /Clients, and anyone you gave full access yourself, keep theirs/);
  assert.doesNotMatch(REGENERATE_PASSCODE_CONFIRM, /[–—]/);
});
