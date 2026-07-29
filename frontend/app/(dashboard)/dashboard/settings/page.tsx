"use client";

import { useRef, useState } from "react";
import type { CompanyUpdateInput } from "@/lib/api";
import type { Company } from "@/lib/types";
import { ImageUpload } from "@/components/ui/ImageUpload";
import { useSettings, useSectionSave } from "./SettingsContext";
import { ChangeWhatsappModal } from "./ChangeWhatsappModal";
import {
  SectionHeading,
  Card,
  Field,
  AddressField,
  CopyableIdField,
  SameAsPersonalCheckbox,
  VerifiedWhatsappField,
  SaveBar,
  BuildingIcon,
  GlobeIcon,
  ImageIcon,
  OpenIcon,
  CheckIcon,
  changed,
} from "./SettingsUI";

/**
 * Studio Identity — the merged Business Information, Google Business
 * Integration and Studio Logo tab. Previously three separate routes/nav
 * items (`/settings`, `/settings/online-presence`, `/settings/logo`);
 * merged into one so studios only have one place to set up how they show up
 * on delivery pages and Google. One shared save bar for the whole page.
 */
export default function StudioIdentityPage() {
  const { company, userProfile, setCompanyState } = useSettings();
  const { saveState, errorMsg, submit } = useSectionSave();

  const [name, setName] = useState(company.name ?? "");
  const [businessEmail, setBusinessEmail] = useState(company.business_email ?? "");
  const [website, setWebsite] = useState(company.website ?? "");

  const [sameEmail, setSameEmail] = useState(false);
  const personalEmail = userProfile?.personal_email?.trim() ?? "";

  function toggleSameEmail(next: boolean) {
    setSameEmail(next);
    if (next) setBusinessEmail(personalEmail);
  }

  const [address, setAddress] = useState(company.address ?? "");
  const [googlePlaceId, setGooglePlaceId] = useState(company.google_place_id ?? "");

  const [darkFile, setDarkFile] = useState<File | null>(null);
  const [lightFile, setLightFile] = useState<File | null>(null);

  const [changeWhatsappOpen, setChangeWhatsappOpen] = useState(false);
  const [whatsappUpdatedFlash, setWhatsappUpdatedFlash] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleWhatsappChanged(updatedCompany: Company) {
    setCompanyState(updatedCompany);
    setWhatsappUpdatedFlash(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setWhatsappUpdatedFlash(false), 3000);
  }

  const dirty =
    changed(name, company.name) ||
    changed(businessEmail, company.business_email) ||
    changed(website, company.website) ||
    changed(address, company.address) ||
    changed(googlePlaceId, company.google_place_id) ||
    !!darkFile ||
    !!lightFile;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;
    const payload: CompanyUpdateInput = {};
    if (changed(name, company.name)) payload.name = name.trim();
    if (changed(businessEmail, company.business_email)) payload.business_email = businessEmail.trim();
    if (changed(website, company.website)) payload.website = website.trim();
    if (changed(address, company.address)) payload.address = address.trim();
    if (changed(googlePlaceId, company.google_place_id)) payload.google_place_id = googlePlaceId.trim();
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
        title="Studio Identity"
        description="How your studio shows up on every delivery page you send to clients, and on Google."
      />

      <Card title="Business Information" icon={<BuildingIcon />}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Studio name"
            value={name}
            onChange={setName}
            required
            placeholder="e.g. Radiant Studios"
            className="sm:col-span-2"
          />
          <Field
            label="Business email"
            value={businessEmail}
            onChange={setBusinessEmail}
            placeholder="studio@email.com"
            type="email"
            readOnly={sameEmail}
          />
        </div>
        {personalEmail && (
          <SameAsPersonalCheckbox
            label="Same as personal email"
            checked={sameEmail}
            onChange={toggleSameEmail}
          />
        )}
        <div className="mt-4">
          <VerifiedWhatsappField
            whatsappNumber={company.whatsapp_number}
            verified={company.whatsapp_verified}
            onChangeClick={() => setChangeWhatsappOpen(true)}
          />
          {whatsappUpdatedFlash && (
            <p className="mt-1.5 text-xs font-semibold text-[var(--color-brand-success)]">
              WhatsApp number updated.
            </p>
          )}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field
            label="Website"
            value={website}
            onChange={setWebsite}
            placeholder="https://yourstudio.com"
            type="url"
            className="sm:col-span-2"
          />
        </div>
      </Card>

      <Card title="Google Business Integration" icon={<GlobeIcon />}>
        <p className="mb-4 text-sm text-[var(--color-brand-muted)]">
          This powers the Google Reviews link on your delivery pages. Getting the right
          listing here means clients land on the correct page when they tap Leave a review.
        </p>
        <div className="space-y-4">
          <div>
            <AddressField
              label="Your studio on Google"
              value={address}
              onChange={setAddress}
              onPlaceSelect={({ placeId }) => setGooglePlaceId(placeId)}
              placeholder="Search for your studio"
            />
            <p className="mt-1.5 text-xs text-[var(--color-brand-muted)]">
              Pick the matching listing from the list. This links your Google reviews automatically.
            </p>
          </div>

          {googlePlaceId && (
            <div>
              <CopyableIdField label="Google Reviews ID" value={googlePlaceId} />
              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-1 text-xs text-[var(--color-brand-muted)]">
                  <CheckIcon className="h-3 w-3 shrink-0 text-[var(--color-brand-success)]" />
                  This is the page clients land on when they tap Leave a review.
                </p>
                <a
                  href={`https://search.google.com/local/writereview?placeid=${encodeURIComponent(googlePlaceId)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="brand-focus inline-flex items-center gap-1.5 rounded-md text-xs font-semibold text-[var(--color-brand-navy)] hover:underline"
                >
                  <OpenIcon className="h-3.5 w-3.5" />
                  See your Google Reviews page
                </a>
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card title="Studio Logo" icon={<ImageIcon />}>
        <div id="studio-logo" className="scroll-mt-24">
          <div className="grid gap-5 sm:grid-cols-2">
            <ImageUpload
              label="Business logo (dark) · default"
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
            Shown on every delivery page. PNG, JPG or WEBP, up to 5 MB. Add a light logo
            too if any of your pages use a dark background; it falls back to the dark one
            where it isn&apos;t set.
          </p>
        </div>
      </Card>

      <SaveBar
        saveState={saveState}
        errorMsg={errorMsg}
        canSave={!!name.trim() && dirty}
        idleHint="Changes apply to all delivery pages immediately."
      />

      <ChangeWhatsappModal
        open={changeWhatsappOpen}
        onClose={() => setChangeWhatsappOpen(false)}
        currentNumber={company.whatsapp_number}
        onSuccess={handleWhatsappChanged}
      />
    </form>
  );
}
