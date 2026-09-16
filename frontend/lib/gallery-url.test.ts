import { test } from "node:test";
import assert from "node:assert/strict";
import { hasLiveCustomDomain, galleryBaseUrl, galleryUrlFor } from "./gallery-url.ts";
import type { Company } from "./types.ts";

/**
 * These cases mirror the backend's domain.utils.test.js deliberately — this
 * module exists only to apply the same rule on the client, so the tests are
 * what stop the two drifting apart. A failure here after a backend change means
 * the mirror is stale.
 */

const company = (over: Partial<Company> = {}) => ({ _id: "c1", name: "Studio", createdAt: "", updatedAt: "", ...over }) as Company;

test("hasLiveCustomDomain: needs BOTH a hostname and an active status", () => {
  assert.equal(hasLiveCustomDomain(company({ custom_domain: "g.s.com", custom_domain_status: "active" })), true);
  assert.equal(hasLiveCustomDomain(company({ custom_domain: "g.s.com", custom_domain_status: "moved" })), false);
  assert.equal(hasLiveCustomDomain(company({ custom_domain: "g.s.com", custom_domain_status: "failed" })), false);
  assert.equal(hasLiveCustomDomain(company({ custom_domain: "g.s.com", custom_domain_status: "pending_dns" })), false);
  assert.equal(hasLiveCustomDomain(company({ custom_domain: null, custom_domain_status: "active" })), false);
});

test("hasLiveCustomDomain: a company with no custom-domain fields at all is not live", () => {
  // Every company predating the feature looks exactly like this.
  assert.equal(hasLiveCustomDomain(company()), false);
  assert.equal(hasLiveCustomDomain(null), false);
  assert.equal(hasLiveCustomDomain(undefined), false);
});

test("galleryBaseUrl: a live custom domain wins", () => {
  const url = galleryBaseUrl(company({ custom_domain: "gallery.studioxyz.com", custom_domain_status: "active" }));
  assert.equal(url, "https://gallery.studioxyz.com");
});

test("galleryBaseUrl: always https for a custom domain — Cloudflare terminates TLS for every custom hostname", () => {
  const url = galleryBaseUrl(company({ custom_domain: "gallery.studioxyz.com", custom_domain_status: "active" }));
  assert.ok(url.startsWith("https://"));
});

test("galleryBaseUrl: falls back to the Vyavasth domain for everyone else", () => {
  const previous = process.env.NEXT_PUBLIC_BASE_URL;
  process.env.NEXT_PUBLIC_BASE_URL = "https://deliver.vyavasth.in";
  try {
    assert.equal(galleryBaseUrl(company()), "https://deliver.vyavasth.in");
    assert.equal(galleryBaseUrl(null), "https://deliver.vyavasth.in");
    // A domain mid-setup must NOT be used yet.
    assert.equal(
      galleryBaseUrl(company({ custom_domain_pending: "gallery.studioxyz.com", custom_domain_status: "pending_dns" })),
      "https://deliver.vyavasth.in",
    );
    // A domain that regressed must fall back rather than keep pointing at a
    // hostname that no longer resolves.
    assert.equal(
      galleryBaseUrl(company({ custom_domain: "gallery.studioxyz.com", custom_domain_status: "moved" })),
      "https://deliver.vyavasth.in",
    );
  } finally {
    process.env.NEXT_PUBLIC_BASE_URL = previous;
  }
});

test("galleryBaseUrl: a trailing slash on the env value is stripped, so links never double up", () => {
  const previous = process.env.NEXT_PUBLIC_BASE_URL;
  process.env.NEXT_PUBLIC_BASE_URL = "https://deliver.vyavasth.in/";
  try {
    assert.equal(galleryUrlFor(company(), "riya-and-arjun"), "https://deliver.vyavasth.in/event/riya-and-arjun");
  } finally {
    process.env.NEXT_PUBLIC_BASE_URL = previous;
  }
});

test("galleryUrlFor: builds the full gallery URL on the studio's own domain", () => {
  const url = galleryUrlFor(
    company({ custom_domain: "gallery.studioxyz.com", custom_domain_status: "active" }),
    "riya-and-arjun",
  );
  assert.equal(url, "https://gallery.studioxyz.com/event/riya-and-arjun");
});

test("galleryUrlFor: returns null without a slug, so callers hide the affordance", () => {
  // A booking whose landing page has not been created yet has no gallery. The
  // old code built a URL anyway and handed the studio something that 404s.
  const live = company({ custom_domain: "gallery.studioxyz.com", custom_domain_status: "active" });
  assert.equal(galleryUrlFor(live, undefined), null);
  assert.equal(galleryUrlFor(live, null), null);
  assert.equal(galleryUrlFor(live, ""), null);
});

test("galleryUrlFor: uses /event/<slug>, never the /c/<id> route that never existed", () => {
  const url = galleryUrlFor(company(), "riya-and-arjun");
  assert.ok(url!.includes("/event/riya-and-arjun"));
  assert.ok(!url!.includes("/c/"));
});
