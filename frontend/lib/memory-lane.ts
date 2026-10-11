// lib/memory-lane.ts — PURE. No React, no fetch, no env, no DOM.
//
// Everything the Client's "memory lane" page decides without looking at the
// screen: which mood an event type gets (its words, colours, drifting specks
// and music), how long ago the day was, which photos float and which hang on
// the line, where each floating photo starts and where it lands in the phone,
// and the notes of the three small scores.
//
// The components under components/validity/lane only draw what is decided
// here, so every rule on this page can be read, and is tested, in one place.

import type { ValidityLinkView, ValidityReel } from "./event-validity.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

/* ── Mood: what an event type feels like ──────────────────────────────────── */

export type LaneMood = "wedding" | "romance" | "birthday" | "gathering";
export type LaneParticles = "petals" | "confetti" | "lights";
export type LaneScoreId = "waltz" | "musicbox" | "drift";

/** The page is dark and warm for every mood; these five colours are what change. */
export type LanePalette = {
  /** The page itself: the deepest tone. */
  bg0: string;
  /** The lighter tone the stage's gradient rises to. */
  bg1: string;
  /** Warm light: the glow behind the phone, the fairy lights, the date stamps. */
  glow: string;
  /** Buttons and small marks on the dark page. */
  accent: string;
  /** Text on an accent button. */
  onAccent: string;
};

export type LaneSpec = {
  mood: LaneMood;
  /** The one line over the floating photos. */
  headline: string;
  particles: LaneParticles;
  score: LaneScoreId;
  palette: LanePalette;
};

const PALETTES: Record<LaneMood, LanePalette> = {
  // Deep wine rising to rose, lit like candles.
  wedding: { bg0: "#1B090D", bg1: "#55202B", glow: "#E0906F", accent: "#F6D2B1", onAccent: "#2A0F14" },
  // Plum and dusk rose: softer than a wedding, still the two of them.
  romance: { bg0: "#190D18", bg1: "#4B2343", glow: "#E39A9A", accent: "#F8D3C6", onAccent: "#26101F" },
  // Midnight violet with marigold: a party after dark.
  birthday: { bg0: "#120E28", bg1: "#3B2266", glow: "#F4A93F", accent: "#FFDC8E", onAccent: "#1E1436" },
  // Deep teal and amber: warm, and nobody's romance.
  gathering: { bg0: "#0B181B", bg1: "#1F4046", glow: "#E5A85A", accent: "#F5DDAA", onAccent: "#0F2226" },
};

const MOOD_OF_TYPE: Record<string, LaneMood> = {
  Wedding: "wedding",
  "Pre-wedding": "romance",
  Engagement: "romance",
  Anniversary: "romance",
  Birthday: "birthday",
  Corporate: "gathering",
  Sports: "gathering",
};

/** Said over the photos. True of the day whoever is reading: it never guesses
 *  who the Client is to the people in the pictures. */
const HEADLINE_OF_TYPE: Record<string, string> = {
  Wedding: "Some days never really end.",
  "Pre-wedding": "Before the big day, there was this one.",
  Engagement: "The day it became official.",
  Anniversary: "Still the two of you.",
  Birthday: "One day, so much joy.",
  Corporate: "A day worth remembering.",
  Sports: "The day everyone gave it everything.",
};

const DEFAULT_HEADLINE = "A day worth keeping.";

const PARTICLES: Record<LaneMood, LaneParticles> = {
  wedding: "petals",
  romance: "petals",
  birthday: "confetti",
  gathering: "lights",
};

const SCORE: Record<LaneMood, LaneScoreId> = {
  wedding: "waltz",
  romance: "waltz",
  birthday: "musicbox",
  gathering: "drift",
};

/**
 * The mood of an event: its headline, colours, drifting specks and music.
 * `eventType` is the Studio's own choice ("Wedding", "Birthday", ...). An
 * unknown or missing type gets the warm, neutral "gathering".
 */
export function laneSpecOf(eventType: string | null | undefined): LaneSpec {
  const type = typeof eventType === "string" ? eventType.trim() : "";
  const mood = MOOD_OF_TYPE[type] ?? "gathering";
  return {
    mood,
    headline: HEADLINE_OF_TYPE[type] ?? DEFAULT_HEADLINE,
    particles: PARTICLES[mood],
    score: SCORE[mood],
    palette: PALETTES[mood],
  };
}

/* ── How long ago ─────────────────────────────────────────────────────────── */

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

const spelled = (n: number, unit: string) => `${n <= 12 ? NUMBER_WORDS[n] : n} ${unit}${n === 1 ? "" : "s"}`;

/**
 * How long ago the day was, the way a person would say it: "nine days",
 * "three weeks", "two months", "a year". Null when there is nothing worth
 * saying: no date, a date still to come, or one from yesterday.
 */
export function timeSinceLabel(eventDate: number | null | undefined, now: number = Date.now()): string | null {
  if (typeof eventDate !== "number" || !Number.isFinite(eventDate)) return null;
  const days = Math.floor((now - eventDate) / DAY_MS);
  if (days < 2) return null;
  if (days < 14) return spelled(days, "day");
  if (days < 56) return spelled(Math.round(days / 7), "week");
  const months = Math.round(days / 30.44);
  if (months < 12) return spelled(months, "month");
  if (months < 18) return "a year";
  if (months < 24) return "a year and a half";
  return spelled(Math.round(months / 12), "year");
}

/**
 * The line that leads into the event's name on the welcome screen:
 * "Aanya, it has been two months since" ... "Aanya & Rohan".
 */
export function thresholdLead(firstName: string | null | undefined, since: string | null): string {
  const name = (firstName ?? "").trim();
  if (since) return name ? `${name}, it has been ${since} since` : `It has been ${since} since`;
  return name ? `${name}, take a walk back to` : "Take a walk back to";
}

/* ── Which photos ─────────────────────────────────────────────────────────── */

export type LanePhoto = {
  url: string;
  /** Width over height. 3:2 when the size was never recorded. */
  ratio: number;
  /** The Client liked this one in their gallery. */
  liked: boolean;
  /** Epoch ms it was taken, when known. */
  capturedAt: number | null;
  /** Only a camera's own time is ever printed. */
  timeReliable: boolean;
};

const ratioOf = (width: number | null | undefined, height: number | null | undefined) =>
  width && height ? width / height : 3 / 2;

/** The most photos that float over the first screen. */
export const HERO_PHOTO_MAX = 12;
/** The most photos that hang on the line. More would make the walk a hike. */
export const WALK_PHOTO_MAX = 10;
/** Fewer than this and there is no line to walk: the page goes straight on. */
export const WALK_PHOTO_MIN = 3;

/**
 * Up to `max` of `items`, spread evenly from the first to the last, in order.
 * The first and the last are always kept, so a sampled day still starts where
 * it started and ends where it ended.
 */
export function sampleEvenly<T>(items: readonly T[], max: number): T[] {
  if (max <= 0) return [];
  if (items.length <= max) return [...items];
  if (max === 1) return [items[0]];
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(items[Math.round((i * (items.length - 1)) / (max - 1))]);
  return out;
}

/**
 * The photos that float over the first screen and then gather in the phone,
 * most prominent first: the favourite, then the ones the Client liked, then
 * the rest of the day in order. No photo twice.
 *
 * With no reel yet, the gallery's welcome strip stands in, and after that the
 * Studio's cover alone. Empty when there is no photo of any kind.
 */
export function heroPhotos(
  view: Pick<ValidityLinkView, "reel" | "fallback_photos" | "cover">,
  max: number = HERO_PHOTO_MAX,
): LanePhoto[] {
  const seen = new Set<string>();
  const out: LanePhoto[] = [];
  const add = (photo: LanePhoto) => {
    if (!photo.url || seen.has(photo.url) || out.length >= max) return;
    seen.add(photo.url);
    out.push(photo);
  };
  const reel = view.reel;
  if (reel) {
    if (reel.favourite) {
      const fav = reel.favourite;
      add({ url: fav.url, ratio: ratioOf(fav.width, fav.height), liked: fav.liked_by_client, capturedAt: null, timeReliable: false });
    }
    const items = reel.items.map(
      (item): LanePhoto => ({
        url: item.url,
        ratio: ratioOf(item.width, item.height),
        liked: item.liked_by_client,
        capturedAt: item.captured_at,
        timeReliable: item.time_reliable,
      }),
    );
    for (const item of items) if (item.liked) add(item);
    // The rest, spread across the day rather than its first few minutes.
    const rest = items.filter((item) => !item.liked);
    for (const item of sampleEvenly(rest, Math.max(0, max - out.length))) add(item);
    for (const item of rest) add(item);
  }
  if (out.length === 0) {
    for (const url of view.fallback_photos ?? []) add({ url, ratio: 3 / 2, liked: false, capturedAt: null, timeReliable: false });
  }
  if (out.length === 0 && view.cover) add({ url: view.cover, ratio: 3 / 2, liked: false, capturedAt: null, timeReliable: false });
  return out;
}

/**
 * The photos that hang on the line, in the order the day happened. Empty when
 * there are too few to walk past.
 */
export function walkPhotos(reel: ValidityReel | null | undefined, max: number = WALK_PHOTO_MAX): LanePhoto[] {
  const items = reel?.items ?? [];
  if (items.length < WALK_PHOTO_MIN) return [];
  return sampleEvenly(items, max).map((item) => ({
    url: item.url,
    ratio: ratioOf(item.width, item.height),
    liked: item.liked_by_client,
    capturedAt: item.captured_at,
    timeReliable: item.time_reliable,
  }));
}

/** The photos the Client liked, for the small fan near the end. Not the favourite itself. */
export function keptClosePhotos(reel: ValidityReel | null | undefined, max = 5): LanePhoto[] {
  if (!reel) return [];
  const favouriteUrl = reel.favourite?.url ?? null;
  return reel.items
    .filter((item) => item.liked_by_client && item.url !== favouriteUrl)
    .slice(0, max)
    .map((item) => ({
      url: item.url,
      ratio: ratioOf(item.width, item.height),
      liked: true,
      capturedAt: item.captured_at,
      timeReliable: item.time_reliable,
    }));
}

/**
 * The date as a film camera would burn it into the corner of a print:
 * "14 02 '26". Always the day in India, whatever zone the reader is in.
 */
export function filmStamp(ms: number | null | undefined): string | null {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return null;
  const parts = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "Asia/Kolkata" }).formatToParts(
    new Date(ms),
  );
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("day")} ${part("month")} '${part("year")}`;
}

/* ── The first screen: where photos float, and where they land ───────────── */

/**
 * One floating photo's resting place on the first screen:
 * x and y from the centre of the stage as fractions of half its width and
 * height (y grows downward), rotation in degrees, scale, depth (how far it
 * drifts as the page scrolls, 0 to 1) and opacity. A photo with opacity 0
 * waits off stage and only joins as the others gather.
 */
export type ScatterSpec = readonly [x: number, y: number, rot: number, scale: number, depth: number, opacity: number];

/** Wide screens: a loose ring around the headline, biggest first. */
export const SCATTER_DESKTOP: readonly ScatterSpec[] = [
  [0.8, 0.1, -5, 0.98, 0.85, 1],
  [-0.82, 0.04, 4, 0.94, 0.9, 1],
  [-0.58, 0.6, -4, 0.84, 0.75, 1],
  [0.58, 0.62, 5, 0.86, 0.8, 1],
  [-0.72, -0.56, -7, 0.76, 0.6, 1],
  [0.7, -0.54, 6, 0.74, 0.65, 1],
  [-0.2, 0.74, 3, 0.7, 0.55, 1],
  [0.19, 0.76, -3, 0.72, 0.6, 1],
  [-0.4, -0.78, 5, 0.58, 0.5, 1],
  [0.38, -0.8, -4, 0.6, 0.5, 1],
  [-1.3, 0.62, -8, 0.8, 0.9, 0],
  [1.3, -0.24, 8, 0.8, 0.9, 0],
];

/** Phones: two above the headline, five below it, the rest waiting off stage. */
export const SCATTER_MOBILE: readonly ScatterSpec[] = [
  [0, 0.5, -2, 0.74, 0.9, 1],
  [-0.66, 0.3, 4, 0.66, 0.8, 1],
  [0.66, 0.28, -5, 0.64, 0.8, 1],
  [-0.58, -0.66, -6, 0.6, 0.6, 1],
  [0.58, -0.68, 5, 0.58, 0.6, 1],
  [-0.46, 0.8, 6, 0.56, 0.7, 1],
  [0.48, 0.82, -4, 0.58, 0.7, 1],
  [-1.9, 0.1, -6, 0.6, 0.8, 0],
  [1.9, -0.2, 6, 0.6, 0.8, 0],
  [-1.9, 0.7, 5, 0.6, 0.8, 0],
  [1.9, 0.6, -5, 0.6, 0.8, 0],
  [0, 1.6, 0, 0.6, 0.8, 0],
];

/** A stage this narrow, or a portrait tablet, gets the phone layout. */
export function isMobileStage(width: number, height: number): boolean {
  return width <= 820 || (width <= 1100 && height > width);
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** How much everything on the stage is scaled for its size. 1 at 390px wide on a phone, at 1440 by 800 on a desktop. */
export function stageScale(width: number, height: number, mobile: boolean): number {
  return mobile ? clamp(width / 390, 0.85, 1.5) : clamp(Math.min(width / 1440, height / 800), 0.62, 1.25);
}

/** A floating photo's resting place in pixels from the centre of the stage. */
export type ScatterPoint = { x: number; y: number; r: number; s: number; z: number; o: number };

export function scatterPoints(count: number, width: number, height: number, mobile: boolean): ScatterPoint[] {
  const specs = mobile ? SCATTER_MOBILE : SCATTER_DESKTOP;
  const k = stageScale(width, height, mobile);
  return specs.slice(0, Math.max(0, count)).map(([x, y, r, s, z, o]) => ({
    x: (x * width) / 2,
    y: (y * height) / 2,
    r,
    s: s * k,
    z,
    o,
  }));
}

/** The phone the photos gather in: its centre (from the centre of the stage) and its size, in pixels. */
export type PhoneBox = { cx: number; cy: number; pw: number; ph: number };

/**
 * On a phone it sits in the middle, a little low, leaving room for the words
 * above it and the two buttons below. On a wide screen it stands to the right
 * and the words take the left.
 */
export function phoneBox(width: number, height: number, mobile: boolean): PhoneBox {
  const ph = mobile ? Math.min(height * 0.56, 540) : Math.min(height * 0.8, 660);
  return { cx: mobile ? 0 : width * 0.2, cy: mobile ? height * 0.03 : height * 0.02, pw: ph * 0.47, ph };
}

/** Photos across the phone's grid. */
export const PHONE_GRID_COLUMNS = 3;
/** The most rows of it that fit under the phone's little header. */
export const PHONE_GRID_ROWS = 4;

/** How many of `count` photos get a place in the phone's grid. The others fly in and vanish behind it. */
export function phoneSlotCount(count: number): number {
  return Math.max(0, Math.min(count, PHONE_GRID_COLUMNS * PHONE_GRID_ROWS));
}

/* ── Scroll arithmetic, shared by the first screen and the line ──────────── */

/**
 * How far through a pinned section the page is, 0 to 1: 0 as its top reaches
 * the top of the screen, 1 as its bottom reaches the bottom.
 */
export function pinProgress(sectionTop: number, sectionHeight: number, viewportHeight: number): number {
  const pin = Math.max(1, sectionHeight - viewportHeight);
  return clamp(-sectionTop / pin, 0, 1);
}

/** How far the line of photos has to slide sideways for its end to come on screen. */
export function walkTravel(trackWidth: number, viewWidth: number): number {
  return Math.max(0, Math.round(trackWidth - viewWidth));
}

/** Which of `count` photos is nearest the middle of the screen at `progress`. */
export function walkIndex(progress: number, count: number): number {
  if (count <= 1) return 0;
  return clamp(Math.round(clamp(progress, 0, 1) * (count - 1)), 0, count - 1);
}

/* ── The music ────────────────────────────────────────────────────────────── */

/** One note: when in its bar it sounds (in steps), which key, for how long, how hard, and on what. */
export type ScoreNote = {
  at: number;
  /** MIDI note number: 60 is middle C. */
  midi: number;
  /** Length in steps. */
  len: number;
  /** 0 to 1. */
  vel: number;
  voice: "keys" | "bell" | "bass" | "pad";
};

export type Score = {
  id: LaneScoreId;
  bpm: number;
  /** A step is this many beats: 0.5 is an eighth note. */
  stepBeats: number;
  stepsPerBar: number;
  /** The pitch classes (0 = C) of its key. Every note is one of them. */
  scale: readonly number[];
  /** Played in order, then again from the top. */
  bars: ScoreNote[][];
};

export const midiToHz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

/** How long one step of a score lasts, in seconds. */
export const stepSeconds = (score: Pick<Score, "bpm" | "stepBeats">) => (60 / score.bpm) * score.stepBeats;

type Melody = ReadonlyArray<readonly [at: number, midi: number, len: number]>;

/**
 * One bar of the waltz: a low note that rings for the bar, six quiet chord
 * notes rising and falling under it, and a line on top.
 */
function waltzBar(bass: number, arp: readonly number[], melody: Melody): ScoreNote[] {
  return [
    { at: 0, midi: bass, len: 6, vel: 0.42, voice: "bass" },
    ...arp.map((midi, at): ScoreNote => ({ at, midi, len: 3, vel: at === 0 ? 0.3 : 0.22, voice: "keys" })),
    ...melody.map(([at, midi, len]): ScoreNote => ({ at, midi, len, vel: 0.46, voice: "keys" })),
  ];
}

/** A slow waltz in D: for a wedding, an engagement, an anniversary. */
const WALTZ: Score = {
  id: "waltz",
  bpm: 76,
  stepBeats: 0.5,
  stepsPerBar: 6,
  scale: [2, 4, 6, 7, 9, 11, 1],
  bars: [
    waltzBar(50, [57, 62, 66, 69, 66, 62], [[0, 78, 4], [4, 76, 2]]),
    waltzBar(47, [54, 59, 62, 66, 62, 59], [[0, 74, 6]]),
    waltzBar(43, [50, 55, 59, 62, 59, 55], [[0, 71, 4], [4, 74, 2]]),
    waltzBar(45, [52, 57, 61, 64, 61, 57], [[0, 73, 6]]),
    waltzBar(54, [57, 62, 66, 69, 66, 62], [[0, 81, 4], [4, 78, 2]]),
    waltzBar(43, [50, 55, 59, 62, 59, 55], [[0, 79, 4], [4, 78, 2]]),
    waltzBar(52, [55, 59, 64, 67, 64, 59], [[0, 76, 4], [4, 74, 2]]),
    waltzBar(45, [52, 55, 61, 64, 61, 57], [[0, 73, 6]]),
  ],
};

/** One bar of the music box: eight bright notes over two soft low ones. */
function musicBoxBar(bass: number, bells: readonly number[]): ScoreNote[] {
  return [
    { at: 0, midi: bass, len: 4, vel: 0.3, voice: "bass" },
    { at: 4, midi: bass, len: 4, vel: 0.24, voice: "bass" },
    ...bells.map((midi, at): ScoreNote => ({ at, midi, len: 3, vel: at % 4 === 0 ? 0.36 : 0.26, voice: "bell" })),
  ];
}

/** A music box in C, a little quicker: for a birthday. */
const MUSICBOX: Score = {
  id: "musicbox",
  bpm: 104,
  stepBeats: 0.5,
  stepsPerBar: 8,
  scale: [0, 2, 4, 5, 7, 9, 11],
  bars: [
    musicBoxBar(48, [72, 76, 79, 76, 84, 79, 76, 79]),
    musicBoxBar(57, [72, 76, 81, 76, 84, 81, 76, 81]),
    musicBoxBar(53, [72, 77, 81, 77, 84, 81, 77, 81]),
    musicBoxBar(55, [71, 74, 79, 74, 83, 79, 74, 79]),
    musicBoxBar(48, [76, 79, 84, 79, 88, 84, 79, 84]),
    musicBoxBar(52, [71, 76, 79, 76, 83, 79, 76, 79]),
    musicBoxBar(53, [72, 77, 81, 77, 84, 81, 77, 81]),
    musicBoxBar(55, [71, 74, 79, 74, 83, 79, 77, 74]),
  ],
};

/** One bar of the drift: a held chord, a slow broken one over it, one high note late in the bar. */
function driftBar(bass: number, pad: readonly number[], keys: ReadonlyArray<number | null>, high: number): ScoreNote[] {
  const notes: ScoreNote[] = [{ at: 0, midi: bass, len: 8, vel: 0.36, voice: "bass" }];
  for (const midi of pad) notes.push({ at: 0, midi, len: 8, vel: 0.2, voice: "pad" });
  keys.forEach((midi, at) => {
    if (midi != null) notes.push({ at, midi, len: 4, vel: at === 0 ? 0.3 : 0.24, voice: "keys" });
  });
  notes.push({ at: 4, midi: high, len: 4, vel: 0.4, voice: "keys" });
  return notes;
}

/** Slow and open, in F: for any other gathering. */
const DRIFT: Score = {
  id: "drift",
  bpm: 66,
  stepBeats: 0.5,
  stepsPerBar: 8,
  scale: [5, 7, 9, 10, 0, 2, 4],
  bars: [
    driftBar(53, [57, 60, 64], [57, 60, 64, 69, null, 64, 60, null], 76),
    driftBar(50, [53, 57, 60], [57, 60, 65, 69, null, 65, 60, null], 77),
    driftBar(46, [50, 53, 57], [53, 58, 62, 69, null, 62, 58, null], 74),
    driftBar(48, [52, 55, 60], [55, 60, 65, 67, null, 64, 60, null], 72),
  ],
};

export const SCORES: Record<LaneScoreId, Score> = { waltz: WALTZ, musicbox: MUSICBOX, drift: DRIFT };

/**
 * A recorded track per score, for when one is licensed: put the file under
 * `public/` and its path here, and the page plays it (looped, faded in)
 * instead of the built-in score. Empty by default: the page ships no audio
 * file and plays the scores above through the browser's own synthesiser.
 */
export const LANE_TRACKS: Partial<Record<LaneScoreId, string>> = {};
