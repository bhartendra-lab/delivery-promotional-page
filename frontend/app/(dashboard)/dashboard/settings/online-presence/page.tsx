"use client";

import { useState } from "react";
import type { CompanyUpdateInput } from "@/lib/api";
import { useSettings, useSectionSave } from "../SettingsContext";
import {
  SectionHeading,
  Card,
  Field,
  SaveBar,
  GlobeIcon,
  changed,
} from "../SettingsUI";

export default function OnlinePresencePage() {
  const { company } = useSettings();
  const { saveState, errorMsg, submit } = useSectionSave();

  const [gmbLink, setGmbLink] = useState(company.gmb_link ?? "");
  const [googlePlaceId, setGooglePlaceId] = useState(company.google_place_id ?? "");

  const dirty =
    changed(gmbLink, company.gmb_link) || changed(googlePlaceId, company.google_place_id);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const payload: CompanyUpdateInput = {};
    if (changed(gmbLink, company.gmb_link)) payload.gmb_link = gmbLink.trim();
    if (changed(googlePlaceId, company.google_place_id)) payload.google_place_id = googlePlaceId.trim();
    submit(payload);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <SectionHeading
        eyebrow="Brand & Delivery"
        title="Online Presence"
        description="Your Google Business presence, used for reviews and maps on delivery pages."
      />

      <Card title="Online presence" icon={<GlobeIcon />}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Google My Business link" value={gmbLink} onChange={setGmbLink} placeholder="https://g.page/your-studio" type="url" />
          <Field label="Google Place ID" value={googlePlaceId} onChange={setGooglePlaceId} placeholder="ChIJ..." />
        </div>
      </Card>

      <SaveBar saveState={saveState} errorMsg={errorMsg} canSave={dirty} />
    </form>
  );
}
