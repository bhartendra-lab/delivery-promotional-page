"use client";

import { useEffect, useRef, useState } from "react";
import { IconUpload } from "@/components/ui/icons";

type Props = {
  label?: string;
  existingUrl?: string | null;
  file: File | null;
  onChange: (file: File | null) => void;
};

// Keep in sync with backend/src/middleware/upload.middleware.js — the two
// codebases don't share a config layer, so this is duplicated by convention,
// not derived. Narrowed to match every consumer's own copy (Studio Logo,
// watermark presets): none of them ever advertised gif/svg, and the server
// only accepts these three now too.
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function validateImageFile(candidate: File): string | null {
  if (!ALLOWED_TYPES.has(candidate.type)) return "Please choose a PNG, JPG or WEBP image.";
  if (candidate.size > MAX_IMAGE_BYTES) return "Image is too large. Maximum size is 5 MB.";
  return null;
}

export function ImageUpload({
  label = "Background image",
  existingUrl,
  file,
  onChange,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(existingUrl ?? null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- falls back to the existing URL synchronously when the pending file is cleared
      setPreview(existingUrl ?? null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file, existingUrl]);

  /** Shared by the file input and drag-drop — validates before ever calling
   *  onChange, so a rejected file never reaches the upload/save path. */
  function acceptFile(candidate: File | null) {
    if (!candidate) {
      setError(null);
      onChange(null);
      return;
    }
    const problem = validateImageFile(candidate);
    if (problem) {
      setError(problem);
      // Clear the input's own value so re-picking the exact same (still
      // bad) file fires a change event again instead of being a no-op.
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setError(null);
    onChange(candidate);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    acceptFile(e.dataTransfer.files?.[0] ?? null);
  }

  return (
    <div className="space-y-2">
      <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-brand-muted)]">
        {label}
      </span>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`relative flex h-44 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed transition-all duration-200 ${
          isDragging
            ? "border-[var(--color-brand-navy)] bg-[var(--color-brand-navy-soft)]"
            : "border-[var(--color-brand-border)] bg-[var(--color-brand-surface-raised)] hover:border-[var(--color-brand-navy)]"
        }`}
      >
        {preview ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="Preview"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 flex items-end justify-end bg-gradient-to-t from-black/60 via-transparent to-transparent p-3 opacity-0 transition-opacity hover:opacity-100">
              <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-[var(--color-brand-ink)]">
                Click to replace
              </span>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 text-center text-[var(--color-brand-muted)]">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--color-brand-navy-soft)] text-[var(--color-brand-navy)]">
              <IconUpload size={20} />
            </span>
            <p className="text-sm font-medium text-[var(--color-brand-ink)]">
              {isDragging ? "Drop to upload" : "Click or drag to upload"}
            </p>
            <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-brand-muted)]">
              PNG · JPG · WEBP · up to 5 MB
            </p>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="text-xs text-[var(--color-brand-danger)]">
          {error}
        </p>
      )}

      {preview && file && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onChange(null);
            setError(null);
            if (inputRef.current) inputRef.current.value = "";
          }}
          className="text-xs font-medium text-[var(--color-brand-danger)] hover:underline"
        >
          Remove
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => acceptFile(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}

