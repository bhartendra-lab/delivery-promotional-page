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
  const [address, setAddress] = useState(company.address ?? "");
  const [contactNumber, setContactNumber] = useState(company.contact_number ?? "");
  const [businessEmail, setBusinessEmail] = useState(company.business_email ?? "");
  const [website, setWebsite] = useState(company.website ?? "");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;
    const payload: CompanyUpdateInput = {};
    if (changed(name, company.name)) payload.name = name.trim();
    if (changed(address, company.address)) payload.address = address.trim();
    if (changed(contactNumber, company.contact_number)) payload.contact_number = contactNumber.trim();
    if (changed(businessEmail, company.business_email)) payload.business_email = businessEmail.trim();
    if (changed(website, company.website)) payload.website = website.trim();
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
          <Field label="Address" value={address} onChange={setAddress} placeholder="123 Main St, City" className="sm:col-span-2" />
          <Field label="Business email" value={businessEmail} onChange={setBusinessEmail} placeholder="studio@email.com" type="email" className="sm:col-span-2" />
          <Field label="Contact number" value={contactNumber} onChange={setContactNumber} placeholder="+91 98765 43210" type="tel" />
          <Field label="Website" value={website} onChange={setWebsite} placeholder="https://yourstudio.com" type="url" />
        </div>
      </Card>

      <SaveBar saveState={saveState} errorMsg={errorMsg} canSave={!!name.trim()} />
    </form>
  );
}
