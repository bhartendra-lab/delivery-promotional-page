"use client";

/**
 * Accessible on/off switch. The app's other boolean settings are `aria-pressed`
 * chips, but a preference row wants a switch — the state has to read at a
 * glance from across the row, without parsing a label. Built as a `<button
 * role="switch">` rather than a checkbox: the switch role is the correct
 * semantic for an immediately-applied binary setting, and a real button gives
 * us Space + Enter activation for free (no key handlers of our own).
 */
export function ToggleSwitch({
  checked,
  onChange,
  disabled = false,
  label,
  describedById,
  id,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** Accessible name — the visible row label lives outside this component. */
  label: string;
  /** Id of the element describing the setting (wired to `aria-describedby`). */
  describedById?: string;
  id?: string;
}) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-describedby={describedById}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`brand-focus relative inline-flex h-[24px] w-[44px] shrink-0 items-center rounded-full border border-transparent p-[2px] transition-colors ${
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
      }`}
      style={{
        background: checked ? "var(--color-brand-navy)" : "var(--color-brand-outline)",
      }}
    >
      <span
        aria-hidden
        className="h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_3px_rgba(42,34,24,0.28)]"
        style={{
          // Transform (not `margin-left`) so the knob slides on the compositor,
          // matching the app's other motion. No overshoot — a settings toggle
          // shouldn't bounce.
          transform: checked ? "translateX(20px)" : "translateX(0)",
          transition: "transform 160ms ease",
        }}
      />
    </button>
  );
}
