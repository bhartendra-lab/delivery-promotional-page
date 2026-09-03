import { test } from "node:test";
import assert from "node:assert/strict";
import { isExpiredPresignError, classifyHttp } from "./retry.ts";

// The exact body R2 returns once a presigned URL's X-Amz-Expires window passes.
const EXPIRED_BODY =
  '<?xml version="1.0" encoding="UTF-8"?><Error><Code>ExpiredRequest</Code><Message>Request has expired</Message></Error>';

test("isExpiredPresignError: recognises R2's expired-signature 403", () => {
  assert.equal(isExpiredPresignError({ status: 403, body: EXPIRED_BODY }), true);
});

test("isExpiredPresignError: a 403 that is NOT an expiry stays unrecognised — re-signing wouldn't fix a bad policy", () => {
  const denied =
    '<?xml version="1.0" encoding="UTF-8"?><Error><Code>AccessDenied</Code><Message>Access Denied</Message></Error>';
  assert.equal(isExpiredPresignError({ status: 403, body: denied }), false);
  const sig =
    '<?xml version="1.0" encoding="UTF-8"?><Error><Code>SignatureDoesNotMatch</Code></Error>';
  assert.equal(isExpiredPresignError({ status: 403, body: sig }), false);
});

test("isExpiredPresignError: the status must be 403, not merely a body that mentions it", () => {
  assert.equal(isExpiredPresignError({ status: 500, body: EXPIRED_BODY }), false);
  assert.equal(isExpiredPresignError({ status: 400, body: EXPIRED_BODY }), false);
});

test("isExpiredPresignError: tolerates a missing or non-string body, null and undefined", () => {
  assert.equal(isExpiredPresignError({ status: 403 }), false);
  assert.equal(isExpiredPresignError({ status: 403, body: 42 }), false);
  assert.equal(isExpiredPresignError(null), false);
  assert.equal(isExpiredPresignError(undefined), false);
  assert.equal(isExpiredPresignError(new Error("boom")), false);
});

test("classifyHttp still calls 403 terminal — expiry recovery is a re-sign, NOT a retry of the same URL", () => {
  // If this ever flipped to "retryable", withRetry would hammer the same dead
  // URL four more times and still fail, instead of re-signing.
  assert.equal(classifyHttp(403), "terminal");
  assert.equal(classifyHttp(429), "retryable");
  assert.equal(classifyHttp(503), "retryable");
});
