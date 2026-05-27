/**
 * Token factory for the client delivery page.
 *
 * Ported verbatim from `ai-tasks/Delivery Page minimal.html` (the reference
 * spec) — `makeTokens(theme, accent)` at lines 56–74 of that file. Keep these
 * values in sync with the reference; they're the single source of truth for
 * the page's surface colors.
 */

export type Theme = "dark" | "light";

export type HeroGradient = {
  /** Base linear-gradient string for the hero / left panel background. */
  base: string;
  /** Top-left accent glow tint (e.g. `rgba(190,95,40,0.22)`). */
  glow: string;
  /** Top-right secondary highlight tint (e.g. `rgba(200,165,100,0.12)`). */
  highlight: string;
};

export type TokenInput = {
  theme: Theme;
  accent: string;
  secondary: string;
  heroGradient: HeroGradient;
};

export type Tokens = {
  theme: Theme;
  /** Page background. */
  bg: string;
  /** Card surface. */
  bgCard: string;
  /** Raised surface (badges, icon wells inside cards). */
  bgRaised: string;
  accent: string;
  /** Accent at low opacity for tinted backgrounds. */
  accentDim: string;
  /** Secondary tint (gold-ish) — star fills, highlight glows. */
  gold: string;
  /** Primary text. */
  text: string;
  /** Secondary text (captions, metadata). */
  muted: string;
  /** Tertiary text (disabled states, faint dividers). */
  faint: string;
  /** Standard divider / border. */
  border: string;
  /** Stronger border (focused/hovered cards). */
  borderHi: string;
  /** Bottom-of-hero fade-to-bg overlay. */
  heroOverlay: string;
  /** Multi-layer hero gradient config. */
  heroGradient: HeroGradient;
};

/** Concat accent + hex alpha (e.g. `#C25A3A33`). */
function alpha(hex: string, suffix: string): string {
  return `${hex}${suffix}`;
}

export function makeTokens(input: TokenInput): Tokens {
  const { theme, accent, secondary, heroGradient } = input;
  const dark = theme === "dark";

  return {
    theme,
    bg: dark ? "#0D0B09" : "#FAFAF8",
    bgCard: dark ? "#1A1612" : "#EDE3D3",
    bgRaised: dark ? "#231D18" : "#E3D8C8",
    accent,
    accentDim: dark ? alpha(accent, "33") : alpha(accent, "22"),
    gold: secondary,
    text: dark ? "#F0E8DC" : "#2A2218",
    muted: dark ? "#9E9187" : "#7A6F63",
    faint: dark ? "#4E4438" : "#B5ADA4",
    border: dark ? "#2A2218" : "#DDD4C4",
    borderHi: dark ? "#3A2E26" : "#C4B9A8",
    heroOverlay: dark
      ? "linear-gradient(to bottom, transparent 25%, rgba(13,11,9,0.7) 60%, rgba(13,11,9,0.98) 92%)"
      : "linear-gradient(to bottom, transparent 25%, rgba(245,237,224,0.7) 60%, rgba(245,237,224,0.98) 92%)",
    heroGradient,
  };
}
