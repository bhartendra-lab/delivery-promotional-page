import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* The dashboard's text tiers must stay readable: body text at WCAG AA (4.5:1)
 * on both surfaces it sits on (white cards, the #FAFAF8 page canvas). The token
 * values are read from globals.css, so changing one cannot slip under the bar. */
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const token = (name: string) => {
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  assert.ok(m, `--${name} not found`);
  return m[1];
};
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const WHITE = "#FFFFFF";

test("body text clears AA on white and on the page canvas", () => {
  const body = token("color-brand-body");
  assert.ok(ratio(body, WHITE) >= 4.5, `body on white ${ratio(body, WHITE).toFixed(2)}`);
  assert.ok(ratio(body, token("color-brand-bg")) >= 4.5, `body on canvas ${ratio(body, token("color-brand-bg")).toFixed(2)}`);
});

test("meta and label text (muted) clear AA on white and on the page canvas", () => {
  const muted = token("color-brand-muted");
  assert.ok(ratio(muted, WHITE) >= 4.5, `muted on white ${ratio(muted, WHITE).toFixed(2)}`);
  assert.ok(ratio(muted, token("color-brand-bg")) >= 4.5, `muted on canvas ${ratio(muted, token("color-brand-bg")).toFixed(2)}`);
});

test("body is darker than muted, and ink is darker than body (a real hierarchy)", () => {
  assert.ok(lum(token("color-brand-body")) < lum(token("color-brand-muted")));
  assert.ok(lum(token("color-brand-ink")) < lum(token("color-brand-body")));
});

test("the existing token values were not changed", () => {
  assert.equal(token("color-brand-navy"), "#C25A3A");
  assert.equal(token("color-brand-ink"), "#2A2218");
  assert.equal(token("color-brand-muted"), "#7A6F63");
});

test("the tier classes exist with the sizes the spec gives", () => {
  assert.match(css, /\.type-body\s*\{[^}]*font-size:\s*13px/);
  assert.match(css, /\.type-meta\s*\{[^}]*font-size:\s*12px/);
  assert.match(css, /\.type-label\s*\{[^}]*font-size:\s*11px[^}]*uppercase/);
});

test("chip text (Client badge, On chip) clears AA on its tint", () => {
  assert.ok(ratio(token("color-brand-navy-deep"), token("color-brand-navy-soft")) >= 4.5, "navy-deep on navy-soft");
});
