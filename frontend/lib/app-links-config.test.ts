import { test } from "node:test";
import assert from "node:assert/strict";
import { appleAppSiteAssociation, assetLinks, STUDIO_PATHS } from "./app-links-config.ts";

test("AASA lists the guest app for /e/* and /event/*, and nothing when unconfigured", () => {
  assert.deepEqual(appleAppSiteAssociation("TEAM123.in.vyavasth.gallery"), {
    applinks: { details: [{ appIDs: ["TEAM123.in.vyavasth.gallery"], components: [{ "/": "/e/*" }, { "/": "/event/*" }] }] },
  });
  assert.deepEqual(appleAppSiteAssociation(undefined), { applinks: { details: [] } });
  assert.deepEqual(appleAppSiteAssociation("", "  "), { applinks: { details: [] } });
});

test("AASA lists the studio app for /r/* and /dashboard/events/* only", () => {
  const doc = appleAppSiteAssociation("TEAM123.in.vyavasth.gallery", "TEAM123.in.vyavasth.studio");
  assert.equal(doc.applinks.details.length, 2);
  assert.deepEqual(doc.applinks.details[1], {
    appIDs: ["TEAM123.in.vyavasth.studio"],
    components: [{ "/": "/r/*" }, { "/": "/dashboard/events/*" }],
  });
  // The studio app alone, without the guest app.
  assert.deepEqual(appleAppSiteAssociation(undefined, "TEAM123.in.vyavasth.studio").applinks.details[0].appIDs, ["TEAM123.in.vyavasth.studio"]);
});

test("nothing under billing or checkout is claimed by the studio app", () => {
  const glob = (p: string) => new RegExp(`^${p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
  const claims = (path: string) => STUDIO_PATHS.some((p) => glob(p).test(path));
  assert.equal(claims("/r/PIXL7K2Q"), true);
  assert.equal(claims("/dashboard/events/42"), true);
  for (const path of ["/checkout", "/dashboard/settings/billing", "/dashboard/billing", "/pricing", "/dashboard/events", "/event/abc"]) {
    assert.equal(claims(path), false, path);
  }
});

test("assetlinks carries every fingerprint, upper-cased", () => {
  const out = assetLinks({ pkg: "in.vyavasth.gallery", fingerprints: "aa:bb, CC:DD" });
  assert.deepEqual(out[0].target.sha256_cert_fingerprints, ["AA:BB", "CC:DD"]);
  assert.deepEqual(assetLinks({ pkg: "in.vyavasth.gallery", fingerprints: "" }), []);
  assert.deepEqual(assetLinks({ pkg: undefined, fingerprints: "AA" }), []);
});

test("assetlinks has one statement per configured app", () => {
  const out = assetLinks(
    { pkg: "in.vyavasth.gallery", fingerprints: "AA:BB" },
    { pkg: "in.vyavasth.studio", fingerprints: "11:22,33:44" },
  );
  assert.deepEqual(out.map((s) => s.target.package_name), ["in.vyavasth.gallery", "in.vyavasth.studio"]);
  assert.deepEqual(out[1].target.sha256_cert_fingerprints, ["11:22", "33:44"]);
  // An unconfigured guest app leaves the studio statement alone.
  assert.deepEqual(assetLinks({ pkg: undefined, fingerprints: undefined }, { pkg: "in.vyavasth.studio", fingerprints: "11:22" }).length, 1);
});
