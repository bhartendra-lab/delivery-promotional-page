"use client";

import { useMemo, useState } from "react";
import type { CompanyUpdateInput } from "@/lib/api";
import type { Company, SocialLinks } from "@/lib/types";
import {
  SOCIAL_PLATFORMS,
  SOCIAL_PLATFORM_BY_KEY,
  isSocialPlatformKey,
  validateSocialLinkInput,
  type SocialPlatformKey,
  type SocialPlatformSpec,
} from "@/lib/social-platforms";
import { SocialChip } from "@/components/event/screens/lounge/SocialIcons";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { IconStar } from "@/components/ui/icons";
import { useSettings, useSectionSave, useReportDirty } from "../SettingsContext";
import { SectionHeading, Card, SaveBar, ShareIcon, PlatformLinkRow, RequiredVisitMarker } from "../SettingsUI";

type Values = Record<SocialPlatformKey, string>;

/**
 * Initial field values from the normalized map, falling back to the legacy
 * single-platform fields for instagram/facebook on companies not yet migrated.
 */
function initialValues(company: Company): Values {
  const sl = company.social_links ?? {};
  const legacy: Partial<Values> = { instagram: company.instagram_link, facebook: company.facebook_link };
  return Object.fromEntries(
    SOCIAL_PLATFORMS.map(({ key }) => [key, sl[key] ?? legacy[key] ?? ""]),
  ) as Values;
}

/** The saved required visit, as this page may show it. The server already
 *  clears a marker whose link is gone; an unknown key is treated the same. */
function initialRequired(company: Company): SocialPlatformKey | null {
  return isSocialPlatformKey(company.mandatory_visit_platform) ? company.mandatory_visit_platform : null;
}

/** A change to the required visit that needs a yes first. Clearing it never
 *  does — that removes friction for Guests, the safe direction. */
type PendingConfirm =
  | { kind: "set"; platform: SocialPlatformKey }
  | { kind: "switch"; platform: SocialPlatformKey; from: SocialPlatformKey }
  | { kind: "removeLink"; platform: SocialPlatformKey };

const GROUPS: { group: SocialPlatformSpec["group"]; title: string; description?: string; icon: React.ReactNode }[] = [
  { group: "social", title: "Social profiles", icon: <ShareIcon /> },
  {
    group: "portal",
    title: "Listing and review portals",
    description: "Where couples find and review you. These show alongside your socials in every gallery.",
    icon: <IconStar size={15} />,
  },
];

export default function SocialLinksPage() {
  const { company } = useSettings();
  const { saveState, errorMsg, submit } = useSectionSave();

  const initial = useMemo(() => initialValues(company), [company]);
  const savedRequired = useMemo(() => initialRequired(company), [company]);
  const [values, setValues] = useState(initial);
  const [required, setRequired] = useState<SocialPlatformKey | null>(savedRequired);
  const [touched, setTouched] = useState<Set<SocialPlatformKey>>(new Set());
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const dirty =
    SOCIAL_PLATFORMS.some((p) => values[p.key].trim() !== initial[p.key].trim()) || required !== savedRequired;
  useReportDirty(dirty);

  const errors = useMemo(() => {
    const out: Partial<Record<SocialPlatformKey, string>> = {};
    for (const { key } of SOCIAL_PLATFORMS) {
      const error = validateSocialLinkInput(key, values[key]);
      if (error) out[key] = error;
    }
    return out;
  }, [values]);
  // Shown once the Studio has left the field, so a link being typed doesn't
  // flash "paste the full link" for its first few keystrokes. Save is blocked
  // either way, and leaving the field (including to click Save) reveals why.
  const visibleError = (key: SocialPlatformKey) => (touched.has(key) ? errors[key] ?? null : null);
  const hasErrors = Object.keys(errors).length > 0;
  const firstVisibleError = SOCIAL_PLATFORMS.map((p) => visibleError(p.key)).find(Boolean) ?? null;
  const canSave = dirty && !hasErrors;

  function toggleRequired(platform: SocialPlatformKey) {
    if (required === platform) {
      setRequired(null);
      return;
    }
    setPending(required ? { kind: "switch", platform, from: required } : { kind: "set", platform });
  }

  function save() {
    const social_links: SocialLinks = {};
    for (const p of SOCIAL_PLATFORMS) {
      const v = values[p.key].trim();
      if (v) social_links[p.key] = v;
    }
    // A marker on a platform whose link is now empty is cleared too — the
    // server does the same unconditionally, this just says so in the payload.
    const nextRequired = required && social_links[required] ? required : null;
    const payload: CompanyUpdateInput = { social_links };
    if (nextRequired !== savedRequired) payload.mandatory_visit_platform = nextRequired ?? "";
    setRequired(nextRequired);
    // Send the whole map; the server normalizes handles → canonical URLs.
    submit(payload);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!dirty) return;
    if (hasErrors) {
      setTouched(new Set(SOCIAL_PLATFORMS.map((p) => p.key)));
      return;
    }
    if (required && !values[required].trim()) {
      setPending({ kind: "removeLink", platform: required });
      return;
    }
    save();
  }

  function handleDiscard() {
    setValues(initial);
    setRequired(savedRequired);
    setTouched(new Set());
  }

  // Arrow keys move between the markers, as in any radiogroup. Each marker is
  // also its own Tab stop, because they sit between the link inputs.
  function onMarkerKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    const group = e.currentTarget.closest('[role="radiogroup"]');
    const markers = Array.from(group?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? []);
    const next = markers[(markers.indexOf(e.currentTarget) + step + markers.length) % markers.length];
    if (next) {
      e.preventDefault();
      next.focus();
    }
  }

  const requiredSpec = required ? SOCIAL_PLATFORM_BY_KEY[required] : null;
  const pendingSpec = pending ? SOCIAL_PLATFORM_BY_KEY[pending.platform] : null;

  return (
    <form id="social-links-form" onSubmit={handleSubmit} className="space-y-6">
      <SectionHeading
        title="Social Links"
        description="Connect your public profiles and listings. They show on your delivery pages and galleries. Enter a username or a full URL for a social profile — we'll tidy it up. Listing portals need the full link."
      />

      {/* The current state at a glance, without scanning nine rows. */}
      <div className="rounded-card border border-[var(--color-brand-border)] bg-[var(--color-brand-surface-raised)] px-4 py-3.5 sm:px-5">
        {requiredSpec ? (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <SocialChip platform={requiredSpec.key} size={24} />
              <p className="min-w-0 flex-1 basis-[220px] text-[13px] text-[var(--color-brand-ink)]">
                <span className="font-semibold">Required visit: {requiredSpec.label}.</span> Guests open this once before
                entering any gallery.
              </p>
              <button
                type="button"
                onClick={() => setRequired(null)}
                className="brand-focus shrink-0 rounded-md text-[13px] font-semibold text-[var(--color-brand-navy)] hover:underline"
              >
                Remove
              </button>
            </div>
            <p className="mt-1.5 text-xs text-[var(--color-brand-muted)]">
              Guests see this before their photos. Keep it to something quick.
            </p>
          </>
        ) : (
          <p className="text-[13px] text-[var(--color-brand-muted)]">
            No required visit. Guests enter your galleries straight away.
          </p>
        )}
      </div>

      <div role="radiogroup" aria-label="Required visit link" className="space-y-6">
        {GROUPS.map(({ group, title, description, icon }) => (
          <Card key={group} title={title} description={description} icon={icon}>
            <div className="space-y-5">
              {SOCIAL_PLATFORMS.filter((p) => p.group === group).map((p) => (
                <PlatformLinkRow
                  key={p.key}
                  chip={<SocialChip platform={p.key} size={28} />}
                  label={p.label}
                  value={values[p.key]}
                  onChange={(v) => setValues((prev) => ({ ...prev, [p.key]: v }))}
                  onBlur={() => setTouched((prev) => (prev.has(p.key) ? prev : new Set(prev).add(p.key)))}
                  placeholder={p.placeholder}
                  error={visibleError(p.key)}
                  marker={
                    <RequiredVisitMarker
                      checked={required === p.key}
                      disabled={!values[p.key].trim()}
                      onToggle={() => toggleRequired(p.key)}
                      onKeyDown={onMarkerKeyDown}
                    />
                  }
                />
              ))}
            </div>
          </Card>
        ))}
      </div>

      <SaveBar
        saveState={saveState}
        errorMsg={errorMsg}
        canSave={canSave}
        dirty={dirty}
        formId="social-links-form"
        blockedReason={firstVisibleError}
        onDiscard={handleDiscard}
      />

      <ConfirmDialog
        open={pending?.kind === "set"}
        title={`Ask every Guest to open ${pendingSpec?.label}?`}
        description="Guests will be asked to open this link before they can see their photos. You can remove it any time."
        confirmLabel="Set required visit"
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending) setRequired(pending.platform);
          setPending(null);
        }}
      />
      <ConfirmDialog
        open={pending?.kind === "switch"}
        title={`Change the required visit to ${pendingSpec?.label}?`}
        description={
          pending?.kind === "switch"
            ? `New Guests will be sent to ${pendingSpec?.label}. Guests who already opened ${SOCIAL_PLATFORM_BY_KEY[pending.from].label} keep their place and will not be asked again.`
            : ""
        }
        confirmLabel="Change link"
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending) setRequired(pending.platform);
          setPending(null);
        }}
      />
      <ConfirmDialog
        open={pending?.kind === "removeLink"}
        title={`Remove your ${pendingSpec?.label} link?`}
        description="It is currently your required visit link, so that will be switched off too."
        confirmLabel="Remove both"
        onCancel={() => setPending(null)}
        onConfirm={() => {
          setPending(null);
          save();
        }}
      />
    </form>
  );
}
