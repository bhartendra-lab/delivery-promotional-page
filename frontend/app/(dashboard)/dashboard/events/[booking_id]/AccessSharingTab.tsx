"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ApiError, exportGuestsCsv, getAllGuests, setGuestAccessLevel, setStudioCollectionEditor } from "@/lib/api";
import type { CustomFolder, Guest } from "@/lib/types";
import {
  addressOf,
  CLIENT_ROLE_LABEL,
  confirmCopyFor,
  describeGuestAccess,
  type GuestAccessCase,
  sentenceStart,
} from "@/lib/guest-access-copy";
import { formatPhoneForDisplay, tidyName } from "@/lib/guest-display";
import {
  accessActionsFor,
  allMediaIsPublic,
  afterEditorChange,
  editorActionFor,
  editorLine,
  fullAccessSourceLabel,
  fullAccessIsRedundant,
  guestMatchesQuery,
  levelOf,
  sortGuestsForList,
  type EditorCap,
  type GuestAccessAction,
  type GuestAccessLevel,
} from "@/lib/guest-access";
import { useCompany } from "@/lib/useCompany";
import { galleryUrlFor } from "@/lib/gallery-url";
import { VYAVASTH_BASE_URL } from "@/lib/site-url";
import { trackEvent } from "@/lib/analytics";
import { guestPhotoUrl } from "@/lib/profile-face";
import {
  DELIVERY_PREFERENCE_DEFAULTS,
  normalizeDeliveryPreferences,
} from "@/lib/delivery-preferences";
import { SOCIAL_PLATFORM_BY_KEY, isSocialPlatformKey } from "@/lib/social-platforms";
import { coupleSlotsMissingNumber, type CoupleSlot } from "@/lib/event-clients";
import { Tip } from "@/components/ui/Tip";
import { IconCaretDown } from "@/components/ui/icons";
import { BrandingReminderDialog } from "./BrandingReminderDialog";
import { CoupleContactsCard } from "./CoupleContactsCard";
import { GalleryPreferencesCard } from "./GalleryPreferencesCard";
import { useEvent } from "./EventContext";
import { ShareTab } from "./ShareTab";
import {
  IconDownload,
  IconSearch,
  IconX,
} from "./icons";

/**
 * Tab 3 · Access & Sharing — three views: Share (one shared link and one family
 * passcode, see ShareTab), Guests (the list and each person's access) and
 * Settings (gallery preferences and guest teams).
 */
export function AccessSharingTab({
  bookingId,
  eventName,
  uniqueIdentifier,
  familyPasscode,
  qrUniqueId,
  qrImageUrl,
  onRegenerate,
}: {
  bookingId: string;
  eventName: string;
  uniqueIdentifier?: string;
  familyPasscode?: string;
  /** Reusable QR pointed at this event, if any (from `getBookingById`). */
  qrUniqueId?: string;
  qrImageUrl?: string;
  /** Mint a fresh passcode server-side; resolves to the new code. */
  onRegenerate: () => Promise<string>;
}) {
  // Built from the COMPANY, not from NEXT_PUBLIC_BASE_URL. This is the link a
  // studio reads off the screen and hands to a client by hand, so it has to be
  // the same one their guests get by email — their own domain once they have a
  // live one. See lib/gallery-url, which mirrors the backend's rule.
  const company = useCompany();
  const shareUrl = galleryUrlFor(company, uniqueIdentifier, VYAVASTH_BASE_URL) ?? "";

  // This card describes what a Guest will actually meet at the other end of the
  // link, so all three of its sentences follow the event's face search switch.
  const { meta, folders, folderCounts, archiveTiers, saveDeliveryPreferences, toast } = useEvent();
  const prefs = normalizeDeliveryPreferences(meta.deliveryPreferences);
  const faceSearchOn = prefs.face_search_enabled;
  const hasPublicPhotos = hasPublicFolderWithPhotos(folders, folderCounts);
  // When every photo is already public (and there is no Host-only download to
  // gain), giving or removing full access changes nothing a Guest can see or
  // do, so the Guest list stops offering it. See fullAccessIsRedundant.
  const fullAccessRedundant = fullAccessIsRedundant({
    folders,
    folderCounts,
    allowDownload: prefs.allow_download,
    archiveDownloadAccess: prefs.archive_download_access,
    archiveTierCount: archiveTiers.length,
  });

  /** The Gallery preferences modal — every per-event Guest setting in one
   *  place. It used to be a gear on the Media tab, which is where a studio
   *  managed FILES, not what Guests could do with them. */

  /** The Bride / Groom still without a number (couple events only). */
  const coupleSlots = coupleSlotsMissingNumber(meta.type, meta.clients);
  /** Bumped after numbers are added, so the Guest list shows the new Clients. */
  const [guestsVersion, setGuestsVersion] = useState(0);

  /**
   * The Studio's required visit link, if this event actually has a live one.
   * Resolved here and handed to the registry as `requiredVisitLabel`, which is
   * also the row's own visibility signal — undefined and the row hides.
   * Mirrors `resolveSocialVisitGate`: no platform, a platform whose URL was
   * cleared, or an event that hides the Studio profile all mean "no gate".
   *
   * Two forms, because the Gallery preferences modal can switch the profile
   * itself: `visitLabelWhenShown` ignores the profile (the modal applies its
   * DRAFT value to it), and `requiredVisitLabel` applies the SAVED one (the
   * summary card).
   */
  const visitPlatform = company?.mandatory_visit_platform;
  const visitSpec = isSocialPlatformKey(visitPlatform) ? SOCIAL_PLATFORM_BY_KEY[visitPlatform] : null;
  const visitLabelWhenShown =
    visitSpec && company?.social_links?.[visitSpec.key]?.trim() ? visitSpec.label : undefined;
  // Read `=== true`, exactly as the Guest gallery reads it.
  const studioProfileOn = meta.includeBranding === true;
  const requiredVisitLabel = studioProfileOn ? visitLabelWhenShown : undefined;

  // One description of who sees what, used by the link card, the passcode card
  // and the Guests panel, so the page cannot say two things at once.
  const access = describeGuestAccess({
    faceSearchOn,
    hasPublicPhotos,
    everyPhotoPublic: allMediaIsPublic(folders, folderCounts),
    fullAccessRedundant,
  });

  const [view, setView] = useState<View>("share");
  const tabsId = useId();

  /* All three panels stay mounted and the inactive ones are hidden, so an
   * edited message or half-typed team name survives switching views. */
  const panelProps = (v: View) => ({
    role: "tabpanel",
    id: `${tabsId}-${v}-panel`,
    "aria-labelledby": `${tabsId}-${v}-tab`,
    hidden: view !== v,
  });

  return (
    // Breakpoints on this tab follow the width the TAB actually gets (a
    // container query on this box), not the viewport: the dashboard sidebar
    // takes a different share of the screen expanded vs collapsed.
    //
    // This box is the ONE vertical scroll surface. It is a size container
    // (`cqh` below is this box's height), which is safe because its height is
    // set by the layout above it, never by content.
    <div className="[container-type:size] h-full min-h-0 overflow-y-auto bg-[var(--color-brand-bg)]">
      <BrandingReminderDialog />
      <div className="px-4 py-4 @2xl:px-6 @2xl:py-5">
        <ViewSwitch view={view} onChange={setView} idBase={tabsId} />

        <div {...panelProps("share")}>
          <ShareTab
            eventName={eventName}
            shareUrl={shareUrl}
            passcode={familyPasscode ?? ""}
            onRegenerate={onRegenerate}
            access={access}
            faceSearchOn={faceSearchOn}
            hasPublicPhotos={hasPublicPhotos}
            fullAccessRedundant={fullAccessRedundant}
            qr={{ qrUniqueId, qrImageUrl, eventDate: meta.eventDate, coverUrl: meta.backgroundImage }}
          />
        </div>

        {/* The couple's missing numbers (when there are any), then the guest
            list. In a wide layout the pair is no taller than the tab and the
            guest list scrolls inside itself. */}
        <div {...panelProps("guests")}>
          <div className="@container mx-auto flex max-w-[760px] flex-col gap-3">
            {coupleSlots.length > 0 && (
              <CoupleReminder slots={coupleSlots} onAdded={() => setGuestsVersion((v) => v + 1)} />
            )}
            <GuestsPanel
              bookingId={bookingId}
              fullAccessRedundant={fullAccessRedundant}
              reloadKey={guestsVersion}
              note={access.guestsNote}
              guestsSee={guestsSeeShort(access.case, hasPublicPhotos)}
            />
          </div>
        </div>

        <div {...panelProps("settings")}>
          <div className="mx-auto flex max-w-[760px] flex-col gap-3">
            <GalleryPreferencesCard
              key={JSON.stringify([meta.deliveryPreferences ?? null, studioProfileOn])}
              saved={meta.deliveryPreferences ?? DELIVERY_PREFERENCE_DEFAULTS}
              onSave={saveDeliveryPreferences}
              toast={toast}
              context={{
                archiveTiers,
                requiredVisitLabel,
                googleReviewEnabledGlobally: company?.google_review_enabled !== false,
                hasPublicFolderWithMedia: hasPublicPhotos,
              }}
              // "Show your studio profile" decides what a Guest sees (the
              // Studio's name, logo, links, review button, and so whether the
              // required visit can be asked at all), which is what this is for.
              studioProfile={{ saved: studioProfileOn, visitLabelWhenShown }}
            />
          </div>
        </div>
      </div>

    </div>
  );
}

/* ── view switch ────────────────────────────────────────────────── */

type View = "share" | "guests" | "settings";

const VIEWS: ReadonlyArray<{ value: View; label: string }> = [
  { value: "share", label: "Share" },
  { value: "guests", label: "Guests" },
  { value: "settings", label: "Settings" },
];

/** Share / Guests / Settings. Arrow keys move between them, as tabs should. */
function ViewSwitch({ view, onChange, idBase }: { view: View; onChange: (view: View) => void; idBase: string }) {
  return (
    <div className="mb-4 flex justify-center">
      <div
        role="tablist"
        aria-label="Access and sharing"
        className="inline-flex w-full max-w-[420px] gap-1 rounded-xl border border-[var(--color-brand-border)] bg-white p-1"
      >
        {VIEWS.map((v, i) => (
          <button
            key={v.value}
            type="button"
            role="tab"
            id={`${idBase}-${v.value}-tab`}
            aria-controls={`${idBase}-${v.value}-panel`}
            aria-selected={view === v.value}
            tabIndex={view === v.value ? 0 : -1}
            onClick={() => onChange(v.value)}
            onKeyDown={(e) => {
              const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
              if (!step) return;
              e.preventDefault();
              const next = VIEWS[(i + step + VIEWS.length) % VIEWS.length].value;
              onChange(next);
              document.getElementById(`${idBase}-${next}-tab`)?.focus();
            }}
            className={`brand-focus h-9 flex-1 rounded-lg text-[13px] font-semibold transition-colors ${
              view === v.value
                ? "bg-[var(--color-brand-navy-soft)] text-[var(--color-brand-navy-deep)]"
                : "text-[var(--color-brand-muted)] hover:text-[var(--color-brand-ink)]"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── guest list panel ───────────────────────────────────────────── */

type GuestFilter = "all" | GuestAccessLevel;

/** Most access first, so the order itself explains the levels. */
const LEVELS: ReadonlyArray<{ value: GuestAccessLevel; label: string }> = [
  { value: "client", label: "Clients" },
  { value: "host", label: "Full access" },
  { value: "guest", label: "Guests" },
];

/** Three different empty states: nobody yet (EMPTY_LABEL, per filter), nobody
 *  matches a search (the search line below), and the filter has no one. */
const EMPTY_LABEL: Record<GuestFilter, string> = {
  all: "No one yet. Guests appear here once they open your gallery link.",
  client: "No Clients yet. Use Change on anyone below to make them a Client.",
  host: "No one with full access yet. Anyone who enters the family passcode, or whom you give full access, appears here.",
  guest: "Everyone here has full access.",
};

const FILTER_NOUN: Record<GuestFilter, string> = { all: "people", client: "Clients", host: "people with full access", guest: "guests" };

/** What each level sees, in a few words. Guests depend on the event's settings. */
function levelMeaning(level: GuestAccessLevel, guestsSee: string): string {
  if (level === "client") return "Every photo, always";
  if (level === "host") return "Every photo";
  return guestsSee;
}

function GuestsPanel({
  bookingId,
  fullAccessRedundant,
  reloadKey,
  note,
  guestsSee,
}: {
  bookingId: string;
  /** Changing it reloads the list (after the couple's numbers are added). */
  reloadKey: number;
  /** The longer line about what Guests can see, from describeGuestAccess. */
  note: string;
  /** What a Guest without full access sees, in a few words. */
  guestsSee: string;
  /** Every photo is already public, so the full-access items are left out of
   *  each row's menu. See fullAccessIsRedundant. */
  fullAccessRedundant: boolean;
}) {
  const [guests, setGuests] = useState<Guest[] | null>(null);
  /** The editor cap while collections are on; null while they are off. */
  const [editorCap, setEditorCap] = useState<EditorCap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<GuestFilter>("all");
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // The whole list, once: it is one unpaginated response either way, and
  // holding all of it is what lets each level show its count. The level and
  // the search both narrow it in the browser.
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getAllGuests(bookingId, {});
      setGuests(sortGuestsForList(res.guests ?? []));
      setEditorCap(res.collections ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load guests");
    } finally {
      setLoading(false);
    }
    // reloadKey is a trigger only: a new value means "the list changed".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId, reloadKey]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-then-setState is the documented React pattern for effects
    void load();
  }, [load]);

  /** A row's level changed: update it in place and re-sort, so a new Client
   *  jumps to the top. Under a level filter it leaves the view by itself. */
  const handleAccessChanged = (guestId: string, updated: Guest) => {
    setGuests((prev) => (prev ? sortGuestsForList(prev.map((g) => (g._id === guestId ? { ...g, ...updated } : g))) : prev));
  };

  const handleExport = async () => {
    setExporting(true);
    setExportError(null);
    try {
      await exportGuestsCsv(bookingId, { guestType: filter === "all" ? undefined : filter });
      trackEvent("leads_exported", { scope: "event" });
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const counts = useMemo(() => {
    const c: Record<GuestAccessLevel, number> = { client: 0, host: 0, guest: 0 };
    for (const g of guests ?? []) c[levelOf(g)] += 1;
    return c;
  }, [guests]);

  const query = search.trim();
  const inFilter = useMemo(
    () => (guests ? guests.filter((g) => filter === "all" || levelOf(g) === filter) : null),
    [guests, filter],
  );
  const visibleGuests = useMemo(
    () => (inFilter ? inFilter.filter((g) => guestMatchesQuery(g, query)) : null),
    [inFilter, query],
  );

  // Clients always lead the list (see compareGuestsForList), so under "All"
  // the first non-Client row is where everyone else begins.
  const firstOtherIndex =
    filter === "all" && visibleGuests ? visibleGuests.findIndex((g) => levelOf(g) !== "client") : -1;
  const showDivider = firstOtherIndex > 0;
  const total = guests?.length ?? 0;

  return (
    <section className="flex flex-col rounded-xl border border-[var(--color-brand-border)] bg-white">
      <div className="flex items-center gap-3 px-4 pt-4">
        <h3 className="flex flex-1 items-center gap-1.5 text-[15.5px] font-bold tracking-tight text-[var(--color-brand-ink)]">
          Guests
          {!loading && !error && guests && (
            <span className="font-semibold tabular-nums text-[var(--color-brand-muted)]">· {total.toLocaleString("en-IN")}</span>
          )}
          <Tip text={`Everyone who opened the gallery link, plus Clients you added. ${note}`} />
        </h3>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting || loading || total === 0}
          className="brand-focus inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--color-brand-border)] bg-white px-3 text-[12.5px] font-semibold text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <IconDownload size={13} />
          {exporting ? "Exporting…" : filter === "all" ? "Export" : "Export these"}
        </button>
      </div>

      {/* The three levels, most access first, each with its count and what it
          sees. They are also the filter: press one to see only them. */}
      <div role="group" aria-label="Filter by access" className="grid grid-cols-1 gap-2 px-4 pt-3 @lg:grid-cols-3">
        {LEVELS.map((l) => {
          const active = filter === l.value;
          return (
            <button
              key={l.value}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(active ? "all" : l.value)}
              className={`brand-focus flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors @lg:block ${
                active
                  ? "border-[var(--color-brand-navy)] bg-[var(--color-brand-navy-soft)]"
                  : "border-[var(--color-brand-border)] bg-white hover:border-[var(--color-brand-outline)]"
              }`}
            >
              <span className="flex items-baseline gap-1.5">
                <span className="text-[13px] font-bold text-[var(--color-brand-ink)]">{l.label}</span>
                <span className="text-[13px] font-semibold tabular-nums text-[var(--color-brand-muted)]">
                  {loading ? "–" : counts[l.value].toLocaleString("en-IN")}
                </span>
              </span>
              <span className="block text-[12px] text-[var(--color-brand-body)]">{levelMeaning(l.value, guestsSee)}</span>
            </button>
          );
        })}
      </div>

      <div className="px-4 py-3">
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[var(--color-brand-muted)]">
            <IconSearch size={14} />
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email or phone"
            aria-label="Search guests"
            autoComplete="off"
            className="brand-focus h-10 w-full rounded-lg border border-[var(--color-brand-border)] bg-white pl-9 pr-8 text-[13px] text-[var(--color-brand-ink)] outline-none placeholder:text-[var(--color-brand-muted)]/70"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="brand-focus absolute inset-y-0 right-1.5 my-auto flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-brand-muted)] hover:bg-[var(--color-brand-border)]"
            >
              <IconX size={12} />
            </button>
          )}
        </div>
      </div>

      {exportError && (
        <div className="border-t border-[#ECE5D8] bg-[var(--color-brand-warning-soft)] px-4 py-2 text-[12px] text-[var(--color-brand-warning)]">
          {exportError}
        </div>
      )}

      {/* The list grows with the page: this view is the whole tab, so the
          page scrolls rather than a box inside it. */}
      <div className="border-t border-[#ECE5D8]">
        {loading && (
          <div className="flex items-center justify-center gap-2 px-4 py-10 text-[12.5px] text-[var(--color-brand-muted)]">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-[2px] border-[var(--color-brand-border)] border-t-[var(--color-brand-navy)]" />
            Loading guests…
          </div>
        )}
        {!loading && error && (
          <div className="px-4 py-8 text-center text-[12.5px] text-[var(--color-brand-muted)]">
            {error}
            <button
              type="button"
              onClick={() => void load()}
              className="brand-focus mt-1 block w-full font-semibold text-[var(--color-brand-navy)] hover:underline"
            >
              Try again
            </button>
          </div>
        )}
        {!loading && !error && (inFilter?.length ?? 0) === 0 && (
          <div className="px-4 py-8 text-center text-[13px] text-[var(--color-brand-body)]">{EMPTY_LABEL[filter]}</div>
        )}
        {!loading && !error && (inFilter?.length ?? 0) > 0 && (visibleGuests?.length ?? 0) === 0 && (
          <div className="px-4 py-8 text-center text-[13px] text-[var(--color-brand-body)]">
            No {FILTER_NOUN[filter]} match &ldquo;{query}&rdquo;.
            <button
              type="button"
              onClick={() => setSearch("")}
              className="brand-focus mt-1 block w-full font-semibold text-[var(--color-brand-navy)] hover:underline"
            >
              Clear search
            </button>
          </div>
        )}
        {!loading &&
          !error &&
          visibleGuests?.map((g, index) => (
            <div key={g._id}>
              {showDivider && index === firstOtherIndex && (
                <div className="border-b border-[#F1ECE2] bg-[var(--color-brand-bg)] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-brand-muted)]">
                  Everyone else
                </div>
              )}
              <GuestRow
                guest={g}
                fullAccessRedundant={fullAccessRedundant}
                bookingId={bookingId}
                editorCap={editorCap}
                onEditorsUsed={(used) => setEditorCap((c) => (c ? { ...c, editors_used: used } : c))}
                onAccessChanged={(updated) => handleAccessChanged(g._id, updated)}
                // A 404 means another Member already changed this row. The
                // message is shown inline by the row itself; reloading is what
                // makes the list agree with it again.
                onStale={() => void load()}
              />
            </div>
          ))}
      </div>
    </section>
  );
}

/**
 * The couple's missing WhatsApp numbers, as one line above the Guest list.
 * The form it opens is the same CoupleContactsCard; folded by default so it
 * no longer sits on top of the list taking a third of the view.
 */
function CoupleReminder({ slots, onAdded }: { slots: CoupleSlot[]; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const who = slots.length === 2 ? "The bride's and groom's WhatsApp numbers are" : `The ${slots[0].role}'s WhatsApp number is`;
  if (open) {
    return (
      <div className="flex flex-col gap-2">
        <CoupleContactsCard slots={slots} onAdded={onAdded} />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="brand-focus self-end rounded text-[12.5px] font-semibold text-[var(--color-brand-muted)] hover:text-[var(--color-brand-ink)]"
        >
          Not now
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[#F0D9B5] bg-[var(--color-brand-warning-soft)] px-4 py-3">
      <p className="min-w-0 flex-1 text-[13px] text-[var(--color-brand-ink)]">
        {who} missing.
        <span className="text-[var(--color-brand-body)]"> Add {slots.length === 2 ? "them" : "it"} to send the gallery and give full access.</span>
      </p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="brand-focus inline-flex h-9 shrink-0 items-center rounded-lg border border-[var(--color-brand-border)] bg-white px-3 text-[12.5px] font-semibold text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)]"
      >
        Add {slots.length === 2 ? "numbers" : "number"}
      </button>
    </div>
  );
}

function GuestRow({
  guest,
  fullAccessRedundant,
  bookingId,
  editorCap,
  onEditorsUsed,
  onAccessChanged,
  onStale,
}: {
  guest: Guest;
  fullAccessRedundant: boolean;
  bookingId: string;
  /** Collections on: the event's editor cap. Null: no editing item at all. */
  editorCap: EditorCap | null;
  onEditorsUsed: (used: number) => void;
  onAccessChanged: (updated: Guest) => void;
  onStale: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useEvent();
  // One value per row, used everywhere below: a Client is stored as a Host
  // with a flag, so the raw fields alone would read every Client as a Host.
  const level = levelOf(guest);
  // Display only: the stored phone and name are never rewritten.
  const contact = guest.email || formatPhoneForDisplay(guest.phone) || "No contact info";
  const shownName = tidyName(guest.name) || "Guest";
  // A Host promoted before the source was recorded can only have come in with
  // the passcode — it was the sole way in — so an absent value reads that way.
  const givenByStudio = guest.full_access_source === "studio";
  const who = addressOf(tidyName(guest.name));
  const actions = accessActionsFor(level, { fullAccessRedundant });
  // Collection editing sits with the giving items, before anything that
  // takes access away.
  const editorAction = editorActionFor(guest, editorCap);
  const menuItems: MenuItem[] = (() => {
    const items: MenuItem[] = [...actions];
    if (!editorAction) return items;
    const firstDestructive = items.findIndex((a) => a.destructive);
    items.splice(firstDestructive < 0 ? items.length : firstDestructive, 0, editorAction);
    return items;
  })();

  /** Editing is reversible and gives nothing away the menu does not say, so it
   *  applies at once (no confirm), with a toast. */
  const applyEditor = async (enable: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const res = await setStudioCollectionEditor(bookingId, guest._id, enable);
      onAccessChanged(afterEditorChange(guest, enable));
      onEditorsUsed(res.editors.used);
      toast(enable ? `${sentenceStart(who.label)} can now edit the selection` : `${sentenceStart(who.label)} can no longer edit the selection`);
    } catch (e) {
      const code = e instanceof ApiError ? (e.body as { code?: string } | null)?.code : undefined;
      setError(
        code === "editor_limit"
          ? `You can add up to ${editorCap?.max_editors ?? 6} editors.`
          : e instanceof Error
            ? e.message
            : "Couldn't change editing",
      );
      if (code === "stale" || (e instanceof ApiError && e.status === 404)) onStale();
    } finally {
      setBusy(false);
    }
  };

  const apply = async (action: GuestAccessAction) => {
    setBusy(true);
    setError(null);
    try {
      const res = await setGuestAccessLevel(guest._id, action.to);
      onAccessChanged(res.guest);
      toast(
        action.to === "client"
          ? `${sentenceStart(who.label)} is now a Client`
          : action.to === "host"
            ? level === "client"
              ? `${sentenceStart(who.label)} is no longer a Client`
              : `${sentenceStart(who.label)} now has full access`
            : `Full access removed for ${who.label}`,
      );
    } catch (e) {
      // A 404 is not a failure so much as news: someone else got there first.
      // Show what the server said, then let the panel reload so the row stops
      // offering an action that no longer applies.
      setError(e instanceof Error ? e.message : "Couldn't update access");
      if (e instanceof ApiError && e.status === 404) onStale();
    } finally {
      setBusy(false);
    }
  };

  const clientRole = CLIENT_ROLE_LABEL[guest.client_role ?? ""];

  return (
    <div className="flex flex-col gap-2 border-b border-[#F1ECE2] px-4 py-3 last:border-b-0">
      <div className="flex items-center gap-3">
        <Avatar name={shownName} photoUrl={guestPhotoUrl(guest)} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[13.5px] font-semibold text-[var(--color-brand-ink)]">{shownName}</span>
            <RoleBadge level={level} />
          </div>
          {/* One quiet line: how to reach them, then where their level came
              from. Only matters when you are about to change it. */}
          <p className="truncate text-[12px] text-[var(--color-brand-muted)]">
            {[
              contact,
              level === "client"
                ? `${clientRole ? `${clientRole} · ` : ""}${guest.client_source === "event_setup" ? "added by you" : "marked by you"}`
                : level === "host"
                  ? fullAccessSourceLabel(guest.full_access_source) === "passcode"
                    ? "used the passcode"
                    : fullAccessSourceLabel(guest.full_access_source)
                  : null,
              editorLine(guest),
              guest.invite_pending === true ? "hasn't opened the gallery yet" : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        {/* Always visible, never a hover-only reveal: this list is used on
            phones. */}
        <GuestAccessMenu
          name={who.label}
          actions={menuItems}
          disabled={busy}
          // Every level change asks first, inside the same popover the change
          // was picked from: editing applies at once (it is reversible and
          // gives nothing the menu does not say).
          confirmFor={(item) => {
            const action = actions.find((a) => a.key === item.key);
            return action ? confirmCopyFor(action, level, who, givenByStudio) : null;
          }}
          onSelect={async (item) => {
            if (item.key === "allow_editing" || item.key === "stop_editing") return applyEditor(item.key === "allow_editing");
            const action = actions.find((a) => a.key === item.key);
            if (action) await apply(action);
          }}
        />
      </div>
      {error && <p className="text-[11.5px] text-[var(--color-brand-danger)]">{error}</p>}
    </div>
  );
}

const MENU_WIDTH = 240;
/** The confirm step needs room for a sentence. */
const CONFIRM_WIDTH = 300;
/** Gap kept between the menu and the viewport edge, and the button. */
const MENU_MARGIN = 8;
const MENU_OFFSET = 4;

/**
 * A Guest row's 3 dot menu: every access change that row can make.
 *
 * Rendered into <body> at a fixed position, for the same reason `Tip` is: the
 * list scrolls inside `overflow-y-auto` and its card clips overflow, so a menu
 * positioned inside the row was cut off on the last rows. It is right-aligned
 * to its button, clamped inside the viewport, and flipped above the button
 * when there is no room below. Its position is a snapshot, so it closes on
 * any scroll or resize rather than drifting away from its row.
 *
 * A real menu to the keyboard: focus goes to the first item on open, the
 * arrow keys move between items, Home and End jump, Enter and Space activate,
 * Escape and Tab close. Focus returns to the 3 dot button whenever it closes.
 * Only one can be open at a time, because opening another means pressing
 * outside this one.
 */
/** One item of a Guest row's menu: an access change, or collection editing. */
type MenuItem = { key: string; label: string; description: string; destructive?: boolean; disabled?: boolean };

function GuestAccessMenu({
  name,
  actions,
  disabled,
  confirmFor,
  onSelect,
}: {
  /** Who the menu is about, for the button's accessible name. */
  name: string;
  actions: MenuItem[];
  disabled?: boolean;
  /** The confirm an item needs, or null to apply it straight away. */
  confirmFor?: (action: MenuItem) => { tone: "warning" | "neutral"; sentence: string; confirmLabel: string } | null;
  /** Applies the item. Resolves when done; the popover stays open until then. */
  onSelect: (action: MenuItem) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  /** The item picked, while the popover shows its confirm instead of the list. */
  const [confirming, setConfirming] = useState<MenuItem | null>(null);
  const [working, setWorking] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();

  const close = useCallback(() => {
    setOpen(false);
    setConfirming(null);
    // preventScroll: a close caused by scrolling must not yank the list back.
    buttonRef.current?.focus({ preventScroll: true });
  }, []);

  // Place the menu once it is in the DOM and its real height is known. Written
  // straight to the element rather than through state: it is one measurement,
  // taken before paint, and nothing else needs to know where the menu landed.
  useLayoutEffect(() => {
    if (!open) return;
    const button = buttonRef.current?.getBoundingClientRect();
    const menu = menuRef.current;
    if (!button || !menu) return;
    const width = Math.min(confirming ? CONFIRM_WIDTH : MENU_WIDTH, window.innerWidth - MENU_MARGIN * 2);
    menu.style.width = `${width}px`;
    const left = Math.min(Math.max(MENU_MARGIN, button.right - width), window.innerWidth - width - MENU_MARGIN);
    const height = menu.offsetHeight;
    const below = button.bottom + MENU_OFFSET;
    const fitsBelow = below + height <= window.innerHeight - MENU_MARGIN;
    const top = fitsBelow ? below : Math.max(MENU_MARGIN, button.top - MENU_OFFSET - height);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.visibility = "visible";
    // A confirm that takes access away lands on Cancel, so Enter is not a
    // one-keystroke removal; anything else lands on its button.
    if (confirming) {
      const tone = confirmFor?.(confirming)?.tone;
      (tone === "warning" ? cancelRef : confirmRef).current?.focus({ preventScroll: true });
    } else itemRefs.current[0]?.focus({ preventScroll: true });
  }, [open, confirming, confirmFor]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Its own Escape only: the tab's dialogs must not also react to it.
        // From a confirm, Escape steps back to the list rather than closing.
        e.stopPropagation();
        if (confirming && !working) setConfirming(null);
        else if (!working) close();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open, close, confirming, working]);

  const onItemKeyDown = (e: React.KeyboardEvent, index: number) => {
    const focusItem = (next: number) => {
      e.preventDefault();
      itemRefs.current[(next + actions.length) % actions.length]?.focus();
    };
    if (e.key === "ArrowDown") focusItem(index + 1);
    else if (e.key === "ArrowUp") focusItem(index - 1);
    else if (e.key === "Home") focusItem(0);
    else if (e.key === "End") focusItem(actions.length - 1);
    else if (e.key === "Tab") {
      // The menu lives at the end of <body>; a native Tab from here would land
      // nowhere near the row. Close and hand focus back to the button instead.
      e.preventDefault();
      close();
    }
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={`Access options for ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="brand-focus inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-[var(--color-brand-border)] bg-white px-2.5 text-[12.5px] font-semibold text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)] disabled:opacity-50"
      >
        Change
        <IconCaretDown size={11} />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role={confirming ? "dialog" : "menu"}
            aria-label={confirming ? `Confirm change for ${name}` : `Access options for ${name}`}
            // Hidden until the layout effect above has measured and placed it,
            // so it never flashes at the top-left corner first.
            style={{ visibility: "hidden", top: 0, left: 0 }}
            className="fixed z-[60] overflow-hidden rounded-lg border border-[var(--color-brand-border)] bg-white p-1 shadow-[0_14px_44px_rgba(42,34,24,0.18)]"
          >
            {confirming ? (
              <ConfirmStep
                copy={confirmFor?.(confirming) ?? null}
                working={working}
                confirmRef={confirmRef}
                cancelRef={cancelRef}
                onCancel={() => setConfirming(null)}
                onConfirm={async () => {
                  setWorking(true);
                  try {
                    await onSelect(confirming);
                  } finally {
                    setWorking(false);
                    close();
                  }
                }}
              />
            ) : actions.map((action, index) => (
              <button
                key={action.key}
                ref={(el) => {
                  itemRefs.current[index] = el;
                }}
                type="button"
                role="menuitem"
                aria-disabled={action.disabled || undefined}
                onKeyDown={(e) => onItemKeyDown(e, index)}
                onClick={() => {
                  if (action.disabled) return;
                  // Ask in place when the change needs it; otherwise apply.
                  if (confirmFor?.(action)) {
                    setConfirming(action);
                    return;
                  }
                  close();
                  void onSelect(action);
                }}
                className={`brand-focus flex min-h-11 w-full flex-col justify-center rounded-md px-2.5 py-1.5 text-left ${
                  action.disabled ? "cursor-not-allowed opacity-50 " : ""
                }${
                  action.destructive
                    ? "mt-1 border-t border-[var(--color-brand-border)] pt-[9px] hover:bg-[var(--color-brand-danger-soft)]"
                    : "hover:bg-[var(--color-brand-hover)]"
                }`}
              >
                <span
                  className={`text-[12.5px] font-semibold ${
                    action.destructive ? "text-[var(--color-brand-danger)]" : "text-[var(--color-brand-ink)]"
                  }`}
                >
                  {action.label}
                </span>
                <span className="text-[11px] leading-snug text-[var(--color-brand-muted)]">{action.description}</span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

/**
 * The confirm step inside a Guest row's Change popover: what the change means
 * for this person, then the button that makes it. Same popover, same place
 * the change was picked, so nothing in the list moves while it is asked.
 */
function ConfirmStep({
  copy,
  working,
  confirmRef,
  cancelRef,
  onCancel,
  onConfirm,
}: {
  copy: { tone: "warning" | "neutral"; sentence: string; confirmLabel: string } | null;
  working: boolean;
  confirmRef: React.RefObject<HTMLButtonElement | null>;
  cancelRef: React.RefObject<HTMLButtonElement | null>;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!copy) return null;
  const warning = copy.tone === "warning";
  return (
    <div className="flex flex-col gap-3 p-2.5">
      <p className="text-[12.5px] leading-relaxed text-[var(--color-brand-ink)]">{copy.sentence}</p>
      <div className="flex justify-end gap-2">
        <button
          ref={cancelRef}
          type="button"
          disabled={working}
          onClick={onCancel}
          className="brand-focus inline-flex h-9 items-center rounded-lg px-3 text-[12.5px] font-semibold text-[var(--color-brand-muted)] hover:text-[var(--color-brand-ink)] disabled:opacity-50"
        >
          Back
        </button>
        <button
          ref={confirmRef}
          type="button"
          disabled={working}
          onClick={onConfirm}
          className={`brand-focus inline-flex h-9 items-center rounded-lg px-3.5 text-[12.5px] font-semibold text-white disabled:opacity-60 ${
            warning
              ? "bg-[var(--color-brand-danger)] hover:opacity-90"
              : "bg-[var(--color-brand-navy)] hover:bg-[var(--color-brand-navy-deep)]"
          }`}
        >
          {working ? "Saving…" : copy.confirmLabel}
        </button>
      </div>
    </div>
  );
}

/** Three levels, three treatments, and never colour alone: the word is always
 *  there. A Client gets the strongest one, since they are who the event is for. */
function RoleBadge({ level }: { level: GuestAccessLevel }) {
  // Sentence case in a soft tinted pill: a role is context, not an alarm, and
  // the old heavy uppercase badge shouted louder than the guest's name.
  const tone =
    level === "client"
      ? "bg-[var(--color-brand-navy-soft)] text-[var(--color-brand-navy-deep)]"
      : level === "host"
        ? "bg-[#EFEAE0] text-[var(--color-brand-body)]"
        : "bg-[#F4F2EE] text-[var(--color-brand-muted)]";
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-[1px] text-[11px] font-medium ${tone}`}>
      {level === "client" ? "Client" : level === "host" ? "Full access" : "Guest"}
    </span>
  );
}

/**
 * A guest row's picture: the same face the guest sees in their own gallery
 * (their profile face once the backend serves those, their selfie before; see
 * lib/profile-face.ts), else their initial. A picture that fails to load shows
 * the initial rather than a broken image.
 */
function Avatar({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (photoUrl && failedUrl !== photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={name}
        onError={() => setFailedUrl(photoUrl)}
        className="h-9 w-9 shrink-0 rounded-full object-cover"
      />
    );
  }
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-bold"
      style={{ background: "var(--color-brand-navy-soft)", color: "var(--color-brand-navy)" }}
    >
      {initial}
    </span>
  );
}

/**
 * Does any public folder actually hold something?
 *
 * "Public folder exists" is not the question — an empty one shows a Guest
 * nothing, so it leaves them just as stuck as having none. Deliberately
 * approximate in one direction: `folderCounts` counts media, videos included,
 * while the Guest-side signal (`sample_media_urls`) is images only. So a public
 * folder holding nothing but videos reads as "fine" here and as "nothing
 * public" to a Guest. It errs toward not nagging a Studio that has done the
 * work, which is the right way round for a warning.
 */
/** What a Guest without full access sees, in a few words, for the level tiles. */
function guestsSeeShort(accessCase: GuestAccessCase, hasPublicPhotos: boolean): string {
  if (accessCase === "all_public") return "Every photo";
  if (accessCase === "public_only") return "Public folders";
  if (accessCase === "passcode_only") return "Nothing until the passcode";
  return hasPublicPhotos ? "Own photos and public folders" : "Own photos only";
}

function hasPublicFolderWithPhotos(
  folders: CustomFolder[],
  folderCounts: Record<string, number>,
): boolean {
  return folders.some((f) => f.visibility === "public" && (folderCounts[f._id] ?? 0) > 0);
}

