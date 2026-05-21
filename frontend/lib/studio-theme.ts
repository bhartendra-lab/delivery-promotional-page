import type { KvData } from "./types";

export type StudioTheme = {
  primaryColor: string;
  secondaryColor: string;
  textOnPrimary: string;
};

const DEFAULT_THEME: StudioTheme = {
  primaryColor: "#1a1a2e",
  secondaryColor: "#e8c49a",
  textOnPrimary: "#ffffff",
};

const PALETTES: StudioTheme[] = [
  { primaryColor: "#1a1a2e", secondaryColor: "#e8c49a", textOnPrimary: "#ffffff" },
  { primaryColor: "#2d3748", secondaryColor: "#d4a373", textOnPrimary: "#ffffff" },
  { primaryColor: "#3c2a21", secondaryColor: "#e5b181", textOnPrimary: "#ffffff" },
  { primaryColor: "#22223b", secondaryColor: "#c9ada7", textOnPrimary: "#ffffff" },
  { primaryColor: "#1f2421", secondaryColor: "#b08968", textOnPrimary: "#ffffff" },
];

function seedFromString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function resolveStudioTheme(kv: KvData): StudioTheme {
  if (kv.brand_colors?.primaryColor) {
    return {
      primaryColor: kv.brand_colors.primaryColor,
      secondaryColor: kv.brand_colors.secondaryColor ?? DEFAULT_THEME.secondaryColor,
      textOnPrimary: kv.brand_colors.textOnPrimary ?? DEFAULT_THEME.textOnPrimary,
    };
  }
  const seed = kv.company_name ? seedFromString(kv.company_name) : 0;
  return PALETTES[seed % PALETTES.length];
}

export function themeToCssVars(theme: StudioTheme): React.CSSProperties {
  return {
    ["--color-primary" as string]: theme.primaryColor,
    ["--color-secondary" as string]: theme.secondaryColor,
    ["--color-text-on-primary" as string]: theme.textOnPrimary,
  } as React.CSSProperties;
}
