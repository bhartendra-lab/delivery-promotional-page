"use client";

import { useMemo, useState } from "react";
import type { CompanyUpdateInput } from "@/lib/api";
import type { Company, SocialLinks } from "@/lib/types";
import { useSettings, useSectionSave } from "../SettingsContext";
import { SectionHeading, Card, Field, SaveBar, ShareIcon } from "../SettingsUI";

type PlatformKey = keyof SocialLinks;

const PLATFORMS: { key: PlatformKey; label: string; placeholder: string }[] = [
  { key: "instagram", label: "Instagram", placeholder: "@yourstudio or full URL" },
  { key: "facebook", label: "Facebook", placeholder: "facebook.com/yourstudio" },
  { key: "youtube", label: "YouTube", placeholder: "@yourstudio or full URL" },
  { key: "vimeo", label: "Vimeo", placeholder: "vimeo.com/yourstudio" },
  { key: "pinterest", label: "Pinterest", placeholder: "pinterest.com/yourstudio" },
  { key: "x", label: "X (Twitter)", placeholder: "@yourstudio or full URL" },
];

/**
 * Initial field values from the normalized map, falling back to the legacy
 * single-platform fields for instagram/facebook on companies not yet migrated.
 */
function initialValues(company: Company): Record<PlatformKey, string> {
  const sl = company.social_links ?? {};
  return {
    instagram: sl.instagram ?? company.instagram_link ?? "",
    facebook: sl.facebook ?? company.facebook_link ?? "",
    youtube: sl.youtube ?? "",
    vimeo: sl.vimeo ?? "",
    pinterest: sl.pinterest ?? "",
    x: sl.x ?? "",
  };
}

export default function SocialLinksPage() {
  const { company } = useSettings();
  const { saveState, errorMsg, submit } = useSectionSave();

  const initial = useMemo(() => initialValues(company), [company]);
  const [values, setValues] = useState(initial);

  const dirty = PLATFORMS.some((p) => values[p.key].trim() !== initial[p.key].trim());

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!dirty) return;
    // Send the whole map; the server normalizes handles → canonical URLs.
    const social_links: SocialLinks = {};
    for (const p of PLATFORMS) {
      const v = values[p.key].trim();
      if (v) social_links[p.key] = v;
    }
    const payload: CompanyUpdateInput = { social_links };
    submit(payload);
  }

  return (
    <form id="social-links-form" onSubmit={handleSubmit} className="space-y-6">
      <SectionHeading
        eyebrow="Brand & Delivery"
        title="Social Links"
        description="Connect your public social profiles. They show on your delivery pages and galleries. Enter a username or a full URL — we'll tidy it up."
      />

      <Card title="Social profiles" icon={<ShareIcon />}>
        <div className="grid gap-4 sm:grid-cols-2">
          {PLATFORMS.map((p) => (
            <Field
              key={p.key}
              label={p.label}
              value={values[p.key]}
              onChange={(v) => setValues((prev) => ({ ...prev, [p.key]: v }))}
              placeholder={p.placeholder}
            />
          ))}
        </div>
      </Card>

      <SaveBar saveState={saveState} errorMsg={errorMsg} canSave={dirty} dirty={dirty} formId="social-links-form" />
    </form>
  );
}
