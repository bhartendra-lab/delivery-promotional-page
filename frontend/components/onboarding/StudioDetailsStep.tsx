"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ApiError, apiErrorCode, attachReferral, requestWhatsappOtp, resolveReferral, saveStudioDetails } from "@/lib/api";
import type { StudioDetailsInput } from "@/lib/api";
import type { Company } from "@/lib/types";
import { stateForCity } from "@/lib/city-state";
import { GST_STATE_CODES } from "@/lib/gst-state-codes";
import { normalizeReferralCode } from "@/lib/referral";
import { clearStoredReferral, getStoredReferral } from "@/lib/referral-storage";
import { IconWarningCircle, IconWhatsApp } from "@/components/ui/icons";
import { INDIAN_CITIES } from "@/lib/indian-cities";
import {
  aboutPayload,
  ACQUISITION_OPTIONS,
  CITY_MAX,
  OTHER_MAX,
  sourceBringsReferralCode,
  validateStudioAbout,
  type AcquisitionSource,
} from "@/lib/studio-about";

/**
 * The optional Referral code, attached when the step is submitted (lib/referral.ts
 * keeps a code from a referral link until now). It never blocks onboarding: a
 * refused code shows the server's sentence under the field, and submitting
 * again with the same code goes on without it.
 */
type ReferralField = {
  code: string;
  /** The inviting studio's name when the code came from a link and resolved: shown as a chip. */
  invitedBy: string | null;
  source: "link" | "manual";
  /** Attached (or the studio already had a referral): nothing more to send. */
  done: boolean;
  /** The code that was refused, so the next submit goes on without it. */
  refused: string | null;
  error: string | null;
};

/**
 * The one onboarding step. Studio name and city are required (the city fills
 * the place of supply, so checkout never asks); the state is asked only when
 * the city is one we cannot place. How they heard about us is optional, and
 * the Referral code shows only when it is relevant (a referral link, the
 * "Referred by a studio" answer, or a tap on "Have a referral code?").
 *
 * `needsNumber`: the Studio signed up by email or Google, so its WhatsApp
 * number is required here too: the step sends the code (onSent) and the next
 * step verifies it with these answers. Signed up by WhatsApp, the number is
 * already proven and the step saves straight away (onSaved).
 */
export function StudioDetailsStep({
  needsNumber,
  initial,
  onSent,
  onSaved,
}: {
  needsNumber: boolean;
  /** Answers to start from (coming back from the code step). */
  initial?: { details: StudioDetailsInput; phone: string } | null;
  onSent: (details: StudioDetailsInput, whatsappNumber: string) => void;
  onSaved: (company: Company) => void;
}) {
  const [studioName, setStudioName] = useState(initial?.details.studioName ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [city, setCity] = useState(initial?.details.city ?? "");
  const [stateCode, setStateCode] = useState(initial?.details.stateCode ?? "");
  const [stateAsked, setStateAsked] = useState(Boolean(initial?.details.stateCode));
  const [referralOpen, setReferralOpen] = useState(false);
  const [source, setSource] = useState<AcquisitionSource | "">((initial?.details.acquisitionSource as AcquisitionSource | "") ?? "");
  const [sourceOther, setSourceOther] = useState(initial?.details.acquisitionSourceOther ?? "");
  const [aboutErrors, setAboutErrors] = useState<{ city?: string; source?: string; other?: string }>({});
  const cityListId = useId();
  const referralInputRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [referral, setReferral] = useState<ReferralField>({
    code: "",
    invitedBy: null,
    source: "manual",
    done: false,
    refused: null,
    error: null,
  });

  // Prefill from a referral link, and name the inviting studio when the code is real.
  useEffect(() => {
    const stored = getStoredReferral();
    if (!stored) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount; reading it in the initializer would mismatch the server render
    setReferral((r) => ({ ...r, code: stored.code, source: "link" }));
    resolveReferral(stored.code)
      .then((res) => {
        if (!cancelled && res.valid) setReferral((r) => (r.code === stored.code ? { ...r, invitedBy: res.studio_name ?? stored.code } : r));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const validPhone = !needsNumber || phone.length === 10;
  // A typed city we cannot place asks for its state, on this same step.
  const cityState = stateForCity(city);
  const needsState = stateAsked || (city.trim().length > 2 && !cityState);
  const canSubmit = studioName.trim().length > 0 && city.trim().length > 0 && validPhone && (!needsState || !!stateCode || !!cityState) && !submitting;
  const showReferral = referralOpen || referral.source === "link" || sourceBringsReferralCode(source) || !!referral.code;

  /** The "Referred by a studio" answer brings the optional Referral code into focus, after it has had a moment to appear. */
  function chooseSource(next: AcquisitionSource | "") {
    setSource(next);
    setAboutErrors((e) => ({ ...e, source: undefined, other: undefined }));
    if (sourceBringsReferralCode(next)) setTimeout(() => referralInputRef.current?.focus(), 0);
  }

  /** Attaches the Referral code if there is one to attach. False only when it was refused just now. */
  async function attachReferralCode(): Promise<boolean> {
    const code = normalizeReferralCode(referral.code);
    if (referral.done || !code || code === referral.refused) return true;
    try {
      await attachReferral({ code, source: referral.source });
      clearStoredReferral();
      setReferral((r) => ({ ...r, done: true, error: null }));
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // The studio already has a referral: first attach wins.
        clearStoredReferral();
        setReferral((r) => ({ ...r, done: true, error: null }));
        return true;
      }
      const message = err instanceof Error ? err.message : "This referral code could not be added.";
      setReferral((r) => ({ ...r, invitedBy: null, refused: code, error: `${message} Change it, or continue without it.` }));
      return false;
    }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    const problems = validateStudioAbout({ city, acquisitionSource: source, acquisitionSourceOther: sourceOther });
    setAboutErrors(problems);
    if (problems.city || problems.source || problems.other) return;
    setSubmitting(true);
    setError(null);
    const details: StudioDetailsInput = {
      studioName: studioName.trim(),
      ...aboutPayload({ city, acquisitionSource: source, acquisitionSourceOther: sourceOther }),
      stateCode: needsState ? stateCode : undefined,
    };
    try {
      if (!(await attachReferralCode())) return;
      if (needsNumber) {
        await requestWhatsappOtp({ whatsappNumber: phone });
        onSent(details, phone);
      } else {
        const res = await saveStudioDetails(details);
        onSaved(res.company);
      }
    } catch (err) {
      if (apiErrorCode(err) === "STATE_REQUIRED") setStateAsked(true);
      setError(err instanceof Error ? err.message : "Couldn't save your studio. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--color-brand-muted)]">
          Set up your studio
        </p>
        <h2 className="text-2xl font-bold text-[var(--color-brand-ink)]">Tell us about your studio</h2>
        <p className="text-sm text-[var(--color-brand-muted)]">
          {needsNumber
            ? "Your studio name, city and WhatsApp number. Delivery notifications and client replies go to this number."
            : "Just your studio name and city. That's all we need to get you started."}
        </p>
      </div>

      <form onSubmit={submit} className="mt-7 space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-muted)]">
            Studio name
            <span aria-hidden="true" className="ml-0.5 text-[var(--color-brand-danger)]">*</span>
          </span>
          <input
            type="text"
            value={studioName}
            onChange={(e) => setStudioName(e.target.value)}
            required
            placeholder="e.g. Radiant Studios"
            className="brand-focus h-11 w-full rounded-lg border border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] px-3 text-sm text-[var(--color-brand-ink)] outline-none placeholder:text-[var(--color-brand-muted)]/70"
          />
        </label>

        {needsNumber && (
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-muted)]">
            WhatsApp number
            <span aria-hidden="true" className="ml-0.5 text-[var(--color-brand-danger)]">*</span>
          </span>
          <div className="flex h-11 items-center rounded-lg border border-[var(--color-brand-border)] bg-[var(--color-brand-bg)]">
            <span className="flex h-full items-center border-r border-[var(--color-brand-border)] px-3 text-sm font-medium text-[var(--color-brand-muted)]">
              +91
            </span>
            <input
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              maxLength={10}
              required
              placeholder="98765 43210"
              className="brand-focus h-full flex-1 bg-transparent px-3 text-sm text-[var(--color-brand-ink)] outline-none placeholder:text-[var(--color-brand-muted)]/60"
            />
          </div>
        </label>
        )}

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-muted)]">
            City
            <span aria-hidden="true" className="ml-0.5 text-[var(--color-brand-danger)]">*</span>
          </span>
          <input
            type="text"
            value={city}
            onChange={(e) => {
              setCity(e.target.value.slice(0, CITY_MAX));
              setAboutErrors((x) => ({ ...x, city: undefined }));
            }}
            list={cityListId}
            autoComplete="address-level2"
            placeholder="e.g. Bhopal"
            aria-invalid={aboutErrors.city ? true : undefined}
            aria-describedby={aboutErrors.city ? "studio-city-error" : undefined}
            className="brand-focus h-11 w-full rounded-lg border border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] px-3 text-sm text-[var(--color-brand-ink)] outline-none placeholder:text-[var(--color-brand-muted)]/70"
          />
          {/* Suggestions only: any text is accepted, for a town not on the list. */}
          <datalist id={cityListId}>
            {INDIAN_CITIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          {aboutErrors.city && (
            <p id="studio-city-error" className="mt-1.5 text-xs text-[var(--color-brand-danger)]">
              {aboutErrors.city}
            </p>
          )}
        </label>

        {needsState && (
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-muted)]">
              State
              <span aria-hidden="true" className="ml-0.5 text-[var(--color-brand-danger)]">*</span>
            </span>
            <select
              value={stateCode}
              onChange={(e) => setStateCode(e.target.value)}
              required
              className="brand-focus h-11 w-full cursor-pointer rounded-lg border border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] px-3 text-sm text-[var(--color-brand-ink)] outline-none"
            >
              <option value="">Choose your state</option>
              {GST_STATE_CODES.map((st) => (
                <option key={st.code} value={st.code}>
                  {st.name}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-[var(--color-brand-muted)]">So your invoices carry the right GST.</p>
          </label>
        )}

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-muted)]">
            How did you hear about us <span className="normal-case tracking-normal">(optional)</span>
          </span>
          <select
            value={source}
            onChange={(e) => chooseSource(e.target.value as AcquisitionSource | "")}
            aria-invalid={aboutErrors.source ? true : undefined}
            aria-describedby={aboutErrors.source ? "studio-source-error" : undefined}
            className="brand-focus h-11 w-full cursor-pointer rounded-lg border border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] px-3 text-sm text-[var(--color-brand-ink)] outline-none"
          >
            <option value="">Choose one</option>
            {ACQUISITION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {aboutErrors.source && (
            <p id="studio-source-error" className="mt-1.5 text-xs text-[var(--color-brand-danger)]">
              {aboutErrors.source}
            </p>
          )}
        </label>

        {source === "other" && (
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-muted)]">
              Tell us in a few words
            </span>
            <input
              type="text"
              value={sourceOther}
              onChange={(e) => {
                setSourceOther(e.target.value.slice(0, OTHER_MAX));
                setAboutErrors((x) => ({ ...x, other: undefined }));
              }}
              autoComplete="off"
              aria-invalid={aboutErrors.other ? true : undefined}
              aria-describedby={aboutErrors.other ? "studio-other-error" : undefined}
              className="brand-focus h-11 w-full rounded-lg border border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] px-3 text-sm text-[var(--color-brand-ink)] outline-none"
            />
            {aboutErrors.other && (
              <p id="studio-other-error" className="mt-1.5 text-xs text-[var(--color-brand-danger)]">
                {aboutErrors.other}
              </p>
            )}
          </label>
        )}

        {!referral.done && !showReferral && (
          <button
            type="button"
            onClick={() => {
              setReferralOpen(true);
              setTimeout(() => referralInputRef.current?.focus(), 0);
            }}
            className="brand-focus rounded-sm text-xs font-semibold text-[var(--color-brand-navy)] underline-offset-2 hover:underline"
          >
            Have a referral code?
          </button>
        )}

        {!referral.done && showReferral && (
          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-muted)]">
              Referral code <span className="normal-case tracking-normal">(optional)</span>
            </span>
            {referral.invitedBy ? (
              <div className="flex h-11 items-center justify-between gap-3 rounded-lg border border-[var(--color-brand-border)] bg-[var(--color-brand-navy-soft)] px-3">
                <span className="truncate text-sm font-semibold text-[var(--color-brand-ink)]">
                  Referred by {referral.invitedBy}
                </span>
                <button
                  type="button"
                  onClick={() => setReferral((r) => ({ ...r, invitedBy: null, source: "manual" }))}
                  className="brand-focus shrink-0 rounded-sm text-xs font-semibold text-[var(--color-brand-navy)] underline underline-offset-2 hover:text-[var(--color-brand-navy-deep)]"
                >
                  Change
                </button>
              </div>
            ) : (
              <input
                ref={referralInputRef}
                type="text"
                value={referral.code}
                onChange={(e) =>
                  setReferral((r) => ({ ...r, code: e.target.value.toUpperCase().slice(0, 24), source: "manual", error: null }))
                }
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                placeholder="If another studio invited you"
                aria-invalid={referral.error ? true : undefined}
                aria-describedby={referral.error ? "referral-code-error" : undefined}
                className="brand-focus h-11 w-full rounded-lg border border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] px-3 font-mono text-sm tracking-[0.08em] text-[var(--color-brand-ink)] outline-none placeholder:font-sans placeholder:tracking-normal placeholder:text-[var(--color-brand-muted)]/70"
              />
            )}
            {referral.error && (
              <p id="referral-code-error" className="mt-1.5 text-xs text-[var(--color-brand-danger)]">
                {referral.error}
              </p>
            )}
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-[var(--color-brand-danger)]/30 bg-[var(--color-brand-danger-soft)] px-3 py-2.5 text-sm text-[var(--color-brand-danger)]"
          >
            <IconWarningCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </p>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="brand-focus flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-brand-navy)] text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {needsNumber ? (
            <>
              <IconWhatsApp size={16} />
              {submitting ? "Sending code on WhatsApp…" : "Send code on WhatsApp"}
            </>
          ) : submitting ? (
            "Saving…"
          ) : (
            "Continue"
          )}
        </button>
      </form>
    </>
  );
}
