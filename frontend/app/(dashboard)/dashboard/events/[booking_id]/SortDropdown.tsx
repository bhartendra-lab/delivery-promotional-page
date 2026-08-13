"use client";

import { useEffect, useRef, useState } from "react";
import { IconCaretDown, IconCheck } from "./icons";

export type SortOption<T extends string> = { value: T; label: string };

/**
 * Single-select sort control shared by the Media tab and the Smart Selects
 * filter bar, so both stay visually and behaviourally consistent: a compact
 * "Sort: <label>" trigger opens a small radio-style menu. Picking an option
 * applies it and closes the menu immediately — there's no "Clear" affordance
 * since a sort always has a value (unlike the multi-select filter dropdowns).
 */
export function SortDropdown<T extends string>({
  value,
  options,
  onChange,
  className,
  align = "right",
}: {
  value: T;
  options: SortOption<T>[];
  onChange: (next: T) => void;
  className?: string;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = options.find((o) => o.value === value);

  return (
    <div ref={ref} className={`relative shrink-0 ${className ?? ""}`}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
        className="brand-focus inline-flex items-center gap-1.5 rounded-md border border-[var(--color-brand-border)] bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)]"
      >
        Sort: {current?.label ?? ""}
        <IconCaretDown size={12} className="opacity-60" />
      </button>
      {open && (
        <div
          role="listbox"
          className={`dash-rise absolute z-30 mt-1.5 w-[172px] overflow-hidden rounded-xl border border-[var(--color-brand-border)] bg-white p-1 shadow-[0_14px_44px_rgba(42,34,24,0.18)] ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={value === opt.value}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className="brand-focus flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-[var(--color-brand-hover)]"
            >
              <span
                className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border transition-colors ${
                  value === opt.value
                    ? "border-[var(--color-brand-navy)] bg-[var(--color-brand-navy)] text-white"
                    : "border-[var(--color-brand-outline)] bg-white text-transparent"
                }`}
              >
                <IconCheck size={12} />
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--color-brand-ink)]">
                {opt.label}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
