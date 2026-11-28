import { test } from "node:test";
import assert from "node:assert/strict";
import { galleryInviteMessage, passcodeShareMessage, SHARE_LANGUAGES, isShareLang, type ShareLang } from "./share-message.ts";

test("the studio's invite is exactly what Access & Sharing has always sent", () => {
  assert.equal(
    galleryInviteMessage({ eventName: "Priya & Rahul", url: "https://deliver.vyavasth.in/event/abc", faceSearchOn: true }),
    "Namaste! The photos from Priya & Rahul are ready. 🎉\n\nOpen the gallery and sign in. Take a quick selfie to see every photo you're in:\nhttps://deliver.vyavasth.in/event/abc",
  );
  assert.equal(
    galleryInviteMessage({ eventName: "Annual Day", url: "https://g.studio.in/event/x", faceSearchOn: false }),
    "Namaste! The photos from Annual Day are ready. 🎉\n\nOpen the gallery and sign in to see them:\nhttps://g.studio.in/event/x",
  );
});

test("the passcode message names the code, the event and the link", () => {
  assert.equal(
    passcodeShareMessage({ passcode: "482913", eventName: "Priya & Rahul’s Wedding", url: "https://g.in/event/x" }),
    "Use passcode 482913 to see all photos from Priya & Rahul’s Wedding: https://g.in/event/x",
  );
  assert.equal(passcodeShareMessage({ passcode: "482913", eventName: " ", url: null }), "Use passcode 482913 to see all photos.");
  assert.doesNotMatch(passcodeShareMessage({ passcode: "1", eventName: "E", url: "u" }), /[–—]/);
});

/* ── languages ──────────────────────────────────────────────────────────── */

const URL_ = "https://deliver.vyavasth.in/event/abc";
const EVENT_ = "Priya & Rahul’s Wedding";

test("English with an explicit lang is byte for byte the default message", () => {
  const args = { eventName: "Priya & Rahul", url: "https://deliver.vyavasth.in/event/abc", faceSearchOn: true };
  assert.equal(galleryInviteMessage({ ...args, lang: "en" }), galleryInviteMessage(args));
  assert.equal(
    galleryInviteMessage({ ...args, lang: "en" }),
    "Namaste! The photos from Priya & Rahul are ready. 🎉\n\nOpen the gallery and sign in. Take a quick selfie to see every photo you're in:\nhttps://deliver.vyavasth.in/event/abc",
  );
  assert.equal(
    passcodeShareMessage({ passcode: "482913", eventName: "Priya & Rahul’s Wedding", url: "https://g.in/event/x", lang: "en" }),
    "Use passcode 482913 to see all photos from Priya & Rahul’s Wedding: https://g.in/event/x",
  );
});

test("the dropdown offers exactly the twelve languages, English first", () => {
  assert.deepEqual(
    SHARE_LANGUAGES.map((l) => l.code),
    ["en", "hi", "hinglish", "mr", "gu", "bn", "pa", "or", "ta", "te", "kn", "ml"],
  );
  assert.equal(isShareLang("hi"), true);
  assert.equal(isShareLang("fr"), false);
  assert.equal(isShareLang(undefined), false);
});

for (const { code } of SHARE_LANGUAGES) {
  test(`${code}: every variant keeps the event name and the link untouched, with no dashes and no leftover placeholders`, () => {
    const lang = code as ShareLang;
    const outputs = [
      galleryInviteMessage({ eventName: EVENT_, url: URL_, faceSearchOn: true, lang }),
      galleryInviteMessage({ eventName: EVENT_, url: URL_, faceSearchOn: false, lang }),
      passcodeShareMessage({ passcode: "482913", eventName: EVENT_, url: URL_, lang }),
      passcodeShareMessage({ passcode: "482913", eventName: EVENT_, url: null, lang }),
      passcodeShareMessage({ passcode: "482913", eventName: " ", url: URL_, lang }),
    ];
    // Invite: the name is in the opening line, the link is the last line.
    assert.ok(outputs[0].includes(EVENT_) && outputs[1].includes(EVENT_));
    assert.ok(outputs[0].endsWith(`\n${URL_}`) && outputs[1].endsWith(`\n${URL_}`));
    // Passcode: the code, the name (when there is one) and the link.
    assert.ok(outputs[2].includes("482913") && outputs[2].includes(EVENT_) && outputs[2].endsWith(URL_));
    assert.ok(outputs[3].includes("482913") && outputs[3].includes(EVENT_) && !outputs[3].includes("http"));
    assert.ok(outputs[4].includes("482913") && outputs[4].endsWith(URL_));
    for (const out of outputs) {
      assert.doesNotMatch(out, /[\u2013\u2014]/, "no en or em dash");
      assert.doesNotMatch(out, /\$\{|undefined|\[object/, "nothing left unfilled");
    }
    // The two invite variants differ (selfie line vs sign in line).
    assert.notEqual(outputs[0], outputs[1]);
  });
}

test("a language is a different message from English (the table is really used)", () => {
  const en = galleryInviteMessage({ eventName: "E", url: "u", faceSearchOn: true });
  for (const { code } of SHARE_LANGUAGES.filter((l) => l.code !== "en")) {
    assert.notEqual(galleryInviteMessage({ eventName: "E", url: "u", faceSearchOn: true, lang: code as ShareLang }), en, code);
  }
});
