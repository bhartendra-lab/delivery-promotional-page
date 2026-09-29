"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { DeliveryPreferencesPanel, ToggleRow } from "./DeliveryPreferencesPanel";
import {
  changedPreferenceKeys,
  type DeliveryPreferenceContext,
  type DeliveryPreferences,
  type DeliveryPreferenceSurface,
} from "@/lib/delivery-preferences";

/**
 * The gear-icon entry point, on the Access & Sharing tab: every per-event
 * setting that decides what a Guest can do, reachable at any time — before the
 * first upload, during one, or long after delivery.
 *
 * It renders the "access" surface, which is a SUPERSET of the upload dialog's
 * step 2: that step asks only about the run being uploaded, while this is the
 * whole picture (face search and the required visit included). Preferences are
 * event-scoped, so both read and write the same value.
 *
 * With `studioProfile` it also carries "Show your studio profile" as the first
 * row. That is not a delivery preference — it is the landing page's top-level
 * `include_company_branding` — so it keeps its own draft here rather than being
 * forced into the typed registry, and is saved in the SAME update-booking call
 * as the preferences (dirty when either changed). The required-visit row
 * depends on it (no profile, no Studio links, so no gate — see
 * resolveSocialVisitGate), so that row is evaluated against the DRAFT value:
 * switching the profile off hides it in this modal immediately.
 */
export function DeliveryPreferencesModal({
  open,
  onClose,
  eventName,
  saved,
  onSave,
  toast,
  context,
  surface = "access",
  studioProfile,
}: {
  open: boolean;
  onClose: () => void;
  /** Named in the subtitle so the scope of the change is unambiguous. */
  eventName: string;
  /** Currently persisted preferences — seeds the draft each time this opens. */
  saved: DeliveryPreferences;
  /** `includeBranding` is present only when this modal carries the Studio
   *  profile row and its value changed. */
  onSave: (next: DeliveryPreferences, extra?: { includeBranding?: boolean }) => Promise<void>;
  toast: (msg: string, type?: "success" | "error") => void;
  /** The booking's archive quality tier, the required-visit label, and whether
   *  any public folder holds media — the registry decides which rows to show,
   *  what to call them, and what to warn about from these. */
  context?: DeliveryPreferenceContext;
  /** Which slice of the registry to render. Defaults to the full Access &
   *  Sharing set; the upload dialog renders "gallery" through the panel. */
  surface?: DeliveryPreferenceSurface;
  /**
   * The "Show your studio profile" row: its saved value, and the required
   * visit platform's label as it would read WITH the profile shown (absent
   * when the Studio has no live required link at all). The context's own
   * `requiredVisitLabel` is ignored while this is given, because it was
   * resolved against the SAVED profile and this modal edits a draft of it.
   */
  studioProfile?: { saved: boolean; visitLabelWhenShown?: string };
}) {
  const [draft, setDraft] = useState<DeliveryPreferences>(saved);
  const [draftProfile, setDraftProfile] = useState<boolean>(studioProfile?.saved ?? true);
  const [saving, setSaving] = useState(false);

  // Re-seed on the open transition only. Depending on `saved` as well would
  // wipe an in-progress toggle the moment an unrelated booking update landed.
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seeds the draft on the open transition, not a render loop
    setDraft(saved);
    setDraftProfile(studioProfile?.saved ?? true);
    setSaving(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const profileChanged = !!studioProfile && draftProfile !== studioProfile.saved;
  const dirty = changedPreferenceKeys(draft, saved).length > 0 || profileChanged;
  const effectiveContext: DeliveryPreferenceContext | undefined = studioProfile
    ? {
        ...(context ?? { archiveTiers: [] }),
        requiredVisitLabel: draftProfile ? studioProfile.visitLabelWhenShown : undefined,
      }
    : context;

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      await onSave(draft, profileChanged ? { includeBranding: draftProfile } : undefined);
      toast("Gallery preferences saved");
      onClose();
    } catch (err) {
      // Stay open, keep the draft: a silent revert would leave the studio
      // believing downloads are off when they are still on.
      setSaving(false);
      toast(err instanceof Error ? err.message : "Couldn’t save preferences", "error");
    }
  }

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={saving ? () => {} : onClose}
      title="Gallery preferences"
      subtitle={eventName}
      size="md"
      footer={
        <div className="flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="brand-focus inline-flex h-10 items-center rounded-lg border border-[var(--color-brand-border)] bg-white px-4 text-[13.5px] font-medium text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!dirty || saving}
            className="brand-focus inline-flex h-10 items-center rounded-lg bg-[var(--color-brand-navy)] px-4 text-[13.5px] font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      }
    >
      <DeliveryPreferencesPanel
        value={draft}
        onChange={setDraft}
        disabled={saving}
        context={effectiveContext}
        surface={surface}
        leading={
          studioProfile && (
            <ToggleRow
              label="Show your studio profile"
              hint="Your name, logo, social links and review button."
              checked={draftProfile}
              onChange={setDraftProfile}
              disabled={saving}
            />
          )
        }
      />
    </Modal>
  );
}
