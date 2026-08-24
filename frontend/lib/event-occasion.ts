import type { StyleVariant } from "./types";

/**
 * Occasion-scoped grouping over the backend `style_variant` enum, replacing
 * the old Season axis (which was meaningless for Corporate events). Every one
 * of the 10 variants appears in exactly one collection per occasion — only
 * the grouping and label change, never the underlying value.
 */
export type Occasion = "wedding" | "celebration" | "corporate" | "neutral";

const WEDDING_TYPES = new Set(["Wedding", "Pre-wedding", "Engagement"]);
const CELEBRATION_TYPES = new Set(["Birthday", "Anniversary"]);

export function occasionFor(eventType?: string | null): Occasion {
  if (!eventType) return "neutral";
  if (eventType === "Corporate") return "corporate";
  if (WEDDING_TYPES.has(eventType)) return "wedding";
  if (CELEBRATION_TYPES.has(eventType)) return "celebration";
  return "neutral";
}

export type ThemeCollection = { id: string; label: string; variants: StyleVariant[] };

const WEDDING_COLLECTIONS: ThemeCollection[] = [
  { id: "ceremony", label: "Ceremony", variants: ["Ivory & Rose", "Blush Minimal", "Fine-Art Warm"] },
  { id: "festivity", label: "Festivity", variants: ["Marigold Bright", "Festive Bloom", "Maroon Velvet"] },
  {
    id: "heirloom",
    label: "Heirloom",
    variants: ["Emerald Royal", "Indigo Dusk", "Sage Sanctuary", "Charcoal Editorial"],
  },
];

const CELEBRATION_COLLECTIONS: ThemeCollection[] = [
  { id: "warm", label: "Warm", variants: ["Ivory & Rose", "Blush Minimal", "Fine-Art Warm"] },
  { id: "bright", label: "Bright", variants: ["Marigold Bright", "Festive Bloom", "Sage Sanctuary"] },
  {
    id: "evening",
    label: "Evening",
    variants: ["Maroon Velvet", "Emerald Royal", "Indigo Dusk", "Charcoal Editorial"],
  },
];

const CORPORATE_COLLECTIONS: ThemeCollection[] = [
  { id: "boardroom", label: "Boardroom", variants: ["Charcoal Editorial", "Indigo Dusk", "Fine-Art Warm"] },
  { id: "launch", label: "Launch", variants: ["Marigold Bright", "Festive Bloom", "Maroon Velvet"] },
  {
    id: "offsite",
    label: "Offsite",
    variants: ["Sage Sanctuary", "Emerald Royal", "Ivory & Rose", "Blush Minimal"],
  },
];

const NEUTRAL_COLLECTIONS: ThemeCollection[] = [
  { id: "light", label: "Light", variants: ["Ivory & Rose", "Blush Minimal", "Fine-Art Warm"] },
  { id: "bright", label: "Bright", variants: ["Marigold Bright", "Festive Bloom", "Sage Sanctuary"] },
  {
    id: "deep",
    label: "Deep",
    variants: ["Maroon Velvet", "Emerald Royal", "Indigo Dusk", "Charcoal Editorial"],
  },
];

/** Ordered collections for an occasion. */
export function collectionsFor(occasion: Occasion): ThemeCollection[] {
  switch (occasion) {
    case "wedding":
      return WEDDING_COLLECTIONS;
    case "celebration":
      return CELEBRATION_COLLECTIONS;
    case "corporate":
      return CORPORATE_COLLECTIONS;
    case "neutral":
      return NEUTRAL_COLLECTIONS;
  }
}

/** Studio-side label for the custom_message field. Every social occasion now
 *  shares one relationship-free voice — a gallery is addressed by its host,
 *  whether that host is a couple, a family or a company — so only Corporate,
 *  which isn't a message at all, keeps a label of its own. */
export function messageLabelFor(eventType?: string | null): string {
  if (!eventType) return "Message to Guests";
  return eventType === "Corporate" ? "Event Briefing" : "Message from the Host";
}
