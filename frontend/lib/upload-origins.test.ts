import { test } from "node:test";
import assert from "node:assert/strict";
import { photoCountLabel, sessionSubtitle, sessionTimeRange, sessionTitle } from "./upload-origins.ts";

const IST = "Asia/Kolkata";
// 10 Nov 2026 in IST: 08:44 UTC = 2:14 pm.
const at = (hhmm: string, day = "10") => `2026-11-${day}T${hhmm}:00.000Z`;

test("session titles name the source, and the camera for a camera session", () => {
  assert.equal(sessionTitle({ source: "camera", label: "Canon EOS R6", devices: [] }), "Camera · Canon EOS R6");
  assert.equal(
    sessionTitle({ source: "camera", label: "EOS R6", devices: [{ label: "Camera A, Rahul" }] }),
    "Camera · Camera A, Rahul",
    "the photos' own camera (with its studio name) wins over the USB label",
  );
  assert.equal(sessionTitle({ source: "camera", label: null, devices: [] }), "Camera");
  assert.equal(sessionTitle({ source: "folder", label: "Day 1", devices: [] }), "Phone folder · Day 1");
  assert.equal(sessionTitle({ source: "photos", label: null, devices: [{ label: "Apple iPhone 15 Pro" }] }), "Photo picker");
  assert.equal(sessionTitle({ source: "web", label: null, devices: [{ label: "a" }, { label: "b" }] }), "Web upload");
});

test("time ranges collapse what repeats", () => {
  assert.equal(sessionTimeRange(at("08:44"), at("10:10"), IST), "10 Nov, 2:14 to 3:40 pm");
  assert.equal(sessionTimeRange(at("10:32"), at("10:32"), IST), "10 Nov, 4:02 pm");
  assert.equal(sessionTimeRange(at("10:32"), null, IST), "10 Nov, 4:02 pm");
  assert.equal(sessionTimeRange(at("06:20"), at("07:00"), IST), "10 Nov, 11:50 am to 12:30 pm");
  assert.equal(sessionTimeRange(at("18:20"), at("19:00"), IST), "10 Nov, 11:50 pm to 11 Nov, 12:30 am");
});

test("subtitle and counts", () => {
  assert.equal(photoCountLabel(1), "1 photo");
  assert.equal(photoCountLabel(12000), "12,000 photos");
  assert.equal(
    sessionSubtitle({ source: "web", label: null, started_at: at("10:32"), ended_at: at("10:40"), photo_count: 120, devices: [] }, IST),
    "10 Nov, 4:02 to 4:10 pm · 120 photos",
  );
});
