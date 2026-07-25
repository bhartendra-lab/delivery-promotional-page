"use client";

import {
  IconInstagram,
  IconFacebook,
  IconYoutube,
  IconVimeo,
  IconPinterest,
  IconXLogo,
} from "@/components/ui/icons";

/**
 * Studio social links, drawn as a colored chip (this app's own composite —
 * no library carries a "brand mark in a colored circle" treatment) with the
 * real react-icons/simple-icons brand mark inside, rendered white.
 */

export type SocialPlatform = "Instagram" | "Facebook" | "YouTube" | "Vimeo" | "Pinterest" | "X";

/** Chip fill per platform. Instagram gets its signature gradient. */
const CHIP: Record<SocialPlatform, string> = {
  Instagram: "linear-gradient(45deg, #F58529, #DD2A7B 45%, #8134AF 75%, #515BD4)",
  Facebook: "#1877F2",
  YouTube: "#FF0000",
  Vimeo: "#1AB7EA",
  Pinterest: "#E60023",
  X: "#0F1419",
};

const GLYPH: Record<SocialPlatform, typeof IconInstagram> = {
  Instagram: IconInstagram,
  Facebook: IconFacebook,
  YouTube: IconYoutube,
  Vimeo: IconVimeo,
  Pinterest: IconPinterest,
  X: IconXLogo,
};

export function SocialChip({ platform, size = 32 }: { platform: SocialPlatform; size?: number }) {
  const glyph = Math.round(size * 0.58);
  const Glyph = GLYPH[platform];
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full transition-transform duration-200 group-hover/social:scale-110"
      style={{ width: size, height: size, background: CHIP[platform] }}
    >
      <Glyph size={glyph} style={{ color: "#fff" }} />
    </span>
  );
}
