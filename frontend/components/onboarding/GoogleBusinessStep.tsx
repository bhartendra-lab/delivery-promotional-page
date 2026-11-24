"use client";

import { useRef, useState } from "react";
import { saveGoogleBusiness } from "@/lib/api";
import { googleReviewLinkMessage, parseGoogleReviewLink } from "@/lib/google-review";
import type { Company } from "@/lib/types";
import { AddressField } from "@/components/ui/AddressField";
import { CopyableIdField, CheckIcon, OpenIcon, Field } from "@/app/(dashboard)/dashboard/settings/SettingsUI";
import { IconWarningCircle } from "@/components/ui/icons";

/**
 * Onboarding step 3 — no back button (WhatsApp verification already
 * happened server-side, so there's nothing to undo by going back).
 */
export function GoogleBusinessStep({
  onDone,
}: {
  onDone: (company: Company) => void;
}) {
  const [address, setAddress] = useState("");
  const [placeId, setPlaceId] = useState("");
  const [confirmingSkip, setConfirmingSkip] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The other way in: a review link pasted instead of a searched listing.
  const [reviewLink, setReviewLink] = useState("");
  const reviewCheck = parseGoogleReviewLink(reviewLink);
  const pasteOk = reviewCheck.status === "ok";
  const pasteError = reviewLink.trim() ? googleReviewLinkMessage(reviewCheck) : null;
  // Whichever way the studio set last wins, so a stale pick can never override
  // a link they just pasted (or the reverse).
  const [source, setSource] = useState<"search" | "paste" | null>(null);
  const canFinish = source === "paste" ? pasteOk : !!placeId;

  // The formatted address Google last committed via onPlaceSelect. Any
  // further typing that diverges from this means the picked place no longer
  // matches what's in the field, so the stale placeId must be cleared —
  // otherwise a user could pick a listing, edit the text, and still Finish
  // against the previous place.
  const committedAddressRef = useRef<string>("");

  function handleAddressChange(value: string) {
    setAddress(value);
    if (value !== committedAddressRef.current) setPlaceId("");
  }

  function handleReviewLinkChange(value: string) {
    setReviewLink(value);
    if (parseGoogleReviewLink(value).status === "ok") {
      setSource("paste");
    } else if (source === "paste") {
      setSource(placeId ? "search" : null);
    }
  }

  // Without a Maps key, AddressField silently degrades to a plain text input
  // and can never produce a place_id — the skip affordance must be a normal
  // button here, not tiny muted text, so the user is never trapped.
  const mapsKeyMissing = !process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  async function finishSetup() {
    if (!canFinish || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res =
        source === "paste" && reviewCheck.status === "ok"
          ? await saveGoogleBusiness({ gmbLink: reviewCheck.url })
          : await saveGoogleBusiness({ googlePlaceId: placeId, address });
      onDone(res.company);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function skipAnyway() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await saveGoogleBusiness({ skipped: true });
      onDone(res.company);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--color-brand-muted)]">
          Almost there
        </p>
        <h2 className="text-2xl font-bold text-[var(--color-brand-ink)]">Find your studio on Google</h2>
        <p className="text-sm text-[var(--color-brand-muted)]">
          This links your Google reviews so clients can leave one in a single tap from their gallery.
        </p>
      </div>

      <div className="mt-7 space-y-4">
        <div>
          <AddressField
            label="Your studio on Google"
            value={address}
            onChange={handleAddressChange}
            onPlaceSelect={({ placeId: id, address: formatted }) => {
              setPlaceId(id);
              setAddress(formatted);
              committedAddressRef.current = formatted;
              setSource("search");
            }}
            placeholder="Search for your studio"
          />
          <p className="mt-1.5 text-xs text-[var(--color-brand-muted)]">
            {placeId
              ? "Search your studio name and pick the matching listing."
              : "Pick your studio from the suggestions, or paste your review link below."}
          </p>
        </div>

        {placeId && source !== "paste" && (
          <div>
            <CopyableIdField label="Google Reviews ID" value={placeId} />
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1 text-xs text-[var(--color-brand-muted)]">
                <CheckIcon className="h-3 w-3 shrink-0 text-[var(--color-brand-success)]" />
                This is the page clients land on when they tap Leave a review.
              </p>
              <a
                href={`https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`}
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

        <div>
          <Field
            label="Can't find your studio? Paste your Google review link"
            value={reviewLink}
            onChange={handleReviewLinkChange}
            placeholder="https://g.page/r/.../review"
            error={pasteError ?? undefined}
            hint={
              pasteOk
                ? "Clients will land straight on your Google review box."
                : "Use this if the search does not show your studio, or the name is in Hindi."
            }
          />
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
            <a
              href="/guides/google-review-link"
              target="_blank"
              rel="noopener noreferrer"
              className="brand-focus inline-flex items-center gap-1.5 rounded-md text-xs font-semibold text-[var(--color-brand-navy)] hover:underline"
            >
              <OpenIcon className="h-3.5 w-3.5" />
              How to find your review link
            </a>
            {pasteOk && (
              <a
                href={reviewCheck.url}
                target="_blank"
                rel="noopener noreferrer"
                className="brand-focus inline-flex items-center gap-1.5 rounded-md text-xs font-semibold text-[var(--color-brand-navy)] hover:underline"
              >
                <OpenIcon className="h-3.5 w-3.5" />
                Test this link
              </a>
            )}
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-[var(--color-brand-danger)]/30 bg-[var(--color-brand-danger-soft)] px-3 py-2.5 text-sm text-[var(--color-brand-danger)]"
          >
            <IconWarningCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </p>
        )}

        {confirmingSkip ? (
          <div className="rounded-lg border border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] p-4">
            <h3 className="text-sm font-semibold text-[var(--color-brand-ink)]">Skip for now?</h3>
            <p className="mt-1.5 text-xs text-[var(--color-brand-muted)]">
              Without a Google listing, clients can&apos;t leave you a review from their gallery, and
              you&apos;ll need to enter your billing address manually when you buy a plan. You can add it
              any time from Settings → Studio Identity.
            </p>
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setConfirmingSkip(false)}
                className="brand-focus inline-flex h-9 items-center justify-center rounded-lg border border-[var(--color-brand-border)] px-4 text-sm font-semibold text-[var(--color-brand-ink)] transition-colors hover:bg-[var(--color-brand-hover)]"
              >
                Go back
              </button>
              <button
                type="button"
                onClick={skipAnyway}
                disabled={saving}
                className="brand-focus inline-flex h-9 items-center justify-center rounded-lg bg-[var(--color-brand-navy)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Saving…" : "Skip anyway"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={finishSetup}
              disabled={!canFinish || saving}
              className="brand-focus flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-brand-navy)] text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving…" : "Finish setup"}
            </button>
            <div className="text-center">
              <button
                type="button"
                onClick={() => setConfirmingSkip(true)}
                className={
                  mapsKeyMissing
                    ? "brand-focus inline-flex h-10 items-center justify-center rounded-lg border border-[var(--color-brand-border)] px-4 text-sm font-semibold text-[var(--color-brand-ink)] transition-colors hover:bg-[var(--color-brand-hover)]"
                    : "brand-focus text-xs text-[var(--color-brand-muted)] underline-offset-2 hover:underline"
                }
              >
                I don&apos;t have a Google listing yet
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
