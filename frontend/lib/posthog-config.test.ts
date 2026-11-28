import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BLOCK_SELECTOR,
  cleanEventUrls,
  consentRequiredForTimezone,
  mayCapture,
  MASK_TEXT_SELECTOR,
  pageviewBlockedOn,
  posthogEnabled,
  posthogHost,
  posthogInitOptions,
  posthogRewrites,
  recordingBlockedOn,
  stripUrl,
} from "./posthog-config.ts";

const ON = { NEXT_PUBLIC_POSTHOG_KEY: "phc_abc", NEXT_PUBLIC_POSTHOG_HOST: "https://eu.i.posthog.com" };

test("inert unless both the key and an https host are set", () => {
  assert.equal(posthogEnabled({}), false);
  assert.equal(posthogEnabled({ NEXT_PUBLIC_POSTHOG_KEY: "phc_abc" }), false);
  assert.equal(posthogEnabled({ NEXT_PUBLIC_POSTHOG_HOST: "https://eu.i.posthog.com" }), false);
  assert.equal(posthogEnabled({ NEXT_PUBLIC_POSTHOG_KEY: "phc_abc", NEXT_PUBLIC_POSTHOG_HOST: "http://eu.i.posthog.com" }), false);
  assert.equal(posthogEnabled({ NEXT_PUBLIC_POSTHOG_KEY: "phc_abc", NEXT_PUBLIC_POSTHOG_HOST: "not a url" }), false);
  assert.equal(posthogEnabled(ON), true);
  assert.equal(posthogHost({ NEXT_PUBLIC_POSTHOG_HOST: "https://eu.i.posthog.com/" }), "https://eu.i.posthog.com");
  assert.deepEqual(posthogRewrites({}), []);
});

test("the proxy sends /ingest to PostHog, static files to its assets host", () => {
  assert.deepEqual(posthogRewrites(ON), [
    { source: "/ingest/static/:path*", destination: "https://eu-assets.i.posthog.com/static/:path*" },
    { source: "/ingest/:path*", destination: "https://eu.i.posthog.com/:path*" },
  ]);
  const us = posthogRewrites({ ...ON, NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com" });
  assert.equal(us[0].destination, "https://us-assets.i.posthog.com/static/:path*");
  const own = posthogRewrites({ ...ON, NEXT_PUBLIC_POSTHOG_HOST: "https://ph.example.com" });
  assert.equal(own[0].destination, "https://ph.example.com/static/:path*");
});

test("a denied choice always wins; Europe waits for OK; elsewhere it is on until opt out", () => {
  assert.equal(mayCapture("denied", "Asia/Kolkata"), false);
  assert.equal(mayCapture("denied", "Europe/Berlin"), false);
  assert.equal(mayCapture("granted", "Europe/Berlin"), true);
  assert.equal(mayCapture(null, "Europe/Berlin"), false);
  assert.equal(mayCapture(null, "Europe/London"), false);
  assert.equal(mayCapture(null, "Asia/Kolkata"), true);
  assert.equal(mayCapture(null, null), true);
  assert.equal(consentRequiredForTimezone("Atlantic/Reykjavik"), true);
  assert.equal(consentRequiredForTimezone("America/New_York"), false);
});

test("replay hides every input, all text and every image; no network bodies, no autocapture", () => {
  const o = posthogInitOptions("https://eu.i.posthog.com", false);
  assert.equal(o.session_recording.maskAllInputs, true);
  assert.equal(o.session_recording.maskTextSelector, MASK_TEXT_SELECTOR);
  assert.equal(MASK_TEXT_SELECTOR, "*");
  for (const tag of ["img", "picture", "video", "canvas"]) assert.ok(BLOCK_SELECTOR.split(",").map((x) => x.trim()).includes(tag), tag);
  assert.ok(BLOCK_SELECTOR.includes("background-image"));
  assert.equal(o.session_recording.recordBody, false);
  assert.equal(o.session_recording.recordHeaders, false);
  assert.equal(o.autocapture, false);
  assert.equal(o.capture_pageview, false);
  assert.equal(o.capture_performance, false);
  assert.equal(o.person_profiles, "identified_only");
  assert.equal(o.api_host, "/ingest");
  assert.equal(o.opt_out_capturing_by_default, false);
  assert.equal(posthogInitOptions("https://eu.i.posthog.com", true).opt_out_capturing_by_default, true);
});

test("URLs lose their query string and fragment, on every URL field", () => {
  assert.equal(stripUrl("https://deliver.vyavasth.in/auth/callback?token=SECRET#x"), "https://deliver.vyavasth.in/auth/callback");
  assert.equal(stripUrl("/login?ref=ABC"), "/login");
  assert.equal(stripUrl(undefined), undefined);
  const e = cleanEventUrls({ event: "x", properties: { $current_url: "https://d.in/a?token=1", $referrer: "https://google.com/?q=name", other: "keep?this" } as Record<string, unknown> });
  assert.equal(e?.properties?.$current_url, "https://d.in/a");
  assert.equal(e?.properties?.$referrer, "https://google.com/");
  assert.equal(e?.properties?.other, "keep?this");
  assert.equal(cleanEventUrls(null), null);
});

test("no replay where the URL holds a token or the guest gallery is shown", () => {
  assert.equal(recordingBlockedOn("/auth/callback"), true);
  assert.equal(recordingBlockedOn("/reset-password"), true);
  assert.equal(recordingBlockedOn("/dashboard/events/abc123/preview"), true);
  assert.equal(recordingBlockedOn("/dashboard/events/abc123"), false);
  assert.equal(recordingBlockedOn("/dashboard"), false);
  assert.equal(pageviewBlockedOn("/dashboard/events/abc123/preview"), true);
  assert.equal(pageviewBlockedOn("/dashboard"), false);
});

test("PostHog is wired into the dashboard group and nowhere near the guest gallery", () => {
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
  assert.match(read("../app/(dashboard)/layout.tsx"), /<PosthogProvider \/>/);
  for (const guest of ["../components/event/screens/LoungeGallery.tsx", "../lib/guest-api.ts", "../app/e", "../app/(client)"]) {
    try {
      const src = read(guest);
      assert.doesNotMatch(src, /posthog/i, guest);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EISDIR" && (err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }
});

test("identify is by company id alone", () => {
  const src = readFileSync(new URL("./posthog.ts", import.meta.url), "utf8");
  assert.match(src, /client\.identify\(companyId\)/);
  assert.doesNotMatch(src, /identify\([^)]*,/, "no person properties");
  assert.doesNotMatch(src, /setPersonProperties|\$set\b|people\.set/);
});
