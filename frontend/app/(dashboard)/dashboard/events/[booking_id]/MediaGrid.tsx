"use client";

import type { MediaItem } from "@/lib/types";

export function MediaGrid({ items }: { items: MediaItem[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--color-brand-border)] bg-white px-6 py-12 text-center text-[13px] text-[var(--color-brand-muted)]">
        No photos in this folder yet.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((m) => (
        <a
          key={m._id}
          href={m.url}
          target="_blank"
          rel="noreferrer"
          className="group relative block aspect-square overflow-hidden rounded bg-[var(--color-brand-surface)]"
        >
          <img
            src={m.url}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        </a>
      ))}
    </div>
  );
}
