/**
 * Client gallery theme registry — the single source of truth for guest-facing
 * colours, and for the dashboard's Gallery Design preview (`GalleryDesignTab`
 * calls `resolveTheme()` too, rather than keeping its own duplicate palette
 * dict, so the preview can never drift from what guests actually see).
 *
 * Those four base values (bg / accent / text / cover pair) per variant are
 * mapped onto the fuller hub2 token shape the client screens consume (card /
 * sunken / border / muted / brandDeep / heroScrim / …) by deriving the rest
 * with simple colour maths.
 *
 * The Sunburst mock palette is intentionally ignored. The never-themed signals
 * (like-heart red, success green, error red, viewer near-black, signature ring)
 * are locked and identical across every theme — lifted from `hub2-themes.jsx`.
 *
 * The auth + face-scan screens use the Vyavasth PLATFORM_SKIN (terracotta on
 * near-white) — they are the trust layer fronted by Vyavasth, not the studio.
 */

import { STYLE_VARIANTS, type StyleVariant } from "./types";

/* ── Locked, never-themed signals (identical across all themes) ──────────── */
export const SIGNAL = {
  liked: "#FF3B5C",
  success: "#1F8A5B",
  successSoft: "#E8F5EE",
  error: "#E2524C",
  errorSoft: "#FFE9E8",
  viewer: "#17110A",
  ring: "#C25A3A",
} as const;

const FONT = "'Nunito', 'Plus Jakarta Sans', sans-serif";

export type ClientTheme = {
  /** Page surface. */
  bg: string;
  /** Card / panel fill. */
  card: string;
  /** Hover / sunken fill. */
  sunken: string;
  /** Hairline border. */
  border: string;
  /** Primary text. */
  text: string;
  /** Secondary text. */
  muted: string;
  /** Tertiary / placeholder text. */
  faint: string;
  /** Accent — owns every CTA + active/selected state. */
  brand: string;
  /** Deeper accent for hover/pressed. */
  brandDeep: string;
  /** Readable text colour on the accent. */
  onBrand: string;
  /** Translucent accent wash (tint chips, rings). */
  accentWash: string;
  /** Deep neutral fill (badges, watermarks). */
  ink: string;
  onInk: string;
  /** Hero gradient pair used when the event has no background_image. */
  cover: [string, string];
  /** Scrim gradient layered over the hero image / cover. */
  heroScrim: string;
  shadow: string;
  shadowSm: string;
  rCard: number;
  rTile: number;
  rField: number;
  font: string;
  /** Locked signals, mirrored here so screens reading the theme stay consistent. */
  ring: string;
  liked: string;
  success: string;
  successSoft: string;
  error: string;
  errorSoft: string;
  viewer: string;
};

/* ── colour maths ───────────────────────────────────────────────────────── */

type Rgb = { r: number; g: number; b: number };

function toRgb(hex: string): Rgb {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function toHex({ r, g, b }: Rgb): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Linear blend of two hex colours; t=0 → a, t=1 → b. */
function mix(a: string, b: string, t: number): string {
  const x = toRgb(a);
  const y = toRgb(b);
  return toHex({ r: x.r + (y.r - x.r) * t, g: x.g + (y.g - x.g) * t, b: x.b + (y.b - x.b) * t });
}

function rgba(hex: string, a: number): string {
  const { r, g, b } = toRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** WCAG relative luminance (0=black, 1=white). */
function luminance(hex: string): number {
  const { r, g, b } = toRgb(hex);
  const lin = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** WCAG contrast ratio between two colours (1–21). */
function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Secondary/tertiary text used to be a fixed linear blend of `text` toward
 * `bg` (mix(text, bg, 0.38/0.55)) — hand-tuned once after an earlier, lighter
 * pass tested as washed out, but with no actual guardrail: every one of the
 * original 8 variants' "muted" measured 3.8–4.4:1 against its background
 * (below the 4.5:1 WCAG AA bar for normal text) and "faint" measured
 * 2.5–2.7:1 (below even the 3:1 large-text/UI-component bar). This binary
 * searches the lightest mix ratio (up to `maxT`) whose contrast against `bg`
 * still clears `minContrast`, so every variant — including any future one —
 * gets text that's visibly lighter than the heading colour without ever
 * reading as washed out on a light, low-contrast background.
 */
function tintTowardBg(text: string, bg: string, maxT: number, minContrast: number): string {
  let lo = 0;
  let hi = maxT;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (contrastRatio(mix(text, bg, mid), bg) >= minContrast) lo = mid;
    else hi = mid;
  }
  return mix(text, bg, lo);
}

/** Build a full theme from the four dashboard base values. */
function buildTheme(base: { bg: string; accent: string; text: string; cover: [string, string] }): ClientTheme {
  const { bg, accent, text, cover } = base;
  const brandDeep = mix(accent, "#000000", 0.2);
  // Yellow/light accents need dark text; saturated/deep accents carry white.
  const onBrand = luminance(accent) > 0.62 ? mix(text, "#000000", 0.1) : "#FFFFFF";
  return {
    bg,
    card: "#FFFFFF",
    sunken: mix(bg, text, 0.06),
    border: mix(bg, text, 0.14),
    text,
    // Contrast-guaranteed rather than a fixed blend — see `tintTowardBg`.
    // Targets mirror WCAG AA: 4.5:1 for secondary text, 3:1 for tertiary/
    // placeholder text (the relaxed large-text/UI-component minimum).
    muted: tintTowardBg(text, bg, 0.55, 4.5),
    faint: tintTowardBg(text, bg, 0.72, 3.0),
    brand: accent,
    brandDeep,
    onBrand,
    accentWash: rgba(accent, 0.16),
    ink: text,
    onInk: bg,
    cover,
    heroScrim: `linear-gradient(160deg, ${rgba(brandDeep, 0.3)} 0%, rgba(0,0,0,0.30) 42%, rgba(0,0,0,0.62) 100%)`,
    shadow: `0 8px 24px ${rgba(text, 0.14)}`,
    shadowSm: `0 3px 10px ${rgba(text, 0.1)}`,
    rCard: 24,
    rTile: 18,
    rField: 18,
    font: FONT,
    ...SIGNAL,
  };
}

/* ── the 10 dashboard palettes (source of truth for the whole app — the
   Gallery Design tab reads these via `resolveTheme()`, it no longer keeps its
   own copy) ──────────────────────────────────────────────────────────────── */

/**
 * Every accent below is deepened (same hue family, just darker) so it clears
 * 5:1 contrast against its own `bg` — brand now doubles as bare label text
 * (gallery folder pills / My-All switcher / action items), not just button
 * fills on `card`/`accentWash`, so 3-4:1 was legible on a button but washed
 * out as text straight on the page background. No existing booking's saved
 * `style_variant` changes meaning, just gets more legible.
 */
const VARIANT_BASE: Record<StyleVariant, { bg: string; accent: string; text: string; cover: [string, string] }> = {
  "Ivory & Rose": { bg: "#FBF7F4", accent: "#925C5C", text: "#3A322E", cover: ["#E8D5CE", "#D6B6AC"] },
  "Blush Minimal": { bg: "#FAF8F6", accent: "#88625C", text: "#2E2926", cover: ["#EADFD8", "#D6C3B8"] },
  // New — a fresh, garden-toned Spring option (muted forest green rather than
  // the more saturated teal-green of Emerald Royal).
  "Sage Sanctuary": { bg: "#F5F7F2", accent: "#557157", text: "#26302A", cover: ["#C9D6C2", "#A8BFA0"] },
  // Accent deepened from the original #DC842A (2.76:1 against `bg` — the only
  // one of the original 8 that failed even the relaxed 3:1 UI-component
  // contrast bar) to #B5651D (4.20:1), then again to #A35B1A (5.00:1) once
  // brand started doubling as bare text, same name/hue family so no existing
  // booking's saved `style_variant` changes meaning, just gets legible.
  "Marigold Bright": { bg: "#FFFBF3", accent: "#A35B1A", text: "#3A2E1E", cover: ["#F1CE8C", "#E3A658"] },
  "Festive Bloom": { bg: "#FFF6F0", accent: "#AA5128", text: "#3A271E", cover: ["#EEB28C", "#DC885A"] },
  "Maroon Velvet": { bg: "#F8F2F1", accent: "#8C2F3A", text: "#2E1F22", cover: ["#B97E86", "#97525E"] },
  "Fine-Art Warm": { bg: "#F7F3EE", accent: "#7D6444", text: "#332B22", cover: ["#CDBBA0", "#B29A7A"] },
  "Emerald Royal": { bg: "#F1F6F3", accent: "#2E6B52", text: "#1F2A24", cover: ["#9CC0AD", "#6C9A82"] },
  "Charcoal Editorial": { bg: "#F4F4F3", accent: "#3C3C3A", text: "#22221F", cover: ["#B8B8B3", "#8C8C86"] },
  // New — a moody indigo Winter option alongside Emerald Royal/Charcoal
  // Editorial, for studios wanting something deeper/more formal.
  "Indigo Dusk": { bg: "#F4F5F8", accent: "#47528C", text: "#22232E", cover: ["#C3C8DE", "#9AA3C9"] },
};

const THEMES: Record<StyleVariant, ClientTheme> = STYLE_VARIANTS.reduce(
  (acc, v) => {
    acc[v] = buildTheme(VARIANT_BASE[v]);
    return acc;
  },
  {} as Record<StyleVariant, ClientTheme>,
);

const DEFAULT_VARIANT: StyleVariant = "Ivory & Rose";

/** Resolve a guest-gallery theme by `style_variant`, falling back to Ivory & Rose. */
export function resolveTheme(styleVariant?: string | null): ClientTheme {
  if (styleVariant && (STYLE_VARIANTS as string[]).includes(styleVariant)) {
    return THEMES[styleVariant as StyleVariant];
  }
  return THEMES[DEFAULT_VARIANT];
}

/* ── Vyavasth platform skin — auth + face-scan trust layer ───────────────── */

export const PLATFORM_SKIN: ClientTheme = {
  bg: "#FAFAF8",
  card: "#FFFFFF",
  sunken: "#F2F0EB",
  border: "#E4DDD0",
  text: "#2A2218",
  muted: "#7A6F63",
  faint: "#B5ADA4",
  brand: "#C25A3A",
  brandDeep: "#A8442A",
  onBrand: "#FFFFFF",
  accentWash: "rgba(194,90,58,0.12)",
  ink: "#2A2218",
  onInk: "#FAFAF8",
  cover: ["#E8C3B5", "#C9836A"],
  heroScrim: "linear-gradient(160deg, rgba(168,68,42,0.30) 0%, rgba(0,0,0,0.30) 42%, rgba(0,0,0,0.62) 100%)",
  shadow: "0 8px 24px rgba(42,34,24,0.12)",
  shadowSm: "0 3px 10px rgba(42,34,24,0.08)",
  rCard: 24,
  rTile: 18,
  rField: 18,
  font: FONT,
  ...SIGNAL,
};
