"use client";

import { useMemo } from "react";

export function EngagementDecor() {
  const sparkles = useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => ({
        left: Math.random() * 100,
        top: Math.random() * 100,
        delay: Math.random() * 4,
        duration: 2 + Math.random() * 3,
        size: 6 + Math.random() * 12,
        key: i,
      })),
    [],
  );

  const bokeh = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => ({
        left: Math.random() * 100,
        top: Math.random() * 100,
        delay: Math.random() * 6,
        duration: 6 + Math.random() * 4,
        size: 80 + Math.random() * 200,
        color: i % 2 === 0 ? "rgba(244,182,232,0.25)" : "rgba(196,181,253,0.25)",
        key: i,
      })),
    [],
  );

  return (
    <>
      {/* Soft bokeh blobs */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      >
        {bokeh.map((b) => (
          <span
            key={b.key}
            className="absolute rounded-full blur-2xl"
            style={{
              left: `${b.left}%`,
              top: `${b.top}%`,
              width: `${b.size}px`,
              height: `${b.size}px`,
              background: b.color,
              animation: `bob ${b.duration}s ease-in-out ${b.delay}s infinite`,
            }}
          />
        ))}
      </div>

      {/* Sparkles */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-10 overflow-hidden"
      >
        {sparkles.map((s) => (
          <span
            key={s.key}
            className="absolute"
            style={{
              left: `${s.left}%`,
              top: `${s.top}%`,
              width: `${s.size}px`,
              height: `${s.size}px`,
              animation: `sparkle ${s.duration}s ease-in-out ${s.delay}s infinite`,
            }}
          >
            <Sparkle />
          </span>
        ))}
      </div>
    </>
  );
}

function Sparkle() {
  return (
    <svg viewBox="0 0 24 24" className="h-full w-full">
      <path
        d="M12 2l1.6 7L21 12l-7.4 3L12 22l-1.6-7L3 12l7.4-3z"
        fill="#f5d0fe"
        stroke="#c084fc"
        strokeWidth="0.4"
      />
    </svg>
  );
}

export function EngagementRing({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 100" className={className} aria-hidden>
      <defs>
        <linearGradient id="ring-gold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="50%" stopColor="#facc15" />
          <stop offset="100%" stopColor="#a16207" />
        </linearGradient>
      </defs>
      <circle
        cx="40"
        cy="64"
        r="22"
        fill="none"
        stroke="url(#ring-gold)"
        strokeWidth="6"
      />
      <polygon
        points="40,8 50,28 40,42 30,28"
        fill="#e0e7ff"
        stroke="#a5b4fc"
        strokeWidth="1.5"
      />
      <polygon points="40,8 50,28 40,18" fill="white" opacity="0.7" />
    </svg>
  );
}
