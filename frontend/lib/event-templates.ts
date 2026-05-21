import type { EventType } from "./types";

export type EventTemplate = {
  themeName: string;
  pageBackground: string;
  /** primary accent — buttons, dividers, focal elements */
  accentColor: string;
  /** secondary accent — soft tints, borders */
  secondaryColor: string;
  /** ink colour for body copy on the page background */
  inkColor: string;
  /** glow tone used by pulse-ring animation around CTAs */
  glowColor: string;
  headingFont: string;
  bodyFont: string;
  heroLayout: "full-bleed" | "split" | "centered" | "cinematic" | "ring";
  decorativeElements: string[];
  deliveryCardStyle: "minimal" | "elevated" | "bordered";
  moodDescriptor: string;
  /** copy that appears in the review CTA section */
  reviewCopy: {
    eyebrow: string;
    title: string;
    body: string;
    cta: string;
  };
};

const WEDDING: EventTemplate = {
  themeName: "wedding",
  pageBackground: "bg-[#fdf8f2] text-[#3d2814]",
  accentColor: "#a47148",
  secondaryColor: "#c9a76a",
  inkColor: "#3d2814",
  glowColor: "rgba(201, 167, 106, 0.55)",
  headingFont: "var(--font-cormorant)",
  bodyFont: "var(--font-geist-sans)",
  heroLayout: "full-bleed",
  decorativeElements: ["falling-petals", "gold-corner-flourish", "ampersand-monogram"],
  deliveryCardStyle: "elevated",
  moodDescriptor: "timeless · romantic",
  reviewCopy: {
    eyebrow: "Before you scroll down",
    title: "Help us spread the love",
    body: "A few honest words on Google means the world to a small studio. It takes 30 seconds — and helps couples like you find us.",
    cta: "Leave a Google review",
  },
};

const BIRTHDAY: EventTemplate = {
  themeName: "birthday",
  pageBackground: "bg-[#fff8ec] text-[#2a1f3d]",
  accentColor: "#f97316",
  secondaryColor: "#ec4899",
  inkColor: "#2a1f3d",
  glowColor: "rgba(249, 115, 22, 0.55)",
  headingFont: "var(--font-nunito)",
  bodyFont: "var(--font-nunito)",
  heroLayout: "centered",
  decorativeElements: ["confetti-rain", "rising-balloons", "party-icons"],
  deliveryCardStyle: "bordered",
  moodDescriptor: "joyful · playful",
  reviewCopy: {
    eyebrow: "One quick favour",
    title: "Help us throw more parties",
    body: "We had a blast capturing the day. If you had fun too, a quick Google review keeps the cake coming for future birthdays.",
    cta: "Drop a 5-star review",
  },
};

const ANNIVERSARY: EventTemplate = {
  themeName: "anniversary",
  pageBackground: "bg-[#faf2f3] text-[#3a1f24]",
  accentColor: "#b56576",
  secondaryColor: "#6f1d1b",
  inkColor: "#3a1f24",
  glowColor: "rgba(181, 101, 118, 0.5)",
  headingFont: "var(--font-playfair)",
  bodyFont: "var(--font-geist-sans)",
  heroLayout: "split",
  decorativeElements: ["floating-hearts", "rose-divider"],
  deliveryCardStyle: "minimal",
  moodDescriptor: "elegant · enduring",
  reviewCopy: {
    eyebrow: "A small request",
    title: "Forever moments deserve a forever review",
    body: "If you loved the way we captured this milestone, a quick word on Google helps us tell more love stories like yours.",
    cta: "Share your story on Google",
  },
};

const PRE_WEDDING: EventTemplate = {
  themeName: "pre-wedding",
  pageBackground: "bg-[#f5e7d6] text-[#3d2c1f]",
  accentColor: "#c2410c",
  secondaryColor: "#7c2d12",
  inkColor: "#3d2c1f",
  glowColor: "rgba(194, 65, 12, 0.5)",
  headingFont: "var(--font-dm-sans)",
  bodyFont: "var(--font-dm-sans)",
  heroLayout: "cinematic",
  decorativeElements: ["sun-rays", "film-grain", "letterbox"],
  deliveryCardStyle: "minimal",
  moodDescriptor: "cinematic · earthy",
  reviewCopy: {
    eyebrow: "Real talk",
    title: "Real moments, real review",
    body: "If our work made the shoot feel real, please tell future couples on Google. Two sentences. Mean the world.",
    cta: "Review us on Google",
  },
};

const ENGAGEMENT: EventTemplate = {
  themeName: "engagement",
  pageBackground: "bg-[#fdf2f8] text-[#3b1f3a]",
  accentColor: "#9d4edd",
  secondaryColor: "#f9a8d4",
  inkColor: "#3b1f3a",
  glowColor: "rgba(157, 78, 221, 0.5)",
  headingFont: "var(--font-lora)",
  bodyFont: "var(--font-lora)",
  heroLayout: "ring",
  decorativeElements: ["sparkles", "ring-decoration", "soft-bokeh"],
  deliveryCardStyle: "elevated",
  moodDescriptor: "soft · dreamy",
  reviewCopy: {
    eyebrow: "Before the sparkle fades",
    title: "Pass the sparkle forward",
    body: "If today felt magical, a Google review keeps the sparkle going for the next couple to find us.",
    cta: "Leave a shining review",
  },
};

const TEMPLATES: Record<EventType, EventTemplate> = {
  Wedding: WEDDING,
  Birthday: BIRTHDAY,
  Anniversary: ANNIVERSARY,
  "Pre-wedding": PRE_WEDDING,
  Engagement: ENGAGEMENT,
};

export function getEventTemplate(eventType: string): EventTemplate {
  return TEMPLATES[eventType as EventType] ?? WEDDING;
}
