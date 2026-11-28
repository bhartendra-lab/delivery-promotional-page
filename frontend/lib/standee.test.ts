import { test } from "node:test";
import assert from "node:assert/strict";
import { inflateRawSync } from "node:zlib";
import {
  buildStandeeDesigns,
  CTA_ENGLISH,
  CTA_HINDI,
  DATE_PLACEHOLDER_TEXT,
  eventNameFontSize,
  fitCover,
  fitInside,
  formatStandeeDate,
  LOGO_PLACEHOLDER_TEXT,
  POWERED_BY,
  STANDEE_DESIGN_COUNT,
  STANDEE_HEIGHT_IN,
  STANDEE_WIDTH_IN,
  standeeFileName,
  type StandeeContent,
} from "./standee.ts";
import { buildStandeePptx } from "./standee-pptx.ts";

// A 1x1 transparent PNG: enough for a real, valid embedded picture.
const PNG = "image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const img = (w = 400, h = 200) => ({ data: PNG, width: w, height: h });

const content = (over: Partial<StandeeContent> = {}): StandeeContent => ({
  studioName: "Pixel Studio",
  eventName: "Aanya & Rohan",
  eventDate: "25 Nov 2026",
  logo: img(600, 300),
  qr: img(512, 512),
  cover: img(1600, 1000),
  ...over,
});

const REQUIRED = ["Studio logo", "Studio name", "Event name", "Event date", "QR code", "Call to action (English)", "Call to action (Hindi)", "Powered by Vyavasth"];

test("five designs, and each has every required object, by name, exactly once", () => {
  const designs = buildStandeeDesigns(content());
  assert.equal(designs.length, STANDEE_DESIGN_COUNT);
  assert.equal(new Set(designs.map((d) => d.id)).size, 5, "five different designs");
  for (const d of designs) {
    const names = d.objects.map((o) => o.name);
    for (const required of REQUIRED) assert.equal(names.filter((n) => n === required).length, 1, `${d.id}: ${required}`);
    assert.equal(new Set(names).size, names.length, `${d.id}: names are unique in the Selection Pane`);
  }
});

test("everything sits inside the 20 x 50 inch slide, and the QR is square and big", () => {
  for (const d of buildStandeeDesigns(content())) {
    for (const o of d.objects) {
      if (o.name === "Background photo") continue; // full bleed on purpose
      assert.ok(o.x >= -0.001 && o.y >= -0.001, `${d.id} ${o.name} starts inside`);
      assert.ok(o.x + o.w <= STANDEE_WIDTH_IN + 0.001, `${d.id} ${o.name} fits the width`);
      assert.ok(o.y + o.h <= STANDEE_HEIGHT_IN + 0.001, `${d.id} ${o.name} fits the height`);
    }
    const qr = d.objects.find((o) => o.name === "QR code")!;
    assert.equal(qr.w, qr.h);
    assert.ok(qr.w >= 12, "big enough to scan from a distance");
  }
});

test("the QR code sits on its own card inside it, so it scans on any background", () => {
  for (const d of buildStandeeDesigns(content())) {
    const card = d.objects.find((o) => o.name === "QR card")!;
    const qr = d.objects.find((o) => o.name === "QR code")!;
    assert.ok(qr.x >= card.x && qr.y >= card.y && qr.x + qr.w <= card.x + card.w && qr.y + qr.h <= card.y + card.h);
    assert.ok(d.objects.indexOf(card) < d.objects.indexOf(qr), "card is behind the code");
  }
});

test("a studio with no logo gets a labelled box in its place, still named Studio logo", () => {
  for (const d of buildStandeeDesigns(content({ logo: null }))) {
    const logo = d.objects.find((o) => o.name === "Studio logo")!;
    assert.equal(logo.type, "shape");
    assert.equal(logo.type === "shape" && logo.text, LOGO_PLACEHOLDER_TEXT);
  }
});

test("an event with no date still has an editable date object, saying what to do", () => {
  const date = buildStandeeDesigns(content({ eventDate: "" }))[0].objects.find((o) => o.name === "Event date")!;
  assert.equal(date.type === "text" && date.text, DATE_PLACEHOLDER_TEXT);
});

test("only the photo design uses the cover, behind a darkening layer, and it falls back without one", () => {
  const withCover = buildStandeeDesigns(content());
  const photo = withCover.find((d) => d.id === "cover-photo")!;
  assert.ok(photo.objects.some((o) => o.name === "Background photo") && photo.objects.some((o) => o.name === "Photo overlay"));
  assert.equal(photo.objects[0].name, "Background photo");
  for (const d of withCover.filter((x) => x.id !== "cover-photo")) assert.ok(!d.objects.some((o) => o.name === "Background photo"));
  const noCover = buildStandeeDesigns(content({ cover: null })).find((d) => d.id === "cover-photo")!;
  assert.ok(!noCover.objects.some((o) => o.name === "Background photo"));
});

test("the call to action is bilingual and no word of the copy uses a dash", () => {
  assert.equal(CTA_ENGLISH, "Scan to get your photos");
  assert.equal(CTA_HINDI, "अपनी फ़ोटो पाने के लिए स्कैन करें");
  assert.equal(POWERED_BY, "Powered by Vyavasth");
  for (const d of buildStandeeDesigns(content())) {
    for (const o of d.objects) {
      const t = o.type === "text" ? o.text : o.type === "shape" ? (o.text ?? "") : "";
      assert.doesNotMatch(t, /[–—]/, `${d.id} ${o.name}`);
    }
  }
  assert.doesNotMatch(DATE_PLACEHOLDER_TEXT + LOGO_PLACEHOLDER_TEXT, /[–—]/);
});

test("the dark designs use light text on a dark ground, and the studio's light logo when it has one", () => {
  const dark = img(10, 10);
  const designs = buildStandeeDesigns(content({ logoOnDark: { ...dark, data: "image/png;base64,DARK" } }));
  const brown = designs.find((d) => d.id === "deep-brown")!;
  const white = designs.find((d) => d.id === "minimal-white")!;
  const brownLogo = brown.objects.find((o) => o.name === "Studio logo")!;
  const whiteLogo = white.objects.find((o) => o.name === "Studio logo")!;
  assert.equal(brownLogo.type === "image" && brownLogo.data, "image/png;base64,DARK");
  assert.notEqual(whiteLogo.type === "image" && whiteLogo.data, "image/png;base64,DARK");
  const name = brown.objects.find((o) => o.name === "Event name")!;
  assert.equal(name.type === "text" && name.color, "FAF6F0");
});

test("a logo keeps its proportions inside its box, and the cover covers the slide", () => {
  const f = fitInside(600, 300, 8, 3.8, 6, 2.2);
  assert.ok(Math.abs(f.w / f.h - 2) < 1e-9);
  assert.ok(f.x >= 6 && f.x + f.w <= 14 + 1e-9 && f.y >= 2.2 && f.y + f.h <= 6 + 1e-9);
  const c = fitCover(1600, 1000);
  assert.ok(c.w >= STANDEE_WIDTH_IN && c.h >= STANDEE_HEIGHT_IN);
  assert.ok(c.x <= 0 && c.y <= 0);
});

test("the event name gets smaller as it gets longer, never below a readable size", () => {
  assert.ok(eventNameFontSize("Aanya & Rohan") > eventNameFontSize("Aanya & Rohan Wedding Day"));
  assert.ok(eventNameFontSize("Aanya & Rohan Wedding Day") > eventNameFontSize("x".repeat(60)));
  assert.ok(eventNameFontSize("x".repeat(200)) >= 80);
});

test("the date reads as India writes it and the file name is safe", () => {
  assert.equal(formatStandeeDate(Date.UTC(2026, 10, 25, 6)), "25 Nov 2026");
  assert.equal(formatStandeeDate(null), "");
  assert.equal(formatStandeeDate(Number.NaN), "");
  assert.equal(standeeFileName("Aanya & Rohan's Wedding!"), "standee-designs-aanya-rohan-s-wedding.pptx");
  assert.equal(standeeFileName("!!!"), "standee-designs-event.pptx");
});

/* ── the file itself ────────────────────────────────────────────────────── */

/** Reads every entry of a zip (a .pptx is one) into strings, enough to inspect the slides. */
function readZip(bytes: Uint8Array): Map<string, Buffer> {
  const buf = Buffer.from(bytes);
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd -= 1;
  assert.ok(eocd >= 0, "not a zip");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50);
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    const lh = localOffset;
    const lhName = buf.readUInt16LE(lh + 26);
    const lhExtra = buf.readUInt16LE(lh + 28);
    const data = buf.subarray(lh + 30 + lhName + lhExtra, lh + 30 + lhName + lhExtra + compSize);
    out.set(name, method === 0 ? Buffer.from(data) : inflateRawSync(data));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

test("the .pptx is a real file: 20 x 50 inches, five slides, every object named and separate", async () => {
  const bytes = (await buildStandeePptx(content(), "uint8array")) as Uint8Array;
  assert.equal(Buffer.from(bytes.subarray(0, 2)).toString(), "PK");
  const files = readZip(bytes);

  const presentation = files.get("ppt/presentation.xml")!.toString("utf8");
  assert.match(presentation, /<p:sldSz cx="18288000" cy="45720000"/, "20 x 50 inches in EMU (914400 per inch)");

  const slides = [...files.keys()].filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  assert.equal(slides.length, STANDEE_DESIGN_COUNT);

  for (const slideName of slides) {
    const xml = files.get(slideName)!.toString("utf8");
    for (const required of REQUIRED) {
      assert.ok(xml.includes(`name="${required}"`), `${slideName}: object named ${required}`);
    }
    assert.ok(xml.includes(`name="QR card"`));
    assert.ok(xml.includes("Scan to get your photos"));
    assert.ok(xml.includes("अपनी फ़ोटो पाने के लिए स्कैन करें"));
    assert.ok(xml.includes("Powered by Vyavasth"));
    assert.ok(xml.includes("Pixel Studio") && xml.includes("Aanya &amp; Rohan") && xml.includes("25 Nov 2026"));
    // Text is live text, not pictures of text: the event name is a text run in its own shape.
    assert.match(xml, /<a:t>Aanya &amp; Rohan<\/a:t>/);
    // The QR and the logo are real pictures, in the slide's own relationships.
    assert.equal((xml.match(/<p:pic>/g) ?? []).length >= 2, true);
  }
  assert.ok([...files.keys()].some((n) => n.startsWith("ppt/media/")), "pictures are embedded, not linked");
});

test("a studio with no logo and no cover still downloads a complete file with a labelled logo box", async () => {
  const bytes = (await buildStandeePptx(content({ logo: null, cover: null, eventDate: "" }), "uint8array")) as Uint8Array;
  const files = readZip(bytes);
  const slides = [...files.keys()].filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  assert.equal(slides.length, 5);
  for (const slideName of slides) {
    const xml = files.get(slideName)!.toString("utf8");
    assert.ok(xml.includes(`name="Studio logo"`));
    assert.ok(xml.includes(LOGO_PLACEHOLDER_TEXT));
    assert.ok(xml.includes(DATE_PLACEHOLDER_TEXT));
  }
});
