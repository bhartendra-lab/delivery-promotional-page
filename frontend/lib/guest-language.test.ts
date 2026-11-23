import { test } from "node:test";
import assert from "node:assert/strict";
import { GUEST_LANGS, WELCOME_COPY, effectiveLang, parseGuestLang } from "./guest-language.ts";

test("parseGuestLang accepts only en and hi", () => {
  assert.equal(parseGuestLang("hi"), "hi");
  assert.equal(parseGuestLang("en"), "en");
  assert.equal(parseGuestLang("HI"), null);
  assert.equal(parseGuestLang(null), null);
  assert.equal(parseGuestLang(undefined), null);
});

test("effectiveLang: saved beats device beats English", () => {
  assert.equal(effectiveLang("en", "hi"), "en");
  assert.equal(effectiveLang(null, "hi"), "hi");
  assert.equal(effectiveLang(undefined, null), "en");
});

test("both languages are offered and fully worded", () => {
  assert.deepEqual(GUEST_LANGS.map((l) => l.code), ["en", "hi"]);
  for (const lang of ["en", "hi"] as const) {
    const c = WELCOME_COPY[lang];
    assert.equal(c.introLines.length, 3);
    assert.ok(c.findMyPhotos && c.viewPhotos && c.getStarted && c.introTitle);
    assert.match(c.photosWaiting(12, "12"), /12/);
    assert.match(c.galleryBy("Sharma Films"), /Sharma Films/);
  }
  assert.equal(WELCOME_COPY.en.photosWaiting(1, "1"), "1 photo waiting for you");
});
