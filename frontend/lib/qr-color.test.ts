import { test } from "node:test";
import assert from "node:assert/strict";
import { expandHex, luminance, PRESETS, tooLightToScan } from "./qr-color.ts";

test("hex input: #RGB and #RRGGBB, with or without #, to lowercase #rrggbb", () => {
  assert.equal(expandHex("#C25"), "#cc2255");
  assert.equal(expandHex("c25a3a"), "#c25a3a");
  assert.equal(expandHex(" #ABCDEF "), "#abcdef");
  assert.equal(expandHex("#abcd"), null);
  assert.equal(expandHex("red"), null);
});

test("the scan guard: white and pale colours are too light, every preset scans", () => {
  assert.equal(tooLightToScan("#ffffff"), true);
  assert.equal(tooLightToScan("#f5e6c8"), true);
  assert.equal(tooLightToScan("#000000"), false);
  for (const p of PRESETS) assert.equal(tooLightToScan(p.hex), false, p.name);
  assert.equal(luminance("not a colour"), 0.35, "unparseable never trips the guard");
});
