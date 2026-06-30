"use client";

import { useState } from "react";
import type { CompanyUpdateInput } from "@/lib/api";
import { ImageUpload } from "@/components/ui/ImageUpload";
import { useSettings, useSectionSave } from "../SettingsContext";
import { SectionHeading, Card, SaveBar, ImageIcon } from "../SettingsUI";

export default function StudioLogoPage() {
  const { company } = useSettings();
  const { saveState, errorMsg, submit } = useSectionSave();

  const [darkFile, setDarkFile] = useState<File | null>(null);
  const [lightFile, setLightFile] = useState<File | null>(null);

  const dirty = !!darkFile || !!lightFile;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!dirty) return;
    const payload: CompanyUpdateInput = {};
    if (darkFile) payload.logo = darkFile;
    if (lightFile) payload.logo_light = lightFile;
    const ok = await submit(payload);
    if (ok) {
      setDarkFile(null);
      setLightFile(null);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <SectionHeading
        eyebrow="Brand & Delivery"
        title="Studio Logo"
        description="Logos shown across your delivery pages. The dark logo is the default; the light logo is used on dark surfaces."
      />

      <Card title="Studio logo" icon={<ImageIcon />}>
        <div className="grid gap-5 sm:grid-cols-2">
          <ImageUpload
            label="Business logo (dark) — default"
            existingUrl={company.logo ?? null}
            file={darkFile}
            onChange={setDarkFile}
          />
          <ImageUpload
            label="Business logo (light)"
            existingUrl={company.logo_light ?? null}
            file={lightFile}
            onChange={setLightFile}
          />
        </div>
        <p className="mt-3 text-xs text-[var(--color-brand-muted)]">
          Used on all delivery pages. PNG, JPG or WEBP — max 5 MB. The light logo
          falls back to the dark one where it isn&apos;t set.
        </p>
      </Card>

      <SaveBar
        saveState={saveState}
        errorMsg={errorMsg}
        canSave={dirty}
        idleHint="Pick a new logo to replace the current one."
      />
    </form>
  );
}
