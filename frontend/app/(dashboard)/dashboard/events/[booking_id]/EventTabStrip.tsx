"use client";

import { useState } from "react";
import { IconLock } from "./icons";

export type TabId = "media" | "gallery" | "access";

export type TabDef = {
  id: TabId;
  label: string;
  count?: number | null;
  locked?: boolean;
  tooltip?: string;
};

/**
 * Tab strip across the event workspace (recreated from `event-tabs.jsx`):
 * terracotta active underline, count badge on Media, lock icon + tooltip on
 * gated tabs. Locked tabs can't be opened.
 */
export function EventTabStrip({
  tabs,
  active,
  onChange,
}: {
  tabs: TabDef[];
  active: TabId;
  onChange: (id: TabId) => void;
}) {
  const [hovered, setHovered] = useState<TabId | null>(null);

  return (
    <div
      role="tablist"
      aria-label="Event workspace"
      className="flex items-stretch gap-1 border-b border-[var(--color-brand-border)] bg-white px-4 sm:px-10"
    >
      {tabs.map((t) => {
        const locked = !!t.locked;
        const isActive = t.id === active && !locked;
        return (
          <div
            key={t.id}
            className="relative flex"
            onMouseEnter={() => locked && setHovered(t.id)}
            onMouseLeave={() => setHovered((h) => (h === t.id ? null : h))}
          >
            <button
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-disabled={locked}
              onClick={() => {
                if (!locked) onChange(t.id);
              }}
              className="brand-focus relative inline-flex items-center gap-2 px-3.5 pb-3.5 pt-[15px] text-[14px] tracking-[-0.005em]"
              style={{
                cursor: locked ? "not-allowed" : "pointer",
                fontWeight: isActive ? 600 : 500,
                color: locked
                  ? "#B5ADA4"
                  : isActive
                  ? "var(--color-brand-navy)"
                  : "var(--color-brand-muted)",
                opacity: locked ? 0.75 : 1,
              }}
            >
              <span>{t.label}</span>
              {locked && <IconLock size={13} className="shrink-0 text-[#B5ADA4]" />}
              {t.count != null && !locked && (
                <span
                  className="rounded-full px-2 py-0.5 text-[11.5px] font-semibold tabular-nums"
                  style={{
                    color: isActive ? "var(--color-brand-navy)" : "var(--color-brand-muted)",
                    background: isActive ? "var(--color-brand-navy-soft)" : "#F2F0EB",
                  }}
                >
                  {t.count.toLocaleString("en-IN")}
                </span>
              )}
              {isActive && (
                <span className="absolute inset-x-3.5 -bottom-px h-0.5 rounded-sm bg-[var(--color-brand-navy)]" />
              )}
            </button>
            {locked && hovered === t.id && t.tooltip && (
              <div className="absolute left-0 top-[calc(100%+6px)] z-40 w-[232px] rounded-lg bg-[var(--color-brand-ink)] px-3 py-2.5 text-[12px] font-medium leading-relaxed text-white shadow-[0_6px_20px_rgba(42,34,24,0.22)]">
                <span className="absolute -top-[5px] left-[22px] h-2.5 w-2.5 rotate-45 bg-[var(--color-brand-ink)]" />
                {t.tooltip}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
