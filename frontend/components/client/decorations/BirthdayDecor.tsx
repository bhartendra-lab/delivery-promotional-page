"use client";

import { useMemo } from "react";

const CONFETTI_COLORS = [
  "#f97316",
  "#ec4899",
  "#f59e0b",
  "#22c55e",
  "#3b82f6",
  "#a855f7",
];

const BALLOON_COLORS = [
  "#fb7185",
  "#fbbf24",
  "#34d399",
  "#60a5fa",
  "#c084fc",
  "#f97316",
];

export function BirthdayDecor() {
  const confetti = useMemo(
    () =>
      Array.from({ length: 32 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 8,
        duration: 7 + Math.random() * 6,
        drift: (Math.random() - 0.5) * 180,
        rotate: Math.random() * 360,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        width: 6 + Math.random() * 8,
        height: 10 + Math.random() * 10,
        key: i,
      })),
    [],
  );

  const balloons = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => ({
        left: Math.random() * 90,
        delay: i * 1.6 + Math.random() * 2,
        duration: 18 + Math.random() * 8,
        drift: (Math.random() - 0.5) * 80,
        size: 36 + Math.random() * 22,
        color: BALLOON_COLORS[i % BALLOON_COLORS.length],
        key: i,
      })),
    [],
  );

  return (
    <>
      {/* Confetti rain */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-10 overflow-hidden"
      >
        {confetti.map((c) => (
          <span
            key={c.key}
            className="absolute"
            style={{
              left: `${c.left}%`,
              top: 0,
              width: `${c.width}px`,
              height: `${c.height}px`,
              background: c.color,
              transform: `rotate(${c.rotate}deg)`,
              borderRadius: "2px",
              animation: `drift-down ${c.duration}s linear ${c.delay}s infinite`,
              ["--drift-x" as string]: `${c.drift}px`,
            }}
          />
        ))}
      </div>

      {/* Floating balloons rising from the bottom of the viewport */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-10 overflow-hidden"
      >
        {balloons.map((b) => (
          <Balloon
            key={b.key}
            left={b.left}
            delay={b.delay}
            duration={b.duration}
            drift={b.drift}
            size={b.size}
            color={b.color}
          />
        ))}
      </div>
    </>
  );
}

function Balloon({
  left,
  delay,
  duration,
  drift,
  size,
  color,
}: {
  left: number;
  delay: number;
  duration: number;
  drift: number;
  size: number;
  color: string;
}) {
  return (
    <span
      className="absolute"
      style={{
        left: `${left}%`,
        top: 0,
        width: `${size}px`,
        height: `${size * 1.5}px`,
        animation: `rise ${duration}s linear ${delay}s infinite`,
        ["--drift-x" as string]: `${drift}px`,
      }}
    >
      <svg viewBox="0 0 60 80" className="h-full w-full">
        <ellipse cx="30" cy="28" rx="22" ry="26" fill={color} opacity="0.9" />
        <ellipse cx="22" cy="20" rx="6" ry="9" fill="white" opacity="0.35" />
        <path d="M28 54l4 0l-2 6z" fill={color} />
        <path
          d="M30 60c-2 6 2 10 0 16"
          stroke={color}
          strokeWidth="1.2"
          fill="none"
          opacity="0.8"
        />
      </svg>
    </span>
  );
}
