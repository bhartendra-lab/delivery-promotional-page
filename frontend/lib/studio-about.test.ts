import { test } from "node:test";
import assert from "node:assert/strict";
import { aboutPayload, ACQUISITION_OPTIONS, sourceBringsReferralCode, validateStudioAbout } from "./studio-about.ts";
import { INDIAN_CITIES, suggestCities } from "./indian-cities.ts";

test("the eight answers the studio can give, in the order asked, with the words asked", () => {
  assert.deepEqual(ACQUISITION_OPTIONS.map((o) => o.label), [
    "Photo fair or expo", "WhatsApp message", "Referred by a studio", "Instagram", "Google search",
    "ChatGPT / Gemini / other AI app", "Call from Vyavasth team", "Other",
  ]);
  assert.deepEqual(ACQUISITION_OPTIONS.map((o) => o.value), ["photo_fair_or_expo", "whatsapp_message", "referred_by_studio", "instagram", "google_search", "ai_app", "vyavasth_team_call", "other"]);
});

test("both answers are required, and Other needs its few words", () => {
  assert.deepEqual(validateStudioAbout({ city: "Bhopal", acquisitionSource: "instagram", acquisitionSourceOther: "" }), {});
  // Both questions are optional: blank answers are fine.
  assert.deepEqual(validateStudioAbout({ city: " ", acquisitionSource: "", acquisitionSourceOther: "" }), {});
  assert.match(validateStudioAbout({ city: "Bhopal", acquisitionSource: "other", acquisitionSourceOther: "  " }).other ?? "", /few words/);
  assert.equal(validateStudioAbout({ city: "Bhopal", acquisitionSource: "other", acquisitionSourceOther: "a friend" }).other, undefined);
  assert.ok(validateStudioAbout({ city: "x".repeat(200), acquisitionSource: "instagram", acquisitionSourceOther: "" }).city);
  for (const e of Object.values(validateStudioAbout({ city: "x".repeat(200), acquisitionSource: "other", acquisitionSourceOther: "" }))) assert.doesNotMatch(e, /[–—]/);
});

test("the payload is clean, and free text goes only with Other", () => {
  assert.deepEqual(aboutPayload({ city: "  Indore  ", acquisitionSource: "other", acquisitionSourceOther: " a   friend " }), { city: "Indore", acquisitionSource: "other", acquisitionSourceOther: "a friend" });
  assert.deepEqual(aboutPayload({ city: "Indore", acquisitionSource: "google_search", acquisitionSourceOther: "left over" }), { city: "Indore", acquisitionSource: "google_search", acquisitionSourceOther: "" });
});

test("only 'Referred by a studio' brings up the Referral code field", () => {
  assert.equal(sourceBringsReferralCode("referred_by_studio"), true);
  for (const s of ["instagram", "other", ""] as const) assert.equal(sourceBringsReferralCode(s), false);
});

test("the city list is compact, has no repeats, and suggests by what is typed", () => {
  assert.ok(INDIAN_CITIES.length >= 100 && INDIAN_CITIES.length <= 250);
  assert.equal(new Set(INDIAN_CITIES).size, INDIAN_CITIES.length);
  assert.ok(INDIAN_CITIES.includes("Bhopal") && INDIAN_CITIES.includes("Indore") && INDIAN_CITIES.includes("Mumbai"));
  assert.equal(suggestCities("bho")[0], "Bhopal");
  assert.deepEqual(suggestCities(""), []);
  assert.deepEqual(suggestCities("zzzz"), []);
  assert.ok(suggestCities("pur").length > 0, "also matches inside a name");
  assert.ok(suggestCities("a", 3).length <= 3);
});

test("blank answers go to the server blank, never as \"other\"", () => {
  assert.deepEqual(aboutPayload({ city: "  ", acquisitionSource: "", acquisitionSourceOther: "x" }), { city: "", acquisitionSource: "", acquisitionSourceOther: "" });
});
