import { test } from "node:test";
import assert from "node:assert/strict";
import { isRecipientToken } from "./campaign-link.ts";

test("recipient tokens are CRM ULIDs only", () => {
  assert.equal(isRecipientToken("01KAXQ6Z3V8M9N2P4R5S6T7W8X"), true);
  assert.equal(isRecipientToken("__recipient__"), false);
  assert.equal(isRecipientToken("01kaxq6z3v8m9n2p4r5s6t7w8x"), false);
  assert.equal(isRecipientToken("01KAXQ6Z3V8M9N2P4R5S6T7W8"), false);
  assert.equal(isRecipientToken("01KAXQ6Z3V8M9N2P4R5S6T7WIL"), false);
  assert.equal(isRecipientToken(undefined), false);
});

