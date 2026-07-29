"use client";

import { useEffect, useRef, useState } from "react";
import { IconMinus, IconPlus } from "@/components/ui/icons";

const PRESETS = [1, 5, 10, 25];
const MAX_QTY = 100;

export function EventQuantity({
  quantity,
  onChange,
}: {
  quantity: number;
  onChange: (qty: number) => void;
}) {
  const [draft, setDraft] = useState(String(quantity));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(String(quantity));
  }, [quantity]);

  function commit(raw: string) {
    const parsed = Math.round(Number(raw));
    const clamped = Number.isFinite(parsed) ? Math.min(MAX_QTY, Math.max(1, parsed)) : quantity;
    onChange(clamped);
    setDraft(String(clamped));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Quick quantities">
        {PRESETS.map((p) => {
          const selected = p === quantity;
          return (
            <button
              key={p}
              type="button"
              onClick={() => {
                onChange(p);
                setDraft(String(p));
              }}
              className={`brand-focus min-h-11 rounded-full px-4 text-sm font-semibold transition-colors ${
                selected
                  ? "bg-[var(--color-brand-navy)] text-white"
                  : "border border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] text-[var(--color-brand-ink)]"
              }`}
            >
              {p}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Decrease quantity"
          onClick={() => commit(String(quantity - 1))}
          className="brand-focus inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--color-brand-border)] text-[var(--color-brand-ink)]"
        >
          <IconMinus size={16} />
        </button>
        <input
          type="text"
          inputMode="numeric"
          value={draft}
          onFocus={() => {
            focused.current = true;
          }}
          onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
          onBlur={(e) => {
            focused.current = false;
            commit(e.target.value);
          }}
          aria-label="Number of events"
          className="brand-focus h-11 w-20 rounded-xl border border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] text-center text-lg font-bold tabular-nums text-[var(--color-brand-ink)]"
        />
        <button
          type="button"
          aria-label="Increase quantity"
          onClick={() => commit(String(quantity + 1))}
          className="brand-focus inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--color-brand-border)] text-[var(--color-brand-ink)]"
        >
          <IconPlus size={16} />
        </button>
      </div>
    </div>
  );
}
