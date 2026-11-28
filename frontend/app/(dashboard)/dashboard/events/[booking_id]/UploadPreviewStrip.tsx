"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getWatermarkPresets } from "@/lib/api";
import { compressWithExif, type UploadVariant } from "@/lib/r2-upload/compressor";
import { WatermarkRenderer } from "@/lib/r2-upload/watermark";
import { firstPreviewFiles, PREVIEW_COUNT, previewKeyOf } from "@/lib/upload-preview";
import { IconX } from "./icons";

type Preview = { key: string; name: string; url: string | null; failed: boolean };

/**
 * "Check before uploading": the first few photos of the selection, produced by
 * the very function the upload engine uses (`compressWithExif`, with the same
 * `WatermarkRenderer`), so orientation, size, position and opacity are what the
 * studio will actually deliver. It re-runs when the quality tier or the
 * watermark switch changes.
 *
 * It only ever touches PREVIEW_COUNT files (the first ones, in selection order),
 * one at a time, through the compressor's own web worker, and only once this
 * step is on screen. A 2,000 photo selection costs the same as a 5 photo one.
 */
export function UploadPreviewStrip({
  files,
  variant,
  watermark,
}: {
  files: File[];
  variant: UploadVariant;
  /** The "Allow watermark" switch of this run. */
  watermark: boolean;
}) {
  const first = useMemo(() => firstPreviewFiles(files), [files]);
  const filesKey = useMemo(() => first.map(previewKeyOf).join("|"), [first]);

  // The studio's default preset, read once. "none" and "error" are real states
  // the strip says out loud, because the upload would behave the same way.
  const [preset, setPreset] = useState<
    | { state: "loading" }
    | { state: "none" }
    | { state: "error" }
    | { state: "ready"; position: Parameters<typeof WatermarkRenderer.create>[0]["position"]; opacity: number; size: number; imageUrl: string }
  >({ state: "loading" });
  useEffect(() => {
    if (!watermark) return;
    let cancelled = false;
    getWatermarkPresets()
      .then(({ presets }) => {
        if (cancelled) return;
        const def = presets.find((p) => p.is_default);
        setPreset(
          def?.image_url
            ? { state: "ready", position: def.position, opacity: def.opacity, size: def.size, imageUrl: def.image_url }
            : { state: "none" },
        );
      })
      .catch(() => {
        if (!cancelled) setPreset({ state: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [watermark]);

  const [previews, setPreviews] = useState<Preview[]>([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Preview | null>(null);
  const urlsRef = useRef<string[]>([]);

  const presetKey =
    watermark && preset.state === "ready" ? `${preset.imageUrl}:${preset.position}:${preset.opacity}:${preset.size}` : watermark ? preset.state : "off";

  useEffect(() => {
    if (first.length === 0) return;
    if (watermark && preset.state === "loading") return;
    let cancelled = false;
    let renderer: WatermarkRenderer | null = null;
    // Debounced: flipping the switch or the tier a few times in a row should
    // cost one render of five photos, not several.
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        if (watermark && preset.state === "ready") {
          try {
            renderer = await WatermarkRenderer.create(
              { position: preset.position, opacity: preset.opacity, size: preset.size },
              preset.imageUrl,
            );
          } catch {
            renderer = null; // the upload would go without it too, and says so
          }
        }
        const next: Preview[] = [];
        for (const file of first) {
          if (cancelled) return;
          const key = previewKeyOf(file);
          try {
            // The same call the engine makes. "original" delivers the same
            // watermarked 2560px view as HD (its archive is the untouched file).
            const result = await compressWithExif(file, renderer, variant === "4096" ? "4096" : "2560");
            const url = URL.createObjectURL(result.blob);
            urlsRef.current.push(url);
            next.push({ key, name: file.name, url, failed: false });
          } catch {
            next.push({ key, name: file.name, url: null, failed: true });
          }
          if (!cancelled) setPreviews([...next]);
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      renderer?.dispose();
    };
    // `first` is derived from filesKey; presetKey stands for the preset's fields.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filesKey, variant, watermark, presetKey]);

  // Free every preview image when the strip leaves the screen or is replaced.
  useEffect(() => {
    return () => {
      for (const url of urlsRef.current) URL.revokeObjectURL(url);
      urlsRef.current = [];
    };
  }, [filesKey, variant, watermark, presetKey]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (first.length === 0) return null;

  // What the preview is honest about: a watermark that is on but cannot be
  // applied is shown WITHOUT it, with the reason, exactly as the upload would go.
  const watermarkNote = !watermark
    ? "Watermark is off for this upload."
    : preset.state === "none"
      ? "You have no default watermark set, so these photos go without one. Set one in Settings > Watermark Presets."
      : preset.state === "error"
        ? "We could not load your watermark, so this preview and the upload go without it."
        : null;

  return (
    <div>
      <p className="type-body mb-2">
        First {Math.min(PREVIEW_COUNT, first.length)} of your photos, as guests will see them. Tap one to enlarge it.
      </p>
      <ul className="grid grid-cols-5 gap-2">
        {first.map((file, i) => {
          const p = previews.find((x) => x.key === previewKeyOf(file));
          return (
            <li key={previewKeyOf(file)}>
              <button
                type="button"
                disabled={!p?.url}
                onClick={() => p?.url && setOpen(p)}
                aria-label={`Enlarge preview of ${file.name}`}
                className="brand-focus relative block aspect-[4/5] w-full overflow-hidden rounded-lg border border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] disabled:cursor-default"
              >
                {p?.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.url} alt={`Preview of ${file.name}`} className="h-full w-full object-contain" />
                ) : p?.failed ? (
                  <span className="flex h-full items-center justify-center px-1 text-center text-[11px] text-[var(--color-brand-muted)]">
                    No preview for this file
                  </span>
                ) : (
                  <span className="skeleton block h-full w-full" aria-label={`Preparing preview ${i + 1}`} />
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[12px] text-[var(--color-brand-muted)]" aria-live="polite">
        {watermarkNote ?? (busy ? "Updating the preview…" : "Check the direction of each photo and where your watermark sits.")}
      </p>

      {open?.url && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Preview of ${open.name}`}
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setOpen(null)}
        >
          <button
            type="button"
            onClick={() => setOpen(null)}
            aria-label="Close preview"
            className="brand-focus absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-[var(--color-brand-ink)]"
          >
            <IconX size={18} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={open.url} alt={`Preview of ${open.name}`} className="max-h-full max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
