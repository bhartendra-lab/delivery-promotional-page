"use client";

import { useMemo } from "react";

export function AnniversaryDecor() {
  const hearts = useMemo(
    () =>
      Array.from({ length: 10 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 14,
        duration: 16 + Math.random() * 10,
        drift: (Math.random() - 0.5) * 120,
        size: 14 + Math.random() * 16,
        opacity: 0.25 + Math.random() * 0.3,
        key: i,
      })),
    [],
  );

  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-10 overflow-hidden"
      >
        {hearts.map((h) => (
          <span
            key={h.key}
            className="absolute"
            style={{
              left: `${h.left}%`,
              top: 0,
              width: `${h.size}px`,
              height: `${h.size}px`,
              opacity: h.opacity,
              animation: `rise ${h.duration}s ease-in-out ${h.delay}s infinite`,
              ["--drift-x" as string]: `${h.drift}px`,
            }}
          >
            <Heart />
          </span>
        ))}
      </div>
    </>
  );
}

function Heart() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <path
        d="M12 21s-7-4.5-9-9.5C1.5 7.5 4 4 7.5 4 10 4 12 6 12 6s2-2 4.5-2C20 4 22.5 7.5 21 11.5 19 16.5 12 21 12 21z"
        fill="#b56576"
      />
    </svg>
  );
}

export function RoseDivider({ className }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center gap-3 ${className ?? ""}`}>
      <span className="h-px w-12 bg-[#b56576]/40" />
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="6" fill="#b56576" />
        <path
          d="M12 9c1.5 0 2 1.5 2 3s-1 3-2 3-2-1.5-2-3 .5-3 2-3z"
          fill="#fdb4c4"
        />
      </svg>
      <span className="h-px w-12 bg-[#b56576]/40" />
    </div>
  );
}
