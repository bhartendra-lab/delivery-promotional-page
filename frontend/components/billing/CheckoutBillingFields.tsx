"use client";

import { useEffect, useRef, useState } from "react";
import { getBillingProfile, updateBillingProfile, getApiErrorCode } from "@/lib/billing";
import { GST_STATE_CODES, GSTIN_REGEX, findGstStateInAddress, stateOfGstin } from "@/lib/gst-state-codes";
import { stateForCity } from "@/lib/city-state";
import { IconCaretDown } from "@/components/ui/icons";

export type BillingFieldsStatus =
  /** Reading the saved profile. */
  | "loading"
  /** No place of supply yet: taxes cannot be worked out. */
  | "needs_state"
  | "saving"
  /** Saved; `version` moves on with every save, so the total is fetched again. */
  | "ready"
  | "error";

/**
 * The only billing a checkout asks for: the state the studio is in (place of
 * supply, which decides CGST + SGST or IGST) and, if it has one, its GSTIN.
 * The invoice is made out to the studio's name unless Settings holds a legal
 * name; the billing address lives in Settings and is not asked here.
 *
 * The state fills itself, in this order: what is saved, the state a GSTIN
 * was issued in, the city given at onboarding, the studio's address. A filled
 * state is saved straight away and stays on screen beside the taxes, so the
 * studio sees it and can change it.
 */
export function CheckoutBillingFields({
  studioName,
  city,
  address,
  onStatus,
}: {
  studioName?: string | null;
  /** The onboarding city (Company.city). */
  city?: string | null;
  /** The studio's address (Company.address). */
  address?: string | null;
  onStatus: (status: BillingFieldsStatus, version: number) => void;
}) {
  const [stateCode, setStateCode] = useState("");
  const [gstin, setGstin] = useState("");
  const [savedGstin, setSavedGstin] = useState("");
  const [legalName, setLegalName] = useState<string | null>(null);
  const [filledFrom, setFilledFrom] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gstinError, setGstinError] = useState<string | null>(null);
  const version = useRef(0);
  const report = useRef(onStatus);
  useEffect(() => {
    report.current = onStatus;
  });

  async function save(nextState: string, nextGstin: string) {
    if (!nextState) return;
    report.current("saving", version.current);
    setError(null);
    try {
      const res = await updateBillingProfile({ place_of_supply_state: nextState, gstin: nextGstin || "" });
      setSavedGstin(res.billing.gstin ?? "");
      version.current += 1;
      report.current("ready", version.current);
    } catch (err) {
      setError(
        getApiErrorCode(err) === "GSTIN_STATE_MISMATCH"
          ? "This GSTIN is from another state. Check the state or the GSTIN."
          : err instanceof Error
            ? err.message
            : "Couldn't save your billing state.",
      );
      report.current("error", version.current);
    }
  }

  useEffect(() => {
    let active = true;
    report.current("loading", version.current);
    getBillingProfile()
      .then(({ billing }) => {
        if (!active) return;
        setLegalName(billing.legal_name);
        setGstin(billing.gstin ?? "");
        setSavedGstin(billing.gstin ?? "");
        if (billing.place_of_supply_state) {
          setStateCode(billing.place_of_supply_state);
          report.current("ready", version.current);
          return;
        }
        const fromGstin = stateOfGstin(billing.gstin);
        const fromCity = fromGstin ? null : stateForCity(city);
        const fromAddress = fromGstin || fromCity ? null : findGstStateInAddress(address);
        const guess = fromGstin ?? fromCity ?? fromAddress;
        if (!guess) {
          report.current("needs_state", version.current);
          return;
        }
        setStateCode(guess.code);
        setFilledFrom(fromGstin ? "your GSTIN" : fromCity ? `your city, ${city?.trim()}` : "your studio address");
        void save(guess.code, billing.gstin ?? "");
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Couldn't load your billing details.");
        report.current("error", version.current);
      });
    return () => {
      active = false;
    };
    // Once, on mount: the company does not change during a checkout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function chooseState(code: string) {
    setStateCode(code);
    setFilledFrom(null);
    const gstinState = stateOfGstin(gstin);
    if (gstinState && gstinState.code !== code) {
      setGstinError("This GSTIN is from another state. Change it, or clear it.");
      report.current("error", version.current);
      return;
    }
    setGstinError(null);
    void save(code, gstinState ? gstin : savedGstin && stateOfGstin(savedGstin)?.code === code ? savedGstin : "");
  }

  function commitGstin() {
    const value = gstin.trim().toUpperCase();
    if (value && !GSTIN_REGEX.test(value)) {
      setGstinError("That doesn't look like a GSTIN. It has 15 characters, like 23ABCDE1234F1Z5.");
      report.current("error", version.current);
      return;
    }
    // Nothing new, and nothing to recover from: no save.
    if (value === savedGstin && !gstinError && !error) return;
    setGstinError(null);
    // A GSTIN names its own state: follow it.
    const own = stateOfGstin(value);
    const nextState = own?.code ?? stateCode;
    if (own && own.code !== stateCode) {
      setStateCode(own.code);
      setFilledFrom("your GSTIN");
    }
    if (!nextState) {
      report.current("needs_state", version.current);
      return;
    }
    void save(nextState, value);
  }

  const invoiceName = legalName?.trim() || studioName?.trim() || null;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid gap-2.5 sm:grid-cols-2">
        <label className="block min-w-0">
          <span className="mb-1 block text-xs font-medium text-[var(--color-brand-body)]">
            State <span className="text-[var(--color-brand-muted)]">(place of supply)</span>
          </span>
          <span className="relative block">
            <select
              value={stateCode}
              onChange={(e) => chooseState(e.target.value)}
              className={`brand-focus h-10 w-full cursor-pointer appearance-none truncate rounded-lg border bg-[var(--color-brand-bg)] pl-3 pr-8 text-sm text-[var(--color-brand-ink)] ${
                stateCode ? "border-[var(--color-brand-border)]" : "border-[var(--color-brand-navy)]/60"
              }`}
            >
              <option value="" disabled>
                Choose your state
              </option>
              {GST_STATE_CODES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-[var(--color-brand-muted)]">
              <IconCaretDown size={12} />
            </span>
          </span>
        </label>
        <label className="block min-w-0">
          <span className="mb-1 block text-xs font-medium text-[var(--color-brand-body)]">
            GSTIN <span className="text-[var(--color-brand-muted)]">(optional)</span>
          </span>
          <input
            type="text"
            value={gstin}
            onChange={(e) => {
              setGstin(e.target.value.toUpperCase().replace(/\s/g, "").slice(0, 15));
              setGstinError(null);
            }}
            onBlur={commitGstin}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitGstin();
              }
            }}
            placeholder="For a GST invoice"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={gstinError ? true : undefined}
            className="brand-focus h-10 w-full rounded-lg border border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] px-3 text-sm uppercase tracking-wide text-[var(--color-brand-ink)] placeholder:normal-case placeholder:tracking-normal placeholder:text-[var(--color-brand-muted)]/70"
          />
        </label>
      </div>
      {(gstinError || error) && (
        <p role="alert" className="text-xs text-[var(--color-brand-danger)]">
          {gstinError || error}
        </p>
      )}
      <p className="text-xs text-[var(--color-brand-muted)]">
        {filledFrom && stateCode ? <>State filled from {filledFrom}. </> : null}
        {invoiceName ? (
          <>
            Invoice in the name of <span className="font-medium text-[var(--color-brand-ink)]">{invoiceName}</span>.
          </>
        ) : null}
      </p>
    </div>
  );
}
