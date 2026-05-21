"use client";

import { useMemo } from "react";

/**
 * Subtle gold petal-fall and corner flourish for the wedding template.
 * Petals are deterministic per mount via Math.random — re-mount = re-shuffle.
 */
export function WeddingDecor() {
  const petals = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 12,
        duration: 14 + Math.random() * 10,
        drift: (Math.random() - 0.5) * 220,
        size: 12 + Math.random() * 14,
        opacity: 0.4 + Math.random() * 0.4,
        rotate: Math.random() * 360,
        key: i,
      })),
    [],
  );

  return (
    <>
      {/* Falling petals — fixed so they linger across sections */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-10 overflow-hidden"
      >
        {petals.map((p) => (
          <span
            key={p.key}
            className="absolute block"
            style={{
              left: `${p.left}%`,
              top: 0,
              width: `${p.size}px`,
              height: `${p.size}px`,
              opacity: p.opacity,
              transform: `rotate(${p.rotate}deg)`,
              animation: `drift-down ${p.duration}s linear ${p.delay}s infinite`,
              ["--drift-x" as string]: `${p.drift}px`,
            }}
          >
            <Petal />
          </span>
        ))}
      </div>

      {/* Top-left & top-right corner flourishes */}
      <CornerFlourish className="absolute left-0 top-0 z-20 h-28 w-28 sm:h-40 sm:w-40" />
      <CornerFlourish
        className="absolute right-0 top-0 z-20 h-28 w-28 -scale-x-100 sm:h-40 sm:w-40"
      />
    </>
  );
}

function Petal() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <path
        d="M12 2c4 4 6 7 6 11s-2.7 7-6 7-6-3-6-7 2-7 6-11z"
        fill="#c9a76a"
        opacity="0.85"
      />
      <path
        d="M12 5c2.5 3 4 5 4 8s-1.8 5-4 5"
        stroke="#a47148"
        strokeWidth="0.6"
        opacity="0.5"
      />
    </svg>
  );
}

function CornerFlourish({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 160" fill="none" className={className} aria-hidden>
      <g stroke="#c9a76a" strokeWidth="1.1" fill="none" opacity="0.85">
        <path d="M0 60 C20 60, 40 50, 60 30 S100 0, 140 0" />
        <path d="M0 78 C24 78, 50 66, 72 44" opacity="0.6" />
        <circle cx="58" cy="32" r="3" fill="#c9a76a" />
        <circle cx="78" cy="20" r="2" fill="#a47148" />
        <circle cx="100" cy="14" r="1.5" fill="#c9a76a" />
        <path
          d="M48 38c4-2 6-6 4-10-3-1-6 1-7 5"
          fill="#c9a76a"
          opacity="0.8"
        />
        <path
          d="M68 26c3-1 5-5 3-9-3 0-6 2-6 6"
          fill="#a47148"
          opacity="0.7"
        />
      </g>
    </svg>
  );
}
