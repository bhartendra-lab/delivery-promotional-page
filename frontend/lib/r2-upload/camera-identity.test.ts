import { test } from "node:test";
import assert from "node:assert/strict";
import { cameraFromExif, cameraFieldsForRecord, cameraForMetadata } from "./camera-identity.ts";

/* SES-01. Dicts shaped as piexifjs 1.0.6 loads them: "0th" holds Make (271)
 * and Model (272), "Exif" holds BodySerialNumber (42033). Values are the
 * strings real bodies write, NUL padding included. */
const dict = (make: unknown, model: unknown, serial?: unknown) => ({
  "0th": { 271: make, 272: model },
  Exif: serial === undefined ? {} : { 42033: serial },
});

test("Canon: make, model and serial; the NUL padding goes", () => {
  assert.deepEqual(cameraFromExif(dict("Canon\0", "Canon EOS R6m2\0", "032021000123\0")), {
    make: "Canon",
    model: "Canon EOS R6m2",
    serial: "032021000123",
  });
});

test("Nikon: the corporation make and a model with its own prefix", () => {
  assert.deepEqual(cameraFromExif(dict("NIKON CORPORATION", "NIKON Z 6_2", "6012345")), {
    make: "NIKON CORPORATION",
    model: "NIKON Z 6_2",
    serial: "6012345",
  });
});

test("Sony without BodySerialNumber: a device with no serial", () => {
  assert.deepEqual(cameraFromExif(dict("SONY", "ILCE-7M4")), { make: "SONY", model: "ILCE-7M4" });
  assert.deepEqual(cameraFromExif(dict("SONY", "ILCE-7M4", "   \0\0")), { make: "SONY", model: "ILCE-7M4" });
});

test("iPhone: a phone's own photos are a device too", () => {
  assert.deepEqual(cameraFromExif(dict("Apple", "iPhone 15 Pro")), { make: "Apple", model: "iPhone 15 Pro" });
});

test("inner whitespace collapses; over-long values are cut at 64", () => {
  const cam = cameraFromExif(dict("  FUJIFILM  ", "X-T5   ", "x".repeat(80)));
  assert.equal(cam?.make, "FUJIFILM");
  assert.equal(cam?.model, "X-T5");
  assert.equal(cam?.serial?.length, 64);
});

test("no device without both make and model, or without EXIF", () => {
  assert.equal(cameraFromExif(dict("Apple", "")), undefined);
  assert.equal(cameraFromExif(dict("", "X-T5")), undefined);
  assert.equal(cameraFromExif(dict(42, "X-T5")), undefined, "a non-string tag is not a make");
  assert.equal(cameraFromExif({ Exif: { 42033: "1" } }), undefined);
  assert.equal(cameraFromExif(null), undefined);
  assert.equal(cameraFromExif(undefined), undefined);
});

test("record fields round-trip into the create-media camera", () => {
  const cam = { make: "Canon", model: "Canon EOS R6m2", serial: "032021000123" };
  const fields = cameraFieldsForRecord(cam);
  assert.deepEqual(fields, { cameraMake: "Canon", cameraModel: "Canon EOS R6m2", cameraSerial: "032021000123" });
  assert.deepEqual(cameraForMetadata(fields), { camera: cam });
  assert.deepEqual(cameraFieldsForRecord({ make: "SONY", model: "ILCE-7M4" }), { cameraMake: "SONY", cameraModel: "ILCE-7M4" });
  assert.deepEqual(cameraFieldsForRecord(undefined), {});
  assert.deepEqual(cameraForMetadata({}), {});
  assert.deepEqual(cameraForMetadata({ cameraMake: "Apple" }), {});
});
