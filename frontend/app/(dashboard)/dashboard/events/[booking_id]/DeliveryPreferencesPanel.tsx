"use client";

import { useId, type ReactNode } from "react";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import {
  DELIVERY_PREFERENCE_DEFAULTS,
  resolveDeliveryPreferenceFields,
  type DeliveryPreferenceContext,
  type DeliveryPreferenceField,
  type DeliveryPreferences,
  type DeliveryPreferenceSurface,
} from "@/lib/delivery-preferences";

/**
 * The preference rows themselves — purely presentational and fully controlled.
 * Zero fetching, zero saving, zero effects: both hosts (the upload dialog's
 * Preferences step and the standalone gear modal) own persistence, so the panel
 * can be rendered against a draft that hasn't been saved yet without either
 * host racing the other.
 *
 * Rows are generated from the preference registry, so a new preference appears
 * in BOTH hosts by editing that registry alone — and so does a change to what a
 * row is called or when it shows at all.
 *
 * `context` carries the booking's archive quality tier. The registry uses it to
 * name the archive row after the tier this event actually has, and to hide that
 * row for a QHD-only event (nothing unwatermarked exists to govern) or when
 * downloads are switched off outright.
 *
 * `surface` picks which rows this host shows: the upload dialog asks only about
 * the run it is uploading, while the Access & Sharing modal carries every row.
 * Both read the same registry, so a row's copy is written once.
 *
 * `leading` renders one extra row FIRST, in the same list — the Access &
 * Sharing modal's "Show your studio profile", which is not a delivery
 * preference (it is the landing page's top-level `include_company_branding`)
 * and so is not forced into the typed registry. `ToggleRow` below is the shape
 * it should use, so it cannot drift from the registry's own toggle rows.
 */
export function DeliveryPreferencesPanel({
  value,
  onChange,
  disabled = false,
  context,
  surface = "gallery",
  leading,
}: {
  value: DeliveryPreferences;
  onChange: (next: DeliveryPreferences) => void;
  disabled?: boolean;
  context?: DeliveryPreferenceContext;
  surface?: DeliveryPreferenceSurface;
  leading?: ReactNode;
}) {
  const fields = resolveDeliveryPreferenceFields(value, context, surface);
  return (
    <div className="flex flex-col gap-3">
      <div className="divide-y divide-[var(--color-brand-border)] overflow-hidden rounded-lg border border-[var(--color-brand-border)] bg-white">
        {leading}
        {fields.map((field) => (
          <PreferenceRow
            key={field.key}
            field={field}
            value={value}
            onChange={onChange}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
}

function PreferenceRow({
  field,
  value,
  onChange,
  disabled,
}: {
  field: DeliveryPreferenceField;
  value: DeliveryPreferences;
  onChange: (next: DeliveryPreferences) => void;
  disabled: boolean;
}) {
  const descriptionId = useId();
  // A row overridden from outside this event shows its EFFECTIVE value and
  // can't be changed here; the stored value is kept untouched underneath.
  const locked = field.locked ?? null;
  const current = locked ? locked.value : value[field.key];
  const isDefault = current === DELIVERY_PREFERENCE_DEFAULTS[field.key];
  const rowDisabled = disabled || !!locked;

  // Switch on the descriptor's type — an unknown type renders nothing rather
  // than crashing the panel out from under a host that hasn't been taught
  // about it yet.
  let control: React.ReactNode = null;
  // A select's options are full-width rows under the label, not a control
  // squeezed beside it — labels only now, so the whole group reads at a glance.
  let stacked: React.ReactNode = null;
  switch (field.type) {
    case "toggle":
      control = (
        <ToggleSwitch
          checked={current as boolean}
          onChange={(next) => onChange({ ...value, [field.key]: next })}
          disabled={rowDisabled}
          label={field.label}
          describedById={field.description ? descriptionId : undefined}
        />
      );
      break;
    case "select": {
      if (!field.options?.length) return null;
      // The one line a select keeps, for the option whose consequence must not
      // be missed — shown only while that option is the one chosen.
      const note = field.options.find((option) => option.value === current)?.note;
      stacked = (
        <>
        <div role="radiogroup" aria-label={field.label} className="flex flex-col gap-1.5">
          {field.options.map((option) => {
            const selected = current === option.value;
            return (
              <label
                key={option.value}
                className={`flex cursor-pointer gap-2.5 rounded-lg border px-3 py-2.5 transition-colors ${
                  selected
                    ? "border-[var(--color-brand-navy-deep)] bg-[var(--color-brand-navy-soft)]"
                    : "border-[var(--color-brand-border)] bg-white"
                } ${rowDisabled ? "cursor-not-allowed opacity-60" : ""}`}
              >
                <input
                  type="radio"
                  name={`${descriptionId}-${field.key}`}
                  value={option.value}
                  checked={selected}
                  disabled={rowDisabled}
                  onChange={() => onChange({ ...value, [field.key]: option.value } as DeliveryPreferences)}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--color-brand-navy-deep)]"
                />
                <span className="min-w-0 text-[12.5px] font-semibold leading-snug text-[var(--color-brand-ink)]">
                  {option.label}
                </span>
              </label>
            );
          })}
        </div>
        {note && (
          <p className="text-[11.5px] font-medium leading-relaxed text-[var(--color-brand-warning)]">{note}</p>
        )}
        </>
      );
      break;
    }
    default:
      return null;
  }

  return (
    <div className="flex flex-col gap-2 px-4 py-3.5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[13.5px] font-semibold leading-snug text-[var(--color-brand-ink)]">
            {field.label}
          </div>
          {field.description && (
            <p
              id={descriptionId}
              className="mt-0.5 text-[12.5px] leading-relaxed text-[var(--color-brand-muted)]"
            >
              {field.description}
            </p>
          )}
        </div>
        {control}
      </div>
      {stacked}
      {/* Something is wrong with the current combination — amber, and distinct
          from the neutral consequence note, which describes a setting working
          as intended. Shown regardless of the default, because the problem is
          real whichever way the studio arrived at it. */}
      {field.warning && (
        <div className="rounded-md border border-[#F0D9B5] bg-[var(--color-brand-warning-soft)] px-3 py-2.5 text-[11.5px] leading-relaxed text-[var(--color-brand-warning)]">
          {field.warning}
        </div>
      )}
      {/* Only while the preference is away from its default — the studio sees
          what it just opted in to, at the moment it opts in. A locked row says
          why it is locked instead. */}
      {locked ? (
        <div className="rounded-md bg-[var(--color-brand-navy-soft)] px-3 py-2.5 text-[11.5px] leading-relaxed text-[var(--color-brand-navy-deep)]">
          {locked.note}
        </div>
      ) : (
        field.consequence &&
        !isDefault && (
          <div className="rounded-md bg-[var(--color-brand-navy-soft)] px-3 py-2.5 text-[11.5px] leading-relaxed text-[var(--color-brand-navy-deep)]">
            {field.consequence}
          </div>
        )
      )}
    </div>
  );
}

/**
 * A plain toggle row in the same shape as the registry's, for a setting that
 * lives OUTSIDE the registry but belongs in the same list (see `leading`).
 * Label, an optional one-line hint, the switch — nothing else.
 */
export function ToggleRow({
  label,
  hint,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  const hintId = useId();
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3.5">
      <div className="min-w-0">
        <div className="text-[13.5px] font-semibold leading-snug text-[var(--color-brand-ink)]">{label}</div>
        {hint && (
          <p id={hintId} className="mt-0.5 text-[12.5px] leading-relaxed text-[var(--color-brand-muted)]">
            {hint}
          </p>
        )}
      </div>
      <ToggleSwitch
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        label={label}
        describedById={hint ? hintId : undefined}
      />
    </div>
  );
}
