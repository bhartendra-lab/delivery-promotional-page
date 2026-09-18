"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { STYLE_VARIANTS, type StyleVariant, type CustomFolder } from "@/lib/types";
import { occasionFor, collectionsFor, messageLabelFor, type Occasion } from "@/lib/event-occasion";
import { toCompactMessage } from "@/lib/guest-message";
import { useIsTruncated } from "@/components/event/screens/lounge/useIsTruncated";
import { resolveTheme, type ClientTheme } from "@/lib/client-theme";
import { resolveGoogleReviewUrl } from "@/lib/google-review";
import { useCompany } from "@/lib/useCompany";
import { ALL, UnlockAwareSwitcher, FolderPillsRow, ActionsCluster } from "@/components/event/screens/gallery/GalleryControls";
import {
  IconArrowRight,
  IconCheck,
  IconDownload,
  IconHeart,
  IconInfo,
  IconLink,
  IconMobile,
  IconMonitor,
  IconX,
  IconCaretDown,
  IconPlus,
} from "./icons";

const OCCASION_TIP_LABEL: Record<Occasion, string> = {
  wedding: "wedding",
  celebration: "celebration",
  corporate: "corporate",
  neutral: "general",
};

const MAX = 500;

/** Narrowest the desktop mockup is laid out at. A narrower preview column shows
 *  it scaled down whole — reflowed into a phone's width it stops looking like
 *  anything a desktop guest would see. */
const DESKTOP_PREVIEW_MIN_WIDTH = 640;
/** The phone mockup's frame width, fixed like the device it stands for. */
const PHONE_FRAME_WIDTH = 300;

export function GalleryDesignTab({
  eventName,
  eventType,
  eventDateLabel,
  coverUrl,
  coverPosition,
  initialStyleVariant,
  initialCustomMessage,
  initialIncludeBranding,
  initialGuestTypes,
  allowDownload,
  showGoogleReview,
  faceSearchEnabled,
  onSave,
}: {
  eventName: string;
  eventType: string;
  eventDateLabel: string | null;
  coverUrl?: string;
  coverPosition?: string;
  initialStyleVariant?: string;
  initialCustomMessage?: string;
  initialIncludeBranding?: boolean;
  initialGuestTypes?: string[];
  /**
   * The event's `allow_download` delivery preference. Read-only here — it's
   * edited from the Media tab's gear — but the preview MUST honour it: a mockup
   * showing a Download button the real gallery doesn't have is a lie the studio
   * would act on.
   */
  allowDownload: boolean;
  /**
   * The event's `show_google_review` preference, also edited from the Media
   * tab's gear. Combined with the company switch and listing through the same
   * resolver the guest gallery uses, so the preview never shows a review ask
   * the real gallery won't make.
   */
  showGoogleReview: boolean;
  /**
   * The event's `face_search_enabled` preference — edited on Access & Sharing,
   * read-only here. The gallery preview must honour it for the same reason it
   * honours `allowDownload`: a mockup showing a My Photos tab this gallery does
   * not have is a lie the studio would design around.
   */
  faceSearchEnabled: boolean;
  onSave: (vals: {
    style_variant: StyleVariant;
    custom_message: string;
    include_company_branding: boolean;
    guest_types: string[];
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
  const [branding, setBranding] = useState(initialIncludeBranding ?? true);
  const [guestTypes, setGuestTypes] = useState<string[]>(initialGuestTypes ?? []);
  const [scope, setScope] = useState<"landing" | "gallery">("landing");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [saving, setSaving] = useState(false);
  const [savedTick, setSavedTick] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const previewWidth = useContentWidth(previewRef);

  // Single source of truth — the exact same theme the guest gallery resolves,
  // so this preview can never drift from what guests actually see (it used to
  // keep its own duplicate palette dict, hand-copied from client-theme.ts).
  const theme = resolveTheme(variant);
  const company = useCompany();
  const showReviewPrompt = !!resolveGoogleReviewUrl({
    placeId: company?.google_place_id,
    gmbLink: company?.gmb_link,
    enabledGlobally: company?.google_review_enabled,
    enabledForEvent: showGoogleReview,
  });
  const copyLabel = messageLabelFor(eventType);
  const activeCollection = collections.find((c) => c.id === collectionId) ?? collections[0];

  // Trimmed, non-empty teams — what we actually save and compare for dirty.
  const cleanGuestTypes = useMemo(() => guestTypes.map((t) => t.trim()).filter(Boolean), [guestTypes]);
  const initialClean = useMemo(
    () => (initialGuestTypes ?? []).map((t) => t.trim()).filter(Boolean),
    [initialGuestTypes],
  );

  const dirty = useMemo(
    () =>
      variant !== startVariant ||
      message !== (initialCustomMessage ?? "") ||
      branding !== (initialIncludeBranding ?? true) ||
      JSON.stringify(cleanGuestTypes) !== JSON.stringify(initialClean),
    [variant, message, branding, cleanGuestTypes, initialClean, startVariant, initialCustomMessage, initialIncludeBranding],
  );

  async function save() {
    setSaving(true);
    try {
      await onSave({
        style_variant: variant,
        custom_message: message,
        include_company_branding: branding,
        guest_types: cleanGuestTypes,
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

        <SectionCard
          overline="Guest Teams / Sub-types"
          tip="Shown on the guest “Which team are you in?” screen after sign-in (e.g. Bride Team / Groom Team). Leave empty to skip that step entirely."
        >
          {guestTypes.length > 0 && (
            <div className="mb-2 flex flex-col gap-2">
              {guestTypes.map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={t}
                    onChange={(e) =>
                      setGuestTypes((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))
                    }
                    placeholder="e.g. Bride Team"
                    aria-label={`Team ${i + 1}`}
                    className="brand-focus block min-w-0 flex-1 rounded-lg border border-[var(--color-brand-border)] bg-white px-3 py-2 text-[13.5px] text-[var(--color-brand-ink)] outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setGuestTypes((prev) => prev.filter((_, j) => j !== i))}
                    aria-label="Remove team"
                    className="brand-focus inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--color-brand-border)] text-[var(--color-brand-muted)] hover:border-[var(--color-brand-outline)] hover:text-[var(--color-brand-ink)]"
                  >
                    <IconX size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => setGuestTypes((prev) => [...prev, ""])}
            className="brand-focus inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[var(--color-brand-outline)] px-3 py-2 text-[12.5px] font-semibold text-[var(--color-brand-navy)] hover:bg-[var(--color-brand-navy-soft)]"
          >
            <IconPlus size={14} /> Add team
          </button>
          {guestTypes.length === 0 && (
            <p className="mt-2 text-[12px] text-[var(--color-brand-muted)]">
              No teams. Guests skip the team question and go straight to their photos.
            </p>
          )}
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
                {showReviewPrompt
                  ? "Shows your Instagram, Facebook and a Google review prompt at the foot of the gallery."
                  : "Shows your social links at the foot of the gallery. Google review prompts are off for this gallery."}
              </span>
            </span>
          </label>
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

        <div ref={previewRef} className="flex flex-1 justify-center p-4 sm:p-6 lg:overflow-hidden">
          {device === "desktop" ? (
            <FitWidth available={previewWidth} naturalWidth={DESKTOP_PREVIEW_MIN_WIDTH}>
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
                    coverPosition={coverPosition}
                    message={message}
                    branding={branding}
                    scope={scope}
                    allowDownload={allowDownload}
                    faceSearchEnabled={faceSearchEnabled}
                    showReviewPrompt={showReviewPrompt}
                  />
                </div>
              </div>
            </FitWidth>
          ) : (
            <FitWidth available={previewWidth} naturalWidth={PHONE_FRAME_WIDTH}>
              <div className="shrink-0 rounded-[34px] bg-[var(--color-brand-ink)] p-2.5 shadow-[0_14px_36px_rgba(42,34,24,0.18)]" style={{ width: PHONE_FRAME_WIDTH }}>
                <div className="relative overflow-hidden rounded-[26px] bg-white">
                  <div className="absolute left-1/2 top-2 z-10 h-5 w-[90px] -translate-x-1/2 rounded-full bg-[var(--color-brand-ink)]" />
                  <div className="h-[540px] overflow-hidden">
                    <ClientPagePreview
                      theme={theme}
                      eventName={eventName}
                      eventType={eventType}
                      eventDateLabel={eventDateLabel}
                      coverUrl={coverUrl}
                      coverPosition={coverPosition}
                      message={message}
                      branding={branding}
                      scope={scope}
                      allowDownload={allowDownload}
                      faceSearchEnabled={faceSearchEnabled}
                      showReviewPrompt={showReviewPrompt}
                      compact
                    />
                  </div>
                </div>
              </div>
            </FitWidth>
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
  coverPosition,
  message,
  branding,
  scope,
  allowDownload,
  faceSearchEnabled,
  showReviewPrompt,
  compact = false,
}: {
  theme: ClientTheme;
  eventName: string;
  eventType: string;
  eventDateLabel: string | null;
  coverUrl?: string;
  coverPosition?: string;
  message: string;
  branding: boolean;
  scope: "landing" | "gallery";
  /** The event's `allow_download` preference — gates every download affordance
   *  in the gallery-scope preview, exactly as it does in the real gallery. */
  allowDownload: boolean;
  /** The event's `face_search_enabled` preference — removes the My Photos
   *  segment from the gallery preview, as it does in the real gallery. */
  faceSearchEnabled: boolean;
  /** Whether the real gallery would show any review ask (see the tab's prop). */
  showReviewPrompt: boolean;
  compact?: boolean;
}) {
  const coverBg = coverUrl
    ? { backgroundImage: `url(${coverUrl})`, backgroundSize: "cover", backgroundPosition: coverPosition || "center" }
    : { backgroundImage: `repeating-linear-gradient(40deg, ${theme.cover[0]} 0 22px, ${theme.cover[1]} 22px 44px)` };

  // Same formatter and the same measured clamp as the guest cover, so the
  // studio can see what guests will see — the preview used to render the raw
  // string in an unclamped <p>, which hid BOTH the lost line breaks and the
  // cut-off. It expands in place rather than opening the real `MessageSheet`:
  // the dashboard has no guest theme provider, and this is a mockup, not the page.
  const compactMessage = toCompactMessage(message);
  const [expanded, setExpanded] = useState(false);
  const messageRef = useRef<HTMLParagraphElement>(null);
  // `expanded` is in the list so collapsing re-measures in the same commit that
  // re-applies the clamp, with no frame in between where the control is gone.
  const truncated = useIsTruncated(messageRef, [compactMessage, expanded, compact]);

  if (scope === "gallery") {
    return (
      <GalleryScopePreview
        theme={theme}
        compact={compact}
        allowDownload={allowDownload}
        faceSearchEnabled={faceSearchEnabled}
      />
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
        {compactMessage && (
          <>
            <p
              ref={messageRef}
              style={{
                margin: "0 auto",
                maxWidth: compact ? 260 : 460,
                fontSize: compact ? 13 : 16,
                lineHeight: 1.7,
                color: theme.text,
                // The studio's own line breaks, and the same three-line window
                // the guest cover shows. `anywhere` so a pasted URL wraps
                // instead of stretching the mockup past the device frame.
                whiteSpace: "pre-line",
                overflowWrap: "anywhere",
                ...(expanded
                  ? null
                  : {
                      display: "-webkit-box",
                      WebkitBoxOrient: "vertical",
                      WebkitLineClamp: 3,
                      overflow: "hidden",
                    }),
              }}
            >
              {compactMessage}
            </p>
            {/* `|| expanded` because expanding removes the clamp, so the
                measurement correctly reads "nothing is cut off" — without this
                the control would vanish the moment it was used. */}
            {(truncated || expanded) && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="brand-focus mt-1.5 cursor-pointer text-[12px] font-semibold underline underline-offset-2"
                style={{ color: theme.brand }}
              >
                {expanded ? "Show less" : "Read more"}
              </button>
            )}
          </>
        )}
        <button
          className="inline-flex items-center gap-2"
          style={{
            marginTop: compactMessage ? (compact ? 20 : 28) : 0,
            background: theme.brand,
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
            style={{ marginTop: compact ? 22 : 36, paddingTop: compact ? 18 : 28, borderTop: `1px solid ${theme.brand}22` }}
          >
            <div className="flex gap-2">
              {["IG", "FB", "YT"].map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center justify-center rounded-full"
                  style={{
                    width: compact ? 30 : 36,
                    height: compact ? 30 : 36,
                    border: `1px solid ${theme.brand}55`,
                    color: theme.brand,
                    fontSize: compact ? 10 : 11,
                    fontWeight: 700,
                  }}
                >
                  {s}
                </span>
              ))}
            </div>
            {showReviewPrompt && (
              <span style={{ fontSize: compact ? 11 : 12.5, fontWeight: 600, color: theme.brand }}>★ Leave us a Google review</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The gallery-scope half of the preview — rebuilt to reuse the guest gallery's
 * real toolbar chrome (`UnlockAwareSwitcher` / `FolderPillsRow` /
 * `ActionsCluster`) instead of a hand-rolled, independently-styled copy. It
 * used to fake its own pill row (no counts, no My/All switcher, no lock, no
 * Liked/Select/Download) that had already drifted from what guests actually
 * see — reusing the real components means it can't drift again: any future
 * change to the toolbar shows up here automatically. Only the photo tiles stay
 * decorative (gradient placeholders) — the real `GalleryGrid`/`PhotoTile` load
 * actual images and own real selection/like state, which this static preview
 * has no need for and shouldn't take on the risk of embedding.
 */
function GalleryScopePreview({
  theme,
  compact,
  allowDownload,
  faceSearchEnabled,
}: {
  theme: ClientTheme;
  compact: boolean;
  allowDownload: boolean;
  faceSearchEnabled: boolean;
}) {
  const [tab, setTab] = useState<"mine" | "all">("all");
  const [folder, setFolder] = useState(ALL);
  const [likedView, setLikedView] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  // Demonstrates the real "Private" behaviour: hidden once "unlocked", which
  // also reveals Download — exactly like the live gallery.
  const [previewUnlocked, setPreviewUnlocked] = useState(false);

  const mockFolders: CustomFolder[] = useMemo(
    () => [
      { _id: "f1", name: "Ceremony", booking_id: "", createdAt: "" },
      { _id: "f2", name: "Reception", booking_id: "", createdAt: "" },
      { _id: "f3", name: "Portraits", booking_id: "", createdAt: "" },
    ],
    [],
  );
  const mockFolderCounts: Record<string, number> = { f1: 412, f2: 298, f3: 187 };
  const tileCount = compact ? 8 : 12;

  return (
    <div style={{ background: theme.bg, minHeight: "100%", fontFamily: "var(--font-plus-jakarta), sans-serif" }}>
      <div
        className="flex flex-col gap-2"
        style={{ padding: compact ? "14px 18px 0" : "16px 40px 0" }}
      >
        <div className="flex items-center justify-between gap-2">
          <UnlockAwareSwitcher t={theme} tab={tab} setTab={setTab} dimmed={likedView} showMine={faceSearchEnabled} />
          <ActionsCluster
            t={theme}
            likedView={likedView}
            onSelectLiked={() => setLikedView((v) => !v)}
            selectMode={selectMode}
            canSelect={allowDownload}
            onToggleSelectMode={() => setSelectMode((v) => !v)}
            canDownloadAll={previewUnlocked && allowDownload}
            zipping={false}
            onDownloadAll={() => { }}
            unlocked={previewUnlocked}
            onOpenPrivate={() => setPreviewUnlocked(true)}
            iconOnly={compact}
          />
        </div>
        {!likedView && (
          <FolderPillsRow
            t={theme}
            folders={mockFolders}
            folderCounts={mockFolderCounts}
            folder={folder}
            setFolder={setFolder}
            likedView={likedView}
            allCount={897}
          />
        )}
      </div>

      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(${compact ? 2 : 4}, 1fr)`,
          gap: compact ? 6 : 10,
          // Extra breathing room under the toolbar, matching the real
          // gallery's sticky-bar-to-grid gap.
          padding: compact ? "20px 18px 18px" : "28px 40px 40px",
        }}
      >
        {Array.from({ length: tileCount }).map((_, i) => (
          <div
            key={i}
            className="relative overflow-hidden"
            style={{
              aspectRatio: "1 / 1",
              borderRadius: 8,
              backgroundImage: `repeating-linear-gradient(${(i * 27) % 180}deg, ${theme.cover[0]} 0 9px, ${theme.cover[1]} 9px 18px)`,
            }}
          >
            {/* Static hints of the real tile's hover affordances (select
                top-left, heart + download bottom-right) — always-on here
                since a static mockup has no hover state to reveal them. The
                download glyph follows the event's `allow_download` preference,
                same as the real tile. */}
            <span
              className="absolute left-1 top-1 rounded-full"
              style={{ width: 14, height: 14, border: "1.5px solid rgba(255,255,255,0.9)", background: "rgba(20,16,8,0.25)" }}
            />
            <span className="absolute bottom-1 right-1 flex items-center gap-1">
              <span className="flex items-center justify-center rounded-full" style={{ width: 16, height: 16, background: "rgba(20,16,8,0.38)" }}>
                <IconHeart size={9} className="text-white" />
              </span>
              {allowDownload && (
                <span className="flex items-center justify-center rounded-full" style={{ width: 16, height: 16, background: "rgba(20,16,8,0.38)" }}>
                  <IconDownload size={9} className="text-white" />
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── preview fitting ────────────────────────────────────────────────────── */

/** The content-box width of `ref`'s element, tracked live; null until measured. */
function useContentWidth(ref: React.RefObject<HTMLElement | null>): number | null {
  const [width, setWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

/**
 * Lays a mockup out at `naturalWidth` and scales it down whole when the column
 * is narrower. Wide enough, the children render untouched. `zoom` rather than a
 * transform, because zoom shrinks the layout box too — the column's height
 * follows the scaled mockup with nothing to measure.
 */
function FitWidth({
  available,
  naturalWidth,
  children,
}: {
  available: number | null;
  naturalWidth: number;
  children: React.ReactNode;
}) {
  if (available === null || available >= naturalWidth) return <>{children}</>;
  return (
    <div className="shrink-0 self-start" style={{ width: naturalWidth, zoom: available / naturalWidth }}>
      {children}
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
    <label className="relative mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-[var(--color-brand-ink)]">
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

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 22) || "event"
  );
}
