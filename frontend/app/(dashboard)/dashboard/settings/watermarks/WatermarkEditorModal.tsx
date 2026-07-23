"use client";

import { useEffect, useMemo, useState } from "react";
import { ImageUpload } from "@/components/ui/ImageUpload";
import {
  createWatermarkPreset,
  updateWatermarkPreset,
  type WatermarkPresetInput,
} from "@/lib/api";
import type { WatermarkPosition, WatermarkPreset } from "@/lib/types";
import { Spinner } from "../SettingsUI";
import { IconX } from "@/components/ui/icons";

export const WATERMARK_POSITIONS: WatermarkPosition[] = [
  "top-left",
  "top-center",
  "top-right",
  "middle-left",
  "center",
  "middle-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];

// Neutral mid-tone sample "photo" so watermark opacity/placement reads clearly.
const SAMPLE_BG = "linear-gradient(135deg, #6b7280 0%, #9ca3af 45%, #d1d5db 100%)";

// This preview is calibrated to the exact frame the renderer bakes onto: the
// compressor caps every photo's long edge at 2560px (REFERENCE_W), so a 3:2
// landscape export is 2560×1707. The watermark width is `size`% of width in
// both preview and renderer, so the size set here is what gets rendered. The
// edge gap is a fixed 7px in the renderer (lib/r2-upload/watermark.ts); we
// express it here as the matching fraction of the 2560×1707 reference, so the
// preview's gap equals the baked gap. Keep EDGE_MARGIN_PX in sync with the renderer.
const REFERENCE_W = 2560;
const REFERENCE_H = Math.round((REFERENCE_W * 2) / 3); // 3:2 landscape → 1707
const EDGE_MARGIN_PX = 0;
const EDGE_MARGIN_H = `${(EDGE_MARGIN_PX / REFERENCE_W) * 100}%`; // ≈ 0.27%
const EDGE_MARGIN_V = `${(EDGE_MARGIN_PX / REFERENCE_H) * 100}%`; // ≈ 0.41%

/** Absolute-position style for the watermark box given anchor/size/opacity. */
export function watermarkBoxStyle(
  position: WatermarkPosition,
  sizePct: number,
  opacity: number,
): React.CSSProperties {
  const [v, h] = position === "center" ? ["middle", "center"] : position.split("-");
  const style: React.CSSProperties = {
    position: "absolute",
    width: `${sizePct}%`,
    opacity: opacity / 100,
  };
  const transforms: string[] = [];

  if (v === "top") style.top = EDGE_MARGIN_V;
  else if (v === "bottom") style.bottom = EDGE_MARGIN_V;
  else {
    style.top = "50%";
    transforms.push("translateY(-50%)");
  }

  if (h === "left") style.left = EDGE_MARGIN_H;
  else if (h === "right") style.right = EDGE_MARGIN_H;
  else {
    style.left = "50%";
    transforms.push("translateX(-50%)");
  }

  if (transforms.length) style.transform = transforms.join(" ");
  return style;
}

/** Sample photo with the watermark composited at the chosen placement. */
export function WatermarkPreview({
  src,
  position,
  size,
  opacity,
  className = "",
}: {
  src: string | null;
  position: WatermarkPosition;
  size: number;
  opacity: number;
  className?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl ${className}`}
      style={{ background: SAMPLE_BG, aspectRatio: "3 / 2" }}
    >
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="object-contain" style={watermarkBoxStyle(position, size, opacity)} />
      )}
    </div>
  );
}

function AnchorGrid({
  value,
  onChange,
}: {
  value: WatermarkPosition;
  onChange: (p: WatermarkPosition) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {WATERMARK_POSITIONS.map((p) => {
        const active = p === value;
        return (
          <button
            key={p}
            type="button"
            aria-label={p}
            aria-pressed={active}
            onClick={() => onChange(p)}
            className={`flex h-9 items-center justify-center rounded-md border transition-colors ${
              active
                ? "border-[var(--color-brand-navy)] bg-[var(--color-brand-navy-soft)]"
                : "border-[var(--color-brand-border)] hover:border-[var(--color-brand-navy)]"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-sm ${
                active ? "bg-[var(--color-brand-navy)]" : "bg-[var(--color-brand-muted)]/50"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-brand-muted)]">
        {label}
        <span className="tabular-nums text-[var(--color-brand-ink)]">{value}%</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--color-brand-navy)]"
      />
    </label>
  );
}

export function WatermarkEditorModal({
  mode,
  initial,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  initial?: WatermarkPreset;
  onClose: () => void;
  onSaved: (preset: WatermarkPreset) => void;
}) {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [name, setName] = useState(initial?.name ?? "");
  const [opacity, setOpacity] = useState(initial?.opacity ?? 70);
  const [position, setPosition] = useState<WatermarkPosition>(initial?.position ?? "bottom-right");
  const [size, setSize] = useState(initial?.size ?? 20);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live preview source: the freshly picked file, else the existing image.
  const objectUrl = useMemo(
    () => (imageFile ? URL.createObjectURL(imageFile) : null),
    [imageFile],
  );
  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);
  const previewSrc = objectUrl ?? initial?.image_url ?? null;

  const canSave = useMemo(
    () => (mode === "create" ? !!imageFile : true),
    [mode, imageFile],
  );

  async function handleSave() {
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    const input: WatermarkPresetInput = { name, opacity, position, size };
    if (imageFile) input.image = imageFile;
    try {
      const res =
        mode === "create"
          ? await createWatermarkPreset(input)
          : await updateWatermarkPreset(initial!._id, input);
      onSaved(res.preset);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save preset");
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-[var(--color-brand-bg)] p-5 shadow-xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--color-brand-ink)]">
            {mode === "create" ? "New watermark preset" : "Edit watermark preset"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="brand-focus flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-brand-muted)] hover:text-[var(--color-brand-ink)]"
            aria-label="Close"
          >
            <IconX size={18} />
          </button>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          {/* Live placement preview */}
          <div className="space-y-3">
            <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-brand-muted)]">
              Preview
            </span>
            <WatermarkPreview src={previewSrc} position={position} size={size} opacity={opacity} />
            <ImageUpload
              label="Watermark image"
              existingUrl={initial?.image_url ?? null}
              file={imageFile}
              onChange={setImageFile}
            />
            <p className="text-xs text-[var(--color-brand-muted)]">
              PNG with transparency recommended. Max 5 MB.
            </p>
          </div>

          {/* Controls */}
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-brand-muted)]">
                Name
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Light corner mark"
                className="brand-focus h-10 w-full rounded-lg border border-[var(--color-brand-border)] bg-[var(--color-brand-surface)] px-3 text-sm text-[var(--color-brand-ink)] outline-none placeholder:text-[var(--color-brand-muted)]/60 focus:border-[var(--color-brand-outline)]"
              />
            </label>

            <div>
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-brand-muted)]">
                Position
              </span>
              <AnchorGrid value={position} onChange={setPosition} />
            </div>

            <Slider label="Size" value={size} min={5} max={60} onChange={setSize} />
            <Slider label="Opacity" value={opacity} min={5} max={100} onChange={setOpacity} />
          </div>
        </div>

        {error && (
          <p className="mt-4 text-sm text-[var(--color-brand-danger)]">{error}</p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="brand-focus h-10 rounded-lg border border-[var(--color-brand-border)] px-4 text-sm font-semibold text-[var(--color-brand-ink)] hover:bg-[var(--color-brand-surface)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave || saving}
            className="brand-focus inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--color-brand-navy)] px-5 text-sm font-semibold text-white hover:bg-[var(--color-brand-navy-deep)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? (
              <>
                <Spinner />
                Saving…
              </>
            ) : (
              "Save preset"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
