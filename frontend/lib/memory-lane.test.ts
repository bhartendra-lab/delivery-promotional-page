import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HERO_PHOTO_MAX,
  LANE_TRACKS,
  PHONE_GRID_COLUMNS,
  PHONE_GRID_ROWS,
  SCATTER_DESKTOP,
  SCATTER_MOBILE,
  SCORES,
  WALK_LIGHTS,
  WALK_PHOTO_MAX,
  filmStamp,
  heroPhotos,
  isMobileStage,
  keepsakeReviewUrl,
  keptClosePhotos,
  laneAskLabel,
  laneModeOf,
  laneSpecOf,
  moreTimeMessage,
  referralMessage,
  studioNameOr,
  studioWhatsAppUrl,
  midiToHz,
  phoneBox,
  phoneSlotCount,
  pinProgress,
  sampleEvenly,
  scatterPoints,
  stageScale,
  stepSeconds,
  thresholdLead,
  timeSinceLabel,
  walkEndWords,
  walkEnds,
  walkIndex,
  walkLight,
  walkPhotos,
  walkTags,
  walkTravel,
} from "./memory-lane.ts";
import type { ValidityReel, ValidityReelItem, ValidityStudio } from "./event-validity.ts";

const DAY = 24 * 60 * 60 * 1000;
const DASHES = /[–—]/;

const item = (n: number, over: Partial<ValidityReelItem> = {}): ValidityReelItem => ({
  url: `https://cdn.test/reel/${n}.webp`,
  width: 1200,
  height: 800,
  folder: null,
  liked_by_client: false,
  ...over,
});

const reelOf = (items: ValidityReelItem[], favourite: ValidityReel["favourite"] = null): ValidityReel => ({
  items,
  favourite,
  stats: { photos: 1248, people: 86 },
});

/* ── Mood ─────────────────────────────────────────────────────────────────── */

test("laneSpecOf: each event type gets its own words, and one of four moods", () => {
  assert.equal(laneSpecOf("Wedding").mood, "wedding");
  for (const type of ["Pre-wedding", "Engagement", "Anniversary"]) assert.equal(laneSpecOf(type).mood, "romance", type);
  assert.equal(laneSpecOf("Birthday").mood, "birthday");
  for (const type of ["Corporate", "Sports"]) assert.equal(laneSpecOf(type).mood, "gathering", type);

  assert.equal(laneSpecOf("Wedding").headline, "Some days never really end.");
  assert.equal(laneSpecOf("Birthday").headline, "One day, so much joy.");
  // A wedding drifts petals to a waltz; a birthday throws confetti to a music box.
  assert.deepEqual([laneSpecOf("Wedding").particles, laneSpecOf("Wedding").score], ["petals", "waltz"]);
  assert.deepEqual([laneSpecOf("Birthday").particles, laneSpecOf("Birthday").score], ["confetti", "musicbox"]);
  assert.deepEqual([laneSpecOf("Corporate").particles, laneSpecOf("Corporate").score], ["lights", "drift"]);
});

test("laneSpecOf: an unknown or missing type still gets a whole, neutral mood", () => {
  for (const type of [null, undefined, "", "  ", "Housewarming", "wedding"]) {
    const spec = laneSpecOf(type);
    assert.equal(spec.mood, "gathering", String(type));
    assert.equal(spec.headline, "A day worth keeping.");
    assert.match(spec.palette.bg0, /^#[0-9A-F]{6}$/i);
  }
  assert.equal(laneSpecOf(" Wedding ").mood, "wedding");
});

test("laneSpecOf: no headline carries a dash, and every palette is five real colours", () => {
  for (const type of ["Wedding", "Pre-wedding", "Engagement", "Anniversary", "Birthday", "Corporate", "Sports", null]) {
    const spec = laneSpecOf(type);
    assert.doesNotMatch(spec.headline, DASHES);
    assert.ok(spec.headline.endsWith("."));
    for (const colour of Object.values(spec.palette)) assert.match(colour, /^#[0-9A-F]{6}$/i);
  }
});

/* ── How long ago ─────────────────────────────────────────────────────────── */

test("timeSinceLabel: said the way a person would say it", () => {
  const now = 1_780_000_000_000;
  const ago = (days: number) => timeSinceLabel(now - days * DAY, now);
  assert.equal(ago(2), "two days");
  assert.equal(ago(9), "nine days");
  assert.equal(ago(13), "13 days");
  assert.equal(ago(14), "two weeks");
  assert.equal(ago(21), "three weeks");
  assert.equal(ago(55), "eight weeks");
  assert.equal(ago(56), "two months");
  assert.equal(ago(62), "two months");
  assert.equal(ago(90), "three months");
  assert.equal(ago(330), "eleven months");
  assert.equal(ago(365), "a year");
  assert.equal(ago(500), "a year");
  assert.equal(ago(600), "a year and a half");
  assert.equal(ago(730), "two years");
  assert.equal(ago(1100), "three years");
});

test("timeSinceLabel: nothing to say for no date, a date still to come, or yesterday", () => {
  const now = 1_780_000_000_000;
  for (const date of [null, undefined, NaN, now + DAY, now, now - DAY, now - DAY - 1]) {
    assert.equal(timeSinceLabel(date as number | null | undefined, now), null, String(date));
  }
});

test("thresholdLead: leads into the event's name, with or without a first name or a date", () => {
  assert.equal(thresholdLead("Aanya", "two months"), "Aanya, it has been two months since");
  assert.equal(thresholdLead(null, "two months"), "It has been two months since");
  assert.equal(thresholdLead("  ", "a year"), "It has been a year since");
  assert.equal(thresholdLead("Aanya", null), "Aanya, take a walk back to");
  assert.equal(thresholdLead(undefined, null), "Take a walk back to");
});

/* ── Which photos ─────────────────────────────────────────────────────────── */

test("sampleEvenly: keeps the first and the last, in order, with no photo twice", () => {
  const twenty = Array.from({ length: 20 }, (_, i) => i);
  const ten = sampleEvenly(twenty, 10);
  assert.equal(ten.length, 10);
  assert.equal(ten[0], 0);
  assert.equal(ten[9], 19);
  assert.deepEqual([...ten].sort((a, b) => a - b), ten);
  assert.equal(new Set(ten).size, 10);
  assert.deepEqual(sampleEvenly([1, 2, 3], 10), [1, 2, 3]);
  assert.deepEqual(sampleEvenly([1, 2, 3], 1), [1]);
  assert.deepEqual(sampleEvenly([1, 2, 3], 0), []);
  for (let max = 2; max <= 18; max++) assert.equal(new Set(sampleEvenly(twenty, max)).size, max, `max=${max}`);
});

test("heroPhotos: the favourite first, then what the Client liked, then the rest, never one twice", () => {
  const items = Array.from({ length: 18 }, (_, i) => item(i, { liked_by_client: i === 7 || i === 12 }));
  const favourite = { url: item(7).url, width: 800, height: 1200, hearts: 42, liked_by_client: true };
  const photos = heroPhotos({ reel: reelOf(items, favourite) });
  assert.equal(photos.length, HERO_PHOTO_MAX);
  assert.equal(photos[0].url, item(7).url);
  // The favourite's own shape, not the 3:2 of its copy in the list.
  assert.equal(photos[0].ratio, 800 / 1200);
  assert.equal(photos[1].url, item(12).url);
  assert.equal(photos[1].liked, true);
  assert.equal(new Set(photos.map((p) => p.url)).size, photos.length);
  // The rest are spread across the day: the first and the last photo both make it.
  assert.ok(photos.some((p) => p.url === item(0).url));
  assert.ok(photos.some((p) => p.url === item(17).url));
});

test("heroPhotos: a short reel is used whole, and a missing size falls back to 3:2", () => {
  const photos = heroPhotos({ reel: reelOf([item(0), item(1, { width: null, height: null })]) });
  assert.equal(photos.length, 2);
  assert.equal(photos[1].ratio, 3 / 2);
});

test("heroPhotos: with no reel the welcome strip stands in, then the cover, then nothing", () => {
  const strip = heroPhotos({ reel: null, fallback_photos: ["https://cdn.test/a.webp", "https://cdn.test/b.webp"], cover: "https://cdn.test/cover.jpg" });
  assert.deepEqual(strip.map((p) => p.url), ["https://cdn.test/a.webp", "https://cdn.test/b.webp"]);
  assert.deepEqual(heroPhotos({ reel: null, cover: "https://cdn.test/cover.jpg" }).map((p) => p.url), ["https://cdn.test/cover.jpg"]);
  assert.deepEqual(heroPhotos({ reel: null }), []);
  assert.deepEqual(heroPhotos({ reel: null, fallback_photos: [], cover: null }), []);
});

test("walkPhotos: the reel in the order it is told, twenty at the very most, and no line at all for fewer than three", () => {
  assert.equal(WALK_PHOTO_MAX, 20);
  // A full reel is shown whole, in order.
  const full = Array.from({ length: 20 }, (_, i) => item(i));
  assert.deepEqual(walkPhotos(reelOf(full)).map((p) => p.url), full.map((p) => p.url));
  // More than twenty can never hang, whatever the API sends.
  const many = Array.from({ length: 45 }, (_, i) => item(i));
  const walk = walkPhotos(reelOf(many));
  assert.equal(walk.length, 20);
  assert.equal(walk[0].url, item(0).url);
  assert.equal(walk[19].url, item(44).url);
  const order = walk.map((p) => many.findIndex((m) => m.url === p.url));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.equal(new Set(order).size, 20);

  assert.deepEqual(walkPhotos(reelOf([item(0), item(1)])), []);
  assert.deepEqual(walkPhotos(null), []);
  assert.equal(walkPhotos(reelOf([item(0), item(1), item(2)])).length, 3);
});

test("walkPhotos: each print carries its folder's name, and nothing about when it was taken", () => {
  const walk = walkPhotos(reelOf([item(0, { folder: "Haldi" }), item(1, { folder: "  Sangeet " }), item(2, { folder: "   " }), item(3)]));
  assert.deepEqual(walk.map((p) => p.folder), ["Haldi", "Sangeet", null, null]);
  // An API that does not send folders yet: no names, and nothing breaks.
  const bare: ValidityReelItem = { url: item(4).url, width: 1200, height: 800, liked_by_client: false };
  assert.equal(walkPhotos(reelOf([bare, bare, bare]))[0].folder, null);
  for (const photo of walk) assert.deepEqual(Object.keys(photo).sort(), ["folder", "liked", "ratio", "url"]);
});

test("walkTags: a tag where each folder begins, and nowhere else", () => {
  const folders = ["Haldi", "Haldi", "Sangeet", "Sangeet", "Sangeet", "Wedding", null, null];
  assert.deepEqual(walkTags(folders.map((folder) => ({ folder }))), ["Haldi", null, "Sangeet", null, null, "Wedding", null, null]);
  // No folders at all: no tags at all.
  assert.deepEqual(walkTags([{ folder: null }, { folder: null }]), [null, null]);
  // A photo in no folder does not make the next one announce its folder again.
  assert.deepEqual(walkTags([{ folder: "Haldi" }, { folder: null }, { folder: "Haldi" }]), ["Haldi", null, null]);
  assert.deepEqual(walkTags([]), []);
});

test("walkEnds: from the first folder to the last, or plain words when there is no such journey", () => {
  const of = (...folders: Array<string | null>) => walkEnds(folders.map((folder) => ({ folder })));
  assert.deepEqual(of("Haldi", "Sangeet", "Reception"), { start: "Haldi", end: "Reception" });
  assert.deepEqual(of("Haldi", "Haldi"), { start: "The start", end: "The end" });
  assert.deepEqual(of("Haldi", "Sangeet", null), { start: "The start", end: "The end" });
  assert.deepEqual(of(null, null), { start: "The start", end: "The end" });
  assert.deepEqual(of(), { start: "The start", end: "The end" });
});

test("walkLight: morning to night across the line, by how far along it the reader is", () => {
  assert.deepEqual([...WALK_LIGHTS], ["morning", "afternoon", "golden", "night"]);
  const twenty = Array.from({ length: 20 }, (_, i) => walkLight(i, 20));
  assert.equal(twenty[0], "morning");
  assert.equal(twenty[19], "night");
  // It only ever moves forward, and every light gets its turn.
  const steps = twenty.map((light) => WALK_LIGHTS.indexOf(light));
  assert.deepEqual([...steps].sort((a, b) => a - b), steps);
  assert.equal(new Set(twenty).size, 4);
  assert.deepEqual([0, 1, 2].map((i) => walkLight(i, 3)), ["morning", "golden", "night"]);
  assert.equal(walkLight(0, 1), "morning");
  assert.equal(walkLight(0, 0), "morning");
  assert.equal(walkLight(99, 20), "night");
});

test("walkEndWords: points at the gallery when the event holds more than the line shows", () => {
  assert.deepEqual(walkEndWords(20, 1248), { line: "And there are so many more.", sub: "All 1,248 photos are waiting in your gallery." });
  assert.deepEqual(walkEndWords(7, 7), { line: "And that was the last one.", sub: "Every one of them is still in your gallery." });
  // A count that was never taken (0) claims nothing.
  assert.equal(walkEndWords(12, 0).line, "And that was the last one.");
  for (const words of [walkEndWords(20, 1248), walkEndWords(7, 7)]) {
    assert.doesNotMatch(words.line + words.sub, DASHES);
  }
});

test("keptClosePhotos: what the Client liked, without the favourite, at most five", () => {
  const items = Array.from({ length: 10 }, (_, i) => item(i, { liked_by_client: i % 2 === 0 }));
  const favourite = { url: item(0).url, width: 1, height: 1, hearts: 3, liked_by_client: true };
  const kept = keptClosePhotos(reelOf(items, favourite));
  assert.deepEqual(kept.map((p) => p.url), [item(2).url, item(4).url, item(6).url, item(8).url]);
  assert.equal(keptClosePhotos(reelOf(Array.from({ length: 10 }, (_, i) => item(i, { liked_by_client: true })))).length, 5);
  assert.deepEqual(keptClosePhotos(null), []);
});

/* ── The first screen ─────────────────────────────────────────────────────── */

test("scatter: twelve places on each layout, biggest first, every visible one on the stage", () => {
  for (const specs of [SCATTER_DESKTOP, SCATTER_MOBILE]) {
    assert.equal(specs.length, HERO_PHOTO_MAX);
    const visible = specs.filter((spec) => spec[5] === 1);
    assert.ok(visible.length >= 7);
    // The favourite takes the first place, so it must be the largest.
    assert.equal(specs[0][3], Math.max(...specs.map((spec) => spec[3])));
    for (const [x, y] of visible) {
      assert.ok(Math.abs(x) <= 0.9 && Math.abs(y) <= 0.9, `${x},${y}`);
    }
    // The ones that wait off stage really are off it.
    for (const [x, y, , , , o] of specs) if (o === 0) assert.ok(Math.abs(x) > 1 || Math.abs(y) > 1);
  }
});

test("scatter: no visible photo sits on the headline in the middle of the stage", () => {
  // The headline takes the centre: |x| < 0.45 between y -0.4 and 0.2 on a wide
  // screen, the full width between y -0.45 and 0.12 on a phone.
  for (const [x, y, , , , o] of SCATTER_DESKTOP) {
    if (o === 1) assert.ok(!(Math.abs(x) < 0.45 && y > -0.4 && y < 0.2), `${x},${y}`);
  }
  for (const [, y, , , , o] of SCATTER_MOBILE) {
    if (o === 1) assert.ok(!(y > -0.45 && y < 0.12), String(y));
  }
});

test("scatterPoints: fractions of the stage become pixels from its centre, scaled for its size", () => {
  const desktop = scatterPoints(3, 1440, 800, false);
  assert.equal(desktop.length, 3);
  assert.deepEqual(desktop[0], { x: 576, y: 40, r: -5, s: 0.98, z: 0.85, o: 1 });
  const phone = scatterPoints(12, 390, 740, true);
  assert.equal(phone.length, 12);
  assert.deepEqual(phone[0], { x: 0, y: 185, r: -2, s: 0.74, z: 0.9, o: 1 });
  // A smaller stage scales the photos down, within limits.
  assert.equal(stageScale(1440, 800, false), 1);
  assert.equal(stageScale(720, 800, false), 0.62);
  assert.equal(stageScale(390, 740, true), 1);
  assert.equal(stageScale(320, 600, true), 0.85);
  assert.deepEqual(scatterPoints(0, 1440, 800, false), []);
});

test("isMobileStage: narrow screens and portrait tablets get the phone layout", () => {
  assert.equal(isMobileStage(390, 740), true);
  assert.equal(isMobileStage(820, 1180), true);
  assert.equal(isMobileStage(1024, 1366), true);
  assert.equal(isMobileStage(1024, 768), false);
  assert.equal(isMobileStage(1440, 800), false);
});

test("phoneBox: centred with room above and below on a phone, to the right on a wide screen", () => {
  const mobile = phoneBox(390, 740, true);
  assert.equal(mobile.cx, 0);
  const top = 740 / 2 + mobile.cy - mobile.ph / 2;
  const below = 740 - (top + mobile.ph);
  // Room for two lines of words above it and two buttons below it.
  assert.ok(top >= 150, `top=${top}`);
  assert.ok(below >= 100, `below=${below}`);
  assert.ok(mobile.pw < 390 * 0.62);

  const wide = phoneBox(1440, 800, false);
  // Its left edge clears the words, which end at 581px.
  assert.ok(1440 / 2 + wide.cx - wide.pw / 2 > 620);
  assert.ok(1440 / 2 + wide.cx + wide.pw / 2 < 1440);
  assert.equal(wide.ph, 640);
  // A very tall screen does not grow the phone without limit.
  assert.equal(phoneBox(1440, 2000, false).ph, 660);
});

test("phoneSlotCount: at most a full grid, and never more than there are photos", () => {
  assert.equal(phoneSlotCount(0), 0);
  assert.equal(phoneSlotCount(5), 5);
  assert.equal(phoneSlotCount(12), PHONE_GRID_COLUMNS * PHONE_GRID_ROWS);
  assert.equal(phoneSlotCount(40), 12);
});

/* ── Scroll arithmetic ────────────────────────────────────────────────────── */

test("pinProgress: 0 as the section's top reaches the top, 1 as its bottom reaches the bottom", () => {
  // A section 2000 tall on an 800 tall screen is pinned for 1200.
  assert.equal(pinProgress(300, 2000, 800), 0);
  assert.equal(pinProgress(0, 2000, 800), 0);
  assert.equal(pinProgress(-600, 2000, 800), 0.5);
  assert.equal(pinProgress(-1200, 2000, 800), 1);
  assert.equal(pinProgress(-5000, 2000, 800), 1);
  // A section no taller than the screen never divides by zero.
  assert.equal(pinProgress(-10, 800, 800), 1);
});

test("walkTravel / walkIndex: the line slides just far enough, and names the photo in the middle", () => {
  assert.equal(walkTravel(3000, 390), 2610);
  assert.equal(walkTravel(300, 390), 0);
  assert.equal(walkIndex(0, 10), 0);
  assert.equal(walkIndex(0.5, 10), 5);
  assert.equal(walkIndex(1, 10), 9);
  assert.equal(walkIndex(7, 10), 9);
  assert.equal(walkIndex(-1, 10), 0);
  assert.equal(walkIndex(0.4, 1), 0);
});

/* ── The music ────────────────────────────────────────────────────────────── */

test("every score: each note is in its key, in its bar, and within what a phone can play", () => {
  for (const score of Object.values(SCORES)) {
    assert.ok(score.bars.length >= 4, score.id);
    assert.equal(score.scale.length, 7);
    for (const [index, bar] of score.bars.entries()) {
      assert.ok(bar.length > 0);
      for (const note of bar) {
        const where = `${score.id} bar ${index + 1} midi ${note.midi}`;
        assert.ok(score.scale.includes(note.midi % 12), `${where} is not in the key`);
        assert.ok(note.at >= 0 && note.at < score.stepsPerBar, where);
        assert.ok(note.len > 0 && note.len <= score.stepsPerBar, where);
        assert.ok(note.vel > 0 && note.vel <= 0.5, where);
        // G2 to E6: low enough to be warm, never a shrill top.
        assert.ok(note.midi >= 43 && note.midi <= 88, where);
      }
      // Something sounds on the first step of every bar.
      assert.ok(bar.some((note) => note.at === 0));
    }
  }
});

test("every score: a calm tempo, and the mood decides the instrument", () => {
  assert.equal(stepSeconds(SCORES.waltz), (60 / 76) * 0.5);
  assert.equal(SCORES.waltz.stepsPerBar, 6);
  assert.ok(SCORES.musicbox.bpm > SCORES.waltz.bpm);
  assert.ok(SCORES.drift.bpm < SCORES.waltz.bpm);
  assert.ok(SCORES.musicbox.bars.flat().some((note) => note.voice === "bell"));
  assert.ok(SCORES.waltz.bars.flat().every((note) => note.voice === "keys" || note.voice === "bass"));
  assert.ok(SCORES.drift.bars.flat().some((note) => note.voice === "pad"));
  assert.equal(Math.round(midiToHz(69)), 440);
  assert.equal(Math.round(midiToHz(60) * 100) / 100, 261.63);
});

test("the page ships no audio file of its own", () => {
  assert.deepEqual(LANE_TRACKS, {});
});

test("filmStamp: the date as a film camera prints it, on India's calendar", () => {
  // 14 February 2026, 18:30 UTC is already the 15th in India.
  assert.equal(filmStamp(Date.UTC(2026, 1, 14, 6, 0)), "14 02 '26");
  assert.equal(filmStamp(Date.UTC(2026, 1, 14, 18, 30)), "15 02 '26");
  assert.equal(filmStamp(null), null);
  assert.equal(filmStamp(NaN), null);
});

/* ── Two endings ──────────────────────────────────────────────────────────── */

const studio = (over: Partial<ValidityStudio> = {}): ValidityStudio => ({
  logo: "https://cdn.test/logo.png",
  logo_light: null,
  website: "https://lumen.example",
  social_links: { instagram: "https://instagram.com/lumen" },
  whatsapp_number: "919876543210",
  google_place_id: "ChIJ-place",
  gmb_link: null,
  google_review_enabled: true,
  show_google_review: true,
  ...over,
});

test("laneModeOf: a keepsake only when the API says so, a renewal for everything else", () => {
  assert.equal(laneModeOf({ mode: "keepsake" }), "keepsake");
  assert.equal(laneModeOf({ mode: "renew" }), "renew");
  // An API that predates the keepsake sends no mode: every link was a renewal.
  assert.equal(laneModeOf({}), "renew");
  assert.equal(laneModeOf(null), "renew");
  assert.equal(laneAskLabel("renew"), "Keep it longer");
  assert.equal(laneAskLabel("keepsake"), "A small favour");
});

test("keepsakeReviewUrl: asks exactly when the gallery would", () => {
  assert.equal(keepsakeReviewUrl(studio()), "https://search.google.com/local/writereview?placeid=ChIJ-place");
  assert.equal(keepsakeReviewUrl(studio({ google_place_id: null, gmb_link: "https://g.page/lumen" })), "https://g.page/lumen");
  // Either switch off, or no listing at all: no ask.
  assert.equal(keepsakeReviewUrl(studio({ google_review_enabled: false })), null);
  assert.equal(keepsakeReviewUrl(studio({ show_google_review: false })), null);
  assert.equal(keepsakeReviewUrl(studio({ google_place_id: null, gmb_link: null })), null);
  assert.equal(keepsakeReviewUrl(null), null);
  assert.equal(keepsakeReviewUrl(undefined), null);
});

test("studioWhatsAppUrl: a chat with the Studio, the message already typed", () => {
  assert.equal(studioWhatsAppUrl("919876543210", "Hi there"), "https://wa.me/919876543210?text=Hi%20there");
  // However the number was stored, only its digits go in the link.
  assert.equal(studioWhatsAppUrl("+91 98765-43210", "Hi"), "https://wa.me/919876543210?text=Hi");
  // The message is encoded whole: an ampersand in an event's name must not cut it short.
  const url = studioWhatsAppUrl("919876543210", referralMessage("Lumen Studio", "Aanya & Rohan"));
  assert.equal(new URL(url ?? "").searchParams.get("text"), referralMessage("Lumen Studio", "Aanya & Rohan"));
  for (const none of [null, undefined, "", "12345", "no number"]) assert.equal(studioWhatsAppUrl(none, "Hi"), null);
});

test("referralMessage / moreTimeMessage: what the chat opens with, with or without the names", () => {
  assert.equal(
    referralMessage("Lumen Studio", "Aanya & Rohan"),
    "Hi Lumen Studio, we loved our photos from Aanya & Rohan. I know someone who is looking for a photographer.",
  );
  assert.equal(referralMessage(null, null), "Hi, we loved our photos. I know someone who is looking for a photographer.");
  assert.equal(moreTimeMessage("Lumen Studio", "Aanya & Rohan"), "Hi Lumen Studio, could you keep the gallery for Aanya & Rohan open a little longer?");
  assert.equal(moreTimeMessage("  ", ""), "Hi, could you keep our gallery open a little longer?");
  assert.equal(studioNameOr("Lumen Studio"), "Lumen Studio");
  assert.equal(studioNameOr("  "), "your photographer");
  assert.equal(studioNameOr(null), "your photographer");
  for (const line of [referralMessage("S", "E"), referralMessage(null, null), moreTimeMessage("S", "E"), moreTimeMessage(null, null), laneAskLabel("keepsake")]) {
    assert.doesNotMatch(line, DASHES);
  }
});
