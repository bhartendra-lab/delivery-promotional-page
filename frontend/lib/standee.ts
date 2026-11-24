/**
 * The QR standee designs: what goes on each slide of the editable PowerPoint a
 * studio downloads from Access & Sharing, as plain data. Pure (no browser, no
 * pptxgenjs), so the layout rules are tested; lib/standee-pptx.ts turns the
 * result into the file.
 *
 * One slide per design, five designs, portrait 2:5 at 20 x 50 inches: it prints
 * at 2 x 5 feet (PowerPoint's largest slide is 56 inches). Every element is its
 * own object with a clear name in the Selection Pane ("QR code", "Studio logo"),
 * so a studio can swap or move it. Fonts are ones every PowerPoint has (Georgia,
 * Arial, Nirmala UI for Devanagari), with nothing embedded: where one is
 * missing, PowerPoint substitutes its own.
 *
 * Copy follows the house rules: no dashes, no rule drawn before a label.
 */

export const STANDEE_WIDTH_IN = 20;
export const STANDEE_HEIGHT_IN = 50;
export const STANDEE_DESIGN_COUNT = 5;

export const CTA_ENGLISH = "Scan to get your photos";
export const CTA_HINDI = "अपनी फ़ोटो पाने के लिए स्कैन करें";
export const POWERED_BY = "Powered by Vyavasth";
export const LOGO_PLACEHOLDER_TEXT = "Studio logo";
export const DATE_PLACEHOLDER_TEXT = "Add the event date";

/** An image the browser has already fetched: a data URI and its own pixel size. */
export type StandeeImage = { data: string; width: number; height: number };

export type StandeeContent = {
  studioName: string;
  eventName: string;
  /** Already formatted ("25 Nov 2026"), or "" when the event has no date. */
  eventDate: string;
  /** The studio's logo from Studio Identity (the light variant is preferred on dark designs), or null. */
  logo: StandeeImage | null;
  /** The logo for light and dark backgrounds, when the studio has both. */
  logoOnDark?: StandeeImage | null;
  /** The event's reusable QR, the same picture "Download QR" saves. */
  qr: StandeeImage;
  /** The event cover, for the photo design. */
  cover: StandeeImage | null;
};

type Align = "left" | "center" | "right";

export type StandeeObject =
  | {
      type: "text";
      name: string;
      text: string;
      x: number;
      y: number;
      w: number;
      h: number;
      fontFace: string;
      fontSize: number;
      bold?: boolean;
      italic?: boolean;
      color: string;
      align: Align;
      valign: "top" | "middle" | "bottom";
    }
  | { type: "image"; name: string; data: string; x: number; y: number; w: number; h: number }
  | {
      type: "shape";
      name: string;
      shape: "rect" | "roundRect";
      x: number;
      y: number;
      w: number;
      h: number;
      fill?: { color: string; transparency?: number };
      line?: { color: string; width: number; dash?: "dash" };
      rectRadius?: number;
      /** A label inside the shape (the logo placeholder). */
      text?: string;
      textColor?: string;
      fontFace?: string;
      fontSize?: number;
    };

export type StandeeDesign = {
  id: string;
  label: string;
  background: string;
  objects: StandeeObject[];
};

/* ── geometry rules ─────────────────────────────────────────────────────── */

/** The largest size of a `w` by `h` picture that fits inside a `boxW` by `boxH` box, centred in it. */
export function fitInside(w: number, h: number, boxW: number, boxH: number, boxX = 0, boxY = 0) {
  const k = Math.min(boxW / w, boxH / h);
  const width = w * k;
  const height = h * k;
  return { x: boxX + (boxW - width) / 2, y: boxY + (boxH - height) / 2, w: width, h: height };
}

/** The event name's size in points, by how long it is, so a short name is huge and a long one still fits 16 inches. */
export function eventNameFontSize(name: string): number {
  const n = name.trim().length;
  if (n <= 14) return 190;
  if (n <= 24) return 150;
  if (n <= 40) return 112;
  return 86;
}

/* ── the layout every design shares ─────────────────────────────────────── */

const MARGIN = 2;
const CONTENT_W = STANDEE_WIDTH_IN - MARGIN * 2;
const LOGO_BOX = { x: 6, y: 2.2, w: 8, h: 3.8 };
const QR = { card: { x: 2, y: 25, w: 16, h: 16 }, image: { x: 3, y: 26, w: 14, h: 14 } };

type Palette = {
  id: string;
  label: string;
  background: string;
  text: string;
  muted: string;
  accent: string;
  card: string;
  cardLine?: string;
  heading: string;
  body: string;
  onDark: boolean;
};

const HEADING = "Georgia";
const BODY = "Arial";
const HINDI = "Nirmala UI";

const PALETTES: Palette[] = [
  { id: "terracotta", label: "Terracotta, type first", background: "FAF6F0", text: "3B2418", muted: "7A6F63", accent: "C25A3A", card: "FFFFFF", cardLine: "C25A3A", heading: HEADING, body: BODY, onDark: false },
  { id: "deep-brown", label: "Deep brown", background: "3B2418", text: "FAF6F0", muted: "D9C7B8", accent: "E8A27F", card: "FAF6F0", heading: HEADING, body: BODY, onDark: true },
  { id: "dark", label: "Dark", background: "14110E", text: "F5EFE6", muted: "B8AB9D", accent: "C25A3A", card: "F5EFE6", heading: HEADING, body: BODY, onDark: true },
  { id: "minimal-white", label: "Minimal white", background: "FFFFFF", text: "2A2218", muted: "7A6F63", accent: "C25A3A", card: "FFFFFF", cardLine: "DDD4C4", heading: BODY, body: BODY, onDark: false },
  { id: "cover-photo", label: "Event photo", background: "C25A3A", text: "FFFFFF", muted: "F1E6DE", accent: "FFFFFF", card: "FFFFFF", heading: HEADING, body: BODY, onDark: true },
];

function text(name: string, t: string, box: { x: number; y: number; w: number; h: number }, o: { fontFace: string; fontSize: number; color: string; bold?: boolean; italic?: boolean; align?: Align; valign?: "top" | "middle" | "bottom" }): StandeeObject {
  return { type: "text", name, text: t, ...box, fontFace: o.fontFace, fontSize: o.fontSize, color: o.color, bold: o.bold, italic: o.italic, align: o.align ?? "center", valign: o.valign ?? "middle" };
}

function designFor(p: Palette, c: StandeeContent): StandeeDesign {
  const objects: StandeeObject[] = [];

  // The cover photo design: the picture full bleed, then a darkening layer so the words read on any photo.
  if (p.id === "cover-photo" && c.cover) {
    const bg = fitCover(c.cover.width, c.cover.height);
    objects.push({ type: "image", name: "Background photo", data: c.cover.data, ...bg });
    objects.push({ type: "shape", name: "Photo overlay", shape: "rect", x: 0, y: 0, w: STANDEE_WIDTH_IN, h: STANDEE_HEIGHT_IN, fill: { color: "000000", transparency: 52 } });
  }

  // Studio logo, or a labelled box in its place.
  const logo = p.onDark && c.logoOnDark ? c.logoOnDark : c.logo;
  if (logo) {
    const f = fitInside(logo.width, logo.height, LOGO_BOX.w, LOGO_BOX.h, LOGO_BOX.x, LOGO_BOX.y);
    objects.push({ type: "image", name: "Studio logo", data: logo.data, ...f });
  } else {
    objects.push({
      type: "shape",
      name: "Studio logo",
      shape: "roundRect",
      ...LOGO_BOX,
      rectRadius: 0.3,
      line: { color: p.muted, width: 3, dash: "dash" },
      text: LOGO_PLACEHOLDER_TEXT,
      textColor: p.muted,
      fontFace: p.body,
      fontSize: 54,
    });
  }

  objects.push(text("Studio name", c.studioName || "Your studio", { x: MARGIN, y: 6.6, w: CONTENT_W, h: 2.6 }, { fontFace: p.body, fontSize: 80, color: p.accent, bold: true }));
  objects.push(text("Event name", c.eventName || "Your event", { x: MARGIN, y: 9.8, w: CONTENT_W, h: 11 }, { fontFace: p.heading, fontSize: eventNameFontSize(c.eventName), color: p.text, bold: p.heading === HEADING }));
  objects.push(text("Event date", c.eventDate || DATE_PLACEHOLDER_TEXT, { x: MARGIN, y: 21.4, w: CONTENT_W, h: 2.6 }, { fontFace: p.body, fontSize: 72, color: p.muted }));

  // The QR sits on a card so it scans on any background, dark and photo designs included.
  objects.push({
    type: "shape",
    name: "QR card",
    shape: "roundRect",
    ...QR.card,
    rectRadius: 0.6,
    fill: { color: p.card },
    ...(p.cardLine ? { line: { color: p.cardLine, width: 4 } } : {}),
  });
  objects.push({ type: "image", name: "QR code", data: c.qr.data, ...QR.image });

  objects.push(text("Call to action (English)", CTA_ENGLISH, { x: MARGIN, y: 42.2, w: CONTENT_W, h: 2.4 }, { fontFace: p.body, fontSize: 96, color: p.text, bold: true }));
  objects.push(text("Call to action (Hindi)", CTA_HINDI, { x: MARGIN, y: 44.6, w: CONTENT_W, h: 2.4 }, { fontFace: HINDI, fontSize: 84, color: p.text }));
  objects.push(text("Powered by Vyavasth", POWERED_BY, { x: MARGIN, y: 47.6, w: CONTENT_W, h: 1.4 }, { fontFace: p.body, fontSize: 40, color: p.muted }));

  return { id: p.id, label: p.label, background: p.background, objects };
}

/** A picture drawn to cover the whole slide, centred (the overflow is cropped by the slide edge). */
export function fitCover(w: number, h: number) {
  const k = Math.max(STANDEE_WIDTH_IN / w, STANDEE_HEIGHT_IN / h);
  const width = w * k;
  const height = h * k;
  return { x: (STANDEE_WIDTH_IN - width) / 2, y: (STANDEE_HEIGHT_IN - height) / 2, w: width, h: height };
}

/** The five designs for one event, in the order of the slides. */
export function buildStandeeDesigns(content: StandeeContent): StandeeDesign[] {
  return PALETTES.map((p) => designFor(p, content));
}

/** "25 Nov 2026" in India's style, or "" for no date. `epoch` is the event's start date in ms. */
export function formatStandeeDate(epoch: number | null | undefined): string {
  if (epoch == null) return "";
  const d = new Date(epoch);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

/** A file name for the download, from the event's name. */
export function standeeFileName(eventName: string): string {
  const slug = eventName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "event";
  return `standee-designs-${slug}.pptx`;
}
