/**
 * Guest-facing delivery preferences for one event's gallery — the single source
 * of truth for the shape, the defaults, and how each preference is presented.
 *
 * To add a preference: add the key to `DeliveryPreferences`, a default to
 * `DELIVERY_PREFERENCE_DEFAULTS`, and a spec to `DELIVERY_PREFERENCE_SPECS`.
 * Every host renders whatever `resolveDeliveryPreferenceFields` returns for its
 * surface, so none of them needs touching. Mirror the key in the backend's
 * `deliveryPreferencesSchema` + `DELIVERY_PREFERENCE_DEFAULTS`.
 *
 * A spec's copy and its visibility are both functions of the booking's context
 * and the current draft, which is what lets one row be called "4K downloads"
 * for one event and "Original file downloads" for another — and lets it
 * disappear entirely for an event that has neither.
 */

import {
  ARCHIVE_TIER_SHORT,
  DELIVERY_TIER_LABEL,
  archiveFilesPhrase,
  type ArchiveTier,
} from "./quality-tiers.ts";

export type { ArchiveTier };

/** Who may download the unwatermarked archive copy (4K or original). */
export type ArchiveDownloadAccess = "none" | "host_only" | "all_guests";

export type DeliveryPreferences = {
  allow_download: boolean;
  archive_download_access: ArchiveDownloadAccess;
  /** Per-event opt-OUT of the Studio's required visit link. True follows the
   *  Studio, which for a Studio that has set none is still no gate. */
  require_social_visit: boolean;
  /** Every Google review affordance in this gallery. The company-wide
   *  `google_review_enabled` is the master switch. */
  show_google_review: boolean;
};

export const DELIVERY_PREFERENCE_DEFAULTS: DeliveryPreferences = {
  allow_download: true,
  archive_download_access: "host_only",
  require_social_visit: true,
  show_google_review: true,
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

/**
 * Where a preference row renders. "gallery" = the Media tab's gear modal and
 * the upload dialog's Preferences step. "access" = the Access & Sharing tab.
 */
export type DeliveryPreferenceSurface = "gallery" | "access";

/* Tier vocabulary lives in one module — see lib/quality-tiers.ts for why the
   studio and a guest are shown different names for the same file. */

/**
 * What the panel needs to know about the booking beyond the preference values
 * themselves.
 *
 * `archiveTiers` is EVERY archive tier this event holds, because the quality
 * tier is chosen per upload run and one event routinely mixes original files
 * from one run with 4K from another. Empty means every photo is HD —
 * there is no unwatermarked copy in existence, so a preference governing who
 * may download one has nothing to govern and is not shown. In the upload dialog
 * this also folds in the tier the studio has just SELECTED, since that run is
 * about to create those copies.
 */
export type DeliveryPreferenceContext = {
  archiveTiers: ArchiveTier[];
  /** Label of the Studio's required visit platform, for the row's copy. */
  requiredVisitLabel?: string;
  /** The company-wide review switch. False means the per-event row is
   *  overridden and must say so rather than claiming a state it does not have. */
  googleReviewEnabledGlobally?: boolean;
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
  /**
   * Present when a setting OUTSIDE this event overrides the row. The panel
   * renders it disabled, showing `value` (the effective state, not the stored
   * one) and `note` in place of the consequence line.
   */
  locked?: { value: DeliveryPreferences[keyof DeliveryPreferences]; note: string };
};

/**
 * The registry entry. Copy is written as functions of the booking's context so
 * that a tier's NAME is never hardcoded into a sentence — the same row reads
 * "4K downloads" for one event and "Original file downloads" for
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
  /** Where this row renders. Defaults to ["gallery"] so every existing spec is
   *  unchanged. "gallery" = the Media tab's gear modal + the upload dialog's
   *  Preferences step. "access" = the Access & Sharing tab. */
  surfaces?: DeliveryPreferenceSurface[];
  /**
   * The row is overridden from outside this event: return the value it
   * effectively has and the sentence that says why, or null when it is not.
   * Use this rather than `isRelevant` for a setting that still EXISTS but is
   * switched off elsewhere — hiding it would teach the studio it does not exist.
   */
  lock?: (ctx: DeliveryPreferenceContext) => DeliveryPreferenceField["locked"] | null;
};

/** Render order within each surface. */
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
    // "Full-resolution": a studio that uploaded 4K did not upload
    // originals, and calling those files "full-resolution originals" would be
    // wrong as well as vague.
    label: (ctx) =>
      ctx.archiveTiers.length === 1
        ? `${ARCHIVE_TIER_SHORT[ctx.archiveTiers[0]]} downloads`
        : // An event holding both has no single honest tier name, and this is
          // where the generic label earns its place — the setting governs both
          // equally.
          "Full-resolution downloads",
    description: (ctx) =>
      `Who can download the unwatermarked ${archiveFilesPhrase(ctx.archiveTiers)} you uploaded. Everyone else gets the watermarked ${DELIVERY_TIER_LABEL.studio} version.`,
    // Two independent reasons this row can be meaningless, and both hide it
    // rather than showing a control that governs nothing:
    //  - the event is HD-only, so no unwatermarked copy exists at all;
    //  - downloads are switched off outright, which overrides this setting
    //    anyway (see the endpoint's authorisation order).
    isRelevant: (ctx, value) => value.allow_download && ctx.archiveTiers.length > 0,
    options: (ctx) => {
      const files = archiveFilesPhrase(ctx.archiveTiers);
      return [
        {
          value: "host_only",
          label: "Only the family (passcode holders)",
          description: `Guests who have entered the family passcode can download the ${files}. Everyone else gets the watermarked ${DELIVERY_TIER_LABEL.studio} copy.`,
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
  {
    key: "show_google_review",
    type: "toggle",
    surfaces: ["gallery"],
    label: () => "Ask Guests for reviews",
    description: () => "Show the Google review button and prompt in this gallery.",
    consequence: () =>
      "No review button or prompt anywhere in this gallery. Guests can still find you through your other links.",
    // Disabled and shown OFF, never hidden, while the Studio has reviews off
    // for every gallery: the event's own value is kept but has no effect, and
    // a row claiming "on" would be a lie the studio acts on.
    lock: (ctx) =>
      ctx.googleReviewEnabledGlobally === false
        ? { value: false, note: "Turned off for every gallery in Settings." }
        : null,
  },
  {
    key: "require_social_visit",
    type: "toggle",
    // Access & Sharing only — the tab that decides how Guests get in. The link
    // itself is chosen Studio-wide in Settings → Social Links; an event can
    // only opt out of it, never point somewhere else.
    surfaces: ["access"],
    label: (ctx) => `Ask Guests to open ${ctx.requiredVisitLabel ?? "your required link"}`,
    description: (ctx) =>
      `Every Guest opens your ${ctx.requiredVisitLabel ?? "required"} page once before they see their photos. The link is set in Settings → Social Links.`,
    consequence: () => "Guests of this event go straight to their photos. Your other events still ask.",
  },
];

/**
 * The rows to render for one booking on one surface, in order, with every
 * string resolved.
 *
 * The context defaults to "no archive tier", which hides the archive row — the
 * safe direction for a host that has not been taught to supply one, since the
 * setting it hides has a conservative default of its own.
 */
export function resolveDeliveryPreferenceFields(
  value: DeliveryPreferences,
  context: DeliveryPreferenceContext = { archiveTiers: [] },
  surface: DeliveryPreferenceSurface = "gallery",
): DeliveryPreferenceField[] {
  return DELIVERY_PREFERENCE_SPECS.filter(
    (spec) => (spec.surfaces ?? ["gallery"]).includes(surface) && (spec.isRelevant?.(context, value) ?? true),
  ).map((spec) => {
    const locked = spec.lock?.(context) ?? null;
    return {
      key: spec.key,
      type: spec.type,
      label: spec.label(context),
      description: spec.description(context),
      ...(spec.consequence ? { consequence: spec.consequence(context) } : {}),
      ...(spec.options ? { options: spec.options(context) } : {}),
      ...(locked ? { locked } : {}),
    };
  });
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
