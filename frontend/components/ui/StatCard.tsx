"use client";

import { useEffect, useRef, useState } from "react";

type Tone = "navy" | "gold" | "success" | "warning";

const TONE_STYLES: Record<
  Tone,
  { iconBg: string; iconFg: string; ring: string; accent: string }
> = {
  navy: {
    iconBg: "var(--color-brand-navy-soft)",
    iconFg: "var(--color-brand-navy)",
    ring: "rgba(15, 45, 92, 0.08)",
    accent: "var(--color-brand-navy)",
  },
  gold: {
    iconBg: "var(--color-brand-gold-soft)",
    iconFg: "var(--color-brand-gold-deep)",
    ring: "rgba(212, 175, 99, 0.18)",
    accent: "var(--color-brand-gold)",
  },
  success: {
    iconBg: "var(--color-brand-success-soft)",
    iconFg: "var(--color-brand-success)",
    ring: "rgba(46, 125, 50, 0.1)",
    accent: "var(--color-brand-success)",
  },
  warning: {
    iconBg: "var(--color-brand-warning-soft)",
    iconFg: "var(--color-brand-warning)",
    ring: "rgba(184, 134, 11, 0.12)",
    accent: "var(--color-brand-warning)",
  },
};

type Props = {
  label: string;
  value: number;
  hint?: string;
  icon?: React.ReactNode;
  tone?: Tone;
  delta?: { value: number; label: string } | null;
};

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "navy",
  delta,
}: Props) {
  const display = useCountUp(value);
  const styles = TONE_STYLES[tone];

  return (
    <div
      className="group relative overflow-hidden rounded-2xl border border-[var(--color-brand-border)] bg-white p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-[var(--color-brand-outline)] hover:shadow-[0_12px_30px_-15px_rgba(15,45,92,0.25)]"
    >
      {/* Subtle accent corner */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{ background: styles.ring }}
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-brand-muted)]">
            {label}
          </p>
          <p
            className="mt-2 text-3xl font-semibold tabular-nums text-[var(--color-brand-ink)]"
            style={{ fontFamily: "var(--font-cormorant)" }}
          >
            {display.toLocaleString()}
          </p>
          {hint && (
            <p className="mt-1 text-xs text-[var(--color-brand-muted)]">{hint}</p>
          )}
        </div>

        {icon && (
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
            style={{ background: styles.iconBg, color: styles.iconFg }}
          >
            {icon}
          </div>
        )}
      </div>

      {delta && (
        <div className="relative mt-4 flex items-center gap-1.5 text-xs">
          <span
            className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-medium"
            style={{
              background:
                delta.value >= 0
                  ? "var(--color-brand-success-soft)"
                  : "var(--color-brand-danger-soft)",
              color:
                delta.value >= 0
                  ? "var(--color-brand-success)"
                  : "var(--color-brand-danger)",
            }}
          >
            {delta.value >= 0 ? "↑" : "↓"} {Math.abs(delta.value)}%
          </span>
          <span className="text-[var(--color-brand-muted)]">{delta.label}</span>
        </div>
      )}

      {/* Bottom accent bar */}
      <span
        aria-hidden
        className="absolute inset-x-5 bottom-0 h-[3px] origin-left scale-x-0 rounded-t-full transition-transform duration-300 group-hover:scale-x-100"
        style={{ background: styles.accent }}
      />
    </div>
  );
}

function useCountUp(target: number, duration = 700): number {
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
