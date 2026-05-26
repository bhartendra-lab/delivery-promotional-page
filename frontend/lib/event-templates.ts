import type { EventType } from "./types";
import type { HeroGradient } from "@/components/client/delivery/tokens";

/**
 * Per-event configuration for the client delivery page.
 *
 * The delivery page is a single shared layout (see
 * `frontend/components/client/delivery/DeliveryPage.tsx`). Each event type
 * is a thin 3-variable skin on top of that layout:
 *
 *   - theme    (dark | light)         — page palette tone
 *   - accent   (single hex)           — buttons, eyebrows, primary CTA
 *   - hero     (multi-layer gradient) — emotional temperature
 *
 * Plus per-event micro-copy: the custom message eyebrow, the review CTA
 * copy, and the studio booking pitch. Structure, typography, spacing and
 * card vocabulary are identical across all events — those don't vary.
 */
export type EventTemplate = {
  themeName: string;
  /** Page palette tone — drives bg/surface/text via `makeTokens`. */
  theme: "dark" | "light";
  /** Single accent — buttons, eyebrows, links, primary CTA. */
  accentColor: string;
  /** Gold-ish secondary tint for star fills and highlight gradients. */
  secondaryColor: string;
  /** Multi-layer hero gradient — sets the emotional temperature. */
  heroGradient: HeroGradient;
  /** Eyebrow shown above the custom message block. */
  customMessageLabel: string;
  /** Copy for the review CTA card. */
  reviewCopy: {
    eyebrow: string;
    title: string;
    body: string;
    cta: string;
  };
  /** Copy for the studio + booking section at the bottom. */
  studioCopy: {
    tagline: string;
    bookingEyebrow: string;
    bookingTitle: string;
    bookingBody: string;
  };
};

/** Reference HTML's wedding hero gradient (lines 273–293) — the baseline. */
const WEDDING_HERO: HeroGradient = {
  base: "linear-gradient(160deg, #2C1A0E 0%, #3E2210 25%, #1A0D07 55%, #080503 100%)",
  glow: "rgba(190,95,40,0.22)",
  highlight: "rgba(200,165,100,0.12)",
};

const WEDDING: EventTemplate = {
  themeName: "Wedding",
  theme: "dark",
  accentColor: "#C25A3A",
  secondaryColor: "#C9A96E",
  heroGradient: WEDDING_HERO,
  customMessageLabel: "A note from the couple",
  reviewCopy: {
    eyebrow: "Your feedback",
    title: "Did we do justice to your day?",
    body: "A few kind words on Google means the world to our team — and helps other couples find us.",
    cta: "Write a Google review",
  },
  studioCopy: {
    tagline: "Every frame, forever.",
    bookingEyebrow: "Planning a celebration?",
    bookingTitle: "Know someone who deserves pictures this beautiful?",
    bookingBody:
      "We shoot weddings, receptions, mehandis, and portraits across India. Inquire about availability.",
  },
};

const BIRTHDAY: EventTemplate = {
  themeName: "Birthday",
  theme: "light",
  accentColor: "#C8721A",
  secondaryColor: "#E8A84C",
  heroGradient: {
    base: "linear-gradient(160deg, #F4D9B2 0%, #E8B97A 25%, #C8721A 55%, #6F3A0E 100%)",
    glow: "rgba(232,168,76,0.32)",
    highlight: "rgba(255,220,165,0.20)",
  },
  customMessageLabel: "A note from the family",
  reviewCopy: {
    eyebrow: "Your feedback",
    title: "Did we make it unforgettable?",
    body: "Share your experience on Google — it helps other families celebrate their moments with us.",
    cta: "Write a Google review",
  },
  studioCopy: {
    tagline: "Every laugh, every candle, every wish.",
    bookingEyebrow: "Planning a celebration?",
    bookingTitle: "Know a family worth photographing?",
    bookingBody:
      "We shoot birthdays, milestones, and family portraits. Tell us about the occasion.",
  },
};

const ANNIVERSARY: EventTemplate = {
  themeName: "Anniversary",
  theme: "light",
  accentColor: "#B56576",
  secondaryColor: "#D4A0A8",
  heroGradient: {
    base: "linear-gradient(160deg, #F0C8CE 0%, #D89098 25%, #B56576 55%, #5C2A33 100%)",
    glow: "rgba(212,160,168,0.30)",
    highlight: "rgba(255,225,228,0.18)",
  },
  customMessageLabel: "A note from the couple",
  reviewCopy: {
    eyebrow: "Your feedback",
    title: "Did we honour your story?",
    body: "Your kind words on Google help other couples trust us with their milestones.",
    cta: "Write a Google review",
  },
  studioCopy: {
    tagline: "Years, captured tenderly.",
    bookingEyebrow: "Marking a milestone?",
    bookingTitle: "Know a couple worth celebrating?",
    bookingBody:
      "We shoot anniversaries, vow renewals, and family portraits. Inquire about availability.",
  },
};

const PRE_WEDDING: EventTemplate = {
  themeName: "Pre-wedding",
  theme: "light",
  accentColor: "#8B7355",
  secondaryColor: "#B09A7A",
  heroGradient: {
    base: "linear-gradient(160deg, #D8C8A8 0%, #B59B7B 25%, #8B7355 55%, #3D3022 100%)",
    glow: "rgba(176,154,122,0.28)",
    highlight: "rgba(240,225,200,0.18)",
  },
  customMessageLabel: "A note from the couple",
  reviewCopy: {
    eyebrow: "Your feedback",
    title: "Did we capture the anticipation?",
    body: "A few kind words on Google helps other couples begin their journey with us.",
    cta: "Write a Google review",
  },
  studioCopy: {
    tagline: "Before the day, the story.",
    bookingEyebrow: "Engaged?",
    bookingTitle: "Know a couple with a story to tell?",
    bookingBody:
      "We shoot pre-wedding films and portraits on location across India. Tell us where to meet you.",
  },
};

const ENGAGEMENT: EventTemplate = {
  themeName: "Engagement",
  theme: "light",
  accentColor: "#9E4D2A",
  secondaryColor: "#C9855A",
  heroGradient: {
    base: "linear-gradient(160deg, #EBC5AA 0%, #D08F66 25%, #9E4D2A 55%, #461E0E 100%)",
    glow: "rgba(201,133,90,0.30)",
    highlight: "rgba(255,225,200,0.18)",
  },
  customMessageLabel: "A note from the couple",
  reviewCopy: {
    eyebrow: "Your feedback",
    title: "Did we capture the beginning?",
    body: "Share your experience — it helps other couples find us for their most important moments.",
    cta: "Write a Google review",
  },
  studioCopy: {
    tagline: "Where forever began.",
    bookingEyebrow: "Just said yes?",
    bookingTitle: "Know a couple starting their journey?",
    bookingBody:
      "We shoot engagements, roka ceremonies, and pre-wedding stories. Inquire about a date.",
  },
};

const CORPORATE: EventTemplate = {
  themeName: "Corporate",
  theme: "light",
  accentColor: "#2C5282",
  secondaryColor: "#4A7FA5",
  heroGradient: {
    base: "linear-gradient(160deg, #B8C9DC 0%, #6F8FB2 25%, #2C5282 55%, #0F1F35 100%)",
    glow: "rgba(74,127,165,0.28)",
    highlight: "rgba(220,232,245,0.18)",
  },
  customMessageLabel: "A note from the organiser",
  reviewCopy: {
    eyebrow: "Your feedback",
    title: "How did we do?",
    body: "A Google review helps other organisations find the right photography partner for their events.",
    cta: "Write a Google review",
  },
  studioCopy: {
    tagline: "Professional. On time. On brief.",
    bookingEyebrow: "Planning an event?",
    bookingTitle: "Looking for a reliable photography partner?",
    bookingBody:
      "We shoot conferences, product launches, awards, and corporate portraits. Inquire about availability.",
  },
};

const TEMPLATES: Record<EventType, EventTemplate> = {
  Wedding: WEDDING,
  Birthday: BIRTHDAY,
  Anniversary: ANNIVERSARY,
  "Pre-wedding": PRE_WEDDING,
  Engagement: ENGAGEMENT,
  Corporate: CORPORATE,
};

export function getEventTemplate(eventType: string): EventTemplate {
  return TEMPLATES[eventType as EventType] ?? WEDDING;
}
