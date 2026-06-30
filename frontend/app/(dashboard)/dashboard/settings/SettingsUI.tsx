"use client";

/**
 * Shared presentational primitives for the sectioned Settings area.
 * Extracted from the original single-page settings form so every section
 * route renders identical cards, fields and the per-section save bar.
 */

export type SaveState = "idle" | "saving" | "saved" | "error";

/** True when a trimmed input differs from its persisted value. */
export function changed(next: string, prev: string | undefined) {
  return next.trim() !== (prev ?? "");
}

export function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-brand-muted)]">
        {eyebrow}
      </p>
      <h1 className="mt-1.5 text-3xl font-bold text-[var(--color-brand-ink)]">{title}</h1>
      <p className="mt-1 text-sm text-[var(--color-brand-muted)]">{description}</p>
    </div>
  );
}

export function Card({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[var(--color-brand-border)] bg-[var(--color-brand-surface)] p-5 shadow-[0_1px_3px_rgba(42,34,24,0.08)]">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--color-brand-navy-soft)] text-[var(--color-brand-navy)]">
          {icon}
        </span>
        <h2 className="text-sm font-semibold text-[var(--color-brand-ink)]">{title}</h2>
      </div>
      {children}
    </div>
  );
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
  type = "text",
  className = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: string;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-muted)]">
        {label}
        {required && <span className="ml-1 text-[var(--color-brand-danger)]">*</span>}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="brand-focus h-10 w-full rounded-lg border border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] px-3 text-sm text-[var(--color-brand-ink)] outline-none placeholder:text-[var(--color-brand-muted)]/60 focus:border-[var(--color-brand-outline)]"
      />
    </label>
  );
}

/**
 * Per-section save bar. Rendered inside each section's <form>; the button is
 * a submit, so it drives the form's onSubmit. `idleHint` is the resting copy.
 */
export function SaveBar({
  saveState,
  errorMsg,
  canSave,
  idleHint = "Changes apply to all delivery pages immediately.",
}: {
  saveState: SaveState;
  errorMsg: string | null;
  canSave: boolean;
  idleHint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-[var(--color-brand-border)] bg-[var(--color-brand-surface)] px-5 py-4">
      {saveState === "error" && errorMsg ? (
        <p className="flex items-center gap-2 text-sm text-[var(--color-brand-danger)]">
          <AlertIcon className="h-4 w-4 shrink-0" />
          {errorMsg}
        </p>
      ) : saveState === "saved" ? (
        <p className="flex items-center gap-2 text-sm text-[var(--color-brand-success)]">
          <CheckIcon className="h-4 w-4 shrink-0" />
          Changes saved
        </p>
      ) : (
        <p className="text-sm text-[var(--color-brand-muted)]">{idleHint}</p>
      )}

      <button
        type="submit"
        disabled={saveState === "saving" || !canSave}
        className="brand-focus inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-[var(--color-brand-navy)] px-5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {saveState === "saving" ? (
          <>
            <Spinner />
            Saving…
          </>
        ) : (
          <>
            <SaveIcon className="h-4 w-4" />
            Save changes
          </>
        )}
      </button>
    </div>
  );
}

export function SectionSkeleton() {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="skeleton h-3 w-12 rounded" />
        <div className="skeleton h-8 w-48 rounded-lg" />
        <div className="skeleton h-4 w-72 rounded" />
      </div>
      {[1, 2].map((i) => (
        <div key={i} className="skeleton h-44 rounded-xl" />
      ))}
    </div>
  );
}

export function FetchError({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-[var(--color-brand-danger)]/30 bg-[var(--color-brand-danger-soft)] p-4 text-sm text-[var(--color-brand-danger)]">
      <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

/* ── icons ──────────────────────────────────────────────────────── */

export function BuildingIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 9h18M9 21V9M15 21V9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function GlobeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function ImageIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="18" height="18" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="8.5" cy="8.5" r="1.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M21 15l-5-5L5 21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ShareIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <circle cx="6" cy="12" r="2.4" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="17" cy="6" r="2.4" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="17" cy="18" r="2.4" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8.1 10.9l6.8-3.8M8.1 13.1l6.8 3.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function WatermarkIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="18" height="18" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M14 14h4v4h-4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="8.5" cy="8.5" r="1.6" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function SaveIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M17 21v-8H7v8M7 3v5h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AlertIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 8v5M12 16.5v.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
