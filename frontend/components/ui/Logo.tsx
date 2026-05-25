"use client";

type Props = {
  /** Height in px — width scales automatically (logo is ~2:1 ratio). */
  size?: number;
  /** Unused — kept for API compatibility; logo is always the full lockup. */
  withWordmark?: boolean;
  /** Render on a dark surface: applies CSS filter to show in white. */
  onDark?: boolean;
  className?: string;
  /** Unused — kept for API compatibility. */
  primary?: string;
  secondary?: string;
};

export function Logo({ size = 40, onDark = false, className }: Props) {
  return (
    <span
      className={`inline-flex items-center ${className ?? ""}`}
      aria-label="vyavasth"
    >
      {/* TODO: replace with updated logo asset when new brand files are ready */}
      <img
        src="/vyavasth-full-logo.svg"
        alt="vyavasth"
        height={size}
        width={size * 2}
        style={onDark ? { filter: "brightness(0) invert(1)" } : undefined}
        draggable={false}
      />
    </span>
  );
}
