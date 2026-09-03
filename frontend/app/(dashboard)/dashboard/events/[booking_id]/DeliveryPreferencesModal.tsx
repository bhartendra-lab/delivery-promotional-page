"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { DeliveryPreferencesPanel } from "./DeliveryPreferencesPanel";
import {
  changedPreferenceKeys,
  type DeliveryPreferenceContext,
  type DeliveryPreferences,
} from "@/lib/delivery-preferences";

/**
 * The gear-icon entry point: the same preference rows as the upload dialog's
 * step 2, reachable at any time — before the first upload, during one, or long
 * after delivery. Preferences are event-scoped, so this and the upload dialog
 * read and write the same value.
 */
export function DeliveryPreferencesModal({
  open,
  onClose,
  eventName,
  saved,
  onSave,
  toast,
  context,
}: {
  open: boolean;
  onClose: () => void;
  /** Named in the subtitle so the scope of the change is unambiguous. */
  eventName: string;
  /** Currently persisted preferences — seeds the draft each time this opens. */
  saved: DeliveryPreferences;
  onSave: (next: DeliveryPreferences) => Promise<void>;
  toast: (msg: string, type?: "success" | "error") => void;
  /** The booking's archive quality tier — decides whether the archive download
   *  row is shown at all, and what it is called. */
  context?: DeliveryPreferenceContext;
}) {
  const [draft, setDraft] = useState<DeliveryPreferences>(saved);
  const [saving, setSaving] = useState(false);

  // Re-seed on the open transition only. Depending on `saved` as well would
  // wipe an in-progress toggle the moment an unrelated booking update landed.
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seeds the draft on the open transition, not a render loop
    setDraft(saved);
    setSaving(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const dirty = changedPreferenceKeys(draft, saved).length > 0;

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      await onSave(draft);
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
        context={context}
      />
    </Modal>
  );
}
