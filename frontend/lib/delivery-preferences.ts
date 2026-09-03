/**
 * Guest-facing delivery preferences for one event's gallery — the single source
 * of truth for the shape, the defaults, and how each preference is presented.
 *
 * To add a preference: add the key to `DeliveryPreferences`, a default to
 * `DELIVERY_PREFERENCE_DEFAULTS`, and a spec to `DELIVERY_PREFERENCE_SPECS`.
 * Both the upload dialog's Preferences step and the standalone Preferences modal
 * render whatever `resolveDeliveryPreferenceFields` returns, so neither needs
 * touching. Mirror the key in the backend's `deliveryPreferencesSchema` +
 * `DELIVERY_PREFERENCE_DEFAULTS`.
 *
 * A spec's copy and its visibility are both functions of the booking's context
 * and the current draft, which is what lets one row be called "Cinema 4K
 * downloads" for one event and "Original file downloads" for another — and lets
 * it disappear entirely for an event that has neither.
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

/** The archive (unwatermarked) quality tiers a studio can upload at. */
export type ArchiveTier = "4096" | "original";

/**
 * ONE studio-facing name per tier, used by the upload dialog's quality
 * selector, this panel, and the guest download pre-flight alike. A tier called
 * "Cinema 4K" while uploading and "high-res" while downloading reads as two
 * different things.
 */
export const ARCHIVE_TIER_SHORT: Record<ArchiveTier, string> = {
  "4096": "Cinema 4K",
  original: "Original file",
};
export const ARCHIVE_TIER_FULL: Record<ArchiveTier, string> = {
  "4096": "Cinema 4K (4096px)",
  original: "Original file",
};

/**
 * How each tier reads INSIDE a sentence, as a plural noun phrase. Kept separate
 * from the labels above because those are headings and interpolating them into
 * prose produces "the Original file files".
 */
const ARCHIVE_TIER_FILES: Record<ArchiveTier, string> = {
  "4096": "Cinema 4K (4096px) files",
  original: "original camera files",
};

/**
 * What the panel needs to know about the booking beyond the preference values
 * themselves.
 *
 * `archiveTier` is null for an event whose photos are all QHD — there is no
 * unwatermarked copy in existence, so a preference governing who may download
 * one has nothing to govern and is not shown. In the upload dialog this is the
 * tier the studio has just SELECTED (the run is about to create those copies);
 * in the standalone Preferences dialog it is the tier the event's photos
 * actually carry.
 */
export type DeliveryPreferenceContext = {
  archiveTier: ArchiveTier | null;
};

/** A preference row, resolved for one booking — concrete strings, ready to
 *  render. The panel never sees the registry's functions. */
export type DeliveryPreferenceField = {
  key: keyof DeliveryPreferences;
  type: "toggle" | "select";
  label: string;
  /** Always-visible one-line explanation of what the preference does. */
  description: string;
  /** Extra line shown only while the preference is in its non-default state,
   *  so the studio sees the consequence at the moment it opts in to it. */
  consequence?: string;
  /** Present for `type: "select"`. */
  options?: DeliveryPreferenceOption[];
};

/**
 * The registry entry. Copy is written as functions of the booking's context so
 * that a tier's NAME is never hardcoded into a sentence — the same row reads
 * "Cinema 4K downloads" for one event and "Original file downloads" for
 * another, and the panel stays a dumb renderer.
 */
type DeliveryPreferenceSpec = {
  key: keyof DeliveryPreferences;
  type: "toggle" | "select";
  label: (ctx: DeliveryPreferenceContext) => string;
  description: (ctx: DeliveryPreferenceContext) => string;
  consequence?: (ctx: DeliveryPreferenceContext) => string;
  options?: (ctx: DeliveryPreferenceContext) => DeliveryPreferenceOption[];
  /**
   * Hide the row entirely when this returns false. It reads the CURRENT draft
   * as well as the context, so a preference that only makes sense underneath
   * another one disappears the moment that one is switched off.
   */
  isRelevant?: (ctx: DeliveryPreferenceContext, value: DeliveryPreferences) => boolean;
};

/** Render order in both hosts. */
const DELIVERY_PREFERENCE_SPECS: DeliveryPreferenceSpec[] = [
  {
    key: "allow_download",
    type: "toggle",
    label: () => "Allow guests to download photos",
    description: () => "",
    consequence: () =>
      "Downloads are hidden for everyone — including family members who have entered the passcode. You can still download everything from this dashboard.",
  },
  {
    key: "archive_download_access",
    type: "select",
    // Named after the tier this event actually has, never a generic
    // "Full-resolution": a studio that uploaded Cinema 4K did not upload
    // originals, and calling those files "full-resolution originals" would be
    // wrong as well as vague.
    label: (ctx) => `${ARCHIVE_TIER_SHORT[ctx.archiveTier ?? "original"]} downloads`,
    description: (ctx) =>
      `Who can download the unwatermarked ${ARCHIVE_TIER_FILES[ctx.archiveTier ?? "original"]} you uploaded. Everyone else gets the watermarked QHD (2560px) version.`,
    // Two independent reasons this row can be meaningless, and both hide it
    // rather than showing a control that governs nothing:
    //  - the event is QHD-only, so no unwatermarked copy exists at all;
    //  - downloads are switched off outright, which overrides this setting
    //    anyway (see the endpoint's authorisation order).
    isRelevant: (ctx, value) => value.allow_download && ctx.archiveTier !== null,
    options: (ctx) => {
      const files = ARCHIVE_TIER_FILES[ctx.archiveTier ?? "original"];
      return [
        {
          value: "host_only",
          label: "Only the family (passcode holders)",
          description: `Guests who have entered the family passcode can download the ${files}. Everyone else gets the watermarked QHD (2560px) copy.`,
        },
        {
          value: "all_guests",
          label: "Every guest",
          // Blunt on purpose. A studio must not enable this believing it is the
          // same file at a larger size — these copies carry no watermark.
          description: `Every guest can download the unwatermarked ${files} for photos they appear in.`,
        },
        {
          value: "none",
          label: "Nobody",
          description: `Nobody in the gallery can download the ${files} — not even passcode holders. You can still download them from this dashboard.`,
        },
      ];
    },
  },
];

/**
 * The rows to render for one booking, in order, with every string resolved.
 *
 * The context defaults to "no archive tier", which hides the archive row — the
 * safe direction for a host that has not been taught to supply one, since the
 * setting it hides has a conservative default of its own.
 */
export function resolveDeliveryPreferenceFields(
  value: DeliveryPreferences,
  context: DeliveryPreferenceContext = { archiveTier: null },
): DeliveryPreferenceField[] {
  return DELIVERY_PREFERENCE_SPECS.filter(
    (spec) => spec.isRelevant?.(context, value) ?? true,
  ).map((spec) => ({
    key: spec.key,
    type: spec.type,
    label: spec.label(context),
    description: spec.description(context),
    ...(spec.consequence ? { consequence: spec.consequence(context) } : {}),
    ...(spec.options ? { options: spec.options(context) } : {}),
  }));
}

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
