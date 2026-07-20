"use client";

import { useState } from "react";
import type { CompanyUpdateInput } from "@/lib/api";
import { useSettings, useSectionSave } from "../SettingsContext";
import {
  SectionHeading,
  Card,
  Field,
  AddressField,
  CopyableIdField,
  SaveBar,
  GlobeIcon,
  CheckIcon,
  changed,
} from "../SettingsUI";

export default function OnlinePresencePage() {
  const { company } = useSettings();
  const { saveState, errorMsg, submit } = useSectionSave();

  const [address, setAddress] = useState(company.address ?? "");
  const [googlePlaceId, setGooglePlaceId] = useState(company.google_place_id ?? "");
  const [website, setWebsite] = useState(company.website ?? "");

  const dirty =
    changed(address, company.address) ||
    changed(googlePlaceId, company.google_place_id) ||
    changed(website, company.website);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const payload: CompanyUpdateInput = {};
    if (changed(address, company.address)) payload.address = address.trim();
    if (changed(googlePlaceId, company.google_place_id)) payload.google_place_id = googlePlaceId.trim();
    if (changed(website, company.website)) payload.website = website.trim();
    submit(payload);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <SectionHeading
        eyebrow="Brand & Delivery"
        title="Online Presence"
        description="Your studio's address and website, used for Google reviews and links on delivery pages."
      />

      <Card title="Online presence" icon={<GlobeIcon />}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <AddressField
              value={address}
              onChange={setAddress}
              onPlaceSelect={({ placeId }) => setGooglePlaceId(placeId)}
              placeholder="Search your studio on Google"
            />
            <p className="mt-1.5 text-xs text-[var(--color-brand-muted)]">
              Select a match from the list to link Google reviews automatically.
            </p>
          </div>

          <Field label="Website" value={website} onChange={setWebsite} placeholder="https://yourstudio.com" type="url" />

          {googlePlaceId && (
            <div>
              <CopyableIdField label="Google Place ID" value={googlePlaceId} />
              <p className="mt-1.5 flex items-center gap-1 text-xs text-[var(--color-brand-muted)]">
                <CheckIcon className="h-3 w-3 shrink-0 text-[var(--color-brand-success)]" />
                Auto-detected from your address · powers reviews on delivery pages
              </p>
            </div>
          )}
        </div>
      </Card>

      <SaveBar saveState={saveState} errorMsg={errorMsg} canSave={dirty} />
    </form>
  );
}
