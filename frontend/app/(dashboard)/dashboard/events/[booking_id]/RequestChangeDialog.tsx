"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { ApiError, createChangeRequest, type ChangeRequest, type ChangeRequestType } from "@/lib/api";
import { requestFormError } from "@/lib/change-request";
import type { MediaItem } from "@/lib/types";
import { IconCheck, IconUpload } from "./icons";

const TYPES: ReadonlyArray<{ value: ChangeRequestType; label: string; hint: string }> = [
  { value: "event_name", label: "Event name", hint: "Ask for a different name." },
  { value: "cover_photo", label: "Cover photo", hint: "Ask for a different cover." },
];

/**
 * "Request change": a studio on a pay per event plan asks the Vyavasth team to
 * change a locked event name or cover photo. It picks which one, gives the new
 * name or chooses the new cover (one of the event's own photos, or a new
 * upload), and may add a reason. Nothing changes until the team approves, and
 * the dialog says so.
 */
export function RequestChangeDialog({
  open,
  onClose,
  bookingId,
  initialType,
  currentName,
  photos,
  uploadCover,
  disabledTypes,
  onSubmitted,
}: {
  open: boolean;
  onClose: () => void;
  bookingId: string;
  initialType: ChangeRequestType;
  currentName: string;
  /** The event's loaded photos, to pick a cover from. */
  photos: MediaItem[];
  /** Uploads a new cover file and returns its URL (the upload engine's own). */
  uploadCover: (file: File) => Promise<string>;
  /** Types that already have an open request: not offered again. */
  disabledTypes: ChangeRequestType[];
  onSubmitted: (request: ChangeRequest) => void;
}) {
  const [type, setType] = useState<ChangeRequestType | null>(initialType);
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [mediaId, setMediaId] = useState<string | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [uploadedPreview, setUploadedPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState<"uploading" | "sending" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // A fresh form each time it opens, on the type the studio came from.
  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect -- resets the form on the open transition */
    setType(disabledTypes.includes(initialType) ? (TYPES.find((t) => !disabledTypes.includes(t.value))?.value ?? null) : initialType);
    setName("");
    setReason("");
    setMediaId(null);
    setUploadedUrl(null);
    setUploadedPreview(null);
    setBusy(null);
    setError(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    // Only on the open transition: a refetch of the requests must not wipe what is typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const images = photos.filter((p) => p.type === "image");
  const coverChosen = mediaId !== null || uploadedUrl !== null;
  const formError = requestFormError({ type, name, coverChosen, currentName });

  async function pickFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy("uploading");
    try {
      const url = await uploadCover(file);
      setUploadedUrl(url);
      setUploadedPreview(url);
      setMediaId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload that photo.");
    } finally {
      setBusy(null);
    }
  }

  async function submit() {
    if (!type || formError || busy) return;
    setError(null);
    setBusy("sending");
    try {
      const res = await createChangeRequest(bookingId, {
        type,
        ...(type === "event_name" ? { value: name.trim() } : mediaId ? { mediaId } : { value: uploadedUrl ?? "" }),
        reason: reason.trim() || undefined,
      });
      onSubmitted(res.request);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : "Could not send your request.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Request a change"
      subtitle="The Vyavasth team will look at it. Nothing changes until it is approved."
      size="md"
      footer={
        <div className="flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="brand-focus inline-flex h-10 items-center rounded-lg border border-[var(--color-brand-border)] bg-white px-4 text-[13.5px] font-medium text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!!formError || !!busy}
            title={formError ?? undefined}
            className="brand-focus inline-flex h-10 items-center rounded-lg bg-[var(--color-brand-navy)] px-4 text-[13.5px] font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy === "sending" ? "Sending…" : "Send request"}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <fieldset>
          <legend className="type-label mb-2">What do you want to change?</legend>
          <div className="grid grid-cols-2 gap-2">
            {TYPES.map((t) => {
              const waiting = disabledTypes.includes(t.value);
              const selected = type === t.value;
              return (
                <label
                  key={t.value}
                  className={`flex cursor-pointer flex-col gap-0.5 rounded-lg border px-3 py-2.5 ${
                    selected ? "border-[var(--color-brand-navy-deep)] bg-[var(--color-brand-navy-soft)]" : "border-[var(--color-brand-border)] bg-white"
                  } ${waiting ? "cursor-not-allowed opacity-60" : ""}`}
                >
                  <span className="flex items-center gap-2 text-[13px] font-semibold text-[var(--color-brand-ink)]">
                    <input
                      type="radio"
                      name="change-type"
                      checked={selected}
                      disabled={waiting}
                      onChange={() => setType(t.value)}
                      className="h-3.5 w-3.5 accent-[var(--color-brand-navy-deep)]"
                    />
                    {t.label}
                  </span>
                  <span className="type-meta pl-[22px]">{waiting ? "Already waiting for a decision." : t.hint}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {type === "event_name" && (
          <label className="block">
            <span className="type-label mb-1.5 block">New event name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={currentName}
              autoComplete="off"
              className="brand-focus h-10 w-full rounded-lg border border-[var(--color-brand-border)] bg-white px-3 text-[14px] text-[var(--color-brand-ink)] outline-none placeholder:text-[var(--color-brand-muted)]/60"
            />
            <span className="type-meta mt-1 block">Now: {currentName}</span>
          </label>
        )}

        {type === "cover_photo" && (
          <div>
            <span className="type-label mb-1.5 block">New cover photo</span>
            {images.length > 0 && (
              <ul className="grid max-h-56 grid-cols-4 gap-1.5 overflow-y-auto rounded-lg border border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] p-1.5 sm:grid-cols-5">
                {images.slice(0, 60).map((p) => {
                  const selected = mediaId === p._id;
                  return (
                    <li key={p._id}>
                      <button
                        type="button"
                        aria-pressed={selected}
                        aria-label="Use this photo as the cover"
                        onClick={() => {
                          setMediaId(p._id);
                          setUploadedUrl(null);
                          setUploadedPreview(null);
                        }}
                        className={`brand-focus relative block aspect-square w-full overflow-hidden rounded-md border-2 ${selected ? "border-[var(--color-brand-navy)]" : "border-transparent"}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.thumbnail_url || p.url} alt="" className="h-full w-full object-cover" />
                        {selected && (
                          <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-brand-navy)] text-white">
                            <IconCheck size={12} />
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={!!busy}
                className="brand-focus inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--color-brand-border)] bg-white px-3 text-[12.5px] font-semibold text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)] disabled:opacity-60"
              >
                <IconUpload size={14} />
                {busy === "uploading" ? "Uploading…" : "Upload a new photo"}
              </button>
              {uploadedPreview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={uploadedPreview} alt="Your uploaded cover" className="h-9 w-14 rounded-md object-cover" />
              )}
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void pickFile(e.target.files?.[0])} />
            </div>
          </div>
        )}

        <label className="block">
          <span className="type-label mb-1.5 block">Reason (optional)</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Tell us why, in a line or two."
            className="brand-focus block w-full resize-none rounded-lg border border-[var(--color-brand-border)] bg-white px-3 py-2 text-[13px] text-[var(--color-brand-ink)] outline-none placeholder:text-[var(--color-brand-muted)]/60"
          />
        </label>

        {error && (
          <p role="alert" className="rounded-lg border border-[var(--color-brand-danger)]/30 bg-[var(--color-brand-danger-soft)] px-3 py-2 text-[13px] text-[var(--color-brand-danger)]">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
