"use client";

/**
 * Simplified, recognizable brand glyphs for the studio's social links, drawn
 * as a colored chip with a white mark inside. Deliberately hand-simplified
 * (not the official logotypes) so they stay legible at ~16px and carry no
 * third-party asset dependency.
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

export function SocialChip({ platform, size = 32 }: { platform: SocialPlatform; size?: number }) {
  const glyph = Math.round(size * 0.58);
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full transition-transform duration-200 group-hover/social:scale-110"
      style={{ width: size, height: size, background: CHIP[platform] }}
    >
      <Glyph platform={platform} size={glyph} />
    </span>
  );
}

function Glyph({ platform, size }: { platform: SocialPlatform; size: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24" } as const;
  switch (platform) {
    case "Instagram":
      return (
        <svg {...common} fill="none" stroke="#fff" strokeWidth={2.1}>
          <rect x="3.4" y="3.4" width="17.2" height="17.2" rx="5" />
          <circle cx="12" cy="12" r="4.1" />
          <circle cx="17.2" cy="6.8" r="1.35" fill="#fff" stroke="none" />
        </svg>
      );
    case "Facebook":
      return (
        <svg {...common} fill="#fff">
          <path d="M13.2 21v-8h2.5l.4-3h-2.9V8.2c0-.85.25-1.4 1.5-1.4h1.5V4.1c-.3-.04-1.3-.13-2.5-.13-2.45 0-4.1 1.5-4.1 4.2V10H7.5v3h2.1v8z" />
        </svg>
      );
    case "YouTube":
      return (
        <svg {...common} fill="#fff">
          <path d="M9.5 8.2v7.6l6.4-3.8z" />
        </svg>
      );
    case "Vimeo":
      return (
        <svg {...common} fill="#fff">
          <path d="M5.9 8.4h3.4l2.1 5.9 2.1-5.9h3.4l-3.8 9.1h-3.4z" />
        </svg>
      );
    case "Pinterest":
      return (
        <svg {...common} fill="#fff">
          <path d="M12.4 4.2c-4 0-6 2.7-6 5 0 1.4.5 2.6 1.7 3.1.2.08.37 0 .43-.22l.18-.68c.06-.22.03-.3-.13-.5-.36-.42-.58-.97-.58-1.74 0-2.25 1.7-4.26 4.4-4.26 2.4 0 3.72 1.45 3.72 3.4 0 2.55-1.14 4.7-2.83 4.7-.93 0-1.63-.77-1.4-1.72.27-1.13.78-2.35.78-3.17 0-.73-.4-1.34-1.2-1.34-.95 0-1.72 1-1.72 2.32 0 .85.29 1.42.29 1.42l-1.16 4.9c-.34 1.46-.05 3.25-.03 3.43.02.1.15.13.2.05.1-.12 1.3-1.6 1.7-3.08l.65-2.5c.35.66 1.35 1.24 2.4 1.24 3.17 0 5.32-2.9 5.32-6.77 0-2.93-2.48-5.66-6.25-5.66z" />
        </svg>
      );
    case "X":
      return (
        <svg {...common} fill="#fff">
          <path d="M17.6 4.5h2.9l-6.35 7.25L21.6 21h-5.6l-4.4-5.75L6.55 21H3.6l6.8-7.75L3.1 4.5h5.75l3.97 5.25zm-1.02 14.75h1.6L8.0 6.15H6.28z" />
        </svg>
      );
  }
}
