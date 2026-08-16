"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  IconBuilding,
  IconGlobe,
  IconImage,
  IconShareNetwork,
  IconCopy,
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
 *
 * Row layout (label left) is for wide, scannable, read-mostly configuration
 * surfaces — Settings sections and per-event config tabs. It needs ≥900px of
 * container width to avoid a cramped label column.
 *
 * Stacked layout (label above) stays the default for modals, wizards, auth
 * screens and narrow panels — there is no room for a 200px label column, and
 * those surfaces are linear (one decision at a time) rather than scannable.
 *
 * Every primitive defaults to `stacked`. Row is always opt-in at the call site.
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
  layout = "stacked",
  helper,
}: {
  label: string;
  value: string;
  className?: string;
  /** See `Field`'s `layout` prop — same contract. */
  layout?: "stacked" | "row";
  /** Extra content below the field — in row layout, sits in the right
   *  column under the value box (same slot `Field`'s hint/error occupy). */
  helper?: React.ReactNode;
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

  const isRow = layout === "row";
  return (
    <div
      className={`${isRow ? "lg:grid lg:grid-cols-[200px_minmax(0,440px)] lg:items-start lg:gap-x-6" : ""} ${className}`}
    >
      <span
        className={`mb-1.5 block text-[13px] font-medium text-[var(--color-brand-ink)] ${isRow ? "lg:col-start-1 lg:row-start-1 lg:mb-0 lg:pt-2.5" : ""
          }`}
      >
        {label}
      </span>
      <div
        className={`flex h-10 items-center gap-1.5 rounded-field border border-[var(--color-brand-border)] bg-[var(--color-brand-surface-raised)] pl-3 pr-1.5 ${isRow ? "lg:col-start-2 lg:row-start-1" : ""
          }`}
      >
        <code className="flex-1 truncate font-mono text-[13px] text-[var(--color-brand-ink)]">{value}</code>
        <button
          type="button"
          onClick={handleCopy}
          className="brand-focus inline-flex h-7 shrink-0 items-center gap-1 rounded-field px-2 text-xs font-semibold text-[var(--color-brand-navy)] transition-colors hover:bg-[var(--color-brand-navy-soft)]"
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
      {helper && <div className={isRow ? "lg:col-start-2 lg:row-start-2" : ""}>{helper}</div>}
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
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-[-0.01em] text-[var(--color-brand-ink)] sm:text-[28px]">{title}</h1>
      <p className="mt-1.5 text-sm text-[var(--color-brand-muted)]">{description}</p>
    </div>
  );
}

export function Card({
  title,
  description,
  icon,
  padded = true,
  className = "",
  children,
}: {
  /** Every settings card carries a title + icon for a consistent header
   *  across sections — including a page with only one card (see Personal
   *  Information's "Your details"). Omit only for a genuinely headerless
   *  card, e.g. a per-item tile in a grid (watermark presets), where a
   *  repeated heading on every tile would be noise rather than wayfinding. */
  title?: string;
  /** Optional sub-line below the title. Ignored when `title` is absent. */
  description?: string;
  icon?: React.ReactNode;
  /** False for a card that manages its own internal padding — e.g. a
   *  watermark preset tile, whose preview image runs full-bleed to the
   *  card's edges above a padded footer. */
  padded?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`overflow-hidden rounded-card border border-[var(--color-brand-border)] bg-[var(--color-brand-surface-raised)] shadow-[0_1px_3px_rgba(42,34,24,0.08)] ${
        padded ? "p-5 sm:p-8" : ""
      } ${className}`}
    >
      {title && (
        <div className={`mb-5 flex gap-3 ${description ? "items-start" : "items-center"}`}>
          {icon && (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-field bg-[var(--color-brand-navy-soft)] text-[var(--color-brand-navy)]">
              {icon}
            </span>
          )}
          <div>
            <h2 className="text-[15px] font-semibold text-[var(--color-brand-ink)]">{title}</h2>
            {description && (
              <p className="mt-0.5 text-[13px] text-[var(--color-brand-muted)]">{description}</p>
            )}
          </div>
        </div>
      )}
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
  layout = "stacked",
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Shown, not hidden, when the shortcut's source data isn't available — a
   *  visibly disabled control with an explanation tells the user why. */
  disabled?: boolean;
  /** "row" aligns the checkbox+label under the control column of whatever
   *  row-layout field follows it, rather than spanning the full width — see
   *  the layout-variant note atop this file. Defaults to "stacked" so every
   *  existing call site renders unchanged. */
  layout?: "stacked" | "row";
}) {
  const isRow = layout === "row";
  return (
    <div className={isRow ? "lg:grid lg:grid-cols-[200px_minmax(0,440px)] lg:gap-x-6" : ""}>
      <label
        aria-disabled={disabled}
        className={`mt-1.5 flex items-center gap-1.5 text-xs text-[var(--color-brand-muted)] ${disabled ? "cursor-not-allowed opacity-60" : ""
          } ${isRow ? "lg:col-start-2" : ""}`}
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
  readOnly = false,
  hint,
  maxLength,
  error,
  onBlur,
  layout = "stacked",
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
  /** "row" puts the label in a fixed-width left column beside the control at
   *  `lg`+ (see the layout-variant note atop this file). Defaults to
   *  "stacked" so every existing call site renders unchanged. */
  layout?: "stacked" | "row";
}) {
  const isRow = layout === "row";
  return (
    <label
      className={`block ${isRow ? "lg:grid lg:grid-cols-[200px_minmax(0,440px)] lg:items-start lg:gap-x-6" : ""} ${className}`}
    >
      <span
        className={`mb-1.5 block text-[13px] font-medium text-[var(--color-brand-ink)] ${isRow ? "lg:col-start-1 lg:row-start-1 lg:mb-0 lg:pt-2.5" : ""
          }`}
      >
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
        aria-readonly={readOnly || undefined}
        maxLength={maxLength}
        aria-invalid={!!error}
        className={`brand-focus h-10 w-full rounded-field border px-3 text-sm text-[var(--color-brand-ink)] outline-none placeholder:text-[var(--color-brand-muted)]/60 focus:border-[var(--color-brand-outline)] ${error ? "border-[var(--color-brand-danger)]" : "border-[var(--color-brand-border)]"
          } ${readOnly ? "cursor-default bg-[var(--color-brand-border)]/25 text-[var(--color-brand-muted)]" : "bg-[var(--color-brand-surface-raised)]"} ${isRow ? "lg:col-start-2 lg:row-start-1" : ""
          }`}
      />
      {error ? (
        <span
          role="alert"
          className={`mt-1 block text-xs text-[var(--color-brand-danger)] ${isRow ? "lg:col-start-2 lg:row-start-2" : ""
            }`}
        >
          {error}
        </span>
      ) : (
        hint && (
          <span
            className={`mt-1 block text-xs text-[var(--color-brand-muted)] ${isRow ? "lg:col-start-2 lg:row-start-2" : ""
              }`}
          >
            {hint}
          </span>
        )
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
  layout = "stacked",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
  hint?: string;
  /** See `Field`'s `layout` prop — same contract. */
  layout?: "stacked" | "row";
}) {
  const isRow = layout === "row";
  return (
    <label
      className={`block ${isRow ? "lg:grid lg:grid-cols-[200px_minmax(0,440px)] lg:items-start lg:gap-x-6" : ""} ${className}`}
    >
      <span
        className={`mb-1.5 block text-[13px] font-medium text-[var(--color-brand-ink)] ${isRow ? "lg:col-start-1 lg:row-start-1 lg:mb-0 lg:pt-2.5" : ""
          }`}
      >
        {label}
        {required && <span className="ml-1 text-[var(--color-brand-danger)]">*</span>}
      </span>
      <div
        className={`flex h-10 items-center rounded-field border border-[var(--color-brand-border)] bg-[var(--color-brand-surface-raised)] ${isRow ? "lg:col-start-2 lg:row-start-1" : ""
          }`}
      >
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
      {hint && (
        <span
          className={`mt-1 block text-xs text-[var(--color-brand-muted)] ${isRow ? "lg:col-start-2 lg:row-start-2" : ""
            }`}
        >
          {hint}
        </span>
      )}
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
 * Shared shell for the two read-only "verified value + change action" rows
 * (WhatsApp number, business email) — label, action button, value box, chip
 * and helper line are identical between them; only the value box's content
 * (and whether a helper is shown at all) differs, so those stay owned by
 * each caller.
 *
 * Stacked path: DOM order is value-row → label/action-row → helper, with CSS
 * `order` restoring the original visual stacking (label/action on top):
 * keyboard and screen-reader users reach the value before the button that
 * changes it, while sighted users see the same layout as before. The
 * wrapping `role="group"` + `aria-labelledby` means entering this region
 * still announces the field's name up front despite the label coming later
 * in source order. This path is untouched by the row layout below — it's a
 * fully separate render branch.
 *
 * Row path: the chip + action button move inside the value box itself,
 * right-aligned, so the whole field is a single `h-10` row like every other
 * primitive. Document order there is simply label → value box → button (the
 * button lives inside the value box's own markup), which already puts the
 * value ahead of the button — no `order`/`display:contents` juggling needed.
 *
 * The action button's own text is the accessible name (e.g. "Change
 * WhatsApp number", not "Change number") rather than a separate `aria-label`
 * — "Change number" isn't a literal substring of "Change WhatsApp number",
 * which would fail WCAG's Label-in-Name for speech-input users; making the
 * visible text itself descriptive sidesteps that entirely, and reads fine
 * now that the action is quieter than it used to be.
 */
function VerifiedFieldRow({
  label,
  required,
  actionLabel,
  onActionClick,
  hasValue,
  verified,
  value,
  helper,
  layout = "stacked",
}: {
  label: string;
  /** Purely informational — these fields are OTP-gated, not part of the
   *  form's own `required` validation, so this can't be a native attribute. */
  required?: boolean;
  actionLabel: string;
  onActionClick: () => void;
  hasValue: boolean;
  verified?: boolean;
  value: React.ReactNode;
  helper?: React.ReactNode;
  /** "row" puts the label in a fixed-width left column and folds the
   *  verified chip + action button into the value box's trailing edge (see
   *  the layout-variant note atop this file). Defaults to "stacked" so every
   *  existing call site renders unchanged. */
  layout?: "stacked" | "row";
}) {
  const labelId = useId();

  const chip = hasValue ? (
    verified ? (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--color-brand-success)]/10 px-2 py-0.5 text-[11px] font-semibold text-[var(--color-brand-success)]">
        <CheckIcon className="h-3 w-3" />
        Verified
      </span>
    ) : (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--color-brand-warning-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-brand-warning)]">
        <AlertIcon className="h-3 w-3" />
        Not verified
      </span>
    )
  ) : null;

  if (layout === "row") {
    return (
      <div
        role="group"
        aria-labelledby={labelId}
        className="lg:grid lg:grid-cols-[200px_minmax(0,440px)] lg:items-start lg:gap-x-6"
      >
        <span
          id={labelId}
          className="mb-1.5 block text-[13px] font-medium text-[var(--color-brand-ink)] lg:col-start-1 lg:row-start-1 lg:mb-0 lg:pt-2.5"
        >
          {label}
          {required && <span className="ml-1 text-[var(--color-brand-danger)]">*</span>}
        </span>
        <div className="flex h-10 items-center gap-2 rounded-field border border-[var(--color-brand-border)] bg-[var(--color-brand-surface-raised)] px-3 lg:col-start-2 lg:row-start-1">
          <div className="min-w-0 flex-1 truncate">{value}</div>
          {chip}
          <button
            type="button"
            onClick={onActionClick}
            className="brand-focus shrink-0 cursor-pointer text-xs font-semibold text-[var(--color-brand-navy)] underline-offset-2 hover:underline"
          >
            {actionLabel}
          </button>
        </div>
        {helper && <div className="lg:col-start-2 lg:row-start-2">{helper}</div>}
      </div>
    );
  }

  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-col">
      <div className="order-2 flex h-10 cursor-default items-center rounded-field border border-[var(--color-brand-border)] bg-[var(--color-brand-surface-raised)] px-3">
        {value}
      </div>
      <div className="order-1 mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span id={labelId} className="text-[13px] font-medium text-[var(--color-brand-ink)]">
          {label}
          {required && <span className="ml-1 text-[var(--color-brand-danger)]">*</span>}
        </span>
        <span className="flex flex-wrap items-center gap-2">
          {chip}
          <button
            type="button"
            onClick={onActionClick}
            className="brand-focus text-xs font-semibold text-[var(--color-brand-navy)] underline-offset-2 hover:underline"
          >
            {actionLabel}
          </button>
        </span>
      </div>
      {helper && <div className="order-3">{helper}</div>}
    </div>
  );
}

/**
 * Read-only display of the studio's one, OTP-verified phone number. Never
 * part of the Studio Identity form's dirty-check or save payload — changing
 * it goes through its own OTP-gated flow (ChangeWhatsappModal), not
 * updateCompanyDetails.
 *
 * Marked visually required: WhatsApp verification is a mandatory onboarding
 * gate (blocks completing onboarding), unlike business email below, which is
 * only a skippable branding-readiness nudge — the two are genuinely
 * different, so they're not signalled the same way.
 */
export function VerifiedWhatsappField({
  whatsappNumber,
  verified,
  onChangeClick,
  layout = "stacked",
}: {
  whatsappNumber?: string;
  verified?: boolean;
  onChangeClick: () => void;
  /** See `VerifiedFieldRow`'s `layout` prop — threaded straight through. */
  layout?: "stacked" | "row";
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
    <VerifiedFieldRow
      label="WhatsApp number"
      required
      hasValue={hasValue}
      verified={verified}
      actionLabel={hasValue ? "Update" : "Add & verify"}
      onActionClick={onChangeClick}
      layout={layout}
      value={
        formatted ? (
          <span className="text-sm text-[var(--color-brand-ink)]">{formatted}</span>
        ) : hasValue ? (
          <span className="truncate text-sm text-[var(--color-brand-ink)]">{raw}</span>
        ) : (
          <span className="flex items-center gap-2 text-sm text-[var(--color-brand-muted)]">
            <span>—</span>
            <span className="text-xs">Not set yet</span>
          </span>
        )
      }
      helper={
        unrecognised ? (
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
        )
      }
    />
  );
}

/**
 * Read-only display of the studio's business email — mirrors
 * `VerifiedWhatsappField` via the shared `VerifiedFieldRow`. Never part of
 * the Studio Identity form's dirty-check or save payload — it can only
 * change through the OTP-gated verify modal (`ChangeBusinessEmailModal`),
 * not `updateCompanyDetails`.
 *
 * Not marked required — unlike WhatsApp, a verified business email is only a
 * skippable branding-readiness nudge, never a gate on anything.
 */
export function VerifiedBusinessEmailField({
  businessEmail,
  verified,
  onActionClick,
  layout = "stacked",
}: {
  businessEmail?: string;
  verified?: boolean;
  onActionClick: () => void;
  /** See `VerifiedFieldRow`'s `layout` prop — threaded straight through. */
  layout?: "stacked" | "row";
}) {
  const hasValue = !!businessEmail;

  return (
    <VerifiedFieldRow
      label="Business email"
      hasValue={hasValue}
      verified={verified}
      actionLabel={hasValue ? "Update" : "Add & verify"}
      onActionClick={onActionClick}
      layout={layout}
      value={
        businessEmail ? (
          <span className="truncate text-sm text-[var(--color-brand-ink)]">{businessEmail}</span>
        ) : (
          <span className="flex items-center gap-2 text-sm text-[var(--color-brand-muted)]">
            <span>—</span>
            <span className="text-xs">Not set yet</span>
          </span>
        )
      }
      helper={
        <p className="mt-1.5 text-xs text-[var(--color-brand-muted)]">
          {hasValue
            ? "Shown to clients as your studio's contact email — separate from your login email on Personal Information."
            : "Add a client-facing contact email — separate from your login email on Personal Information."}
        </p>
      }
    />
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
  layout = "stacked",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  required?: boolean;
  className?: string;
  /** See `Field`'s `layout` prop — same contract. */
  layout?: "stacked" | "row";
}) {
  const isRow = layout === "row";
  return (
    <label
      className={`block ${isRow ? "lg:grid lg:grid-cols-[200px_minmax(0,440px)] lg:items-start lg:gap-x-6" : ""} ${className}`}
    >
      <span
        className={`mb-1.5 block text-[13px] font-medium text-[var(--color-brand-ink)] ${isRow ? "lg:col-start-1 lg:row-start-1 lg:mb-0 lg:pt-2.5" : ""
          }`}
      >
        {label}
        {required && <span className="ml-1 text-[var(--color-brand-danger)]">*</span>}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className={`brand-focus h-10 w-full rounded-field border border-[var(--color-brand-border)] bg-[var(--color-brand-surface-raised)] px-3 text-sm text-[var(--color-brand-ink)] outline-none focus:border-[var(--color-brand-outline)] ${isRow ? "lg:col-start-2 lg:row-start-1" : ""
          }`}
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
  onDiscard,
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
  /** Resets the section's local state back to its last-loaded snapshot.
   *  Rendered only while `dirty`, so it disappears the moment there's
   *  nothing left to discard. */
  onDiscard?: () => void;
}) {
  // Looked up in an effect, not a lazy initializer: when SettingsChrome's
  // `load` flips from "loading" to "ready" for the first time, the anchor
  // div and this section's <SaveBar> are created in the SAME render pass.
  // React runs all render-phase code (including a useState lazy
  // initializer) before committing anything to the real DOM, so
  // document.getElementById found nothing on that first render and,
  // being a lazy initializer, never looked again — the bar silently
  // stayed null for the lifetime of that mount. Navigating between
  // sections worked because the anchor was already committed from an
  // earlier render by then. An effect runs after commit, so by the time
  // it fires the anchor is guaranteed to exist, on every mount.
  const [root, setRoot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setRoot(document.getElementById(SECTION_SAVE_BAR_ROOT_ID));
  }, []);

  const visible = dirty || saveState !== "idle";
  if (!visible || !root) return null;

  return createPortal(
    <div className="toast-rise sticky top-0 z-30 mb-4 flex flex-col items-stretch gap-3 rounded-pill border border-[var(--color-brand-border)] bg-[var(--color-brand-surface-raised)] px-5 py-4 shadow-[0_8px_24px_rgba(42,34,24,0.14)] sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      {/* One live region for every state this bar can be in — success, error
          and the blocked-reason explanation all need announcing, and it's
          simpler and more reliable than nesting a second (assertive)
          role="alert" region inside a polite one. Safe against the bar's
          own portal-in/portal-out lifecycle: submit() only ever fires while
          `dirty` is already true, so this region is already mounted before
          any saveState transition happens — there's no case where a fresh
          mount needs to announce a message that predates it. */}
      <div role="status" aria-live="polite" aria-atomic="true">
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
      </div>

      <div className="flex w-full shrink-0 items-center justify-end gap-3 sm:w-auto sm:justify-start">
        {dirty && onDiscard && (
          <button
            type="button"
            onClick={onDiscard}
            disabled={saveState === "saving"}
            className="brand-focus text-sm font-semibold text-[var(--color-brand-muted)] transition-colors hover:text-[var(--color-brand-ink)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Discard
          </button>
        )}
        <button
          type="submit"
          form={formId}
          disabled={saveState === "saving" || !canSave}
          className="brand-focus inline-flex h-10 shrink-0 items-center gap-2 rounded-field bg-[var(--color-brand-navy)] px-5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saveState === "saving" ? (
            <>
              <Spinner />
              Saving…
            </>
          ) : (
            <>
              <CheckIcon className="h-4 w-4" />
              Save changes
            </>
          )}
        </button>
      </div>
    </div>,
    root,
  );
}

export function SectionSkeleton() {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="skeleton h-3 w-12 rounded" />
        <div className="skeleton h-8 w-48 rounded-field" />
        <div className="skeleton h-4 w-72 rounded" />
      </div>
      {[1, 2].map((i) => (
        <div key={i} className="skeleton h-44 rounded-card" />
      ))}
    </div>
  );
}

export function FetchError({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-card border border-[var(--color-brand-danger)]/30 bg-[var(--color-brand-danger-soft)] p-4 text-sm text-[var(--color-brand-danger)]">
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

export function CopyIcon({ className }: { className?: string }) {
  return <IconCopy className={className} />;
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
