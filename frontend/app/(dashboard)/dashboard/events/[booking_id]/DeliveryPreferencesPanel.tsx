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

  // Switch on the descriptor's type even though "toggle" is the only one today
  // — a future select/number field renders nothing rather than crashing the
  // panel out from under a host that hasn't been taught about it yet.
  let control: React.ReactNode;
  switch (field.type) {
    case "toggle":
      control = (
        <ToggleSwitch
          checked={current}
          onChange={(next) => onChange({ ...value, [field.key]: next })}
          disabled={disabled}
          label={field.label}
          describedById={descriptionId}
        />
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
