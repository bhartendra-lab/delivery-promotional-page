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

/** Who may download the unwatermarked archive copy (4096px or original). */
export type ArchiveDownloadAccess = "none" | "host_only" | "all_guests";

export type DeliveryPreferences = {
  allow_download: boolean;
  archive_download_access: ArchiveDownloadAccess;
};

export const DELIVERY_PREFERENCE_DEFAULTS: DeliveryPreferences = {
  allow_download: true,
  archive_download_access: "host_only",
};

/** Allowed values for each non-boolean preference. `normalizeDeliveryPreferences`
 *  checks membership, so a value outside this list (a typo, an older/newer
 *  client, a half-written document) resolves to the conservative default rather
 *  than reaching a `switch` that cannot interpret it. Mirrors the backend's
 *  DELIVERY_PREFERENCE_ENUMS. */
export const DELIVERY_PREFERENCE_ENUMS: { archive_download_access: ArchiveDownloadAccess[] } = {
  archive_download_access: ["none", "host_only", "all_guests"],
};

/** One choice in a `select` preference. */
export type DeliveryPreferenceOption = {
  value: string;
  label: string;
  /** Shown under the label. For a permissive option this must state the
   *  consequence in plain words, not a neutral restatement of the label. */
  description: string;
};

/** How one preference is presented. `type` exists so a non-boolean preference
 *  (a select, a number) can be added without reworking the panel. */
export type DeliveryPreferenceField = {
  key: keyof DeliveryPreferences;
  type: "toggle" | "select";
  label: string;
  /** Always-visible one-line explanation of what the preference does. */
  description: string;
  /** Extra line shown only while the preference is in its non-default state,
   *  so the studio sees the consequence at the moment it opts in to it. */
  consequence?: string;
  /** Required for `type: "select"`, ignored otherwise. */
  options?: DeliveryPreferenceOption[];
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
  },
  {
    key: "archive_download_access",
    type: "select",
    label: "Full-resolution downloads",
    description:
      "Who can download the unwatermarked copy you uploaded. Everyone else gets the watermarked 2560px version.",
    // Shown for every booking, including one whose photos are all web-tier
    // today: the preference is forward-looking (it governs the next upload as
    // much as the last one), so a studio can set it before it matters. The
    // gallery hides the tier selector on its own when no selected photo has an
    // archive copy.
    options: [
      {
        value: "host_only",
        label: "Only the family (passcode holders)",
        description:
          "Guests who have entered the family passcode can download the full-resolution files. Everyone else gets the watermarked 2560px copy.",
      },
      {
        value: "all_guests",
        label: "Every guest",
        // Blunt on purpose. A studio must not enable this believing it is the
        // same file at a larger size.
        description:
          "Guests can download unwatermarked, full-resolution originals of photos they appear in.",
      },
      {
        value: "none",
        label: "Nobody",
        description:
          "Nobody in the gallery can download the full-resolution files — not even passcode holders. You can still download them from this dashboard.",
      },
    ],
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
    if (typeof value !== typeof DELIVERY_PREFERENCE_DEFAULTS[key]) continue;
    // An enum-valued preference also has to be IN its enum. A `typeof` check
    // passes any string, and an unrecognised one would fall off the end of
    // every switch that reads it — which for an access control must not mean
    // "open".
    const allowed = (DELIVERY_PREFERENCE_ENUMS as Record<string, readonly string[]>)[key];
    if (allowed && !allowed.includes(value as string)) continue;
    next[key] = value as never;
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
