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
  /** eyebrow shown above the custom message block */
  customMessageLabel: string;
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
  pageBackground: "bg-[#0D0B09] text-[#F0E8DC]",
  accentColor: "#C25A3A",
  secondaryColor: "#C9A96E",
  inkColor: "#F0E8DC",
  glowColor: "rgba(194, 90, 58, 0.25)",
  headingFont: "var(--font-cormorant)",
  bodyFont: "var(--font-geist-sans)",
  heroLayout: "full-bleed",
  decorativeElements: ["falling-petals", "gold-corner-flourish", "ampersand-monogram"],
  deliveryCardStyle: "elevated",
  moodDescriptor: "Cinematic & intimate",
  customMessageLabel: "A note from the couple",
  reviewCopy: {
    eyebrow: "Your feedback",
    title: "Did we do justice to your day?",
    body: "A few kind words on Google means the world to our team — and helps other couples find us.",
    cta: "Write a Google review",
  },
};

const BIRTHDAY: EventTemplate = {
  themeName: "birthday",
  pageBackground: "bg-[#FDF5E8] text-[#2D1A08]",
  accentColor: "#C8721A",
  secondaryColor: "#E8A84C",
  inkColor: "#2D1A08",
  glowColor: "rgba(200, 114, 26, 0.2)",
  headingFont: "var(--font-nunito)",
  bodyFont: "var(--font-nunito)",
  heroLayout: "centered",
  decorativeElements: [],
  deliveryCardStyle: "minimal",
  moodDescriptor: "Warm & celebratory",
  customMessageLabel: "A note from the family",
  reviewCopy: {
    eyebrow: "Your feedback",
    title: "Did we make it unforgettable?",
    body: "Share your experience on Google — it helps other families celebrate their moments with us.",
    cta: "Write a Google review",
  },
};

const ANNIVERSARY: EventTemplate = {
  themeName: "anniversary",
  pageBackground: "bg-[#FAF2F3] text-[#3A1F24]",
  accentColor: "#B56576",
  secondaryColor: "#D4A0A8",
  inkColor: "#3A1F24",
  glowColor: "rgba(181, 101, 118, 0.2)",
  headingFont: "var(--font-playfair)",
  bodyFont: "var(--font-geist-sans)",
  heroLayout: "split",
  decorativeElements: ["floating-hearts", "rose-divider"],
  deliveryCardStyle: "elevated",
  moodDescriptor: "Romantic & timeless",
  customMessageLabel: "A note from the couple",
  reviewCopy: {
    eyebrow: "Your feedback",
    title: "Did we honour your story?",
    body: "Your kind words on Google help other couples trust us with their milestones.",
    cta: "Write a Google review",
  },
};

const PRE_WEDDING: EventTemplate = {
  themeName: "pre-wedding",
  pageBackground: "bg-[#F5F0E8] text-[#2A2218]",
  accentColor: "#8B7355",
  secondaryColor: "#B09A7A",
  inkColor: "#2A2218",
  glowColor: "rgba(139, 115, 85, 0.2)",
  headingFont: "var(--font-dm-sans)",
  bodyFont: "var(--font-dm-sans)",
  heroLayout: "cinematic",
  decorativeElements: ["sun-rays", "film-grain", "letterbox"],
  deliveryCardStyle: "minimal",
  moodDescriptor: "Soft & aspirational",
  customMessageLabel: "A note from the couple",
  reviewCopy: {
    eyebrow: "Your feedback",
    title: "Did we capture the anticipation?",
    body: "A few kind words on Google helps other couples begin their journey with us.",
    cta: "Write a Google review",
  },
};

const ENGAGEMENT: EventTemplate = {
  themeName: "engagement",
  pageBackground: "bg-[#FBF0E8] text-[#281508]",
  accentColor: "#9E4D2A",
  secondaryColor: "#C9855A",
  inkColor: "#281508",
  glowColor: "rgba(158, 77, 42, 0.2)",
  headingFont: "var(--font-lora)",
  bodyFont: "var(--font-lora)",
  heroLayout: "ring",
  decorativeElements: ["sparkles", "ring-decoration", "soft-bokeh"],
  deliveryCardStyle: "elevated",
  moodDescriptor: "Warm & celebratory",
  customMessageLabel: "A note from the couple",
  reviewCopy: {
    eyebrow: "Your feedback",
    title: "Did we capture the beginning?",
    body: "Share your experience — it helps other couples find us for their most important moments.",
    cta: "Write a Google review",
  },
};

const CORPORATE: EventTemplate = {
  themeName: "Corporate",
  pageBackground: "bg-[#F4F7FA] text-[#1A2332]",
  accentColor: "#2C5282",
  secondaryColor: "#4A7FA5",
  inkColor: "#1A2332",
  glowColor: "rgba(44, 82, 130, 0.15)",
  headingFont: "var(--font-cormorant)",
  bodyFont: "var(--font-geist-sans)",
  heroLayout: "centered",
  decorativeElements: [],
  deliveryCardStyle: "bordered",
  moodDescriptor: "Clean & professional",
  customMessageLabel: "A note from the organiser",
  reviewCopy: {
    eyebrow: "Your feedback",
    title: "How did we do?",
    body: "A Google review helps other organisations find the right photography partner for their events.",
    cta: "Write a Google review",
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
