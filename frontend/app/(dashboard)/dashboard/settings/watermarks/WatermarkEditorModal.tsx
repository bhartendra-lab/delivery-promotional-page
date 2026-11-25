"use client";

import { useEffect, useMemo, useState } from "react";
import { ImageUpload } from "@/components/ui/ImageUpload";
import {
  createWatermarkPreset,
  updateWatermarkPreset,
  type WatermarkPresetInput,
} from "@/lib/api";
import type { WatermarkPosition, WatermarkPreset } from "@/lib/types";
import { EDGE_MARGIN_RATIO } from "@/lib/r2-upload/watermark";
import { trimmedPreviewUrl } from "@/lib/watermark-trim";
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

// This preview is calibrated to the exact frames the renderer bakes onto: the
// compressor caps every photo's long edge at 2560px, so a 3:2 export is
// 2560x1707 (landscape) or 1707x2560 (portrait). The renderer sizes the mark as
// `size`% of the photo's SHORTER edge (geometry.ts `watermarkSize`), so both
// orientations get the identical mark — the editor shows both frames so the
// studio sees that.
//
// The edge gap is imported from the renderer rather than restated, so the two
// cannot drift. The renderer insets by the same number of PIXELS on both axes
// (EDGE_MARGIN_RATIO of the shorter edge), but CSS percentages resolve per
// axis — top/bottom against the container's height, left/right against its
// width. So the inset along the shorter axis is the ratio as-is, and along the
// longer one it is scaled by the aspect ratio to land on the same pixels. The
// mark's CSS width (a % of the container's WIDTH) is converted the same way.
export type PreviewOrientation = "landscape" | "portrait";
/** Shorter edge / longer edge of the reference 3:2 frame. */
const SHORT_OVER_LONG = Math.round((2560 * 2) / 3) / 2560; // 1707 / 2560

/**
 * Smallest available "Watermark N" — fills gaps left by deleted presets
 * rather than just counting existing ones, so deleting "Watermark 2" and
 * creating a new preset offers "Watermark 2" again, not "Watermark 4".
 */
function nextWatermarkName(existingNames: string[]): string {
  const taken = new Set(existingNames.map((n) => n.trim().toLowerCase()).filter(Boolean));
  let n = 1;
  while (taken.has(`watermark ${n}`)) n++;
  return `Watermark ${n}`;
}

/** Absolute-position style for the watermark box given anchor/size/opacity,
 *  on a 3:2 frame of the given orientation. */
export function watermarkBoxStyle(
  position: WatermarkPosition,
  sizePct: number,
  opacity: number,
  orientation: PreviewOrientation = "landscape",
): React.CSSProperties {
  const [v, h] = position === "center" ? ["middle", "center"] : position.split("-");
  const landscape = orientation === "landscape";
  const marginPct = EDGE_MARGIN_RATIO * 100;
  // Width is the long edge on a landscape, the short edge on a portrait.
  const widthPct = landscape ? sizePct * SHORT_OVER_LONG : sizePct;
  const EDGE_MARGIN_H = `${landscape ? marginPct * SHORT_OVER_LONG : marginPct}%`;
  const EDGE_MARGIN_V = `${landscape ? marginPct : marginPct * SHORT_OVER_LONG}%`;
  const style: React.CSSProperties = {
    position: "absolute",
    width: `${Math.min(100, widthPct)}%`,
    maxHeight: "100%",
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
  orientation = "landscape",
  className = "",
}: {
  src: string | null;
  position: WatermarkPosition;
  size: number;
  opacity: number;
  orientation?: PreviewOrientation;
  className?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl ${className}`}
      style={{ background: SAMPLE_BG, aspectRatio: orientation === "landscape" ? "3 / 2" : "2 / 3" }}
    >
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          className="object-contain"
          style={watermarkBoxStyle(position, size, opacity, orientation)}
        />
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
  existingNames,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  initial?: WatermarkPreset;
  /** Every other preset's current name — used to suggest the next available
   *  "Watermark N" when creating. Ignored when editing (initial.name wins). */
  existingNames: string[];
  onClose: () => void;
  onSaved: (preset: WatermarkPreset) => void;
}) {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [name, setName] = useState(() => initial?.name ?? nextWatermarkName(existingNames));
  const [opacity, setOpacity] = useState(initial?.opacity ?? 70);
  const [position, setPosition] = useState<WatermarkPosition>(initial?.position ?? "bottom-right");
  const [size, setSize] = useState(initial?.size ?? 20);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live preview source: the freshly picked file with its empty border
  // cropped off exactly as the server will crop it on save (watermark-trim.ts),
  // else the existing (already trimmed) image.
  const [trimmed, setTrimmed] = useState<{ file: File; url: string } | null>(null);
  useEffect(() => {
    if (!imageFile) return;
    let url: string | null = null;
    let live = true;
    trimmedPreviewUrl(imageFile).then((u) => {
      if (live) {
        url = u;
        setTrimmed({ file: imageFile, url: u });
      } else URL.revokeObjectURL(u);
    });
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [imageFile]);
  // A picked file shows nothing until its trimmed copy is ready (a few ms),
  // rather than flashing the untrimmed image.
  const previewSrc = imageFile
    ? trimmed?.file === imageFile
      ? trimmed.url
      : null
    : (initial?.image_url ?? null);

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
      className="fixed inset-0 z-50 flex flex-col bg-black/40 sm:items-center sm:justify-center sm:p-4"
      role="dialog"
      aria-modal
      onClick={onClose}
    >
      {/* A flex column, not one big overflow-y-auto box — the header and
          footer are fixed-height siblings of the scrolling middle section,
          not part of what scrolls. Before this, the header and Cancel/Save
          buttons scrolled away WITH the content, so on a short viewport a
          tall form (this one grew once Name/Preview stopped sharing a
          column with the other controls) could leave both ends
          simultaneously out of view with no visible way back to either. */}
      <div
        className="flex w-full flex-1 flex-col overflow-hidden bg-[var(--color-brand-bg)] shadow-xl sm:max-h-[90vh] sm:w-full sm:max-w-2xl sm:flex-none sm:rounded-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-brand-border)] px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 sm:py-4">
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

        <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6">
        {/* Name and the live preview span the full width — pairing them with
            a column partner (as before) left one side much taller than the
            other, trailing off into dead space before the footer buttons.
            The remaining controls pair by comparable weight instead (image
            upload ≈ position grid; slider ≈ slider), which keeps both
            columns close in height. */}
        <div className="space-y-5">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-brand-muted)]">
              Name
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Light corner mark"
              className="brand-focus h-10 w-full rounded-lg border border-[var(--color-brand-border)] bg-[var(--color-brand-surface-raised)] px-3 text-sm text-[var(--color-brand-ink)] outline-none placeholder:text-[var(--color-brand-muted)]/60 focus:border-[var(--color-brand-outline)]"
            />
          </label>

          <div className="mx-auto w-full max-w-md space-y-1.5">
            <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-brand-muted)]">
              Preview
            </span>
            {/* Both orientations: the mark is sized off the shorter edge, so
                it comes out the same on each — what the studio sees here is
                what lands on every photo. 3fr:2fr gives the two frames the
                same height. */}
            <div className="grid grid-cols-[3fr_2fr] items-start gap-2">
              <WatermarkPreview src={previewSrc} position={position} size={size} opacity={opacity} />
              <WatermarkPreview
                src={previewSrc}
                position={position}
                size={size}
                opacity={opacity}
                orientation="portrait"
              />
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <ImageUpload
                label="Watermark image"
                existingUrl={initial?.image_url ?? null}
                file={imageFile}
                onChange={setImageFile}
              />
              <p className="text-xs text-[var(--color-brand-muted)]">
                PNG with transparency recommended. Max 5 MB. Empty space around
                the logo is trimmed automatically.
              </p>
            </div>
            <div>
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-brand-muted)]">
                Position
              </span>
              <AnchorGrid value={position} onChange={setPosition} />
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Slider label="Size" value={size} min={2} max={60} onChange={setSize} />
            <Slider label="Opacity" value={opacity} min={5} max={100} onChange={setOpacity} />
          </div>
        </div>

        {error && (
          <p className="mt-4 text-sm text-[var(--color-brand-danger)]">{error}</p>
        )}
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--color-brand-border)] px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:py-4">
          <button
            type="button"
            onClick={onClose}
            className="brand-focus h-10 rounded-lg border border-[var(--color-brand-border)] px-4 text-sm font-semibold text-[var(--color-brand-ink)] hover:bg-[var(--color-brand-hover)]"
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
