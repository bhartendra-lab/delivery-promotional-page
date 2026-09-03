"use client";

import { useId } from "react";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import {
  DELIVERY_PREFERENCE_DEFAULTS,
  DELIVERY_PREFERENCE_FIELDS,
  type DeliveryPreferenceField,
  type DeliveryPreferences,
} from "@/lib/delivery-preferences";

/**
 * The preference rows themselves — purely presentational and fully controlled.
 * Zero fetching, zero saving, zero effects: both hosts (the upload dialog's
 * Preferences step and the standalone gear modal) own persistence, so the panel
 * can be rendered against a draft that hasn't been saved yet without either
 * host racing the other.
 *
 * Rows are generated from `DELIVERY_PREFERENCE_FIELDS`, so a new preference
 * appears in BOTH hosts by editing that registry alone.
 */
export function DeliveryPreferencesPanel({
  value,
  onChange,
  disabled = false,
}: {
  value: DeliveryPreferences;
  onChange: (next: DeliveryPreferences) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="divide-y divide-[var(--color-brand-border)] overflow-hidden rounded-lg border border-[var(--color-brand-border)] bg-white">
        {DELIVERY_PREFERENCE_FIELDS.map((field) => (
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
  const current = value[field.key];
  const isDefault = current === DELIVERY_PREFERENCE_DEFAULTS[field.key];

  // Switch on the descriptor's type — an unknown type renders nothing rather
  // than crashing the panel out from under a host that hasn't been taught
  // about it yet.
  let control: React.ReactNode = null;
  // A select's options are full-width rows under the label, not a control
  // squeezed beside it: each carries a sentence the studio has to actually
  // read before choosing.
  let stacked: React.ReactNode = null;
  switch (field.type) {
    case "toggle":
      control = (
        <ToggleSwitch
          checked={current as boolean}
          onChange={(next) => onChange({ ...value, [field.key]: next })}
          disabled={disabled}
          label={field.label}
          describedById={descriptionId}
        />
      );
      break;
    case "select":
      if (!field.options?.length) return null;
      stacked = (
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
                } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
              >
                <input
                  type="radio"
                  name={`${descriptionId}-${field.key}`}
                  value={option.value}
                  checked={selected}
                  disabled={disabled}
                  onChange={() => onChange({ ...value, [field.key]: option.value } as DeliveryPreferences)}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--color-brand-navy-deep)]"
                />
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-semibold leading-snug text-[var(--color-brand-ink)]">
                    {option.label}
                  </span>
                  <span className="mt-0.5 block text-[11.5px] leading-relaxed text-[var(--color-brand-muted)]">
                    {option.description}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      );
      break;
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
          <p
            id={descriptionId}
            className="mt-0.5 text-[12.5px] leading-relaxed text-[var(--color-brand-muted)]"
          >
            {field.description}
          </p>
        </div>
        {control}
      </div>
      {stacked}
      {/* Only while the preference is away from its default — the studio sees
          what it just opted in to, at the moment it opts in. */}
      {field.consequence && !isDefault && (
        <div className="rounded-md bg-[var(--color-brand-navy-soft)] px-3 py-2.5 text-[11.5px] leading-relaxed text-[var(--color-brand-navy-deep)]">
          {field.consequence}
        </div>
      )}
    </div>
  );
}
