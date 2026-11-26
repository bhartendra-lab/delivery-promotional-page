import { test } from "node:test";
import assert from "node:assert/strict";
import { exclusiveValidity, offerDaysLeft } from "./offer-urgency.ts";

const END = Date.parse("2026-12-13T23:59:59.999+05:30");
const DAY = 24 * 60 * 60 * 1000;

test("exclusiveValidity: urgency sharpens as the end nears, the date is always IST", () => {
  assert.deepEqual(exclusiveValidity(END, END - 60 * DAY), { urgency: "Limited time", ends: "Ends 13 Dec 2026" });
  assert.deepEqual(exclusiveValidity(END, END - 18 * DAY), { urgency: "Only 18 days left", ends: "Ends 13 Dec 2026" });
  assert.deepEqual(exclusiveValidity(END, END - 9 * DAY), { urgency: "Only 9 days left", ends: "Ends 13 Dec 2026" });
  assert.equal(exclusiveValidity(END, END - 60_000)?.urgency, "Last day today");
  assert.equal(exclusiveValidity(null, END), null);
  assert.equal(offerDaysLeft(END, END + 1), 0);
  for (const d of [30, 9, 0.1]) {
    const v = exclusiveValidity(END, END - d * DAY);
    assert.doesNotMatch(`${v?.urgency} ${v?.ends}`, /[–—]/);
  }
});
