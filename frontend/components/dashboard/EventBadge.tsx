"use client";

import type { EventType } from "@/lib/types";

const TONES: Record<EventType, { fg: string; bg: string }> = {
  Wedding: { fg: "#6f1d1b", bg: "#fbe4e6" },
  Birthday: { fg: "#92400e", bg: "#fff3e0" },
  Anniversary: { fg: "#6a4c93", bg: "#f3e8ff" },
  "Pre-wedding": { fg: "#7c2d12", bg: "#fde8d3" },
  Engagement: { fg: "#9d2466", bg: "#fce7f3" },
};

const FALLBACK = { fg: "#0f2d5c", bg: "#e8edf5" };

export function EventBadge({ type }: { type: EventType }) {
  const tone = TONES[type] ?? FALLBACK;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em]"
      style={{ color: tone.fg, background: tone.bg }}
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: tone.fg }}
      />
      {type}
    </span>
  );
}
