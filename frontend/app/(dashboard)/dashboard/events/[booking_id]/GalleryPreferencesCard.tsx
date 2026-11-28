"use client";

import { useState } from "react";
import { DeliveryPreferencesPanel, ToggleRow } from "./DeliveryPreferencesPanel";
import { Tip } from "@/components/ui/Tip";
import {
  changedPreferenceKeys,
  type DeliveryPreferenceContext,
  type DeliveryPreferences,
} from "@/lib/delivery-preferences";

/**
 * Settings view of Access & Sharing: every per-event Guest setting, shown and
 * edited in place. It replaced a summary of On/Off chips whose Manage button
 * opened the same rows in a dialog: one click and one layer fewer, for a page
 * whose only job is these settings.
 *
 * The rules are the old dialog's, unchanged: the same
 * "access" surface of the registry, "Show your studio profile" as the first
 * row with its own draft, and the required-visit row evaluated against that
 * draft. The parent keys this card on the saved values, so a save (or a change
 * from elsewhere) starts it fresh from what the server holds.
 */
export function GalleryPreferencesCard({
  saved,
  onSave,
  toast,
  context,
  studioProfile,
}: {
  saved: DeliveryPreferences;
  onSave: (next: DeliveryPreferences, extra?: { includeBranding?: boolean }) => Promise<void>;
  toast: (msg: string, type?: "success" | "error") => void;
  context: DeliveryPreferenceContext;
  studioProfile: { saved: boolean; visitLabelWhenShown?: string };
}) {
  const [draft, setDraft] = useState<DeliveryPreferences>(saved);
  const [draftProfile, setDraftProfile] = useState<boolean>(studioProfile.saved);
  const [saving, setSaving] = useState(false);

  const profileChanged = draftProfile !== studioProfile.saved;
  const dirty = changedPreferenceKeys(draft, saved).length > 0 || profileChanged;
  const effectiveContext: DeliveryPreferenceContext = {
    ...context,
    requiredVisitLabel: draftProfile ? studioProfile.visitLabelWhenShown : undefined,
  };

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      await onSave(draft, profileChanged ? { includeBranding: draftProfile } : undefined);
      toast("Gallery settings saved");
    } catch (err) {
      // Keep the draft: a silent revert would leave the studio believing
      // downloads are off when they are still on.
      toast(err instanceof Error ? err.message : "Couldn’t save settings", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex flex-col rounded-xl border border-[var(--color-brand-border)] bg-white">
      <h3 className="flex items-center gap-1.5 px-4 pb-3 pt-4 text-[15.5px] font-bold tracking-tight text-[var(--color-brand-ink)]">
        What guests can do
        <Tip text="These apply to this event only, and change what every guest sees right away, including in galleries you have already shared." />
      </h3>
      <div className="px-4 pb-4">
        <DeliveryPreferencesPanel
          value={draft}
          onChange={setDraft}
          disabled={saving}
          context={effectiveContext}
          surface="access"
          leading={
            <ToggleRow
              label="Show your studio profile"
              hint="Your name, logo, social links and review button."
              checked={draftProfile}
              onChange={setDraftProfile}
              disabled={saving}
            />
          }
        />
      </div>

      {/* Shown only while something changed, so an untouched page has no
          buttons asking to be pressed. Sticks to the bottom of the view so it
          stays in reach on a long list. */}
      {dirty && (
        <div className="sticky bottom-0 flex items-center justify-end gap-2 rounded-b-xl border-t border-[#ECE5D8] bg-[var(--color-brand-bg)] px-4 py-3">
          <span className="mr-auto text-[12.5px] text-[var(--color-brand-muted)]">Unsaved changes</span>
          <button
            type="button"
            onClick={() => {
              setDraft(saved);
              setDraftProfile(studioProfile.saved);
            }}
            disabled={saving}
            className="brand-focus inline-flex h-9 items-center rounded-lg px-3 text-[12.5px] font-semibold text-[var(--color-brand-muted)] hover:text-[var(--color-brand-ink)] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="brand-focus inline-flex h-9 items-center rounded-lg bg-[var(--color-brand-navy)] px-4 text-[12.5px] font-semibold text-white hover:bg-[var(--color-brand-navy-deep)] disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      )}
    </section>
  );
}
