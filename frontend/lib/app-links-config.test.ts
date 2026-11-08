import { test } from "node:test";
import assert from "node:assert/strict";
import { appleAppSiteAssociation, assetLinks } from "./app-links-config.ts";

test("AASA lists the app for /e/* and /event/*, and nothing when unconfigured", () => {
  assert.deepEqual(appleAppSiteAssociation("TEAM123.in.vyavasth.gallery"), {
    applinks: { details: [{ appIDs: ["TEAM123.in.vyavasth.gallery"], components: [{ "/": "/e/*" }, { "/": "/event/*" }] }] },
  });
  assert.deepEqual(appleAppSiteAssociation(undefined), { applinks: { details: [] } });
});

test("assetlinks carries every fingerprint, upper-cased", () => {
  const out = assetLinks("in.vyavasth.gallery", "aa:bb, CC:DD");
  assert.deepEqual(out[0].target.sha256_cert_fingerprints, ["AA:BB", "CC:DD"]);
  assert.deepEqual(assetLinks("in.vyavasth.gallery", ""), []);
  assert.deepEqual(assetLinks(undefined, "AA"), []);
});
