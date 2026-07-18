"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import type { QrCode } from "@/lib/types";
import { useCompany } from "@/lib/useCompany";

/**
 * F1a — the "paint style" generate modal, opened from the "Generate new QR"
 * button. This is the one place in the app allowed more than one colour on
 * screen (it's literally a colour picker); all chrome stays on the
 * terracotta/cream tokens, only the swatches carry arbitrary hues.
 *
 * A curated palette of dark/saturated jewel tones (kept dark so the QR stays
 * scannable), plus a Custom swatch (native colour input + validated hex field)
 * and a "colours you've already used" row derived from the existing QRs. Guards
 * against near-white customs that won't scan, and against the plan's QR cap.
 *
 * Portaled to `document.body` (like `AssignEventModal`) rather than rendered
 * where it's triggered from, so its `fixed inset-0` overlay isn't trapped by a
 * `dash-rise`-animated ancestor — that animation's `transform` never fully
 * clears (fill-mode `both`), which makes the ancestor a containing block/
 * stacking context for fixed descendants and breaks both sizing and z-index.
 */

type Preset = { name: string; hex: string };

// Dark/saturated enough to stay scannable; leans into the brand's rich
// jewel-tone direction rather than generic corporate colours.
const PRESETS: Preset[] = [
  { name: "Terracotta", hex: "#C25A3A" },
  { name: "Maroon", hex: "#8C2F3A" },
  { name: "Emerald", hex: "#2E6B52" },
  { name: "Ink navy", hex: "#1F2A44" },
  { name: "Charcoal", hex: "#2A2218" },
  { name: "Deep gold", hex: "#B8860B" },
  { name: "Royal purple", hex: "#5B3A8C" },
  { name: "Forest", hex: "#2F4F2F" },
  { name: "Wine", hex: "#6B1F3A" },
  { name: "Teal", hex: "#1F5E5E" },
  { name: "Deep rose", hex: "#A8425A" },
  { name: "Bronze", hex: "#8A5A2E" },
];

/** Accepts `#RGB` or `#RRGGBB` — the subset the QR renderer + luminance math
 *  handle cleanly (a superset would be valid to the backend but break the
 *  gradient/contrast maths). */
const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const DEFAULT_HEX = "#c25a3a";

/** Normalise `#RGB` / `#RRGGBB` (with or without the leading #) to a canonical
 *  lowercase 6-digit `#rrggbb`, or null if it isn't a valid short/long hex. The
 *  6-digit form is what a native `<input type="color">` and the luminance maths
 *  both require, so every picked colour flows through here. */
function expandHex(raw: string): string | null {
  const v = raw.trim();
  const withHash = v.startsWith("#") ? v : `#${v}`;
  if (!HEX_RE.test(withHash)) return null;
  const body = withHash.slice(1).toLowerCase();
  const full = body.length === 3 ? body.split("").map((c) => c + c).join("") : body;
  return `#${full}`;
}

/** WCAG relative luminance (0=black, 1=white) — same math as
 *  `lib/client-theme.ts`'s private `luminance()`, inlined here since it isn't
 *  exported. A near-white QR won't scan against its background. Falls back to a
 *  mid value for anything unparseable so a stray legacy code can't wrongly trip
 *  the "too light" guard. */
function luminance(hex: string): number {
  const norm = expandHex(hex);
  if (!norm) return 0.35;
  const n = parseInt(norm.slice(1), 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const lin = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** Above this the QR's foreground is too light to scan reliably. */
const MAX_SCANNABLE_LUMINANCE = 0.7;

export function QrColorPicker({
  qrs,
  qrLimit,
  onGenerate,
  onClose,
}: {
  qrs: QrCode[];
  qrLimit: number | null;
  /** Resolves when the new QR is in the grid; rejects (message shown) on failure. */
  onGenerate: (colorCode: string) => Promise<void>;
  onClose: () => void;
}) {
  const company = useCompany();
  const hasLogo = Boolean(company?.logo);

  const [selected, setSelected] = useState<string | null>(null);
  const [customHex, setCustomHex] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);

  // Body scroll lock + Esc-to-close (gated on generating), mirroring AssignEventModal.
  useEffect(() => {
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || generating) return;
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [generating, onClose]);

  const usedColors = useMemo(
    () => Array.from(new Set(qrs.map((q) => q.color_code).filter(Boolean))),
    [qrs],
  );

  const atCap = typeof qrLimit === "number" && qrs.length >= qrLimit;
  const tooLight = selected != null && luminance(selected) > MAX_SCANNABLE_LUMINANCE;
  const customValid = expandHex(customHex) != null;

  const canGenerate = selected != null && !tooLight && !atCap && !generating;

  function pick(hex: string) {
    setSelected(expandHex(hex) ?? hex.toLowerCase());
    setError(null);
  }

  function onCustomHexChange(raw: string) {
    setCustomHex(raw);
    const norm = expandHex(raw);
    if (norm) {
      setSelected(norm);
      setError(null);
    }
  }

  async function generate() {
    if (!selected || !canGenerate) return;
    setGenerating(true);
    setError(null);
    try {
      await onGenerate(selected);
      // Keep the picked colour so the studio can quickly make another in the
      // same hue if they want; nothing to reset.
    } catch (e) {
      // Surface the backend message (e.g. the hard 400 cap) without losing the pick.
      setError(e instanceof Error ? e.message : "Could not generate the QR. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Generate a new QR code"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={generating ? undefined : onClose}
        className="drawer-fade absolute inset-0 bg-[var(--color-brand-ink)]/40 backdrop-blur-[1px]"
      />
      <div className="dash-rise relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-2xl border border-[var(--color-brand-border)] bg-white shadow-[0_12px_40px_rgba(42,34,24,0.18)] sm:max-h-[85vh] sm:max-w-[560px] sm:rounded-xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-brand-border)] px-5 py-4">
          <div>
            <h2 className="text-[17px] font-bold leading-tight tracking-tight text-[var(--color-brand-ink)]">
              Generate a new QR
            </h2>
            <p className="mt-0.5 text-[12.5px] text-[var(--color-brand-muted)]">
              Pick a colour, generate once, print it — then re-point it at whichever event is live.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            {typeof qrLimit === "number" && (
              <span className="rounded-full border border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] px-2.5 py-1 text-[11.5px] font-semibold tabular-nums text-[var(--color-brand-muted)]">
                {qrs.length} of {qrLimit} used
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              disabled={generating}
              aria-label="Close"
              className="brand-focus flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--color-brand-muted)] hover:bg-[var(--color-brand-surface)] hover:text-[var(--color-brand-ink)] disabled:opacity-50"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="6" y1="18" x2="18" y2="6" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body — scrollable */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-6 p-5 sm:flex-row sm:items-start">
            {/* Current-pick preview */}
            <div className="flex shrink-0 flex-col items-center gap-2">
              <span
                className="flex h-[84px] w-[84px] items-center justify-center rounded-full transition-colors"
                style={
                  selected
                    ? { background: selected, boxShadow: "0 1px 3px rgba(42,34,24,0.18)" }
                    : { border: "2px dashed var(--color-brand-outline)" }
                }
                aria-hidden
              >
                {!selected && <PaletteIcon />}
              </span>
              <span className="font-mono text-[12px] uppercase text-[var(--color-brand-muted)]">
                {selected ?? "Pick one"}
              </span>
            </div>

            {/* Palette + custom + used */}
            <div className="min-w-0 flex-1 space-y-5">
              <div>
                <Label>Preset palette</Label>
                <div className="mt-2 flex flex-wrap gap-2.5">
                  {PRESETS.map((p) => (
                    <Swatch
                      key={p.hex}
                      hex={p.hex}
                      label={p.name}
                      selected={selected === p.hex.toLowerCase()}
                      onClick={() => pick(p.hex)}
                    />
                  ))}
                </div>
              </div>

              <div>
                <Label>Custom colour</Label>
                <div className="mt-2 flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => colorInputRef.current?.click()}
                    title="Pick any colour"
                    aria-label="Pick a custom colour"
                    className="brand-focus relative h-9 w-9 shrink-0 overflow-hidden rounded-full ring-1 ring-[var(--color-brand-border)] transition-transform duration-150 hover:scale-110"
                    style={{
                      background: "conic-gradient(#C25A3A,#B8860B,#2E6B52,#1F5E5E,#1F2A44,#5B3A8C,#A8425A,#C25A3A)",
                    }}
                  >
                    <span className="absolute inset-[6px] rounded-full bg-white/85" />
                    <span className="absolute inset-0 flex items-center justify-center text-[13px] font-bold text-[var(--color-brand-ink)]">
                      +
                    </span>
                  </button>
                  <input
                    ref={colorInputRef}
                    type="color"
                    value={(selected && expandHex(selected)) || DEFAULT_HEX}
                    onChange={(e) => {
                      setSelected(e.target.value.toLowerCase());
                      setCustomHex(e.target.value);
                      setError(null);
                    }}
                    className="sr-only"
                    aria-hidden
                    tabIndex={-1}
                  />
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center font-mono text-[13px] text-[var(--color-brand-muted)]">
                      #
                    </span>
                    <input
                      type="text"
                      inputMode="text"
                      value={customHex.replace(/^#/, "")}
                      onChange={(e) => onCustomHexChange(e.target.value)}
                      placeholder="A8425A"
                      maxLength={6}
                      aria-label="Custom hex colour"
                      className="brand-focus h-9 w-[124px] rounded-lg border bg-white pl-5 pr-2.5 font-mono text-[13px] uppercase text-[var(--color-brand-ink)] outline-none"
                      style={{
                        borderColor:
                          customHex.length === 0
                            ? "var(--color-brand-border)"
                            : customValid
                              ? "var(--color-brand-success)"
                              : "var(--color-brand-danger)",
                      }}
                    />
                  </div>
                </div>
              </div>

              {usedColors.length > 0 && (
                <div>
                  <Label>Colours you&apos;ve used</Label>
                  <div className="mt-2 flex flex-wrap gap-2.5">
                    {usedColors.map((hex) => (
                      <Swatch
                        key={hex}
                        hex={hex}
                        label={hex}
                        selected={selected === hex.toLowerCase()}
                        onClick={() => pick(hex)}
                        size={30}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer — guards, hints, and the Generate action */}
        <div className="flex flex-col gap-3 border-t border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] px-5 py-4">
          {tooLight && (
            <Hint tone="danger">
              That colour is too light to scan reliably — pick a darker, more saturated shade.
            </Hint>
          )}
          {atCap && (
            <Hint tone="warning">
              You&apos;ve used every QR on your plan. Reassign or delete an existing QR to make room for a new colour.
            </Hint>
          )}
          {!hasLogo && (
            <Hint tone="info">
              <Link href="/dashboard/settings/logo" className="font-semibold underline">
                Add your studio logo
              </Link>{" "}
              to have it appear in the centre of new QR codes.
            </Hint>
          )}
          {error && <Hint tone="danger">{error}</Hint>}

          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={generate}
              disabled={!canGenerate}
              className="brand-focus inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--color-brand-navy)] px-5 text-[13.5px] font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {generating ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-[2px] border-white/60 border-t-white" />
                  Generating…
                </>
              ) : (
                <>
                  <PlusIcon />
                  Generate QR
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Swatch({
  hex,
  label,
  selected,
  onClick,
  size = 36,
}: {
  hex: string;
  label: string;
  selected: boolean;
  onClick: () => void;
  size?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={selected}
      className="brand-focus relative rounded-full transition-transform duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:scale-110"
      style={{
        width: size,
        height: size,
        background: hex,
        boxShadow: selected
          ? `0 0 0 2px var(--color-brand-surface-raised), 0 0 0 4px ${hex}`
          : "0 1px 3px rgba(42,34,24,0.18)",
      }}
    >
      {selected && (
        <span className="absolute inset-0 flex items-center justify-center">
          <CheckIcon />
        </span>
      )}
    </button>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-brand-muted)]">
      {children}
    </span>
  );
}

function Hint({ tone, children }: { tone: "info" | "warning" | "danger"; children: React.ReactNode }) {
  const styles =
    tone === "danger"
      ? { color: "var(--color-brand-danger)", background: "var(--color-brand-danger-soft)", border: "var(--color-brand-danger)" }
      : tone === "warning"
        ? { color: "var(--color-brand-warning)", background: "var(--color-brand-warning-soft)", border: "var(--color-brand-warning)" }
        : { color: "var(--color-brand-muted)", background: "var(--color-brand-surface-raised)", border: "var(--color-brand-border)" };
  return (
    <div
      className="rounded-lg px-3 py-2 text-[12.5px] leading-relaxed"
      style={{ color: styles.color, background: styles.background, border: `1px solid ${tone === "info" ? styles.border : `color-mix(in srgb, ${styles.border} 30%, transparent)`}` }}
    >
      {children}
    </div>
  );
}

function PlusIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" style={{ filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.35))" }}>
      <polyline points="5 12 10 17 19 7" />
    </svg>
  );
}

function PaletteIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--color-brand-outline)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a9 9 0 0 0 0 18c1.4 0 2-1 2-2 0-1.2-1-1.6-1-2.6 0-.8.7-1.4 1.6-1.4H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8z" />
      <circle cx="7.5" cy="10.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="16.5" cy="10.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
