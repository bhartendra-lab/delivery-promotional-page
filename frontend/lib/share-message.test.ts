import { test } from "node:test";
import assert from "node:assert/strict";
import { galleryInviteMessage, passcodeShareMessage } from "./share-message.ts";

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
