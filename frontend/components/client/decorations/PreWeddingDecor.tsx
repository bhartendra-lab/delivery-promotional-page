"use client";

/**
 * Cinematic, earthy decor — large slowly-rotating sun-ray burst, a film-grain
 * overlay, and letterbox bars that fade in during the hero.
 */
export function PreWeddingDecor() {
  return (
    <>
      {/* Sun-ray burst, fixed in top-right, very slow rotation */}
      <div
        aria-hidden
        className="pointer-events-none fixed -right-32 -top-32 z-0 h-[36rem] w-[36rem] sm:-right-40 sm:-top-40 sm:h-[48rem] sm:w-[48rem]"
      >
        <div className="client-anim-spin-slow client-anim-sun-pulse h-full w-full">
          <SunRays />
        </div>
      </div>

      {/* Film-grain overlay */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-10 mix-blend-multiply opacity-[0.18]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='1.4' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.2 0 0 0 0 0.15 0 0 0 0 0.1 0 0 0 0.5 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
        }}
      />
    </>
  );
}

function SunRays() {
  const rays = Array.from({ length: 32 });
  return (
    <svg viewBox="0 0 200 200" className="h-full w-full">
      <defs>
        <radialGradient id="sun-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.7" />
          <stop offset="60%" stopColor="#f97316" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#c2410c" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="100" cy="100" r="80" fill="url(#sun-core)" />
      <g transform="translate(100 100)">
        {rays.map((_, i) => (
          <rect
            key={i}
            x="-1"
            y="-100"
            width="2"
            height="40"
            fill="#fbbf24"
            opacity="0.35"
            transform={`rotate(${(360 / rays.length) * i})`}
          />
        ))}
      </g>
    </svg>
  );
}
