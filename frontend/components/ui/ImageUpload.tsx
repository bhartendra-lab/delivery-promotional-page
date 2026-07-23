"use client";

import { useEffect, useRef, useState } from "react";
import { IconUpload } from "@/components/ui/icons";

type Props = {
  label?: string;
  existingUrl?: string | null;
  file: File | null;
  onChange: (file: File | null) => void;
};

export function ImageUpload({
  label = "Background image",
  existingUrl,
  file,
  onChange,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(existingUrl ?? null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!file) {
      setPreview(existingUrl ?? null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file, existingUrl]);

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped && dropped.type.startsWith("image/")) {
      onChange(dropped);
    }
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
            : "border-[var(--color-brand-border)] bg-[var(--color-brand-surface)] hover:border-[var(--color-brand-navy)]"
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
              PNG · JPG · WEBP
            </p>
          </div>
        )}
      </div>

      {preview && file && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onChange(null);
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
        accept="image/*"
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}

