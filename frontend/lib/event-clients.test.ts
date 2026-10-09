import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COUPLE_EVENT_TYPES,
  EVENT_CLIENT_NAME_MAX,
  EVENT_EXPIRY_OPTIONS,
  coupleEventName,
  coupleEventNamePreview,
  createdEventNotice,
  eventExpiryPreview,
  eventField,
  expiryOutcomeLine,
  firstNameOf,
  formatExpiryDay,
  hasCompleteNumber,
  isCoupleEventType,
  istDateInputOf,
  resolveEventExpiry,
  tomorrowIstDateInput,
  validateEventDraft,
  type PersonDraft,
} from "./event-clients.ts";

/**
 * These cases mirror the backend's bookings.utils.test.js and
 * ist-time.utils.test.js deliberately. This module exists to apply the same
 * rules on the client, so the create modal previews the name and the expiry
 * day the server will actually store. A failure here after a backend change
 * means the mirror is stale.
 */

const ist = (iso: string) => Date.parse(`${iso}+05:30`);
const endOfIstDay = (date: string) => ist(`${date}T23:59:59.999`);

/* ── couple events ──────────────────────────────────────────────────────── */

test("isCoupleEventType: the four couple types, and nothing else", () => {
  assert.deepEqual([...COUPLE_EVENT_TYPES], ["Wedding", "Pre-wedding", "Engagement", "Anniversary"]);
  for (const type of COUPLE_EVENT_TYPES) assert.equal(isCoupleEventType(type), true, type);
  for (const type of ["Birthday", "Corporate", "Sports", "wedding", "", undefined, null]) {
    assert.equal(isCoupleEventType(type), false, String(type));
  }
});

test("firstNameOf: the first word of the trimmed, whitespace-collapsed name", () => {
  assert.equal(firstNameOf("Aanya Sharma"), "Aanya");
  assert.equal(firstNameOf("   Rohan \t Kumar   Verma "), "Rohan");
  for (const raw of ["", "    ", undefined, null]) assert.equal(firstNameOf(raw), "", String(raw));
});

test("coupleEventName: the two first names with ' & ' between them, Bride first", () => {
  assert.equal(coupleEventName("Aanya Sharma", "Rohan Verma"), "Aanya & Rohan");
});

test("coupleEventNamePreview: nothing until BOTH first names exist", () => {
  assert.equal(coupleEventNamePreview("Aanya Sharma", "Rohan"), "Aanya & Rohan");
  assert.equal(coupleEventNamePreview("Aanya", ""), null);
  assert.equal(coupleEventNamePreview("   ", "Rohan"), null);
});

/* ── the people ─────────────────────────────────────────────────────────── */

const person = (id: string, role: PersonDraft["role"], name = "", phone = ""): PersonDraft => ({ id, role, name, phone });
const noExpiry = { required: false, choice: null, date: "" } as const;

test("validateEventDraft: a couple event with both names is valid, and its people are sent with their roles", () => {
  const result = validateEventDraft({
    couple: true,
    eventName: "ignored on a couple type",
    people: [person("b", "bride", "  Aanya   Sharma ", "9876543210"), person("g", "groom", "Rohan Verma")],
    expiry: noExpiry,
  });
  assert.deepEqual(result.errors, {});
  assert.equal(result.firstInvalid, null);
  assert.deepEqual(result.clients, [
    { role: "bride", name: "Aanya Sharma", phone: "9876543210" },
    { role: "groom", name: "Rohan Verma" },
  ]);
});

test("validateEventDraft: a couple event needs the Bride's and the Groom's names, each with its own message", () => {
  const result = validateEventDraft({
    couple: true,
    eventName: "",
    people: [person("b", "bride"), person("g", "groom")],
    expiry: noExpiry,
  });
  assert.deepEqual(result.errors, {
    [eventField.personName("b")]: "Enter the bride's name",
    [eventField.personName("g")]: "Enter the groom's name",
  });
  assert.equal(result.firstInvalid, eventField.personName("b"));
});

test("validateEventDraft: a couple event never asks for an event name", () => {
  const result = validateEventDraft({
    couple: true,
    eventName: "",
    people: [person("b", "bride", "Aanya"), person("g", "groom", "Rohan")],
    expiry: noExpiry,
  });
  assert.equal(eventField.eventName in result.errors, false);
});

test("validateEventDraft: every other type needs an event name, and its Clients' names are optional", () => {
  const missing = validateEventDraft({ couple: false, eventName: "   ", people: [person("c1", "client")], expiry: noExpiry });
  assert.deepEqual(missing.errors, { [eventField.eventName]: "Enter an event name" });

  const ok = validateEventDraft({
    couple: false,
    eventName: "Meera's 30th Birthday",
    people: [person("c1", "client", "", "9123456780"), person("c2", "client", "Kabir")],
    expiry: noExpiry,
  });
  assert.deepEqual(ok.errors, {});
  assert.deepEqual(ok.clients, [{ role: "client", phone: "9123456780" }, { role: "client", name: "Kabir" }]);
});

test("validateEventDraft: on a type that is not a couple type, every role is sent as client", () => {
  const result = validateEventDraft({
    couple: false,
    eventName: "Offsite",
    people: [person("b", "bride", "Aanya"), person("g", "groom", "Rohan")],
    expiry: noExpiry,
  });
  assert.deepEqual(result.clients.map((c) => c.role), ["client", "client"]);
});

test("validateEventDraft: a row nobody typed in is dropped silently, never flagged", () => {
  const result = validateEventDraft({
    couple: true,
    eventName: "",
    people: [person("b", "bride", "Aanya"), person("g", "groom", "Rohan"), person("x1", "client"), person("x2", "client", "  ")],
    expiry: noExpiry,
  });
  assert.deepEqual(result.errors, {});
  assert.equal(result.clients.length, 2);
});

test("validateEventDraft: a number that was started must be all ten digits", () => {
  const result = validateEventDraft({
    couple: true,
    eventName: "",
    people: [person("b", "bride", "Aanya", "9876543"), person("g", "groom", "Rohan", "9876543210")],
    expiry: noExpiry,
  });
  assert.deepEqual(result.errors, { [eventField.personPhone("b")]: "Enter a 10 digit WhatsApp number" });
});

test("validateEventDraft: two people may not share a number, and the LATER row is the one marked", () => {
  const result = validateEventDraft({
    couple: true,
    eventName: "",
    people: [person("b", "bride", "Aanya", "9876543210"), person("g", "groom", "Rohan", "9876543210")],
    expiry: noExpiry,
  });
  assert.deepEqual(result.errors, { [eventField.personPhone("g")]: "This number is already used above" });
});

test("validateEventDraft: firstInvalid follows reading order — name, then people top to bottom, then expiry", () => {
  const result = validateEventDraft({
    couple: false,
    eventName: "",
    people: [person("c1", "client", "Meera", "123"), person("c2", "client", "Kabir", "45")],
    expiry: { required: true, choice: null, date: "" },
  });
  assert.equal(result.firstInvalid, eventField.eventName);
  assert.deepEqual(Object.keys(result.errors), [
    eventField.eventName,
    eventField.personPhone("c1"),
    eventField.personPhone("c2"),
    eventField.expiry,
  ]);
});

test(`validateEventDraft: a name is cut to ${EVENT_CLIENT_NAME_MAX} characters`, () => {
  const result = validateEventDraft({
    couple: false,
    eventName: "Offsite",
    people: [person("c1", "client", `${"a".repeat(EVENT_CLIENT_NAME_MAX)} overflow`)],
    expiry: noExpiry,
  });
  assert.equal(result.clients[0].name, "a".repeat(EVENT_CLIENT_NAME_MAX));
});

test("validateEventDraft: the expiry is checked only when the plan asks for one", () => {
  const base = { couple: false, eventName: "Offsite", people: [] as PersonDraft[], nowMs: ist("2026-10-09T10:00:00") };
  assert.deepEqual(validateEventDraft({ ...base, expiry: { required: false, choice: null, date: "" } }).errors, {});
  assert.deepEqual(validateEventDraft({ ...base, expiry: { required: true, choice: null, date: "" } }).errors, {
    [eventField.expiry]: "Choose when this event expires",
  });
  assert.deepEqual(validateEventDraft({ ...base, expiry: { required: true, choice: "custom", date: "" } }).errors, {
    [eventField.expiryDate]: "Pick a date",
  });
  assert.deepEqual(validateEventDraft({ ...base, expiry: { required: true, choice: "custom", date: "2026-10-09" } }).errors, {
    [eventField.expiryDate]: "The expiry date must be tomorrow or later",
  });
  for (const choice of ["1m", "3m", "6m", "never"] as const) {
    assert.deepEqual(validateEventDraft({ ...base, expiry: { required: true, choice, date: "" } }).errors, {}, choice);
  }
  assert.deepEqual(validateEventDraft({ ...base, expiry: { required: true, choice: "custom", date: "2026-10-10" } }).errors, {});
});

test("hasCompleteNumber: only a full ten digit number counts as somebody to message", () => {
  assert.equal(hasCompleteNumber([person("b", "bride", "Aanya", "987654321")]), false);
  assert.equal(hasCompleteNumber([person("b", "bride", "Aanya"), person("g", "groom", "Rohan", "9876543210")]), true);
  assert.equal(hasCompleteNumber([]), false);
});

/* ── event expiry ───────────────────────────────────────────────────────── */

test("the five expiry answers, in the order the chips show them", () => {
  assert.deepEqual(EVENT_EXPIRY_OPTIONS.map((o) => o.value), ["1m", "3m", "6m", "never", "custom"]);
  assert.deepEqual(EVENT_EXPIRY_OPTIONS.map((o) => o.label), ["1 month", "3 months", "6 months", "Never", "Custom date"]);
});

test("resolveEventExpiry: never has no date", () => {
  assert.deepEqual(resolveEventExpiry({ choice: "never", nowMs: ist("2026-10-09T10:00:00") }), { choice: "never", at: null });
});

test("resolveEventExpiry: each preset counts calendar months from today, to the end of that day in IST", () => {
  const nowMs = ist("2026-10-09T10:00:00");
  assert.equal(resolveEventExpiry({ choice: "1m", nowMs }).at, endOfIstDay("2026-11-09"));
  assert.equal(resolveEventExpiry({ choice: "3m", nowMs }).at, endOfIstDay("2027-01-09"));
  assert.equal(resolveEventExpiry({ choice: "6m", nowMs }).at, endOfIstDay("2027-04-09"));
});

test("resolveEventExpiry: the day is clamped to the target month's last one, and never spills into the next", () => {
  assert.equal(resolveEventExpiry({ choice: "6m", nowMs: ist("2026-08-31T10:00:00") }).at, endOfIstDay("2027-02-28"));
  assert.equal(resolveEventExpiry({ choice: "6m", nowMs: ist("2027-08-31T10:00:00") }).at, endOfIstDay("2028-02-29"));
  assert.equal(resolveEventExpiry({ choice: "1m", nowMs: ist("2026-01-31T10:00:00") }).at, endOfIstDay("2026-02-28"));
  assert.equal(resolveEventExpiry({ choice: "1m", nowMs: ist("2026-12-15T09:00:00") }).at, endOfIstDay("2027-01-15"));
});

test("resolveEventExpiry: 'today' is the IST calendar day, whatever the browser's or server's own zone", () => {
  assert.equal(resolveEventExpiry({ choice: "1m", nowMs: ist("2026-11-01T00:10:00") }).at, endOfIstDay("2026-12-01"));
  assert.equal(resolveEventExpiry({ choice: "1m", nowMs: ist("2026-10-31T23:50:00") }).at, endOfIstDay("2026-11-30"));
});

test("resolveEventExpiry: a custom date is the end of that day in IST, tomorrow or later, at most 10 years out", () => {
  const nowMs = ist("2026-10-09T23:30:00");
  assert.equal(resolveEventExpiry({ choice: "custom", date: "2026-10-10", nowMs }).at, endOfIstDay("2026-10-10"));
  assert.equal(resolveEventExpiry({ choice: "custom", date: "2036-10-09", nowMs }).at, endOfIstDay("2036-10-09"));
  for (const date of ["2026-10-09", "2026-10-08"]) {
    assert.throws(() => resolveEventExpiry({ choice: "custom", date, nowMs }), /tomorrow or later/, date);
  }
  assert.throws(() => resolveEventExpiry({ choice: "custom", date: "2036-10-10", nowMs }), /at most 10 years/);
});

test("resolveEventExpiry: anything that is not a real calendar date, or not a choice at all, throws", () => {
  const nowMs = ist("2026-10-09T10:00:00");
  for (const date of [undefined, null, "", "2027-02-30", "31-01-2027", "2027-1-31"]) {
    assert.throws(() => resolveEventExpiry({ choice: "custom", date, nowMs }), /Pick a valid expiry date/, String(date));
  }
  for (const choice of [undefined, null]) {
    assert.throws(() => resolveEventExpiry({ choice, nowMs }), /Choose when this event expires/, String(choice));
  }
});

test("formatExpiryDay and istDateInputOf read the IST day of an instant", () => {
  assert.equal(formatExpiryDay(endOfIstDay("2027-01-07")), "7 Jan 2027");
  assert.equal(istDateInputOf(endOfIstDay("2027-01-07")), "2027-01-07");
  // 23:59 IST is still the 7th, although it is already the 7th 18:29 in UTC.
  assert.equal(formatExpiryDay(ist("2027-01-07T00:00:00")), "7 Jan 2027");
});

test("tomorrowIstDateInput: the earliest custom date is tomorrow in IST", () => {
  assert.equal(tomorrowIstDateInput(ist("2026-10-09T10:00:00")), "2026-10-10");
  assert.equal(tomorrowIstDateInput(ist("2026-10-31T23:59:00")), "2026-11-01");
  assert.equal(tomorrowIstDateInput(ist("2026-12-31T00:01:00")), "2027-01-01");
});

test("expiryOutcomeLine: names the real outcome, with a date or without one", () => {
  assert.equal(
    expiryOutcomeLine(endOfIstDay("2027-01-07")),
    "Guests can open this gallery until 7 Jan 2027. It is then archived, and its photos are deleted 7 days later unless you restore it.",
  );
  assert.equal(expiryOutcomeLine(null), "This gallery stays live until you archive it.");
});

test("eventExpiryPreview: the line for the answer being chosen, and nothing while it is incomplete", () => {
  const nowMs = ist("2026-10-07T10:00:00");
  assert.equal(
    eventExpiryPreview({ choice: "3m", nowMs }),
    "Guests can open this gallery until 7 Jan 2027. It is then archived, and its photos are deleted 7 days later unless you restore it.",
  );
  assert.equal(eventExpiryPreview({ choice: "never", nowMs }), "This gallery stays live until you archive it.");
  assert.equal(eventExpiryPreview({ choice: null, nowMs }), null);
  assert.equal(eventExpiryPreview({ choice: "custom", date: "", nowMs }), null);
  assert.equal(eventExpiryPreview({ choice: "custom", date: "2026-10-07", nowMs }), null);
});

test("no user-facing string here carries an em dash or an en dash", () => {
  const lines = [
    expiryOutcomeLine(null),
    expiryOutcomeLine(endOfIstDay("2027-01-07")),
    createdEventNotice({ status: "sending", count: 2 }),
    createdEventNotice({ status: "skipped", count: 2 }),
    ...EVENT_EXPIRY_OPTIONS.map((o) => o.label),
  ];
  for (const line of lines) assert.doesNotMatch(String(line), /[–—]/);
});

/* ── after create ───────────────────────────────────────────────────────── */

test("createdEventNotice: names the count when messages are on their way, singular for one", () => {
  assert.equal(
    createdEventNotice({ status: "sending", count: 2 }),
    "Event created. Sending the gallery link to 2 people on WhatsApp.",
  );
  assert.equal(
    createdEventNotice({ status: "sending", count: 1 }),
    "Event created. Sending the gallery link to 1 person on WhatsApp.",
  );
});

test("createdEventNotice: says so when the Studio chose not to message anyone", () => {
  assert.equal(createdEventNotice({ status: "skipped", count: 3 }), "Event created. Your Clients were not messaged.");
});

test("createdEventNotice: never mentions WhatsApp when nothing was sent or deliberately held back", () => {
  assert.equal(createdEventNotice({ status: "none", count: 0 }), null);
  assert.equal(createdEventNotice({ status: "unavailable", count: 2 }), null);
  assert.equal(createdEventNotice({ status: "sending", count: 0 }), null);
  assert.equal(createdEventNotice(undefined), null);
  assert.equal(createdEventNotice(null), null);
});
