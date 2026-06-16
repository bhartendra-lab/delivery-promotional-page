"use client";

import { useMemo, useState } from "react";
import { STYLE_VARIANTS, type StyleVariant } from "@/lib/types";
import { IconArrowRight, IconCheck, IconInfo, IconLink, IconMobile, IconMonitor } from "./icons";

/** Season grouping over the backend `style_variant` enum. */
const SEASONS = ["Spring", "Summer", "Autumn", "Winter"] as const;
type Season = (typeof SEASONS)[number];

const SEASON_VARIANTS: Record<Season, StyleVariant[]> = {
  Spring: ["Ivory & Rose", "Blush Minimal"],
  Summer: ["Marigold Bright", "Festive Bloom"],
  Autumn: ["Maroon Velvet", "Fine-Art Warm"],
  Winter: ["Emerald Royal", "Charcoal Editorial"],
};

const VARIANT_THEME: Record<StyleVariant, { bg: string; accent: string; text: string; cover: [string, string] }> = {
  "Ivory & Rose": { bg: "#FBF7F4", accent: "#C07A7A", text: "#3A322E", cover: ["#E8D5CE", "#D6B6AC"] },
  "Blush Minimal": { bg: "#FAF8F6", accent: "#B07F77", text: "#2E2926", cover: ["#EADFD8", "#D6C3B8"] },
  "Marigold Bright": { bg: "#FFFBF3", accent: "#DC842A", text: "#3A2E1E", cover: ["#F1CE8C", "#E3A658"] },
  "Festive Bloom": { bg: "#FFF6F0", accent: "#CF6230", text: "#3A271E", cover: ["#EEB28C", "#DC885A"] },
  "Maroon Velvet": { bg: "#F8F2F1", accent: "#8C2F3A", text: "#2E1F22", cover: ["#B97E86", "#97525E"] },
  "Fine-Art Warm": { bg: "#F7F3EE", accent: "#947751", text: "#332B22", cover: ["#CDBBA0", "#B29A7A"] },
  "Emerald Royal": { bg: "#F1F6F3", accent: "#2E6B52", text: "#1F2A24", cover: ["#9CC0AD", "#6C9A82"] },
  "Charcoal Editorial": { bg: "#F4F4F3", accent: "#3C3C3A", text: "#22221F", cover: ["#B8B8B3", "#8C8C86"] },
};

function seasonOf(variant: StyleVariant): Season {
  return (SEASONS.find((s) => SEASON_VARIANTS[s].includes(variant)) ?? "Spring") as Season;
}

const COPY_LABEL: Record<string, string> = {
  Wedding: "Message from the Couple",
  Engagement: "Message from the Couple",
  "Pre-wedding": "Message from the Couple",
  Anniversary: "Message from the Hosts",
  Birthday: "Message from the Hosts",
  Corporate: "Event Briefing",
};

const MAX = 500;

export function GalleryDesignTab({
  eventName,
  eventType,
  eventDateLabel,
  coverUrl,
  initialStyleVariant,
  initialCustomMessage,
  initialIncludeBranding,
  onSave,
}: {
  eventName: string;
  eventType: string;
  eventDateLabel: string | null;
  coverUrl?: string;
  initialStyleVariant?: string;
  initialCustomMessage?: string;
  initialIncludeBranding?: boolean;
  onSave: (vals: {
    style_variant: StyleVariant;
    custom_message: string;
    include_company_branding: boolean;
  }) => Promise<void>;
}) {
  const startVariant: StyleVariant =
    (STYLE_VARIANTS.includes(initialStyleVariant as StyleVariant)
      ? (initialStyleVariant as StyleVariant)
      : "Ivory & Rose") as StyleVariant;

  const [variant, setVariant] = useState<StyleVariant>(startVariant);
  const [season, setSeason] = useState<Season>(seasonOf(startVariant));
  const [message, setMessage] = useState(initialCustomMessage ?? "");
  const [branding, setBranding] = useState(initialIncludeBranding ?? true);
  const [scope, setScope] = useState<"landing" | "gallery">("landing");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [saving, setSaving] = useState(false);
  const [savedTick, setSavedTick] = useState(false);

  const theme = VARIANT_THEME[variant];
  const copyLabel = COPY_LABEL[eventType] ?? "Message to Guests";

  const dirty = useMemo(
    () =>
      variant !== startVariant ||
      message !== (initialCustomMessage ?? "") ||
      branding !== (initialIncludeBranding ?? true),
    [variant, message, branding, startVariant, initialCustomMessage, initialIncludeBranding],
  );

  async function save() {
    setSaving(true);
    try {
      await onSave({ style_variant: variant, custom_message: message, include_company_branding: branding });
      setSavedTick(true);
      setTimeout(() => setSavedTick(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      {/* LEFT — controls */}
      <div className="overflow-auto border-b border-[var(--color-brand-border)] px-6 py-6 lg:w-[45%] lg:shrink-0 lg:border-b-0 lg:border-r">
        <SectionCard
          overline="Season — Theme Skin"
          tip="A skin sets the colour palette of the guest-facing gallery. Pick a season, then a variant to preview it live."
        >
          <FieldLabel>Season</FieldLabel>
          <Segmented
            value={season}
            options={SEASONS.map((s) => ({ id: s, label: s }))}
            onChange={(s) => {
              const next = s as Season;
              setSeason(next);
              setVariant(SEASON_VARIANTS[next][0]);
            }}
          />
          <div className="h-4" />
          <FieldLabel>Style variant</FieldLabel>
          <Select
            value={variant}
            options={SEASON_VARIANTS[season]}
            onChange={(v) => setVariant(v as StyleVariant)}
          />
          <div className="mt-3 flex items-center gap-2">
            <span className="text-[11.5px] text-[var(--color-brand-muted)]">Palette</span>
            {[...theme.cover, theme.accent].map((c, i) => (
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
          <div className="mt-1.5 flex justify-end">
            <span
              className="text-[11.5px] tabular-nums"
              style={{ color: message.length > MAX - 40 ? "var(--color-brand-warning)" : "var(--color-brand-muted)" }}
            >
              {message.length} / {MAX}
            </span>
          </div>
        </SectionCard>

        <SectionCard overline="Global Profile Injections" last>
          <label className="flex cursor-pointer items-start gap-2.5">
            <span
              className="mt-px inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border"
              style={{
                borderColor: branding ? "var(--color-brand-navy)" : "var(--color-brand-outline)",
                background: branding ? "var(--color-brand-navy)" : "#FFFFFF",
                color: "#FFFFFF",
              }}
            >
              {branding && <IconCheck size={12} />}
            </span>
            <input
              type="checkbox"
              checked={branding}
              onChange={(e) => setBranding(e.target.checked)}
              className="sr-only"
            />
            <span className="text-[13.5px] font-semibold text-[var(--color-brand-ink)]">
              Inject Studio Socials &amp; Review Links
              <span className="mt-0.5 block text-[12px] font-normal text-[var(--color-brand-muted)]">
                Shows your Instagram, Facebook and a Google review prompt at the foot of the gallery.
              </span>
            </span>
          </label>
        </SectionCard>

        <div className="mt-1 flex items-center gap-3">
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
        <div className="flex items-center justify-between gap-3 border-b border-[var(--color-brand-border)] bg-white px-5 py-3">
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

        <div className="flex flex-1 justify-center overflow-hidden p-6">
          {device === "desktop" ? (
            <div className="flex w-full max-w-[760px] flex-col overflow-hidden rounded-xl border border-[var(--color-brand-outline)] bg-white shadow-[0_14px_36px_rgba(42,34,24,0.12)]">
              <div className="flex items-center gap-2.5 border-b border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] px-3.5 py-2.5">
                <span className="flex gap-1.5">
                  {["#E0796A", "#E6B84F", "#74B36A"].map((c) => (
                    <span key={c} className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />
                  ))}
                </span>
                <div className="flex flex-1 items-center gap-1.5 rounded-md border border-[var(--color-brand-border)] bg-white px-3 py-1 font-mono text-[11px] text-[var(--color-brand-muted)]">
                  <IconLink size={11} className="text-[var(--color-brand-success)]" />
                  vyavasth.in/k/{slug(eventName)}
                </div>
              </div>
              <div className="h-[480px] overflow-hidden">
                <ClientPagePreview
                  theme={theme}
                  eventName={eventName}
                  eventType={eventType}
                  eventDateLabel={eventDateLabel}
                  coverUrl={coverUrl}
                  message={message}
                  branding={branding}
                  scope={scope}
                />
              </div>
            </div>
          ) : (
            <div className="shrink-0 rounded-[34px] bg-[var(--color-brand-ink)] p-2.5 shadow-[0_14px_36px_rgba(42,34,24,0.18)]" style={{ width: 300 }}>
              <div className="relative overflow-hidden rounded-[26px] bg-white">
                <div className="absolute left-1/2 top-2 z-10 h-5 w-[90px] -translate-x-1/2 rounded-full bg-[var(--color-brand-ink)]" />
                <div className="h-[540px] overflow-hidden">
                  <ClientPagePreview
                    theme={theme}
                    eventName={eventName}
                    eventType={eventType}
                    eventDateLabel={eventDateLabel}
                    coverUrl={coverUrl}
                    message={message}
                    branding={branding}
                    scope={scope}
                    compact
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── simulated guest-facing page ───────────────────────────────────────── */

function ClientPagePreview({
  theme,
  eventName,
  eventType,
  eventDateLabel,
  coverUrl,
  message,
  branding,
  scope,
  compact = false,
}: {
  theme: { bg: string; accent: string; text: string; cover: [string, string] };
  eventName: string;
  eventType: string;
  eventDateLabel: string | null;
  coverUrl?: string;
  message: string;
  branding: boolean;
  scope: "landing" | "gallery";
  compact?: boolean;
}) {
  const coverBg = coverUrl
    ? { backgroundImage: `url(${coverUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
    : { backgroundImage: `repeating-linear-gradient(40deg, ${theme.cover[0]} 0 22px, ${theme.cover[1]} 22px 44px)` };

  if (scope === "gallery") {
    const cols = compact ? 2 : 4;
    const tiles = compact ? 8 : 12;
    return (
      <div style={{ background: theme.bg, minHeight: "100%", fontFamily: "var(--font-plus-jakarta), sans-serif" }}>
        <div
          className="flex items-center justify-between"
          style={{ padding: compact ? "14px 18px" : "18px 40px", borderBottom: `1px solid ${theme.accent}22` }}
        >
          <span style={{ fontSize: compact ? 14 : 17, fontWeight: 700, color: theme.text }}>{eventName}</span>
          <span style={{ fontSize: compact ? 10 : 12, fontWeight: 600, color: theme.accent }}>Photos</span>
        </div>
        <div className="flex flex-wrap gap-2" style={{ padding: compact ? "12px 18px 0" : "16px 40px 0" }}>
          {["All", "Ceremony", "Reception", "Portraits"].map((c, i) => (
            <span
              key={c}
              style={{
                fontSize: compact ? 10 : 12,
                fontWeight: 600,
                color: i === 0 ? "#FFFFFF" : theme.text,
                background: i === 0 ? theme.accent : "transparent",
                border: `1px solid ${i === 0 ? theme.accent : theme.accent + "44"}`,
                borderRadius: 999,
                padding: compact ? "4px 10px" : "5px 13px",
              }}
            >
              {c}
            </span>
          ))}
        </div>
        <div
          className="grid"
          style={{
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gap: compact ? 6 : 10,
            padding: compact ? "12px 18px 18px" : "16px 40px 40px",
          }}
        >
          {Array.from({ length: tiles }).map((_, i) => (
            <div
              key={i}
              style={{
                aspectRatio: "1 / 1",
                borderRadius: 4,
                backgroundImage: `repeating-linear-gradient(${(i * 27) % 180}deg, ${theme.cover[0]} 0 9px, ${theme.cover[1]} 9px 18px)`,
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: theme.bg, minHeight: "100%", fontFamily: "var(--font-plus-jakarta), sans-serif" }}>
      <div
        className="relative flex flex-col items-center justify-center"
        style={{ height: compact ? 220 : 300, ...coverBg }}
      >
        <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.04), rgba(0,0,0,0.34))" }} />
        <div className="relative text-center text-white">
          <div style={{ fontSize: compact ? 9 : 11, fontWeight: 600, letterSpacing: "0.22em", textTransform: "uppercase", opacity: 0.92, marginBottom: 10 }}>
            {eventType === "Corporate" ? "Event Gallery" : `The ${eventType} of`}
          </div>
          <div style={{ fontSize: compact ? 22 : 34, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.1 }}>{eventName}</div>
          {eventDateLabel && (
            <div style={{ fontSize: compact ? 10 : 12.5, fontWeight: 500, marginTop: 10, opacity: 0.92 }}>{eventDateLabel}</div>
          )}
        </div>
      </div>

      <div style={{ padding: compact ? "22px 18px" : "40px 40px", textAlign: "center" }}>
        {message.trim() && (
          <p style={{ margin: "0 auto", maxWidth: compact ? 260 : 460, fontSize: compact ? 13 : 16, lineHeight: 1.7, color: theme.text }}>
            {message}
          </p>
        )}
        <button
          className="inline-flex items-center gap-2"
          style={{
            marginTop: message.trim() ? (compact ? 20 : 28) : 0,
            background: theme.accent,
            color: "#FFFFFF",
            border: "none",
            borderRadius: 999,
            padding: compact ? "10px 20px" : "13px 28px",
            fontSize: compact ? 12 : 14,
            fontWeight: 600,
            letterSpacing: "0.02em",
          }}
        >
          View all photos
          <IconArrowRight size={compact ? 14 : 16} />
        </button>

        {branding && (
          <div
            className="flex flex-col items-center gap-3"
            style={{ marginTop: compact ? 22 : 36, paddingTop: compact ? 18 : 28, borderTop: `1px solid ${theme.accent}22` }}
          >
            <div className="flex gap-2">
              {["IG", "FB", "YT"].map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center justify-center rounded-full"
                  style={{
                    width: compact ? 30 : 36,
                    height: compact ? 30 : 36,
                    border: `1px solid ${theme.accent}55`,
                    color: theme.accent,
                    fontSize: compact ? 10 : 11,
                    fontWeight: 700,
                  }}
                >
                  {s}
                </span>
              ))}
            </div>
            <span style={{ fontSize: compact ? 11 : 12.5, fontWeight: 600, color: theme.accent }}>★ Leave us a Google review</span>
          </div>
        )}
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
      className={`rounded-xl border border-[var(--color-brand-border)] bg-white px-5 pb-5 pt-4 ${last ? "mb-4" : "mb-4"}`}
    >
      <div className="mb-3.5 flex items-center gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-brand-muted)]">{overline}</span>
        {tip && <InfoTip text={tip} />}
      </div>
      {children}
    </section>
  );
}

function FieldLabel({ children, tip }: { children: React.ReactNode; tip?: string }) {
  return (
    <label className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-[var(--color-brand-ink)]">
      {children}
      {tip && <InfoTip text={tip} />}
    </label>
  );
}

function InfoTip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span
      className="relative inline-flex align-middle"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <IconInfo size={14} className="cursor-help text-[#B5ADA4]" />
      {show && (
        <span className="absolute bottom-[calc(100%+8px)] left-1/2 z-40 w-[224px] -translate-x-1/2 rounded-lg bg-[var(--color-brand-ink)] px-3 py-2.5 text-left text-[12px] font-medium leading-relaxed text-white shadow-[0_8px_24px_rgba(42,34,24,0.22)]">
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

function IconChevron({ open }: { open: boolean }) {
  return (
    <svg
      width={15}
      height={15}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-[var(--color-brand-muted)] transition-transform"
      style={{ transform: open ? "rotate(180deg)" : "none" }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 22) || "event"
  );
}
