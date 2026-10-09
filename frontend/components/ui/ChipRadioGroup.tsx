"use client";

import { useRef } from "react";
import { IconCheck } from "@/components/ui/icons";

export type ChipOption<T extends string> = {
  value: T;
  label: string;
  /** Extra classes for this chip alone (e.g. spanning two grid columns). */
  className?: string;
};

/**
 * A single-choice set of chips: the dashboard's "pick one" control for a
 * handful of short options (event type, event expiry).
 *
 * A real radio group to assistive tech and to the keyboard: `role="radiogroup"`
 * with `aria-checked` on each chip, one tab stop for the whole set, and the
 * arrow keys moving both focus and the choice, as native radios do. Home and
 * End jump to the ends. Nothing is selected until the Studio chooses, so the
 * first chip holds the tab stop until then.
 *
 * The LAYOUT is the caller's (`className` on the group, and per-chip classes):
 * the two uses want different grids at different widths.
 */
export function ChipRadioGroup<T extends string>({
  id,
  label,
  labelledBy,
  options,
  value,
  onChange,
  disabled,
  invalid,
  describedBy,
  className = "",
}: {
  id?: string;
  /** Accessible name, when there is no visible label to point `labelledBy` at. */
  label?: string;
  labelledBy?: string;
  options: ReadonlyArray<ChipOption<T>>;
  value: T | null;
  onChange: (value: T) => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  className?: string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = options.findIndex((o) => o.value === value);
  const tabStop = selectedIndex >= 0 ? selectedIndex : 0;

  const move = (index: number) => {
    const next = (index + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      move(index + 1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      move(index - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      move(0);
    } else if (e.key === "End") {
      e.preventDefault();
      move(options.length - 1);
    }
  };

  return (
    <div
      id={id}
      role="radiogroup"
      aria-label={label}
      aria-labelledby={labelledBy}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      // Focusable programmatically only: an invalid, unanswered group is where
      // the form sends focus, and a chip inside it would read as a choice.
      tabIndex={-1}
      className={`outline-none ${className}`}
    >
      {options.map((option, index) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={index === tabStop ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={`brand-focus inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-10 ${
              active
                ? "border border-[var(--color-brand-navy)] bg-[var(--color-brand-navy-soft)] font-semibold text-[var(--color-brand-navy)]"
                : `border bg-white font-medium text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)] ${
                    invalid ? "border-[var(--color-brand-danger)]/60" : "border-[var(--color-brand-border)]"
                  }`
            } ${option.className ?? ""}`}
          >
            {active && <IconCheck size={13} weight="bold" />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
