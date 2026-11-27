import { test } from "node:test";
import assert from "node:assert/strict";
import { stateForCity } from "./city-state.ts";
import { INDIAN_CITIES } from "./indian-cities.ts";

test("every suggested onboarding city has a state", () => {
  const missing = INDIAN_CITIES.filter((c) => !stateForCity(c));
  assert.deepEqual(missing, []);
});

test("common spellings and free text find the state", () => {
  assert.equal(stateForCity("Bhopal")?.name, "Madhya Pradesh");
  assert.equal(stateForCity("  bangalore ")?.name, "Karnataka");
  assert.equal(stateForCity("Bhopal, MP")?.name, "Madhya Pradesh");
  assert.equal(stateForCity("Allahabad (Prayagraj)")?.name, "Uttar Pradesh");
  assert.equal(stateForCity("Navi Mumbai")?.name, "Maharashtra");
  assert.equal(stateForCity("Gurgaon")?.code, "06");
  assert.equal(stateForCity("Pimpri-Chinchwad")?.name, "Maharashtra");
});

test("a town not on the list falls back to a state named in the text, else nothing", () => {
  assert.equal(stateForCity("Sehore, Madhya Pradesh")?.name, "Madhya Pradesh");
  assert.equal(stateForCity("Sehore"), null);
  assert.equal(stateForCity(""), null);
  assert.equal(stateForCity(undefined), null);
});
