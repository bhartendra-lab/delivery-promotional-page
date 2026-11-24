"use client";

import { useEffect, useRef, useState } from "react";
import { STYLE_VARIANTS, type StyleVariant } from "@/lib/types";
import { occasionFor, collectionsFor, messageLabelFor, type Occasion } from "@/lib/event-occasion";
import { resolveTheme } from "@/lib/client-theme";
import { galleryUrlFor } from "@/lib/gallery-url";
import { VYAVASTH_BASE_URL } from "@/lib/site-url";
import { useCompany } from "@/lib/useCompany";
import { GalleryPreviewFrame } from "./GalleryPreviewFrame";
import {
  IconCheck,
  IconInfo,
  IconMobile,
  IconMonitor,
  IconCaretDown,
} from "./icons";

const OCCASION_TIP_LABEL: Record<Occasion, string> = {
  wedding: "wedding",
  celebration: "celebration",
  corporate: "corporate",
  neutral: "general",
};

const MAX = 500;

export function GalleryDesignTab({
  bookingId,
  uniqueIdentifier,
  eventType,
  initialStyleVariant,
  initialCustomMessage,
  initialIncludeBranding,
  onSave,
}: {
  bookingId: string;
  /** The event's public slug: the real gallery link, and what the preview opens. */
  uniqueIdentifier?: string;
  eventType: string;
  initialStyleVariant?: string;
  initialCustomMessage?: string;
  initialIncludeBranding?: boolean;
  /** No `include_company_branding` any more: "Show your studio profile" moved
   *  to the Gallery preferences modal on Access & Sharing, and saving here
   *  must not write back a stale copy of it. No `guest_types` either, for the
   *  same reason: the Guest teams card lives on Access & Sharing now. */
  onSave: (vals: {
    style_variant: StyleVariant;
    custom_message: string;
  }) => Promise<void>;
}) {
  const startVariant: StyleVariant =
    (STYLE_VARIANTS.includes(initialStyleVariant as StyleVariant)
      ? (initialStyleVariant as StyleVariant)
      : "Ivory & Rose") as StyleVariant;

  // Occasion never changes within one tab instance (the event type isn't
  // editable here), so the collection list is effectively static per mount.
  const occasion = occasionFor(eventType);
  const collections = collectionsFor(occasion);

  const [variant, setVariant] = useState<StyleVariant>(startVariant);
  // Derived once from the saved variant on mount. If it isn't found in any
  // collection (shouldn't happen), fall back to the first collection but
  // leave `variant` untouched — never silently change a live gallery's saved
  // variant just because the picker couldn't place it.
  const [collectionId, setCollectionId] = useState<string>(
    () => (collections.find((c) => c.variants.includes(startVariant)) ?? collections[0]).id,
  );
  const [showAllThemes, setShowAllThemes] = useState(false);
  const [message, setMessage] = useState(initialCustomMessage ?? "");
  // READ-ONLY here now. "Show your studio profile" is edited in the Gallery
  // preferences modal on Access & Sharing; the preview follows the SAVED value
  // (ctx.meta.includeBranding), so it still shows exactly what Guests get.
  const branding = initialIncludeBranding ?? true;
  const [scope, setScope] = useState<"landing" | "gallery">("landing");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [saving, setSaving] = useState(false);
  const [savedTick, setSavedTick] = useState(false);

  // Single source of truth — the exact same theme the guest gallery resolves,
  // so this preview can never drift from what guests actually see (it used to
  // keep its own duplicate palette dict, hand-copied from client-theme.ts).
  const theme = resolveTheme(variant);
  // The real link a guest opens, on the studio's own domain once it has a live one.
  const company = useCompany();
  const galleryUrl = galleryUrlFor(company, uniqueIdentifier, VYAVASTH_BASE_URL) ?? "";
  const copyLabel = messageLabelFor(eventType);
  const activeCollection = collections.find((c) => c.id === collectionId) ?? collections[0];

  const dirty = variant !== startVariant || message !== (initialCustomMessage ?? "");

  async function save() {
    setSaving(true);
    try {
      await onSave({
        style_variant: variant,
        custom_message: message,
      });
      setSavedTick(true);
      setTimeout(() => setSavedTick(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    // Side by side from lg, each half scrolling on its own. Below that the two
    // stack and the tab scrolls as ONE column — two scrollers sharing a phone's
    // height left each a sliver, and clipped the preview.
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
      {/* LEFT — controls */}
      <div className="border-b border-[var(--color-brand-border)] px-4 py-5 sm:px-6 sm:py-6 lg:w-[45%] lg:shrink-0 lg:overflow-auto lg:border-b-0 lg:border-r">
        <SectionCard
          overline="Theme"
          tip={`A theme sets the colour palette of the guest-facing gallery. Collections are grouped for ${OCCASION_TIP_LABEL[occasion]} events — pick one, then a variant to preview it live.`}
        >
          {!showAllThemes && (
            <>
              <FieldLabel>Collection</FieldLabel>
              <Segmented
                value={collectionId}
                options={collections.map((c) => ({ id: c.id, label: c.label }))}
                onChange={(id) => {
                  setCollectionId(id);
                  const next = collections.find((c) => c.id === id);
                  if (next) setVariant(next.variants[0]);
                }}
              />
              <div className="h-4" />
            </>
          )}
          <FieldLabel>Style variant</FieldLabel>
          <Select
            value={variant}
            options={showAllThemes ? STYLE_VARIANTS : activeCollection.variants}
            onChange={(v) => setVariant(v as StyleVariant)}
          />
          <button
            type="button"
            onClick={() => {
              setShowAllThemes((prev) => {
                const next = !prev;
                // Turning the escape hatch off snaps back to whichever
                // collection contains the current variant — the variant
                // itself is never touched by the toggle.
                if (!next) {
                  const match = collections.find((c) => c.variants.includes(variant)) ?? collections[0];
                  setCollectionId(match.id);
                }
                return next;
              });
            }}
            className="brand-focus mt-3 text-[12px] font-semibold text-[var(--color-brand-navy)] hover:underline"
          >
            {showAllThemes ? "Show current collection only" : "Show all themes"}
          </button>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-[11.5px] text-[var(--color-brand-muted)]">Palette</span>
            {[...theme.cover, theme.brand].map((c, i) => (
              <span
                key={i}
                className="h-5 w-5 rounded-[5px] border border-[rgba(42,34,24,0.1)]"
                style={{ background: c }}
              />
            ))}
          </div>
        </SectionCard>

        <SectionCard overline="Dynamic Guest Text">
          <FieldLabel tip="Leave blank to hide this block on the live page. The label adapts to the event type.">
            {copyLabel}
          </FieldLabel>
          <textarea
            value={message}
            maxLength={MAX}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Add a short greeting your guests will see on the landing page…"
            className="brand-focus block min-h-[96px] w-full resize-y rounded-lg border border-[var(--color-brand-border)] bg-white px-3 py-2.5 text-[13.5px] leading-relaxed text-[var(--color-brand-ink)] outline-none"
          />
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            {/* What the textarea can't show on its own: that Enter survives the
                save, and that the cover is a three-line window onto a message
                that can be much longer. */}
            <span className="text-[11.5px] text-[var(--color-brand-muted)]">
              Line breaks are kept. Guests see the first 3 lines, then Read more.
            </span>
            <span
              className="ml-auto text-[11.5px] tabular-nums"
              style={{ color: message.length > MAX - 40 ? "var(--color-brand-warning)" : "var(--color-brand-muted)" }}
            >
              {message.length} / {MAX}
            </span>
          </div>
        </SectionCard>


        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
          <button
            type="button"
            onClick={save}
            disabled={!dirty || saving}
            className="brand-focus inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--color-brand-navy)] px-4 text-[13.5px] font-semibold text-white hover:bg-[var(--color-brand-navy-deep)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-[2px] border-white/60 border-t-white" />
                Saving…
              </>
            ) : savedTick ? (
              <>
                <IconCheck size={14} /> Saved
              </>
            ) : (
              "Save changes"
            )}
          </button>
          <span className="text-[12px] text-[var(--color-brand-muted)]">
            Design changes never require re-publishing — only new media does.
          </span>
        </div>
      </div>

      {/* RIGHT — preview */}
      <div className="flex min-w-0 flex-1 flex-col bg-[#F2F0EB]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-brand-border)] bg-white px-4 py-3 sm:gap-3 sm:px-5">
          <Segmented
            value={scope}
            options={[
              { id: "landing", label: "Landing page" },
              { id: "gallery", label: "Photo gallery" },
            ]}
            onChange={(s) => setScope(s as "landing" | "gallery")}
          />
          <Segmented
            size="sm"
            value={device}
            options={[
              { id: "desktop", label: "Desktop", Icon: IconMonitor },
              { id: "mobile", label: "Mobile", Icon: IconMobile },
            ]}
            onChange={(d) => setDevice(d as "desktop" | "mobile")}
          />
        </div>

        <GalleryPreviewFrame
          bookingId={bookingId}
          uniqueIdentifier={uniqueIdentifier}
          galleryUrl={galleryUrl}
          scope={scope}
          device={device}
          draft={{ style_variant: variant, custom_message: message, include_company_branding: branding }}
        />
      </div>
    </div>
  );
}

/* ── small controls ─────────────────────────────────────────────────────── */

function SectionCard({
  overline,
  tip,
  children,
  last,
}: {
  overline: string;
  tip?: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <section
      className={`rounded-xl border border-[var(--color-brand-border)] bg-white px-4 pb-5 pt-4 sm:px-5 ${last ? "mb-4" : "mb-4"}`}
    >
      <div className="relative mb-3.5 flex items-center gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-brand-muted)]">{overline}</span>
        {tip && <InfoTip text={tip} />}
      </div>
      {children}
    </section>
  );
}

function FieldLabel({ children, tip }: { children: React.ReactNode; tip?: string }) {
  return (
    <label className="type-label relative mb-1.5 flex items-center gap-1.5">
      {children}
      {tip && <InfoTip text={tip} />}
    </label>
  );
}

/**
 * Hover opens it with a mouse; touch has no hover, so a tap toggles it and a tap
 * anywhere else closes it. Below sm the bubble drops under the row it sits in
 * and spans it (the nearest `relative` ancestor — the card header or field
 * label): centred on the icon, it ran off the edge of a phone screen.
 */
function InfoTip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  // Set on pointerdown so the click that follows knows whether hover already
  // handled it. Keyboard activation has no pointerdown, so it toggles too.
  const viaMouse = useRef(false);

  useEffect(() => {
    if (!show) return;
    const closeOutside = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setShow(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [show]);

  return (
    <span ref={wrapRef} className="inline-flex align-middle sm:relative">
      <button
        type="button"
        aria-label="More info"
        aria-expanded={show}
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") setShow(true);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") setShow(false);
        }}
        onPointerDown={(e) => {
          viaMouse.current = e.pointerType === "mouse";
        }}
        onClick={() => {
          if (!viaMouse.current) setShow((s) => !s);
          viaMouse.current = false;
        }}
        onBlur={() => setShow(false)}
        className="brand-focus inline-flex cursor-help rounded-full"
      >
        <IconInfo size={14} className="text-[#B5ADA4]" />
      </button>
      {show && (
        <span
          role="tooltip"
          className="absolute left-0 right-0 top-[calc(100%+8px)] z-40 rounded-lg bg-[var(--color-brand-ink)] px-3 py-2.5 text-left text-[12px] font-medium normal-case leading-relaxed tracking-normal text-white shadow-[0_8px_24px_rgba(42,34,24,0.22)] sm:bottom-[calc(100%+8px)] sm:left-1/2 sm:right-auto sm:top-auto sm:w-[224px] sm:-translate-x-1/2"
        >
          {text}
        </span>
      )}
    </span>
  );
}

function Select({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="brand-focus flex w-full items-center justify-between gap-2 rounded-lg border border-[var(--color-brand-border)] bg-white px-3 py-2.5 text-left text-[13.5px] font-medium text-[var(--color-brand-ink)]"
      >
        <span>{value}</span>
        <IconChevron open={open} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 overflow-hidden rounded-lg border border-[var(--color-brand-border)] bg-white shadow-[0_8px_24px_rgba(42,34,24,0.12)]">
          {options.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => {
                onChange(o);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between px-3 py-2.5 text-left text-[13.5px]"
              style={{
                background: o === value ? "var(--color-brand-bg)" : "transparent",
                fontWeight: o === value ? 600 : 500,
                color: o === value ? "var(--color-brand-navy)" : "var(--color-brand-ink)",
              }}
            >
              {o}
              {o === value && <IconCheck size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type SegOption = { id: string; label: string; Icon?: (p: { size?: number; style?: React.CSSProperties }) => React.ReactElement };
function Segmented({
  value,
  options,
  onChange,
  size = "md",
}: {
  value: string;
  options: SegOption[];
  onChange: (id: string) => void;
  size?: "sm" | "md";
}) {
  return (
    <div className="inline-flex gap-0.5 rounded-[9px] border border-[var(--color-brand-border)] bg-[#F2F0EB] p-[3px]">
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className="inline-flex items-center gap-1.5 rounded-md"
            style={{
              padding: size === "sm" ? "5px 10px" : "7px 13px",
              fontSize: size === "sm" ? 12 : 13,
              fontWeight: active ? 600 : 500,
              color: active ? "var(--color-brand-ink)" : "var(--color-brand-muted)",
              background: active ? "#FFFFFF" : "transparent",
              border: active ? "1px solid var(--color-brand-border)" : "1px solid transparent",
              boxShadow: active ? "0 1px 2px rgba(42,34,24,0.06)" : "none",
            }}
          >
            {o.Icon && <o.Icon size={14} style={{ color: active ? "var(--color-brand-navy)" : "var(--color-brand-muted)" }} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Accordion caret — rotates 180° open, reusing the shared IconCaretDown glyph. */
function IconChevron({ open }: { open: boolean }) {
  return (
    <IconCaretDown
      size={15}
      className="shrink-0 text-[var(--color-brand-muted)] transition-transform"
      style={{ transform: open ? "rotate(180deg)" : "none" }}
    />
  );
}
