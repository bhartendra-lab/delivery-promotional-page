/**
 * Guest-facing delivery preferences for one event's gallery — the single source
 * of truth for the shape, the defaults, and how each preference is presented.
 *
 * To add a preference: add the key to `DeliveryPreferences`, a default to
 * `DELIVERY_PREFERENCE_DEFAULTS`, and a descriptor to `DELIVERY_PREFERENCE_FIELDS`.
 * Both the upload dialog's Preferences step and the standalone Preferences modal
 * render from `DELIVERY_PREFERENCE_FIELDS`, so neither needs touching. Mirror the
 * key in the backend's `deliveryPreferencesSchema` + `DELIVERY_PREFERENCE_DEFAULTS`.
 */
export type DeliveryPreferences = {
  allow_download: boolean;
};

export const DELIVERY_PREFERENCE_DEFAULTS: DeliveryPreferences = {
  allow_download: true,
};

/** How one preference is presented. `type` exists so a future non-boolean
 *  preference (a select, a number) can be added without reworking the panel. */
export type DeliveryPreferenceField = {
  key: keyof DeliveryPreferences;
  type: "toggle";
  label: string;
  /** Always-visible one-line explanation of what the preference does. */
  description: string;
  /** Extra line shown only while the preference is in its non-default state,
   *  so the studio sees the consequence at the moment it opts in to it. */
  consequence?: string;
  /** One-line, guest's-eye restatement of each state, for the upload dialog's
   *  "What guests will see" rail. Present here (not in the dialog) so a new
   *  preference shows up in that summary without editing the dialog. */
  summary?: { on: string; off: string };
};

/** Render order in both hosts. */
export const DELIVERY_PREFERENCE_FIELDS: DeliveryPreferenceField[] = [
  {
    key: "allow_download",
    type: "toggle",
    label: "Allow guests to download photos",
    description: "",
    consequence:
      "Downloads are hidden for everyone — including family members who have entered the passcode. You can still download everything from this dashboard.",
    summary: {
      on: "Guests can download photos",
      off: "Downloads are turned off for this gallery",
    },
  },
];

/** Fill defaults and drop unknown keys. Use this for EVERY read — a gallery
 *  created before a preference existed has no value for it, and an absent
 *  boolean reads as `false` at the call site, which silently inverts the
 *  intended default. */
export function normalizeDeliveryPreferences(
  raw: Partial<DeliveryPreferences> | null | undefined,
): DeliveryPreferences {
  const next = { ...DELIVERY_PREFERENCE_DEFAULTS };
  if (!raw) return next;
  for (const key of Object.keys(DELIVERY_PREFERENCE_DEFAULTS) as Array<keyof DeliveryPreferences>) {
    const value = raw[key];
    // Type-check rather than trusting the payload: the guest endpoint projects
    // this object raw, so a half-written document must not flip a preference.
    if (typeof value === typeof DELIVERY_PREFERENCE_DEFAULTS[key]) next[key] = value as never;
  }
  return next;
}

/** Keys whose value differs between two preference sets. Drives dirty-state
 *  in both hosts and lets a save send only what changed. */
export function changedPreferenceKeys(
  a: DeliveryPreferences,
  b: DeliveryPreferences,
): Array<keyof DeliveryPreferences> {
  return (Object.keys(DELIVERY_PREFERENCE_DEFAULTS) as Array<keyof DeliveryPreferences>).filter(
    (key) => a[key] !== b[key],
  );
}
