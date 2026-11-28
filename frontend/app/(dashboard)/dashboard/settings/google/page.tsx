"use client";

import { useId, useRef, useState } from "react";
import type { CompanyUpdateInput } from "@/lib/api";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { googleReviewLinkMessage, parseGoogleReviewLink } from "@/lib/google-review";
import { useSettings, useSectionSave, useReportDirty } from "../SettingsContext";
import {
  SectionHeading,
  Card,
  Field,
  AddressField,
  CopyableIdField,
  SaveBar,
  GlobeIcon,
  OpenIcon,
  CheckIcon,
  changed,
} from "../SettingsUI";

/**
 * Google reviews: the studio's Google Business listing and whether galleries
 * ask Guests for a review. Its own section (it used to sit inside Studio
 * Identity, between the website field and the logo) because it is a growth
 * feature every studio should set up, not a detail of how the studio is named.
 * The fields, rules and save payload are unchanged from that card.
 */
export default function GoogleReviewsPage() {
  const { company } = useSettings();
  const { saveState, errorMsg, submit } = useSectionSave();

  const [address, setAddress] = useState(company.address ?? "");
  const [googlePlaceId, setGooglePlaceId] = useState(company.google_place_id ?? "");
  // Absent on a company that predates the switch, and absent is ON.
  const savedReviewEnabled = company.google_review_enabled !== false;
  const [reviewEnabled, setReviewEnabled] = useState(savedReviewEnabled);
  const [confirmReviewsOff, setConfirmReviewsOff] = useState(false);
  const reviewDescriptionId = useId();
  // A Studio's own call whether to ask for reviews, so the switch works whenever
  // a review button could exist at all: a picked listing, or the legacy GMB
  // link some older Studios still carry. With neither there is no button to
  // switch off.
  const [reviewLink, setReviewLink] = useState(company.gmb_link ?? "");
  const reviewCheck = parseGoogleReviewLink(reviewLink);
  const hasReviewListing = !!googlePlaceId.trim() || reviewCheck.status !== "invalid";
  /** What is SAVED, for the Connected line: a draft does not count yet. */
  const connected = !!company.google_place_id?.trim() || parseGoogleReviewLink(company.gmb_link ?? "").status === "ok";

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

  // The pasted review link and the searched listing are two ways to say the
  // same thing, and the gallery prefers a place ID when both exist. So the last
  // one a Studio sets wins here, instead of a stale place ID silently
  // overriding a link that was just pasted (or the reverse).
  function handleReviewLinkChange(value: string) {
    setReviewLink(value);
    const check = parseGoogleReviewLink(value);
    if (check.status === "ok") setGooglePlaceId(check.placeId ?? "");
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
    setReviewLink("");
    setAddress("");
    committedAddressRef.current = "";
  }

  const dirty =
    changed(address, company.address) ||
    changed(googlePlaceId, company.google_place_id) ||
    changed(reviewLink, company.gmb_link) ||
    reviewEnabled !== savedReviewEnabled;
  useReportDirty(dirty);

  // Only a link the Studio has just typed is held to the review-link rule. An
  // older saved listing link stays as it is until the Studio touches it.
  const reviewLinkTouched = changed(reviewLink, company.gmb_link);
  const reviewLinkError = reviewLinkTouched ? googleReviewLinkMessage(reviewCheck) : null;
  const canSave = !reviewLinkError && dirty;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (reviewLinkError) return;
    const payload: CompanyUpdateInput = {};
    if (changed(address, company.address)) payload.address = address.trim();
    if (changed(googlePlaceId, company.google_place_id)) payload.google_place_id = googlePlaceId.trim();
    if (reviewLinkTouched) payload.gmb_link = reviewCheck.status === "ok" ? reviewCheck.url : "";
    if (reviewEnabled !== savedReviewEnabled) payload.google_review_enabled = reviewEnabled;
    await submit(payload);
  }

  function handleDiscard() {
    setAddress(company.address ?? "");
    setGooglePlaceId(company.google_place_id ?? "");
    setReviewLink(company.gmb_link ?? "");
    setReviewEnabled(savedReviewEnabled);
    committedAddressRef.current = company.address ?? "";
  }

  return (
    <form id="google-reviews-form" onSubmit={handleSubmit} className="space-y-6">
      <SectionHeading
        title="Google reviews"
        description="Guests can leave you a Google review straight from their gallery, right after they see their photos."
      />

      {connected ? (
        <p className="flex items-center gap-2 rounded-lg border border-[var(--color-brand-success)]/30 bg-[var(--color-brand-success-soft)] px-4 py-3 text-sm font-medium text-[var(--color-brand-success)]">
          <CheckIcon className="h-3.5 w-3.5 shrink-0" />
          Connected. {savedReviewEnabled ? "Galleries show a Leave a review button." : "Asking guests for reviews is turned off."}
        </p>
      ) : (
        <p className="rounded-lg border border-[#F0D9B5] bg-[var(--color-brand-warning-soft)] px-4 py-3 text-sm text-[var(--color-brand-ink)]">
          Not connected yet. Add your listing below so guests can review you.
        </p>
      )}

      <Card
        title="Your Google Business profile"
        icon={<GlobeIcon />}
        description="Pick your listing, or paste your review link. Guests who tap Leave a review land on the right page."
      >
        <div className="space-y-5">
          <div>
            <AddressField
              label="Your studio on Google"
              value={address}
              onChange={handleAddressChange}
              onPlaceSelect={({ placeId, address: pickedAddress }) => {
                setGooglePlaceId(placeId);
                setReviewLink("");
                committedAddressRef.current = pickedAddress;
              }}
              placeholder="Search for your studio"
              layout="row"
            />
            <p className="mt-1.5 text-xs text-[var(--color-brand-muted)]">
              Pick the matching listing from the list. This links your Google reviews automatically.
            </p>
          </div>

          <div>
            <Field
              label="Or paste your review link"
              value={reviewLink}
              onChange={handleReviewLinkChange}
              placeholder="https://g.page/r/.../review"
              error={reviewLinkError ?? undefined}
              hint={
                reviewCheck.status === "ok"
                  ? "Guests will land straight on your Google review box."
                  : "Can't find your studio in the search, or the name is in Hindi? Paste the link instead."
              }
              layout="row"
            />
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 lg:ml-[224px]">
              <a
                href="/guides/google-review-link"
                target="_blank"
                rel="noopener noreferrer"
                className="brand-focus inline-flex items-center gap-1.5 rounded-md text-xs font-semibold text-[var(--color-brand-navy)] hover:underline"
              >
                <OpenIcon className="h-3.5 w-3.5" />
                Show me how to get this link
              </a>
              {reviewCheck.status === "ok" && (
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

          <div className="lg:grid lg:grid-cols-[200px_minmax(0,440px)] lg:items-start lg:gap-x-6">
            <span className="mb-1.5 block text-[13px] font-medium text-[var(--color-brand-ink)] lg:mb-0 lg:pt-0.5">
              Ask Guests for reviews
            </span>
            <div className="flex items-start justify-between gap-4">
              <p id={reviewDescriptionId} className="text-xs leading-relaxed text-[var(--color-brand-muted)]">
                Galleries show a Google review button and an occasional prompt. Turn this off to remove both everywhere.
                {!hasReviewListing && (
                  <span className="mt-1 block font-medium text-[var(--color-brand-ink)]">
                    Guests see no review button until you pick your listing or paste your review link above.
                  </span>
                )}
              </p>
              <ToggleSwitch
                checked={reviewEnabled}
                onChange={(next) => (next ? setReviewEnabled(true) : setConfirmReviewsOff(true))}
                disabled={!hasReviewListing}
                label="Ask Guests for reviews"
                describedById={reviewDescriptionId}
              />
            </div>
          </div>
        </div>
      </Card>

      <SaveBar
        saveState={saveState}
        errorMsg={errorMsg}
        canSave={canSave}
        dirty={dirty}
        formId="google-reviews-form"
        idleHint="Changes apply to all galleries immediately."
        blockedReason={reviewLinkError}
        onDiscard={handleDiscard}
      />

      <ConfirmDialog
        open={confirmReviewsOff}
        title="Stop asking Guests for reviews?"
        description="No gallery will show a review button or prompt, including events where it is switched on. Your Google listing is not affected."
        confirmLabel="Turn it off"
        onCancel={() => setConfirmReviewsOff(false)}
        onConfirm={() => {
          setReviewEnabled(false);
          setConfirmReviewsOff(false);
        }}
      />
    </form>
  );
}
