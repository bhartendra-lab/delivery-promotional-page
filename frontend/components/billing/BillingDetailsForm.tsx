"use client";

import { useEffect, useState } from "react";
import { getBillingProfile, updateBillingProfile, getApiErrorCode } from "@/lib/billing";
import type { BillingProfile } from "@/lib/billing-types";
import { GST_STATE_CODES, findGstStateByName, findGstStateInAddress } from "@/lib/gst-state-codes";
import { AddressField } from "@/components/ui/AddressField";
import {
  Field,
  SelectField,
  SameAsPersonalCheckbox,
  SaveBar,
  type SaveState,
} from "@/app/(dashboard)/dashboard/settings/SettingsUI";

export type BillingDetailsFormProps = {
  /** Studio address offered as a one-tap prefill; omit/null to hide that option. */
  studioAddress?: string | null;
  studioName?: string | null;
  /** True when the studio explicitly skipped Google Business onboarding — the
   *  "same as studio address" shortcut is shown disabled with an explanation
   *  instead of hidden, so the user understands why the shortcut isn't there. */
  gmbSkipped?: boolean;
  /** Renders a submit button with this label instead of the settings SaveBar
   *  — the upgrade modal's in-flow billing step. */
  submitLabel?: string;
  onSaved: (profile: BillingProfile) => void;
  onCancel?: () => void;
};

/**
 * The billing profile (legal name, GSTIN, billing address, place-of-supply
 * state) that drives CGST+SGST vs IGST on every invoice. Shared by the
 * Settings "Billing details" card and the upgrade modal's in-flow billing
 * step, so a studio never has to leave a purchase to go fill this in
 * elsewhere. The state dropdown is never auto-filled silently: it only
 * pre-selects when a fresh Google Places search on this form's own address
 * field resolves one, and always stays user-editable before saving.
 */
export function BillingDetailsForm({
  studioAddress,
  studioName,
  gmbSkipped,
  submitLabel,
  onSaved,
  onCancel,
}: BillingDetailsFormProps) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saved, setSaved] = useState<BillingProfile | null>(null);

  const [legalName, setLegalName] = useState("");
  const [gstin, setGstin] = useState("");
  const [billingAddress, setBillingAddress] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [sameAsStudio, setSameAsStudio] = useState(false);

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getBillingProfile()
      .then((res) => {
        if (!active) return;
        setSaved(res.billing);
        setLegalName(res.billing.legal_name ?? "");
        setGstin(res.billing.gstin ?? "");
        setBillingAddress(res.billing.billing_address ?? "");
        setStateCode(res.billing.place_of_supply_state ?? "");
      })
      .catch((err) => {
        if (active) setLoadError(err instanceof Error ? err.message : "Couldn't load billing details.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function toggleSameAsStudio(next: boolean) {
    setSameAsStudio(next);
    if (next) {
      setLegalName(studioName ?? "");
      setBillingAddress(studioAddress ?? "");
      // Best-effort: the studio's saved address is free text, not a
      // structured place — only pre-fill the state when a GST state name
      // is actually found in it. Stays user-editable either way.
      const match = findGstStateInAddress(studioAddress);
      setStateCode(match?.code ?? "");
    } else {
      setLegalName("");
      setBillingAddress("");
      setStateCode("");
    }
  }

  const dirty =
    legalName.trim() !== (saved?.legal_name ?? "") ||
    gstin.trim().toUpperCase() !== (saved?.gstin ?? "") ||
    billingAddress.trim() !== (saved?.billing_address ?? "") ||
    stateCode !== (saved?.place_of_supply_state ?? "");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!legalName.trim() || !billingAddress.trim() || !stateCode) return;
    setSaveState("saving");
    setErrorMsg(null);
    try {
      const res = await updateBillingProfile({
        legal_name: legalName.trim(),
        gstin: gstin.trim() || undefined,
        billing_address: billingAddress.trim(),
        place_of_supply_state: stateCode,
      });
      setSaved(res.billing);
      setSaveState("saved");
      setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 3000);
      onSaved(res.billing);
    } catch (err) {
      setErrorMsg(
        getApiErrorCode(err) === "GSTIN_STATE_MISMATCH"
          ? "This GSTIN's state doesn't match the selected place of supply."
          : err instanceof Error
            ? err.message
            : "Failed to save",
      );
      setSaveState("error");
    }
  }

  if (loading) {
    return <div className="skeleton h-40 rounded-lg" />;
  }

  if (loadError) {
    return <p className="text-sm text-[var(--color-brand-danger)]">{loadError}</p>;
  }

  // Editing a field the shortcut just filled means the user wants to
  // diverge from the studio's details — unchecking it hands control back
  // instead of silently re-syncing on the next studio-detail change.
  function editLegalName(v: string) {
    setLegalName(v);
    setSameAsStudio(false);
  }
  function editBillingAddress(v: string) {
    setBillingAddress(v);
    setSameAsStudio(false);
  }
  function editStateCode(v: string) {
    setStateCode(v);
    setSameAsStudio(false);
  }

  const canSave = !!legalName.trim() && !!billingAddress.trim() && !!stateCode && dirty;
  // Shown even with no studioAddress when gmb_skipped — a visibly disabled
  // shortcut with an explanation, not a silently missing one (§9.3).
  const showSameAsStudio = Boolean(studioAddress) || gmbSkipped;

  return (
    <form
      id="billing-details"
      onSubmit={handleSubmit}
      className={submitLabel ? "space-y-4" : "scroll-mt-24 space-y-4"}
    >
      {showSameAsStudio && (
        <SameAsPersonalCheckbox
          label="Same as Studio details"
          checked={sameAsStudio}
          onChange={toggleSameAsStudio}
          disabled={gmbSkipped}
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Legal / billing name"
          value={legalName}
          onChange={editLegalName}
          required
          placeholder="As registered for tax purposes"
        />
        <Field
          label="GSTIN"
          value={gstin}
          onChange={setGstin}
          placeholder="Optional — leave blank if unregistered"
        />
      </div>

      <div>
        <AddressField
          label="Billing address"
          value={billingAddress}
          onChange={editBillingAddress}
          onPlaceSelect={({ stateName }) => {
            const match = findGstStateByName(stateName);
            if (match) setStateCode(match.code);
          }}
          placeholder="Search for your billing address"
        />
      </div>

      <div>
        <SelectField
          label="State (place of supply)"
          value={stateCode}
          onChange={editStateCode}
          options={GST_STATE_CODES.map((s) => ({ value: s.code, label: s.name }))}
          required
        />
      </div>

      {submitLabel ? (
        <div className="space-y-3">
          {errorMsg && (
            <p role="alert" className="text-sm text-[var(--color-brand-danger)]">
              {errorMsg}
            </p>
          )}
          <div className="flex items-center gap-3">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="brand-focus inline-flex h-11 items-center justify-center rounded-lg border border-[var(--color-brand-border)] px-4 text-sm font-semibold text-[var(--color-brand-ink)] transition-colors hover:bg-[var(--color-brand-surface)]"
              >
                Back
              </button>
            )}
            <button
              type="submit"
              disabled={!canSave || saveState === "saving"}
              className="brand-focus flex-1 inline-flex h-11 items-center justify-center rounded-lg bg-[var(--color-brand-navy)] text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saveState === "saving" ? "Saving…" : submitLabel}
            </button>
          </div>
        </div>
      ) : (
        <SaveBar
          saveState={saveState}
          errorMsg={errorMsg}
          canSave={canSave}
          idleHint="Needed to calculate GST correctly on every purchase."
        />
      )}
    </form>
  );
}
