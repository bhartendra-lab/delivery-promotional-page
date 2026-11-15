/**
 * Pure. The Reusable QR colour rules (QrColorPicker): the curated palette,
 * hex parsing, and the "too light to scan" guard. Split out of the picker so
 * the Studio app shares them through its core sync.
 */

export type Preset = { name: string; hex: string };

// Dark/saturated enough to stay scannable; leans into the brand's rich
// jewel-tone direction rather than generic corporate colours.
export const PRESETS: Preset[] = [
  { name: "Terracotta", hex: "#C25A3A" },
  { name: "Maroon", hex: "#8C2F3A" },
  { name: "Emerald", hex: "#2E6B52" },
  { name: "Ink navy", hex: "#1F2A44" },
  { name: "Charcoal", hex: "#2A2218" },
  { name: "Deep gold", hex: "#B8860B" },
  { name: "Royal purple", hex: "#5B3A8C" },
  { name: "Forest", hex: "#2F4F2F" },
  { name: "Wine", hex: "#6B1F3A" },
  { name: "Teal", hex: "#1F5E5E" },
  { name: "Deep rose", hex: "#A8425A" },
  { name: "Bronze", hex: "#8A5A2E" },
];

/** Accepts `#RGB` or `#RRGGBB` — the subset the QR renderer + luminance math
 *  handle cleanly (a superset would be valid to the backend but break the
 *  gradient/contrast maths). */
export const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export const DEFAULT_HEX = "#c25a3a";

/** Normalise `#RGB` / `#RRGGBB` (with or without the leading #) to a canonical
 *  lowercase 6-digit `#rrggbb`, or null if it isn't a valid short/long hex. The
 *  6-digit form is what a native `<input type="color">` and the luminance maths
 *  both require, so every picked colour flows through here. */
export function expandHex(raw: string): string | null {
  const v = raw.trim();
  const withHash = v.startsWith("#") ? v : `#${v}`;
  if (!HEX_RE.test(withHash)) return null;
  const body = withHash.slice(1).toLowerCase();
  const full = body.length === 3 ? body.split("").map((c) => c + c).join("") : body;
  return `#${full}`;
}

/** WCAG relative luminance (0=black, 1=white) — same math as
 *  `lib/client-theme.ts`'s private `luminance()`. A near-white QR won't scan against its background. Falls back to a
 *  mid value for anything unparseable so a stray legacy code can't wrongly trip
 *  the "too light" guard. */
export function luminance(hex: string): number {
  const norm = expandHex(hex);
  if (!norm) return 0.35;
  const n = parseInt(norm.slice(1), 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const lin = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** Above this the QR's foreground is too light to scan reliably. */
export const MAX_SCANNABLE_LUMINANCE = 0.7;

/** True when a colour is too light to scan reliably (the picker's warning). */
export const tooLightToScan = (hex: string): boolean => luminance(hex) > MAX_SCANNABLE_LUMINANCE;
