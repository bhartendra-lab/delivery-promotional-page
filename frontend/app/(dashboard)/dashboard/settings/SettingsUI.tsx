"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  IconBuilding,
  IconGlobe,
  IconImage,
  IconShareNetwork,
  IconCopy,
  IconSave,
  IconWarningCircle,
  IconCheck,
  IconUser,
  IconArchive,
  IconOpen,
} from "@/components/ui/icons";

/**
 * Shared presentational primitives for the sectioned Settings area.
 * Extracted from the original single-page settings form so every section
 * route renders identical cards, fields and the per-section save bar.
 */

export type SaveState = "idle" | "saving" | "saved" | "error";

// Lives in components/ui/ (not a settings-route file) so non-settings
// consumers — the onboarding wizard's Google Business step — don't have to
// import across route boundaries. Re-exported here so every existing
// settings import site keeps working unchanged.
export { AddressField } from "@/components/ui/AddressField";

/**
 * Read-only display for a value the user shouldn't hand-edit but does need to
 * grab — the Google Place ID once `AddressField` has resolved one. Shown as a
 * monospace chip with a one-tap copy button, styled to sit next to `Field`s.
 */
export function CopyableIdField({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — the ID is still
      // visible and selectable by hand, so this is a silent no-op.
    }
  }

  return (
    <div className={className}>
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-muted)]">
        {label}
      </span>
      <div className="flex h-10 items-center gap-1.5 rounded-lg border border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] pl-3 pr-1.5">
        <code className="flex-1 truncate font-mono text-[13px] text-[var(--color-brand-ink)]">{value}</code>
        <button
          type="button"
          onClick={handleCopy}
          className="brand-focus inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-semibold text-[var(--color-brand-navy)] transition-colors hover:bg-[var(--color-brand-navy-soft)]"
        >
          {copied ? (
            <>
              <CheckIcon className="h-3.5 w-3.5 text-[var(--color-brand-success)]" />
              Copied
            </>
          ) : (
            <>
              <CopyIcon className="h-3.5 w-3.5" />
              Copy
            </>
          )}
        </button>
      </div>
    </div>
  );
}

/** True when a trimmed input differs from its persisted value. Trims both
 *  sides — a stored value carrying leading/trailing whitespace would
 *  otherwise never be able to report clean again. */
export function changed(next: string, prev: string | undefined) {
  return next.trim() !== (prev ?? "").trim();
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
    <div className="rounded-xl border border-[var(--color-brand-border)] bg-[var(--color-brand-surface-raised)] p-5 shadow-[0_1px_3px_rgba(42,34,24,0.08)]">
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

/**
 * Generic "same as X" toggle — checking it copies a source value in and
 * locks the field (read-only, not disabled, so it still submits);
 * unchecking hands control back without discarding what was typed. Used by
 * Studio Identity's business email ("Same as login email") and
 * `BillingDetailsForm` ("Same as Studio details").
 */
export function SameAsCheckbox({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Shown, not hidden, when the shortcut's source data isn't available — a
   *  visibly disabled control with an explanation tells the user why. */
  disabled?: boolean;
}) {
  return (
    <label
      aria-disabled={disabled}
      className={`mt-1.5 flex items-center gap-1.5 text-xs text-[var(--color-brand-muted)] ${
        disabled ? "cursor-not-allowed opacity-60" : ""
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 rounded border-[var(--color-brand-border)] text-[var(--color-brand-navy)] accent-[var(--color-brand-navy)]"
      />
      {label}
    </label>
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
  readOnly = false,
  hint,
  maxLength,
  error,
  onBlur,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: string;
  className?: string;
  /** Locked but still submitted — used by "same as" shortcuts. */
  readOnly?: boolean;
  hint?: string;
  maxLength?: number;
  /** Field-level validation message. Renders in place of `hint` and marks
   *  the input aria-invalid — for a problem native constraint validation
   *  either can't express (whitespace-only content) or that this codebase
   *  is deliberately handling itself instead of a native bubble (see the
   *  website field), so the explanation stays in-flow instead of anchoring
   *  to a spot that can be scrolled off-screen. */
  error?: string;
  onBlur?: () => void;
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
        onBlur={onBlur}
        placeholder={placeholder}
        required={required}
        readOnly={readOnly}
        maxLength={maxLength}
        aria-invalid={!!error}
        className={`brand-focus h-10 w-full rounded-lg border px-3 text-sm text-[var(--color-brand-ink)] outline-none placeholder:text-[var(--color-brand-muted)]/60 focus:border-[var(--color-brand-outline)] ${
          error ? "border-[var(--color-brand-danger)]" : "border-[var(--color-brand-border)]"
        } ${readOnly ? "cursor-default bg-[var(--color-brand-border)]/25 text-[var(--color-brand-muted)]" : "bg-[var(--color-brand-bg)]"}`}
      />
      {error ? (
        <span role="alert" className="mt-1 block text-xs text-[var(--color-brand-danger)]">
          {error}
        </span>
      ) : (
        hint && <span className="mt-1 block text-xs text-[var(--color-brand-muted)]">{hint}</span>
      )}
    </label>
  );
}

/**
 * India-only (+91) phone number input. Strips non-digits and caps at 10 as
 * the user types; the +91 prefix is a fixed, non-editable chip rather than
 * part of the value, so `onChange` always receives bare digits (0-10 long).
 * Shared by the WhatsApp number change flow (OTP-gated) and Personal
 * Information's own-record contact field (no verification) — the INPUT
 * contract is identical between them; only the surrounding verification UI
 * differs, and stays owned by each call site.
 */
export function PhoneField({
  label,
  value,
  onChange,
  placeholder = "98765 43210",
  required,
  className = "",
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
  hint?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-muted)]">
        {label}
        {required && <span className="ml-1 text-[var(--color-brand-danger)]">*</span>}
      </span>
      <div className="flex h-10 items-center rounded-lg border border-[var(--color-brand-border)] bg-[var(--color-brand-bg)]">
        <span className="flex h-full items-center border-r border-[var(--color-brand-border)] px-3 text-sm font-medium text-[var(--color-brand-muted)]">
          +91
        </span>
        <input
          type="tel"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 10))}
          maxLength={10}
          required={required}
          placeholder={placeholder}
          className="brand-focus h-full flex-1 bg-transparent px-3 text-sm text-[var(--color-brand-ink)] outline-none placeholder:text-[var(--color-brand-muted)]/60"
        />
      </div>
      {hint && <span className="mt-1 block text-xs text-[var(--color-brand-muted)]">{hint}</span>}
    </label>
  );
}

/**
 * Extracts the bare 10-digit national number from a stored phone value, only
 * when it unambiguously is one: bare 10 digits, or the canonical
 * `91`-prefixed 12-digit form every write path in this codebase normalizes
 * to (see `normalizePhoneNumber` in the backend's whatsapp.utils.js — its
 * output is also relied on elsewhere, e.g. public wa.me links, so it is NOT
 * being changed to bare-10 here). Anything else (wrong length, a genuinely
 * different country code) returns null rather than guessing — slicing the
 * last 10 digits of a longer/foreign number would fabricate a number that
 * was never entered. This is the one function on the frontend that knows
 * this storage shape; every other comparison against a stored
 * `whatsapp_number` should go through it rather than re-deriving digits.
 */
export function extractIndianNational(raw: string | undefined): string | null {
  const digits = (raw ?? "").trim().replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  return null;
}

function formatIndianMobile(raw: string | undefined): string | null {
  const national = extractIndianNational(raw);
  return national ? `+91 ${national.slice(0, 5)} ${national.slice(5)}` : null;
}

/**
 * Read-only display of the studio's one, OTP-verified phone number. Never
 * part of the Studio Identity form's dirty-check or save payload — changing
 * it goes through its own OTP-gated flow (ChangeWhatsappModal), not
 * updateCompanyDetails.
 */
export function VerifiedWhatsappField({
  whatsappNumber,
  verified,
  onChangeClick,
}: {
  whatsappNumber?: string;
  verified?: boolean;
  onChangeClick: () => void;
}) {
  const raw = (whatsappNumber ?? "").trim();
  const hasValue = raw.length > 0;
  const formatted = formatIndianMobile(raw);
  // A value is stored but doesn't parse as an Indian mobile number — legacy
  // data from before normalization, or something else entirely. Show it
  // as-is with a warning, never silently as "Not set yet" (it isn't empty)
  // and never reformatted into a number that was never entered.
  const unrecognised = hasValue && !formatted;

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-muted)]">
          WhatsApp number
        </span>
        <button
          type="button"
          onClick={onChangeClick}
          className="brand-focus text-sm font-semibold text-[var(--color-brand-navy)] underline-offset-2 hover:underline"
        >
          {hasValue ? "Change number" : "Add & verify"}
        </button>
      </div>
      <div className="flex h-10 cursor-default items-center justify-between gap-3 rounded-lg border border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] px-3">
        {formatted ? (
          <span className="text-sm text-[var(--color-brand-ink)]">{formatted}</span>
        ) : hasValue ? (
          <span className="truncate text-sm text-[var(--color-brand-ink)]">{raw}</span>
        ) : (
          <span className="flex items-center gap-2 text-sm text-[var(--color-brand-muted)]">
            <span>—</span>
            <span className="text-xs">Not set yet</span>
          </span>
        )}
        {hasValue &&
          (verified ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--color-brand-success)]/10 px-2 py-0.5 text-[11px] font-semibold text-[var(--color-brand-success)]">
              <CheckIcon className="h-3 w-3" />
              Verified
            </span>
          ) : (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--color-brand-warning-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-brand-warning)]">
              <AlertIcon className="h-3 w-3" />
              Not verified
            </span>
          ))}
      </div>
      {unrecognised ? (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-[var(--color-brand-warning)]">
          <AlertIcon className="h-3 w-3 shrink-0" />
          Unrecognised format — re-add your number.
        </p>
      ) : hasValue ? (
        <p className="mt-1.5 text-xs text-[var(--color-brand-muted)]">
          Delivery notifications, OTPs and client replies all go to this number.
        </p>
      ) : (
        <p className="mt-1.5 text-xs text-[var(--color-brand-muted)]">
          Add a number to receive delivery notifications, OTPs and client replies.
        </p>
      )}
    </div>
  );
}

/**
 * Read-only display of the studio's business email — mirrors
 * `VerifiedWhatsappField`. Never part of the Studio Identity form's
 * dirty-check or save payload — it can only change through the OTP-gated
 * verify modal (`ChangeBusinessEmailModal`), not `updateCompanyDetails`.
 */
export function VerifiedBusinessEmailField({
  businessEmail,
  verified,
  onActionClick,
}: {
  businessEmail?: string;
  verified?: boolean;
  onActionClick: () => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-muted)]">
          Business email
        </span>
        <button
          type="button"
          onClick={onActionClick}
          className="brand-focus text-sm font-semibold text-[var(--color-brand-navy)] underline-offset-2 hover:underline"
        >
          {businessEmail ? "Change email" : "Add & verify"}
        </button>
      </div>
      <div className="flex h-10 cursor-default items-center justify-between gap-3 rounded-lg border border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] px-3">
        {businessEmail ? (
          <span className="truncate text-sm text-[var(--color-brand-ink)]">{businessEmail}</span>
        ) : (
          <span className="flex items-center gap-2 text-sm text-[var(--color-brand-muted)]">
            <span>—</span>
            <span className="text-xs">Not set yet</span>
          </span>
        )}
        {businessEmail &&
          (verified ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--color-brand-success)]/10 px-2 py-0.5 text-[11px] font-semibold text-[var(--color-brand-success)]">
              <CheckIcon className="h-3 w-3" />
              Verified
            </span>
          ) : (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--color-brand-warning-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-brand-warning)]">
              <AlertIcon className="h-3 w-3" />
              Not verified
            </span>
          ))}
      </div>
    </div>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder = "Select…",
  required,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-muted)]">
        {label}
        {required && <span className="ml-1 text-[var(--color-brand-danger)]">*</span>}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="brand-focus h-10 w-full rounded-lg border border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] px-3 text-sm text-[var(--color-brand-ink)] outline-none focus:border-[var(--color-brand-outline)]"
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * DOM id of the anchor mounted at the top of the settings content column
 * (see `SettingsChrome` in layout.tsx). `SaveBar` portals into it so the bar
 * sits in normal flow there instead of in the section form's own document
 * position — `position: sticky; top: 0` then pins it under the Topbar as
 * the user scrolls. Scoped to the content column (not the full `<main>`
 * width) so it never overlaps the settings nav aside, which has its own
 * independent `lg:sticky lg:top-8`.
 */
export const SECTION_SAVE_BAR_ROOT_ID = "settings-section-save-bar-root";

/**
 * Per-section save bar. Portals into `SECTION_SAVE_BAR_ROOT_ID` so it pins
 * to the top of the settings content column while scrolling — scoped to
 * whichever section's form is currently mounted, since each section's own
 * page instance renders and unmounts it independently.
 *
 * Only visible while there's something to react to: unsaved changes
 * (`dirty`), or a save in flight/just resolved. Idle + clean renders
 * nothing, so it disappears the moment a save lands or an edit is reverted.
 *
 * The button submits via the `form` attribute (not DOM nesting) since the
 * portal moves it outside the section's actual <form> element.
 */
export function SaveBar({
  saveState,
  errorMsg,
  canSave,
  dirty,
  formId,
  idleHint = "Changes apply to all delivery pages immediately.",
  blockedReason,
}: {
  saveState: SaveState;
  errorMsg: string | null;
  canSave: boolean;
  /** Whether the section's fields currently differ from their saved values. */
  dirty: boolean;
  /** id of the section's <form> — the button submits it via the `form` attribute. */
  formId: string;
  idleHint?: string;
  /** Shown instead of idleHint while idle and dirty but `canSave` is false —
   *  e.g. a required field that's present but invalid (whitespace-only
   *  name, malformed website). Without this, the bar just shows a
   *  permanently disabled button with no indication why. Ignored once a
   *  real save error or the "saved" flash takes over. */
  blockedReason?: string | null;
}) {
  // Lazy initializer (not an effect): the anchor is already in the DOM by
  // the time this component's first client render runs, whether that's
  // hydration of server-rendered HTML or a client-side route change within
  // the persistent settings layout.
  const [root] = useState<HTMLElement | null>(() =>
    typeof document === "undefined" ? null : document.getElementById(SECTION_SAVE_BAR_ROOT_ID),
  );

  const visible = dirty || saveState !== "idle";
  if (!visible || !root) return null;

  return createPortal(
    <div className="toast-rise sticky top-0 z-30 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-brand-border)] bg-[var(--color-brand-surface)] px-5 py-4 shadow-[0_8px_24px_rgba(42,34,24,0.14)]">
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
      ) : blockedReason ? (
        <p className="flex items-center gap-2 text-sm text-[var(--color-brand-danger)]">
          <AlertIcon className="h-4 w-4 shrink-0" />
          {blockedReason}
        </p>
      ) : (
        <p className="text-sm text-[var(--color-brand-muted)]">{idleHint}</p>
      )}

      <button
        type="submit"
        form={formId}
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
    </div>,
    root,
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
  return <IconBuilding size={15} />;
}

export function GlobeIcon() {
  return <IconGlobe size={15} />;
}

export function ImageIcon() {
  return <IconImage size={15} />;
}

export function ShareIcon() {
  return <IconShareNetwork size={15} />;
}

export function UserIcon() {
  return <IconUser size={15} />;
}

export function StorageIcon() {
  return <IconArchive size={15} />;
}

export function OpenIcon({ className }: { className?: string }) {
  return <IconOpen className={className} />;
}

// NOTE: unused anywhere (SettingsNav renders plain text labels, no icons) —
// left as-is pending the A6 dead-code sweep rather than migrated in place.
export function WatermarkIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="18" height="18" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M14 14h4v4h-4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="8.5" cy="8.5" r="1.6" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function CopyIcon({ className }: { className?: string }) {
  return <IconCopy className={className} />;
}

export function SaveIcon({ className }: { className?: string }) {
  return <IconSave className={className} />;
}

export function AlertIcon({ className }: { className?: string }) {
  return <IconWarningCircle className={className} />;
}

export function CheckIcon({ className }: { className?: string }) {
  return <IconCheck className={className} />;
}

export function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
