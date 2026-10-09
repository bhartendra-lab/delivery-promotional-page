"use client";

/**
 * The India-only (+91) phone control: a fixed, non-editable +91 chip and a
 * digits-only input capped at ten. `onChange` always receives bare digits
 * (0 to 10 long), never the prefix.
 *
 * The bare control, with no label of its own, so each caller owns its label,
 * hint and error line: Settings wraps it in a labelled field, and the "Add new
 * event" modal puts several in a row per person.
 */
export function PhoneInput({
  id,
  value,
  onChange,
  placeholder = "98765 43210",
  required,
  disabled,
  invalid,
  autoComplete,
  className = "",
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
}: {
  id?: string;
  value: string;
  onChange: (digits: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  /** Marks the field as failing validation (border and `aria-invalid`). */
  invalid?: boolean;
  autoComplete?: string;
  /** Extra classes for the outer box (layout only). */
  className?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
}) {
  return (
    <div
      className={`flex h-10 items-center rounded-field border bg-[var(--color-brand-surface-raised)] ${
        invalid ? "border-[var(--color-brand-danger)]" : "border-[var(--color-brand-border)]"
      } ${className}`}
    >
      <span className="flex h-full items-center border-r border-[var(--color-brand-border)] px-3 text-sm font-medium text-[var(--color-brand-muted)]">
        +91
      </span>
      <input
        id={id}
        type="tel"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 10))}
        maxLength={10}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        aria-describedby={ariaDescribedBy}
        className="brand-focus h-full min-w-0 flex-1 bg-transparent px-3 text-sm text-[var(--color-brand-ink)] outline-none placeholder:text-[var(--color-brand-muted)]/60 disabled:cursor-not-allowed disabled:opacity-60"
      />
    </div>
  );
}
