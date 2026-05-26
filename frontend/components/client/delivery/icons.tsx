"use client";

/**
 * SVG icon set for the delivery page. Ports the icons from
 * `ai-tasks/Delivery Page minimal.html` 1:1 (lines 87–165). Sizes and
 * colors are configurable via props.
 *
 * Convention: `s` = pixel size (number), `c` = stroke/fill color (string).
 */

type IconProps = { s?: number; c?: string };

export function ArrowRight({ s = 16, c = "currentColor" }: IconProps) {
  return (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3 8h10M9 4l4 4-4 4"
        stroke={c}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ShareIcon({ s = 16, c = "currentColor" }: IconProps) {
  return (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="13" cy="3" r="1.5" stroke={c} strokeWidth="1.4" />
      <circle cx="3" cy="8" r="1.5" stroke={c} strokeWidth="1.4" />
      <circle cx="13" cy="13" r="1.5" stroke={c} strokeWidth="1.4" />
      <path
        d="M4.4 7.1l7.2-3.2M4.4 8.9l7.2 3.2"
        stroke={c}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CamIcon({ s = 20, c = "currentColor" }: IconProps) {
  return (
    <svg width={s} height={s} viewBox="0 0 20 20" fill="none" aria-hidden>
      <rect x="2" y="5" width="16" height="12" rx="2.5" stroke={c} strokeWidth="1.5" />
      <circle cx="10" cy="11" r="3.5" stroke={c} strokeWidth="1.5" />
      <path
        d="M7.5 5l1-2h3l1 2"
        stroke={c}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function FilmIcon({ s = 20, c = "currentColor" }: IconProps) {
  return (
    <svg width={s} height={s} viewBox="0 0 20 20" fill="none" aria-hidden>
      <rect x="2" y="3" width="16" height="14" rx="2" stroke={c} strokeWidth="1.5" />
      <path
        d="M2 7h2M2 13h2M16 7h2M16 13h2M6 3v14M14 3v14"
        stroke={c}
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function BookIcon({ s = 20, c = "currentColor" }: IconProps) {
  return (
    <svg width={s} height={s} viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M3 4h9a2 2 0 012 2v11H3a2 2 0 01-2-2V6a2 2 0 012-2z"
        stroke={c}
        strokeWidth="1.5"
      />
      <path d="M14 4a2 2 0 012 2v11a2 2 0 01-2 2" stroke={c} strokeWidth="1.5" />
      <path d="M5 8h7M5 11h5" stroke={c} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function StarIcon({
  s = 28,
  filled = false,
  color = "#C9A96E",
}: {
  s?: number;
  filled?: boolean;
  color?: string;
}) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        fill={filled ? color : "none"}
      />
    </svg>
  );
}

export function IgIcon({ s = 18, c = "currentColor" }: IconProps) {
  return (
    <svg width={s} height={s} viewBox="0 0 20 20" fill="none" aria-hidden>
      <rect x="2" y="2" width="16" height="16" rx="5" stroke={c} strokeWidth="1.5" />
      <circle cx="10" cy="10" r="3.5" stroke={c} strokeWidth="1.5" />
      <circle cx="14.5" cy="5.5" r="1" fill={c} />
    </svg>
  );
}

export function FacebookIcon({ s = 18, c = "currentColor" }: IconProps) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill={c} aria-hidden>
      <path d="M13.5 21v-7h2.4l.4-3.2H13.5V8.7c0-.9.3-1.6 1.6-1.6h1.7V4.2c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.5-4 4.1v2.6H8v3.2h2.4V21h3.1z" />
    </svg>
  );
}

export function GlobeIcon({ s = 18, c = "currentColor" }: IconProps) {
  return (
    <svg width={s} height={s} viewBox="0 0 20 20" fill="none" aria-hidden>
      <circle cx="10" cy="10" r="8" stroke={c} strokeWidth="1.5" />
      <path
        d="M2 10h16M10 2a13 13 0 000 16M10 2a13 13 0 010 16"
        stroke={c}
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function ExtIcon({ s = 13, c = "currentColor" }: IconProps) {
  return (
    <svg width={s} height={s} viewBox="0 0 13 13" fill="none" aria-hidden>
      <path
        d="M5 2H2v9h9V8M7.5 2H11v3.5M7 6l4-4"
        stroke={c}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function GoogleG({ s = 14 }: { s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 18 18" aria-hidden>
      <path
        d="M17.64 9.2a10.3 10.3 0 00-.164-1.84H9v3.48h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"
        fill="#EA4335"
      />
    </svg>
  );
}

/** Aperture-lens monogram for the studio identity. */
export function LensIcon({ accent }: { accent: string }) {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden>
      <circle cx="13" cy="13" r="11.5" stroke={accent} strokeWidth="1.3" />
      <circle cx="13" cy="13" r="5.5" stroke={accent} strokeWidth="1.3" />
      <circle cx="13" cy="13" r="2" fill={accent} />
      <line x1="13" y1="1.5" x2="13" y2="6" stroke={accent} strokeWidth="1.3" strokeLinecap="round" />
      <line x1="13" y1="20" x2="13" y2="24.5" stroke={accent} strokeWidth="1.3" strokeLinecap="round" />
      <line x1="1.5" y1="13" x2="6" y2="13" stroke={accent} strokeWidth="1.3" strokeLinecap="round" />
      <line x1="20" y1="13" x2="24.5" y2="13" stroke={accent} strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
