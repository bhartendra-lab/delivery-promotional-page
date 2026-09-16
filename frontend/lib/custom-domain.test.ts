import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeHostname, validateCustomHostname, checkHostnameInput } from "./custom-domain.ts";

/**
 * These cases are deliberately the SAME cases as the backend's
 * src/utils/domain.utils.test.js. That duplication is the point: this module
 * exists only to mirror the server's rules, so the tests are what stop the two
 * drifting apart silently. A failure here after a backend change means the
 * mirror is stale, not that the test is wrong.
 */

test("normalizeHostname: lowercases and trims", () => {
  assert.equal(normalizeHostname("  Gallery.StudioXYZ.com  "), "gallery.studioxyz.com");
});

test("normalizeHostname: strips scheme, path, query, fragment, port and trailing dot", () => {
  assert.equal(normalizeHostname("https://gallery.studioxyz.com/photos?a=1#b"), "gallery.studioxyz.com");
  assert.equal(normalizeHostname("http://gallery.studioxyz.com:8443"), "gallery.studioxyz.com");
  assert.equal(normalizeHostname("gallery.studioxyz.com."), "gallery.studioxyz.com");
});

test("normalizeHostname: empty-ish input becomes the empty string", () => {
  for (const input of ["", "   ", null, undefined]) {
    assert.equal(normalizeHostname(input), "");
  }
});

test("validateCustomHostname: subdomains are accepted", () => {
  assert.equal(validateCustomHostname("gallery.studioxyz.com"), null);
  assert.equal(validateCustomHostname("photos.gallery.studioxyz.com"), null);
  assert.equal(validateCustomHostname("gallery.studio.co.uk"), null);
});

test("validateCustomHostname: an apex is rejected with the subdomain instruction", () => {
  assert.match(validateCustomHostname("studioxyz.com") ?? "", /subdomain like gallery\.yourstudio\.com/);
});

test("validateCustomHostname: KNOWN LIMITATION — an apex under a multi-part public suffix passes", () => {
  // Mirrors the backend gap exactly: three labels, so a label-count check
  // cannot see that this is a zone apex. Cloudflare rejects it at create time.
  assert.equal(validateCustomHostname("studio.co.uk"), null);
});

test("validateCustomHostname: anything under vyavasth.in is rejected", () => {
  assert.notEqual(validateCustomHostname("gallery.vyavasth.in"), null);
  assert.notEqual(validateCustomHostname("vyavasth.in"), null);
});

test("validateCustomHostname: a lookalike that merely ends in the zone string is allowed", () => {
  assert.equal(validateCustomHostname("gallery.notvyavasth.in"), null);
});

test("validateCustomHostname: malformed labels are rejected", () => {
  for (const bad of [
    "gallery..studioxyz.com",
    "-gallery.studioxyz.com",
    "gallery-.studioxyz.com",
    "gallery.studio xyz.com",
    "gallery.studio_xyz.com",
  ]) {
    assert.notEqual(validateCustomHostname(bad), null, bad);
  }
});

test("validateCustomHostname: an over-long hostname is rejected", () => {
  const long = `${"a".repeat(63)}.${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(63)}.com`;
  assert.notEqual(validateCustomHostname(long), null);
});

test("validateCustomHostname: empty input asks for a domain rather than calling it invalid", () => {
  assert.match(validateCustomHostname("") ?? "", /Enter the domain/);
});

test("checkHostnameInput: normalizes first, so a pasted URL validates cleanly", () => {
  const result = checkHostnameInput("https://Gallery.StudioXYZ.com/photos");
  assert.equal(result.hostname, "gallery.studioxyz.com");
  assert.equal(result.error, null);
});

test("checkHostnameInput: returns the normalized hostname even when it's rejected", () => {
  // The panel shows the studio what we understood them to mean alongside the
  // error, so the hostname must come back regardless of the verdict.
  const result = checkHostnameInput("https://StudioXYZ.com");
  assert.equal(result.hostname, "studioxyz.com");
  assert.match(result.error ?? "", /subdomain/);
});
