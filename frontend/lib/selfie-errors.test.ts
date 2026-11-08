import { test } from "node:test";
import assert from "node:assert/strict";
import { extractReason, toFriendlyError } from "./selfie-errors.ts";

class FakeApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    super("x");
    this.status = status;
    this.body = body;
  }
}
const api = (body: unknown, status = 422) => toFriendlyError(new FakeApiError(status, body)).message;

test("not an API error: a connection hint", () => {
  assert.deepEqual(toFriendlyError(new Error("network")), {
    message: "Something went wrong. Please check your connection and retake.",
    faceSearchDisabled: false,
  });
  assert.equal(toFriendlyError("boom").faceSearchDisabled, false);
});

test("FACE_SEARCH_DISABLED is the one case a retake cannot help", () => {
  assert.deepEqual(toFriendlyError(new FakeApiError(403, { code: "FACE_SEARCH_DISABLED" })), {
    message: "Face search has been turned off for this gallery.",
    faceSearchDisabled: true,
  });
});

test("every worker reason maps to its guidance", () => {
  assert.match(api({ error: "No face detected" }), /couldn’t find a face/);
  assert.match(api({ reason: "multiple faces found" }), /more than one face/);
  assert.match(api({ detail: "image too blurry" }), /blurry/);
  assert.match(api({ message: "low light" }), /lighting was off/);
  assert.match(api({ error: "face too small" }), /too small/);
  assert.match(api({ error: "bad angle" }), /look straight/);
  assert.match(api({ error: "sunglasses detected" }), /covering your face/);
});

test("a short clean worker reason is shown; a technical one is not", () => {
  assert.equal(api({ error: "eyes closed" }), "Eyes closed. Please retake.");
  assert.equal(api({ error: "Eyes closed!" }), "Eyes closed!");
  assert.match(api({ error: "HTTP 500 exception in handler" }), /couldn’t verify your face clearly/);
});

test("generic fallback, and the controller's own sentinel is never a reason", () => {
  assert.match(api({ message: "Failed to validate selfie" }), /couldn’t verify your face clearly/);
  assert.match(api(null), /couldn’t verify your face clearly/);
});

test("extractReason digs through nesting and arrays", () => {
  assert.equal(extractReason({ error: { detail: "no face" } }), "no face");
  assert.equal(extractReason({ errors: [{ message: "blur" }] }), "blur");
  assert.equal(extractReason({ errors: ["first", "second"] }), "first");
  assert.equal(extractReason("Failed to validate selfie"), "");
  assert.equal(extractReason(42), "");
});
