import { test } from "node:test";
import assert from "node:assert/strict";
import { toCompactMessage, toMessageParagraphs } from "./guest-message.ts";

/* ── Paragraphs and lines ────────────────────────────────────────────────── */

test("a single line is one paragraph of one line", () => {
  assert.deepEqual(toMessageParagraphs("Thank you for celebrating with us."), [
    ["Thank you for celebrating with us."],
  ]);
});

test("a single newline is a line break inside one paragraph", () => {
  assert.deepEqual(toMessageParagraphs("a\nb"), [["a", "b"]]);
});

test("a blank line starts a new paragraph", () => {
  assert.deepEqual(toMessageParagraphs("a\n\nb"), [["a"], ["b"]]);
});

test("more blank lines say nothing more than one does", () => {
  // The studio hitting Enter five times gets the same gap as hitting it twice.
  assert.deepEqual(toMessageParagraphs("a\n\n\n\nb"), [["a"], ["b"]]);
});

test("Windows line endings split the same way as Unix ones", () => {
  assert.deepEqual(toMessageParagraphs("a\r\n\r\nb"), [["a"], ["b"]]);
  assert.deepEqual(toMessageParagraphs("a\rb"), [["a", "b"]]);
});

/* ── What gets dropped ───────────────────────────────────────────────────── */

test("a whitespace-only message is nothing at all", () => {
  assert.deepEqual(toMessageParagraphs("  \n\n  "), []);
  assert.equal(toCompactMessage("  \n\n  "), "");
  for (const empty of ["", null, undefined]) {
    assert.deepEqual(toMessageParagraphs(empty), []);
    assert.equal(toCompactMessage(empty), "");
  }
});

test("blank lines at the start and end of the message disappear", () => {
  assert.deepEqual(toMessageParagraphs("\n\n  a\nb  \n\n"), [["a", "b"]]);
});

test("trailing spaces on a line are dropped", () => {
  // `pre-line` collapses them on screen anyway; dropping them here keeps two
  // messages that look identical in the textarea from measuring differently.
  assert.deepEqual(toMessageParagraphs("a   \n   b"), [["a", "b"]]);
});

/* ── What passes through untouched ───────────────────────────────────────── */

test("Devanagari and emoji pass through unchanged", () => {
  assert.deepEqual(toMessageParagraphs("आपका स्वागत है 🎉\n\nधन्यवाद"), [
    ["आपका स्वागत है 🎉"],
    ["धन्यवाद"],
  ]);
});

test("markup and URLs stay plain text — nothing is parsed", () => {
  const raw = "See <b>this</b> at https://example.com/a_b?c=1";
  assert.deepEqual(toMessageParagraphs(raw), [[raw]]);
  assert.equal(toCompactMessage(raw), raw);
});

/* ── The cover's compact form ────────────────────────────────────────────── */

test("the compact form flattens a paragraph break to a single line break", () => {
  assert.equal(toCompactMessage("a\n\nb"), "a\nb");
});

test("the compact form never contains a blank line", () => {
  const compact = toCompactMessage("\n\na\n\n\nb\nc\n\n");
  assert.equal(compact, "a\nb\nc");
  assert.ok(!compact.includes("\n\n"));
});
