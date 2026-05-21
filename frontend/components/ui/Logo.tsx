"use client";

type Props = {
  /** Pixel size of the square viewport. */
  size?: number;
  /** Show the wordmark next to the symbol. */
  withWordmark?: boolean;
  /** Override colours (defaults: navy primary, gold secondary). */
  primary?: string;
  secondary?: string;
  /** Render colours on a dark surface — flips wordmark to white. */
  onDark?: boolean;
  className?: string;
};

/**
 * Brand mark — stylised "V" composed of a navy left stroke and a gold right
 * stroke that extends up into an arrow, with a camera-shutter aperture seated
 * inside the V. Drop a real PNG into `/public/logo.png` and swap this file's
 * implementation if you ever want a raster asset instead.
 */
export function Logo({
  size = 40,
  withWordmark = false,
  primary = "#0f2d5c",
  secondary = "#d4af63",
  onDark = false,
  className,
}: Props) {
  const wordmarkColor = onDark ? "#ffffff" : primary;
  return (
    <span
      className={`inline-flex items-center gap-3 ${className ?? ""}`}
      aria-label="Vyavasth"
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 120 120"
        fill="none"
        role="img"
        aria-hidden
      >
        <defs>
          <linearGradient id="logo-gold" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={secondary} stopOpacity="0.85" />
            <stop offset="100%" stopColor={secondary} />
          </linearGradient>
          <linearGradient id="logo-navy" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={primary} />
            <stop offset="100%" stopColor={primary} stopOpacity="0.92" />
          </linearGradient>
        </defs>

        {/* Left stroke of the V (navy) */}
        <path
          d="M16 18 L60 104 L74 80 L36 18 Z"
          fill="url(#logo-navy)"
        />

        {/* Right stroke of the V transforming into an arrow */}
        <path
          d="M60 104 L46 78 L88 18 L88 6 L104 6 L104 22 L74 22 Z"
          fill="url(#logo-gold)"
        />

        {/* Camera shutter — sits in the bowl of the V */}
        <g transform="translate(60 56)">
          <circle cx="0" cy="0" r="18" fill="white" />
          <circle
            cx="0"
            cy="0"
            r="17"
            fill="none"
            stroke={primary}
            strokeWidth="1.4"
          />
          {/* Six hexagonal aperture blades */}
          {Array.from({ length: 6 }).map((_, i) => {
            const angle = (i * 60 * Math.PI) / 180;
            const x1 = Math.cos(angle) * 14;
            const y1 = Math.sin(angle) * 14;
            const x2 = Math.cos(angle + Math.PI / 3) * 14;
            const y2 = Math.sin(angle + Math.PI / 3) * 14;
            return (
              <polygon
                key={i}
                points={`0,0 ${x1},${y1} ${x2},${y2}`}
                fill={secondary}
                opacity={0.55 + (i % 2) * 0.25}
                stroke={primary}
                strokeWidth="0.6"
                strokeLinejoin="round"
              />
            );
          })}
          <circle cx="0" cy="0" r="3.2" fill={primary} />
        </g>
      </svg>

      {withWordmark && (
        <span className="flex flex-col leading-none">
          <span
            className="text-base font-semibold tracking-[0.18em] uppercase"
            style={{ color: wordmarkColor }}
          >
            Vyavasth
          </span>
          <span
            className="mt-0.5 text-[10px] font-medium tracking-[0.32em] uppercase"
            style={{ color: secondary }}
          >
            Studio · Delivery
          </span>
        </span>
      )}
    </span>
  );
}
