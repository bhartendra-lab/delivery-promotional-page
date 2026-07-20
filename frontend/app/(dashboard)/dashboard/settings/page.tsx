"use client";

import { useState } from "react";
import type { CompanyUpdateInput } from "@/lib/api";
import { useSettings, useSectionSave } from "./SettingsContext";
import {
  SectionHeading,
  Card,
  Field,
  SaveBar,
  BuildingIcon,
  changed,
} from "./SettingsUI";

export default function StudioIdentityPage() {
  const { company } = useSettings();
  const { saveState, errorMsg, submit } = useSectionSave();

  const [name, setName] = useState(company.name ?? "");
  const [contactNumber, setContactNumber] = useState(company.contact_number ?? "");
  const [businessEmail, setBusinessEmail] = useState(company.business_email ?? "");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;
    const payload: CompanyUpdateInput = {};
    if (changed(name, company.name)) payload.name = name.trim();
    if (changed(contactNumber, company.contact_number)) payload.contact_number = contactNumber.trim();
    if (changed(businessEmail, company.business_email)) payload.business_email = businessEmail.trim();
    submit(payload);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <SectionHeading
        eyebrow="Studio"
        title="Studio Identity"
        description="Core details that identify your studio across delivery pages."
      />

      <Card title="Studio identity" icon={<BuildingIcon />}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Studio name" value={name} onChange={setName} required placeholder="e.g. Radiant Studios" className="sm:col-span-2" />
          <Field label="Business email" value={businessEmail} onChange={setBusinessEmail} placeholder="studio@email.com" type="email" />
          <Field label="Contact number" value={contactNumber} onChange={setContactNumber} placeholder="+91 98765 43210" type="tel" />
        </div>
      </Card>

      <SaveBar saveState={saveState} errorMsg={errorMsg} canSave={!!name.trim()} />
    </form>
  );
}
