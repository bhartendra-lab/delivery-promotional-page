"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  label: string;
  value: number;
  hint?: string;
  /**
   * Richer mockup sublabel (e.g. "Indore · Jaipur +4"). Optional and, when
   * present, replaces `hint`. Not populated yet — needs the backend aggregates
   * endpoint (see StatsBar TODO).
   */
  subLabel?: string;
  /** Unused — kept for API compatibility */
  icon?: React.ReactNode;
  /** Unused — kept for API compatibility */
  tone?: string;
  delta?: { value: number; label: string } | null;
};

export function StatCard({ label, value, hint, subLabel, delta }: Props) {
  const display = useCountUp(value);
  const sub = subLabel ?? hint;

  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-muted)]">
        {label}
      </p>
      <p className="mt-1.5 text-3xl font-bold tabular-nums text-[var(--color-brand-ink)]">
        {display.toLocaleString()}
      </p>
      {sub && (
        <p className="mt-1 text-xs text-[var(--color-brand-muted)]">{sub}</p>
      )}
      {delta && (
        <p className="mt-1 text-xs">
          <span
            className="font-medium"
            style={{
              color: delta.value >= 0 ? "var(--color-brand-success)" : "var(--color-brand-danger)",
            }}
          >
            {delta.value >= 0 ? "↑" : "↓"} {Math.abs(delta.value)}%
          </span>
          <span className="ml-1 text-[var(--color-brand-muted)]">{delta.label}</span>
        </p>
      )}
    </div>
  );
}

function useCountUp(target: number, duration = 600): number {
  const [val, setVal] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(Math.round(from + (target - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return val;
}
