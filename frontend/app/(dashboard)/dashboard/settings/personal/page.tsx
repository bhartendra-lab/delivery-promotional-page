"use client";

import { useState } from "react";
import type { UserProfileUpdateInput } from "@/lib/api";
import type { UserProfile } from "@/lib/types";
import { useSettings, useProfileSectionSave, useReportDirty } from "../SettingsContext";
import {
  SectionHeading,
  Card,
  Field,
  PhoneField,
  SaveBar,
  UserIcon,
  changed,
  SectionSkeleton,
  FetchError,
} from "../SettingsUI";

const NAME_MAX_LENGTH = 120;

/**
 * Your Account → Personal Information. Your own details as the account
 * holder, kept separate from the studio's business details on Studio
 * Identity.
 *
 * Gated on `profileLoad` (not just `userProfile` being non-null): the form
 * itself only mounts once the profile has actually loaded, so its `useState`
 * seeding never captures a still-loading or failed-to-load null profile as
 * "" — which would otherwise make the save bar appear dirty on load and let
 * one click overwrite saved data with blanks.
 */
export default function PersonalInformationPage() {
  const { userProfile, profileLoad } = useSettings();

  if (profileLoad.status === "loading") {
    return (
      <div className="space-y-6">
        <PersonalInformationHeading />
        <SectionSkeleton />
      </div>
    );
  }

  if (profileLoad.status === "error" || !userProfile) {
    return (
      <div className="space-y-6">
        <PersonalInformationHeading />
        <FetchError
          message={profileLoad.status === "error" ? profileLoad.message : "Couldn't load your profile."}
        />
      </div>
    );
  }

  return <PersonalInformationForm profile={userProfile} />;
}

function PersonalInformationHeading() {
  return (
    <SectionHeading
      title="Personal Information"
      description="Your own details as the account holder. Not shown to clients."
    />
  );
}

function PersonalInformationForm({ profile }: { profile: UserProfile }) {
  const { saveState, errorMsg, submit } = useProfileSectionSave();

  const [firstName, setFirstName] = useState(profile.first_name ?? "");
  const [lastName, setLastName] = useState(profile.last_name ?? "");
  const [personalContact, setPersonalContact] = useState(profile.personal_contact ?? "");

  const dirty =
    changed(firstName, profile.first_name) ||
    changed(lastName, profile.last_name) ||
    changed(personalContact, profile.personal_contact);
  useReportDirty(dirty);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const payload: UserProfileUpdateInput = {};
    if (changed(firstName, profile.first_name)) payload.first_name = firstName.trim();
    if (changed(lastName, profile.last_name)) payload.last_name = lastName.trim();
    if (changed(personalContact, profile.personal_contact)) payload.personal_contact = personalContact.trim();
    await submit(payload);
  }

  function handleDiscard() {
    setFirstName(profile.first_name ?? "");
    setLastName(profile.last_name ?? "");
    setPersonalContact(profile.personal_contact ?? "");
  }

  return (
    <form id="personal-information-form" onSubmit={handleSubmit} className="space-y-6">
      <PersonalInformationHeading />

      <Card title="Your details" icon={<UserIcon />}>
        <div className="space-y-5">
          <Field
            label="Login email"
            value={profile.email ?? ""}
            onChange={() => {}}
            readOnly
            hint="Used only to sign in. For the address clients see, set a verified Business email on Studio Identity."
            layout="row"
          />
          <Field
            label="First name"
            value={firstName}
            onChange={setFirstName}
            placeholder="Anjali"
            maxLength={NAME_MAX_LENGTH}
            layout="row"
          />
          <Field
            label="Last name"
            value={lastName}
            onChange={setLastName}
            placeholder="Rao"
            maxLength={NAME_MAX_LENGTH}
            layout="row"
          />
          <PhoneField
            label="Personal contact"
            value={personalContact}
            onChange={setPersonalContact}
            layout="row"
          />
        </div>
      </Card>

      <SaveBar
        saveState={saveState}
        errorMsg={errorMsg}
        canSave={dirty}
        dirty={dirty}
        formId="personal-information-form"
        idleHint="Only visible to you, never shown on delivery pages."
        onDiscard={handleDiscard}
      />
    </form>
  );
}
