import { test } from "node:test";
import assert from "node:assert/strict";
import { isVyavasthHost, isGuestSurfacePath, isRequestAllowed } from "./host-gate.ts";

/**
 * This is the security boundary for the whole custom-domain feature: it is the
 * only thing stopping the studio dashboard from being served at a URL that
 * looks like it belongs to the studio. Tested exhaustively, and deliberately
 * including the cases that would be easy to "simplify" wrongly later.
 */

/* ── host classification ────────────────────────────────────────────────── */

test("isVyavasthHost: our own production and dev hostnames", () => {
  assert.equal(isVyavasthHost("deliver.vyavasth.in"), true);
  assert.equal(isVyavasthHost("dev.deliver.vyavasth.in"), true);
});

test("isVyavasthHost: loopback, with or without a port", () => {
  for (const host of ["localhost", "localhost:3000", "127.0.0.1", "127.0.0.1:8787", "[::1]", "[::1]:8787"]) {
    assert.equal(isVyavasthHost(host), true, host);
  }
});

test("isVyavasthHost: case and whitespace are normalised", () => {
  assert.equal(isVyavasthHost("  Deliver.Vyavasth.IN  "), true);
});

test("isVyavasthHost: a studio domain is not ours", () => {
  assert.equal(isVyavasthHost("gallery.studioxyz.com"), false);
});

test("isVyavasthHost: a missing or empty Host is NOT treated as ours", () => {
  // Fail closed. An absent Host must not be a way to reach the dashboard from
  // an arbitrary hostname.
  for (const host of ["", "   ", null, undefined]) {
    assert.equal(isVyavasthHost(host), false);
  }
});

test("isVyavasthHost: a hostname that merely CONTAINS ours is not ours", () => {
  // The check is on the whole hostname, not a substring/suffix match — these
  // are all domains someone else can register.
  for (const host of [
    "deliver.vyavasth.in.evil.com",
    "notdeliver.vyavasth.in",
    "evil-deliver.vyavasth.in",
    "deliver.vyavasth.in.co",
  ]) {
    assert.equal(isVyavasthHost(host), false, host);
  }
});

test("isVyavasthHost: our own APEX and other subdomains are not the app's hosts", () => {
  // vyavasth.in and www are the marketing site (a different Worker); media/app
  // are R2 and Vercel. None of them should get the dashboard through this gate.
  for (const host of ["vyavasth.in", "www.vyavasth.in", "media.vyavasth.in", "app.vyavasth.in"]) {
    assert.equal(isVyavasthHost(host), false, host);
  }
});

/* ── path classification ────────────────────────────────────────────────── */

test("isGuestSurfacePath: the gallery and its sub-paths are allowed", () => {
  assert.equal(isGuestSurfacePath("/event/riya-and-arjun"), true);
  assert.equal(isGuestSurfacePath("/event/riya-and-arjun/auth/callback"), true);
});

test("isGuestSurfacePath: the QR error screens are allowed", () => {
  assert.equal(isGuestSurfacePath("/error/qr-not-found"), true);
  assert.equal(isGuestSurfacePath("/error/qr-not-assigned"), true);
});

test("isGuestSurfacePath: next/image is allowed — a gallery without it has no photos", () => {
  // Callers pass `url.pathname`, which never carries the query string, so
  // `/_next/image` is the whole path even though the real request is
  // /_next/image?url=…&w=640&q=75.
  assert.equal(isGuestSurfacePath("/_next/image"), true);
  assert.equal(isGuestSurfacePath("/_next/static/chunks/main.js"), true);
});

test("isGuestSurfacePath: /_next/data is NOT allowed", () => {
  // Blanket-allowing /_next/ is exactly how a protected page leaks through its
  // own data route. Only /_next/static and /_next/image are allowed.
  assert.equal(isGuestSurfacePath("/_next/data/build/dashboard.json"), false);
  assert.equal(isGuestSurfacePath("/_next/server/app/dashboard.html"), false);
});

test("isGuestSurfacePath: every dashboard surface is refused", () => {
  for (const path of [
    "/",
    "/dashboard",
    "/dashboard/events",
    "/dashboard/settings",
    "/dashboard/settings/domain",
    "/login",
    "/onboarding",
    "/checkout",
    "/reset-password",
    "/auth/callback",
  ]) {
    assert.equal(isGuestSurfacePath(path), false, path);
  }
});

test("isGuestSurfacePath: a path that merely CONTAINS /event/ is refused", () => {
  // Prefix match, anchored at the start — not a substring search.
  assert.equal(isGuestSurfacePath("/dashboard/event/abc"), false);
  assert.equal(isGuestSurfacePath("/x/event/abc"), false);
});

test("isGuestSurfacePath: a bare /event or /error without the trailing slash is refused", () => {
  // Neither is a real route, and allowing the un-slashed prefix would also
  // allow /eventual-something.
  assert.equal(isGuestSurfacePath("/event"), false);
  assert.equal(isGuestSurfacePath("/eventsomething"), false);
  assert.equal(isGuestSurfacePath("/error"), false);
  assert.equal(isGuestSurfacePath("/error/anything-else"), false);
});

/* ── the combined decision ──────────────────────────────────────────────── */

test("isRequestAllowed: our own host gets everything, unchanged", () => {
  for (const path of ["/", "/dashboard", "/login", "/event/abc", "/_next/data/x.json"]) {
    assert.equal(isRequestAllowed("deliver.vyavasth.in", path), true, path);
    assert.equal(isRequestAllowed("localhost:3000", path), true, path);
  }
});

test("isRequestAllowed: a studio host gets the guest surface only", () => {
  assert.equal(isRequestAllowed("gallery.studioxyz.com", "/event/abc"), true);
  assert.equal(isRequestAllowed("gallery.studioxyz.com", "/error/qr-not-found"), true);
  assert.equal(isRequestAllowed("gallery.studioxyz.com", "/_next/image"), true);
});

test("isRequestAllowed: a studio host cannot reach the dashboard, login or the app root", () => {
  for (const path of ["/dashboard", "/dashboard/settings/domain", "/login", "/", "/checkout", "/onboarding"]) {
    assert.equal(isRequestAllowed("gallery.studioxyz.com", path), false, path);
  }
});

test("isRequestAllowed: an unknown host with no Host header still cannot reach the dashboard", () => {
  assert.equal(isRequestAllowed(null, "/dashboard"), false);
  assert.equal(isRequestAllowed("", "/dashboard"), false);
});
