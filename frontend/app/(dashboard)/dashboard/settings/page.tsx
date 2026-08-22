"use client";

import { useEffect, useRef, useState } from "react";
import type { CompanyUpdateInput } from "@/lib/api";
import type { Company } from "@/lib/types";
import { ImageUpload } from "@/components/ui/ImageUpload";
import { useSettings, useSectionSave, useReportDirty } from "./SettingsContext";
import { useReminders } from "@/components/dashboard/RemindersProvider";
import { ChangeWhatsappModal } from "./ChangeWhatsappModal";
import { ChangeBusinessEmailModal } from "./ChangeBusinessEmailModal";
import {
  SectionHeading,
  Card,
  Field,
  AddressField,
  CopyableIdField,
  VerifiedWhatsappField,
  VerifiedBusinessEmailField,
  SaveBar,
  BuildingIcon,
  GlobeIcon,
  ImageIcon,
  OpenIcon,
  CheckIcon,
  changed,
} from "./SettingsUI";

// Permissive "looks like a URL" check: scheme, then something, a dot, then
// something more — not a full RFC validator, just enough to catch garbage
// that survives the auto-prefix below (e.g. no dot at all).
const WEBSITE_RE = /^https?:\/\/[^\s]+\.[^\s]+$/i;

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
  const { refresh: refreshReminders } = useReminders();

  const [name, setName] = useState(company.name ?? "");
  const [website, setWebsite] = useState(company.website ?? "");

  const loginEmail = userProfile?.email?.trim() ?? "";

  const [address, setAddress] = useState(company.address ?? "");
  const [googlePlaceId, setGooglePlaceId] = useState(company.google_place_id ?? "");

  // The formatted address Google last committed via onPlaceSelect. Initialised
  // from the loaded company address (not "") so an already-saved listing
  // doesn't get its place ID wiped by the first unrelated keystroke on page
  // load. Any further typing that diverges from this means the picked place
  // no longer matches what's in the field, so the stale placeId must be
  // cleared — see handleAddressChange below.
  const committedAddressRef = useRef<string>(company.address ?? "");

  function handleAddressChange(value: string) {
    setAddress(value);
    if (value !== committedAddressRef.current) setGooglePlaceId("");
  }

  function handleRemoveListing() {
    if (
      !window.confirm(
        "Remove this listing? Guests will no longer see a Leave a review button on any of your galleries.",
      )
    ) {
      return;
    }
    setGooglePlaceId("");
    setAddress("");
    committedAddressRef.current = "";
  }

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

  // business_email is only ever writable via the OTP-gated verify flow (see
  // ChangeBusinessEmailModal) — it's intentionally excluded from `dirty` and
  // the save payload below so the shared SaveBar never claims unsaved changes
  // for a field this form no longer owns.
  const [emailVerifyOpen, setEmailVerifyOpen] = useState(false);
  const [emailVerifiedFlash, setEmailVerifiedFlash] = useState(false);
  const emailFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Neither flash timer was cleared on unmount before — unlike useSaveState
  // and CopyableIdField, which both do — so navigating away from Settings
  // within the 3s flash window fired a setState on an unmounted component.
  useEffect(() => {
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
      if (emailFlashTimer.current) clearTimeout(emailFlashTimer.current);
    };
  }, []);

  function handleBusinessEmailVerified(updatedCompany: Company) {
    setCompanyState(updatedCompany);
    setEmailVerifiedFlash(true);
    if (emailFlashTimer.current) clearTimeout(emailFlashTimer.current);
    emailFlashTimer.current = setTimeout(() => setEmailVerifiedFlash(false), 3000);
    // Resolves the branding-readiness "Business Email" checkpoint — refresh
    // so a studio returning to an event doesn't see a stale reminder.
    void refreshReminders();
  }

  const dirty =
    changed(name, company.name) ||
    changed(website, company.website) ||
    changed(address, company.address) ||
    changed(googlePlaceId, company.google_place_id) ||
    !!darkFile ||
    !!lightFile;
  useReportDirty(dirty);

  // Whitespace-only passes the input's native `required` (it isn't empty),
  // so without this the save bar just sits there permanently disabled with
  // no indication why — canSave already correctly blocked it via
  // `!!name.trim()`, this only adds the explanation.
  const nameError = name.length > 0 && !name.trim() ? "Studio name can't be blank." : null;
  const trimmedWebsite = website.trim();
  const websiteError = trimmedWebsite && !WEBSITE_RE.test(trimmedWebsite) ? "Enter a valid website address." : null;
  const canSave = !!name.trim() && !websiteError && dirty;
  const blockedReason = nameError ?? websiteError ?? null;

  // Auto-prefixes a bare domain ("royalorchidbanquet.com") with https:// on
  // blur rather than relying on native `type="url"` validation — that
  // bubble anchors to the input, which can sit below the sticky save bar on
  // a scrolled page, making the explanation invisible when the button
  // appears to just do nothing. Chosen over validate-and-explain-only:
  // completing an obviously-implied scheme on a *website* field is a safe,
  // low-risk assist (unlike guessing at a phone number's country code),
  // and matches how people actually type a website address.
  function normalizeWebsiteOnBlur() {
    if (!trimmedWebsite || /^https?:\/\//i.test(trimmedWebsite)) return;
    setWebsite(`https://${trimmedWebsite}`);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim() || websiteError) return;
    const payload: CompanyUpdateInput = {};
    if (changed(name, company.name)) payload.name = name.trim();
    if (changed(website, company.website)) payload.website = trimmedWebsite;
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

  function handleDiscard() {
    setName(company.name ?? "");
    setWebsite(company.website ?? "");
    setAddress(company.address ?? "");
    setGooglePlaceId(company.google_place_id ?? "");
    committedAddressRef.current = company.address ?? "";
    setDarkFile(null);
    setLightFile(null);
  }

  return (
    <form id="studio-identity-form" onSubmit={handleSubmit} className="space-y-6">
      <SectionHeading
        title="Studio Identity"
        description="How your studio shows up on every delivery page you send to clients, and on Google."
      />

      <Card
        title="Business information"
        icon={<BuildingIcon />}
        description="Core details clients see on every delivery page."
      >
        <div className="space-y-5">
          <Field
            label="Studio name"
            value={name}
            onChange={setName}
            required
            placeholder="e.g. Radiant Studios"
            error={nameError ?? undefined}
            layout="row"
          />
          <VerifiedBusinessEmailField
            businessEmail={company.business_email}
            verified={company.business_email_verified}
            onActionClick={() => setEmailVerifyOpen(true)}
            layout="row"
          />
        </div>
        {emailVerifiedFlash && (
          <p className="mt-1.5 text-xs font-semibold text-[var(--color-brand-success)]" aria-live="polite">
            Business email verified.
          </p>
        )}
        <div className="mt-5">
          <VerifiedWhatsappField
            whatsappNumber={company.whatsapp_number}
            verified={company.whatsapp_verified}
            onChangeClick={() => setChangeWhatsappOpen(true)}
            layout="row"
          />
          {whatsappUpdatedFlash && (
            <p className="mt-1.5 text-xs font-semibold text-[var(--color-brand-success)]" aria-live="polite">
              WhatsApp number updated.
            </p>
          )}
        </div>
        <Field
          label="Website"
          value={website}
          onChange={setWebsite}
          onBlur={normalizeWebsiteOnBlur}
          placeholder="yourstudio.com"
          type="text"
          className="mt-5"
          error={websiteError ?? undefined}
          layout="row"
        />
      </Card>

      <Card
        title="Google Business integration"
        icon={<GlobeIcon />}
        description="This powers the Google Reviews link on your delivery pages. Getting the right listing here means clients land on the correct page when they tap Leave a review."
      >
        <div className="space-y-5">
          <div>
            <AddressField
              label="Your studio on Google"
              value={address}
              onChange={handleAddressChange}
              onPlaceSelect={({ placeId, address: pickedAddress }) => {
                setGooglePlaceId(placeId);
                committedAddressRef.current = pickedAddress;
              }}
              placeholder="Search for your studio"
              layout="row"
            />
            <p className="mt-1.5 text-xs text-[var(--color-brand-muted)]">
              Pick the matching listing from the list. This links your Google reviews automatically.
            </p>
          </div>

          {googlePlaceId && (
            <CopyableIdField
              label="Google Reviews ID"
              value={googlePlaceId}
              layout="row"
              helper={
                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                  <p className="flex items-center gap-1 text-xs text-[var(--color-brand-muted)]">
                    <CheckIcon className="h-3 w-3 shrink-0 text-[var(--color-brand-success)]" />
                    This is the page clients land on when they tap Leave a review.
                  </p>
                  <div className="flex items-center gap-3">
                    <a
                      href={`https://search.google.com/local/writereview?placeid=${encodeURIComponent(googlePlaceId)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="brand-focus inline-flex items-center gap-1.5 rounded-md text-xs font-semibold text-[var(--color-brand-navy)] hover:underline"
                    >
                      <OpenIcon className="h-3.5 w-3.5" />
                      See your Google Reviews page
                    </a>
                    <button
                      type="button"
                      onClick={handleRemoveListing}
                      className="brand-focus rounded-md text-xs font-semibold text-[var(--color-brand-danger)] hover:underline"
                    >
                      Remove listing
                    </button>
                  </div>
                </div>
              }
            />
          )}
        </div>
      </Card>

      <Card title="Studio logo" icon={<ImageIcon />}>
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
        canSave={canSave}
        dirty={dirty}
        formId="studio-identity-form"
        idleHint="Changes apply to all delivery pages immediately."
        blockedReason={blockedReason}
        onDiscard={handleDiscard}
      />

      <ChangeWhatsappModal
        open={changeWhatsappOpen}
        onClose={() => setChangeWhatsappOpen(false)}
        currentNumber={company.whatsapp_number}
        onSuccess={handleWhatsappChanged}
      />

      <ChangeBusinessEmailModal
        open={emailVerifyOpen}
        onClose={() => setEmailVerifyOpen(false)}
        currentEmail={company.business_email}
        verified={company.business_email_verified}
        loginEmail={loginEmail}
        onSuccess={handleBusinessEmailVerified}
      />
    </form>
  );
}
