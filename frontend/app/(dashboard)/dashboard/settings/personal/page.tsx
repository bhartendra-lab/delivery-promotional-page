"use client";

import { useState } from "react";
import type { UserProfileUpdateInput } from "@/lib/api";
import { useSettings, useProfileSectionSave } from "../SettingsContext";
import { SectionHeading, Card, Field, SaveBar, UserIcon, changed } from "../SettingsUI";

/**
 * Your Account → Personal Information. Your own details as the account
 * holder, kept separate from the studio's business details on Studio
 * Identity. Feeds the "same as personal" email/phone shortcut there.
 *
 * NOTE: backed by placeholder endpoints (see `getUserProfile` in
 * lib/api.ts) pending backend support — see BACKEND_NOTES.md.
 */
export default function PersonalInformationPage() {
  const { userProfile } = useSettings();
  const { saveState, errorMsg, submit } = useProfileSectionSave();

  const [firstName, setFirstName] = useState(userProfile?.first_name ?? "");
  const [lastName, setLastName] = useState(userProfile?.last_name ?? "");
  const [personalEmail, setPersonalEmail] = useState(userProfile?.personal_email ?? "");
  const [personalContact, setPersonalContact] = useState(userProfile?.personal_contact ?? "");

  const dirty =
    changed(firstName, userProfile?.first_name) ||
    changed(lastName, userProfile?.last_name) ||
    changed(personalEmail, userProfile?.personal_email) ||
    changed(personalContact, userProfile?.personal_contact);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const payload: UserProfileUpdateInput = {};
    if (changed(firstName, userProfile?.first_name)) payload.first_name = firstName.trim();
    if (changed(lastName, userProfile?.last_name)) payload.last_name = lastName.trim();
    if (changed(personalEmail, userProfile?.personal_email)) payload.personal_email = personalEmail.trim();
    if (changed(personalContact, userProfile?.personal_contact)) payload.personal_contact = personalContact.trim();
    submit(payload);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <SectionHeading
        eyebrow="Your Account"
        title="Personal Information"
        description="Your own details as the account holder. Not shown to clients."
      />

      <Card title="Personal information" icon={<UserIcon />}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" value={firstName} onChange={setFirstName} placeholder="Anjali" />
          <Field label="Last name" value={lastName} onChange={setLastName} placeholder="Rao" />
          <Field
            label="Personal email"
            value={personalEmail}
            onChange={setPersonalEmail}
            placeholder="you@email.com"
            type="email"
          />
          <Field
            label="Personal contact"
            value={personalContact}
            onChange={setPersonalContact}
            placeholder="+91 98765 43210"
            type="tel"
          />
        </div>
        <p className="mt-4 text-xs text-[var(--color-brand-muted)]">
          Add your email and phone here once, then reuse them for your business email and
          contact on Studio Identity with the same as personal checkbox.
        </p>
      </Card>

      <SaveBar
        saveState={saveState}
        errorMsg={errorMsg}
        canSave={dirty}
        idleHint="Only visible to you, never shown on delivery pages."
      />
    </form>
  );
}
