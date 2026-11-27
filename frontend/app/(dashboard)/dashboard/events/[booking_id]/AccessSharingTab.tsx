"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ApiError, exportGuestsCsv, getAllGuests, setGuestAccessLevel, setStudioCollectionEditor } from "@/lib/api";
import { downloadImage } from "@/lib/media-actions";
import type { CustomFolder, Guest } from "@/lib/types";
import {
  addressOf,
  CLIENT_ROLE_LABEL,
  confirmCopyFor,
  describeGuestAccess,
  REGENERATE_PASSCODE_CONFIRM,
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
import { Tip } from "@/components/ui/Tip";
import { IconCaretDown } from "@/components/ui/icons";
import { useCompany } from "@/lib/useCompany";
import { galleryUrlFor } from "@/lib/gallery-url";
import { VYAVASTH_BASE_URL } from "@/lib/site-url";
import { galleryInviteMessage, passcodeShareMessage, SHARE_LANGUAGES, type ShareLang } from "@/lib/share-message";
import { readShareLang, saveShareLang } from "@/lib/share-lang-store";
import { trackEvent } from "@/lib/analytics";
import { guestPhotoUrl } from "@/lib/profile-face";
import {
  DELIVERY_PREFERENCE_DEFAULTS,
  normalizeDeliveryPreferences,
  type DeliveryPreferences,
} from "@/lib/delivery-preferences";
import { SOCIAL_PLATFORM_BY_KEY, isSocialPlatformKey } from "@/lib/social-platforms";
import { coupleSlotsMissingNumber } from "@/lib/event-clients";
import { BrandingReminderDialog } from "./BrandingReminderDialog";
import { CoupleContactsCard } from "./CoupleContactsCard";
import { GuestTeamsCard } from "./GuestTeamsCard";
import { DeliveryPreferencesModal } from "./DeliveryPreferencesModal";
import { useEvent } from "./EventContext";
import {
  IconCheck,
  IconCopy,
  IconDotsVertical,
  IconDownload,
  IconGear,
  IconInfo,
  IconLink,
  IconLock,
  IconMail,
  IconQrCode,
  IconRefresh,
  IconScanFace,
  IconSearch,
  IconShieldCheck,
  IconUsers,
  IconWhatsApp,
  IconX,
} from "./icons";

/**
 * Tab 3 · Access & Sharing — one real shared link + one real family passcode,
 * plus the full guest list (who's a host vs. a guest, and a way to revoke a
 * host's full-gallery access).
 *
 * The single `/event/<unique_identifier>` URL covers all photo access: every
 * guest signs in and face-matches their own photos; the family passcode (shared
 * separately) unlocks the complete gallery in-lounge. Backed by real data from
 * the booking — no placeholders.
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
  const [prefsOpen, setPrefsOpen] = useState(false);

  /** The Bride / Groom still without a number (couple events only). */
  const coupleSlots = coupleSlotsMissingNumber(meta.type, meta.clients);
  /** Bumped after numbers are added, so the Guest list shows the new Clients. */
  const [guestsVersion, setGuestsVersion] = useState(0);
  const savedTeams = meta.guestTypes ?? [];

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

  // The language the share messages are written in, remembered per browser.
  // Read once on mount: this tab only mounts after the event has loaded in the
  // browser, so there is no server render for it to disagree with.
  const [lang, setLangState] = useState<ShareLang>(() => readShareLang());
  const setLang = (next: ShareLang) => {
    setLangState(next);
    saveShareLang(next);
  };

  // Shared with the Client's Guest Control, so both send the same words.
  const message = galleryInviteMessage({ eventName, url: shareUrl, faceSearchOn, lang });

  return (
    // Breakpoints on this tab follow the width the TAB actually gets (a
    // container query on this box), not the viewport: the dashboard sidebar
    // takes a different share of the screen expanded vs collapsed, and a
    // viewport `lg` switched to two columns at widths where neither was usable.
    //
    // This box is the ONE vertical scroll surface at every width: the left
    // column flows at its natural height, and wheel or touch anywhere on the
    // tab (cards, the gutters between them, the page edges) scrolls it. The
    // right column sticks while the left scrolls, limited to the height of this
    // box, so the guest list is the only nested scroller and hands the wheel
    // back to the page at its ends (default overscroll chaining; no wheel
    // handlers). It is a size container (`cqh` below is this box's height), which
    // is safe because its height is set by the layout above it, never by content.
    <div className="[container-type:size] h-full min-h-0 overflow-y-auto bg-[var(--color-brand-bg)]">
      <BrandingReminderDialog />
      <div className="mx-auto grid max-w-[1180px] grid-cols-1 gap-5 px-4 py-5 @2xl:gap-6 @2xl:px-6 @2xl:py-6 @4xl:grid-cols-[minmax(0,720px)_minmax(320px,1fr)] @4xl:items-start @4xl:px-8">
        {/* Left — the link, then the passcode, then the preferences behind
            them both. Natural height: the tab scrolls it, this column does not. */}
        <div className="flex min-w-0 flex-col">
          <section className="@container flex shrink-0 flex-col overflow-hidden rounded-xl border border-[var(--color-brand-border)] bg-white">
            <div className="flex items-center gap-3 border-b border-[#ECE5D8] px-4 py-4">
              <span
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px]"
                style={{ background: "var(--color-brand-navy-soft)", color: "var(--color-brand-navy)" }}
              >
                <IconScanFace size={19} />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="flex items-center gap-1.5 text-[15.5px] font-bold tracking-tight text-[var(--color-brand-ink)]">
                  Guest gallery link
                  <Tip text={access.tooltip} />
                </h3>
                <p className="mt-0.5 text-[13px] text-[var(--color-brand-body)]">One link for every guest.</p>
              </div>
            </div>

            <div className="flex flex-col p-4">
              {shareUrl ? (
                <>
                  <Label>Shared gallery URL</Label>
                  <UrlField url={shareUrl} />
                  <div className="mt-2.5 flex items-start gap-2 text-[13px] text-[var(--color-brand-body)]">
                    <IconShieldCheck size={15} className="mt-[1px] shrink-0 text-[var(--color-brand-success)]" />
                    {/* What a Guest can see without the passcode genuinely
                        differs, so the words come from describeGuestAccess,
                        the same source the passcode card and Guests panel use. */}
                    <span>{access.summary}</span>
                  </div>

                  {/* Compact message actions (3/4) beside a QR visibility panel
                      (1/4), once THIS CARD is wide enough (@xl, ≥ 576px) for the
                      QR panel to hold its button. Stacked below that — message
                      first, then the QR. */}
                  <div className="mt-4 grid grid-cols-1 gap-4 border-t border-[#ECE5D8] pt-4 @xl:grid-cols-[3fr_1fr]">
                    <Dispatch key={`${shareUrl}|${lang}`} eventName={eventName} message={message} lang={lang} onLangChange={setLang} />
                    <QrPanel
                      qrUniqueId={qrUniqueId}
                      qrImageUrl={qrImageUrl}
                      eventName={eventName}
                      eventDate={meta.eventDate}
                      coverUrl={meta.backgroundImage}
                    />
                  </div>
                </>
              ) : (
                <div className="flex items-start gap-2.5 rounded-lg border border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] px-3.5 py-3 text-[12.5px] text-[var(--color-brand-muted)]">
                  <IconInfo size={15} className="mt-px shrink-0" />
                  <span>The shared link appears here once the event is fully set up. Try reopening this event.</span>
                </div>
              )}
            </div>
          </section>

          <PasscodeCard
            passcode={familyPasscode ?? ""}
            onRegenerate={onRegenerate}
            description={access.passcode}
            eventName={eventName}
            shareUrl={shareUrl || null}
            lang={lang}
          />
          <PreferencesCard
            onOpen={() => setPrefsOpen(true)}
            prefs={prefs}
            studioProfileOn={studioProfileOn}
            requiredVisitLabel={requiredVisitLabel}
            reviewsEnabledGlobally={company?.google_review_enabled !== false}
          />
          <GuestTeamsCard key={JSON.stringify(savedTeams)} saved={savedTeams} eventType={meta.type} />
        </div>

        {/* Right — the couple's missing numbers (when there are any), then the
            guest list, level filter, export, and each Guest's access. In the
            wide layout it sticks (top 1.5rem, the grid's own padding) and is
            no taller than the tab (100cqh less the padding above and below):
            the couple card keeps its size and the Guest list takes what is
            left, scrolling inside itself. */}
        <div className="flex min-w-0 flex-col gap-4 @4xl:sticky @4xl:top-6 @4xl:max-h-[calc(100cqh-3rem)]">
          {coupleSlots.length > 0 && (
            <CoupleContactsCard slots={coupleSlots} onAdded={() => setGuestsVersion((v) => v + 1)} />
          )}
          <GuestsPanel bookingId={bookingId} fullAccessRedundant={fullAccessRedundant} reloadKey={guestsVersion} note={access.guestsNote} />
        </div>
      </div>

      {/* Every per-event Guest setting, in the tab that is about Guests.
          Event-scoped, so saving here changes what every Guest sees at once —
          already-delivered galleries included. */}
      <DeliveryPreferencesModal
        open={prefsOpen}
        onClose={() => setPrefsOpen(false)}
        eventName={eventName}
        saved={meta.deliveryPreferences ?? DELIVERY_PREFERENCE_DEFAULTS}
        onSave={saveDeliveryPreferences}
        toast={toast}
        surface="access"
        context={{
          archiveTiers,
          requiredVisitLabel,
          googleReviewEnabledGlobally: company?.google_review_enabled !== false,
          hasPublicFolderWithMedia: hasPublicPhotos,
        }}
        // "Show your studio profile" lives here now, moved from Gallery
        // design: it decides what a Guest sees (the Studio's name, logo,
        // links, review button — and so whether the required visit can be
        // asked at all), which is what this modal is for.
        studioProfile={{ saved: studioProfileOn, visitLabelWhenShown }}
      />
    </div>
  );
}

/* ── guest list panel ───────────────────────────────────────────── */

type GuestFilter = "all" | GuestAccessLevel;

const FILTERS: ReadonlyArray<{ value: GuestFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "client", label: "Clients" },
  { value: "host", label: "Hosts" },
  { value: "guest", label: "Guests" },
];

/** Three different empty states: nobody yet (EMPTY_LABEL, per filter), nobody
 *  matches a search (the search line below), and the filter has no one. */
const EMPTY_LABEL: Record<GuestFilter, string> = {
  all: "No guests yet. They appear here once they open your gallery link.",
  client: "No Clients yet. Open a guest's menu to mark them as a Client.",
  host: "No Hosts yet. Anyone who enters the passcode, or whom you give full access, appears here.",
  guest: "No guests without full access yet.",
};

const FILTER_NOUN: Record<GuestFilter, string> = { all: "guests", client: "Clients", host: "Hosts", guest: "guests without full access" };

function GuestsPanel({
  bookingId,
  fullAccessRedundant,
  reloadKey,
  note,
}: {
  bookingId: string;
  /** Changing it reloads the list (after the couple's numbers are added). */
  reloadKey: number;
  /** The quiet line about what Guests can see, from describeGuestAccess. */
  note: string;
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getAllGuests(bookingId, { guestType: filter === "all" ? undefined : filter });
      // Already in this order from the server; sorted again here so the list
      // and every later local re-sort go through one comparator.
      setGuests(sortGuestsForList(res.guests ?? []));
      setEditorCap(res.collections ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load guests");
    } finally {
      setLoading(false);
    }
    // reloadKey is a trigger only: a new value means "the list changed".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId, filter, reloadKey]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-then-setState is the documented React pattern for effects
    void load();
  }, [load]);

  /**
   * A row's level changed. The level filters are SERVER-side and mutually
   * exclusive, so a row that just crossed a line no longer belongs in a scoped
   * list — drop it rather than leave a "Host" sitting under the Guests filter.
   * Under "All" it stays and is re-sorted at once, which is what makes a Guest
   * marked as Client jump to the top (and a removed Client drop back into
   * place) without a reload.
   */
  const handleAccessChanged = (guestId: string, updated: Guest) => {
    setGuests((prev) => {
      if (!prev) return prev;
      const stillBelongs = filter === "all" || levelOf(updated) === filter;
      if (!stillBelongs) return prev.filter((g) => g._id !== guestId);
      return sortGuestsForList(prev.map((g) => (g._id === guestId ? { ...g, ...updated } : g)));
    });
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

  // Search narrows what the level filter already loaded, in the browser: the
  // whole list is one unpaginated response, so there is nothing to ask the
  // server for. The order is untouched.
  const query = search.trim();
  const visibleGuests = useMemo(
    () => (guests ? guests.filter((g) => guestMatchesQuery(g, query)) : guests),
    [guests, query],
  );

  // Clients always lead the list (see compareGuestsForList), so under "All"
  // the first non-Client row is where everyone else begins. The divider is
  // shown only when BOTH groups have rows; a list of one kind needs no label.
  // Read off the rows on screen, so a search that leaves only Guests (or only
  // Clients) drops it too.
  const firstOtherIndex =
    filter === "all" && visibleGuests ? visibleGuests.findIndex((g) => levelOf(g) !== "client") : -1;
  const showDivider = firstOtherIndex > 0;

  return (
    // In the wide layout this takes the room the sticky right column leaves
    // (see the parent) and the row list below is the only part that scrolls.
    <section className="flex flex-col overflow-hidden rounded-xl border border-[var(--color-brand-border)] bg-white @4xl:min-h-0 @4xl:flex-1">
      <div className="flex items-start gap-3 border-b border-[#ECE5D8] px-4 py-4">
        <span
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px]"
          style={{ background: "var(--color-brand-navy-soft)", color: "var(--color-brand-navy)" }}
        >
          <IconUsers size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15.5px] font-bold tracking-tight text-[var(--color-brand-ink)]">
            Guests
            {!loading && !error && guests && (
              <span className="font-semibold tabular-nums text-[var(--color-brand-muted)]"> · {guests.length.toLocaleString("en-IN")}</span>
            )}
          </h3>
          <p className="mt-0.5 text-[13px] text-[var(--color-brand-body)]">Everyone who opened the link, plus Clients you added.</p>
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting || loading || (guests?.length ?? 0) === 0}
          title="Export guest list as CSV"
          className="brand-focus inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--color-brand-border)] bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <IconDownload size={13} />
          {exporting ? "Exporting…" : "Export"}
        </button>
      </div>

      <div className="border-b border-[#ECE5D8] px-4 py-2.5">
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
            className="brand-focus h-9 w-full rounded-lg border border-[var(--color-brand-border)] bg-white pl-9 pr-8 text-[13px] text-[var(--color-brand-ink)] outline-none placeholder:text-[var(--color-brand-muted)]/70"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="brand-focus absolute inset-y-0 right-1.5 my-auto flex h-6 w-6 items-center justify-center rounded-full text-[var(--color-brand-muted)] hover:bg-[var(--color-brand-border)]"
            >
              <IconX size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Four pills. On the narrowest phones they scroll sideways inside this
          strip rather than wrapping or pushing the page wider. */}
      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-[#ECE5D8] px-4 py-2.5">
        {FILTERS.map((f) => (
          <FilterPill key={f.value} active={filter === f.value} onClick={() => setFilter(f.value)}>
            {f.label}
          </FilterPill>
        ))}
      </div>

      {/* Why the menus are shorter than usual, said once for the whole list. */}
      <p className="border-b border-[#ECE5D8] bg-[var(--color-brand-bg)] px-4 py-2 text-[12px] leading-relaxed text-[var(--color-brand-muted)]">
        {note}
      </p>

      {exportError && (
        <div className="border-b border-[#ECE5D8] bg-[var(--color-brand-warning-soft)] px-4 py-2 text-[12px] text-[var(--color-brand-warning)]">
          {exportError}
        </div>
      )}

      {/* Capped when stacked (a "consistent height" rather than growing to fit
          every guest); in the wide layout it fills whatever room is left in the
          panel instead, since the panel itself is bound to the tab's height. */}
      <div className="min-h-0 max-h-[50vh] flex-1 overflow-y-auto @4xl:max-h-none">
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
        {!loading && !error && (guests?.length ?? 0) === 0 && (
          <div className="px-4 py-8 text-center text-[13px] text-[var(--color-brand-body)]">
            {EMPTY_LABEL[filter]}
          </div>
        )}
        {!loading && !error && (guests?.length ?? 0) > 0 && (visibleGuests?.length ?? 0) === 0 && (
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
                  Guests
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

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`brand-focus shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors ${active
          ? "border-[var(--color-brand-navy)] bg-[var(--color-brand-navy)] text-white"
          : "border-[var(--color-brand-border)] bg-white text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)]"
        }`}
    >
      {children}
    </button>
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
  /** The change picked from the menu, awaiting its confirm. */
  const [pending, setPending] = useState<GuestAccessAction | null>(null);
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
      setPending(null);
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
      if (e instanceof ApiError && e.status === 404) {
        setPending(null);
        onStale();
      }
    } finally {
      setBusy(false);
    }
  };

  const confirm = pending ? confirmCopyFor(pending, level, who, givenByStudio) : null;
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
          <p className="truncate text-[12px] text-[var(--color-brand-muted)]">{contact}</p>
          {/* Where this level came from. Quiet on purpose: it only matters when
              you are about to change it, and the badge above already says what
              they are. */}
          {level === "client" && (
            <p className="truncate text-[11px] text-[var(--color-brand-muted)]">
              Client{clientRole ? ` · ${clientRole}` : ""} ·{" "}
              {guest.client_source === "event_setup" ? "added by you" : "marked by you"}
            </p>
          )}
          {level === "host" && (
            <p className="truncate text-[11px] text-[var(--color-brand-muted)]">
              Full access · {fullAccessSourceLabel(guest.full_access_source)}
            </p>
          )}
          {editorLine(guest) && <p className="truncate text-[11px] text-[var(--color-brand-muted)]">{editorLine(guest)}</p>}
          {/* Someone the Studio added at event setup who has not signed in. */}
          {guest.invite_pending === true && (
            <p className="truncate text-[11px] text-[var(--color-brand-muted)]">Has not opened the gallery yet</p>
          )}
        </div>
        {/* Always visible, never a hover-only reveal: this list is used on
            phones. */}
        <GuestAccessMenu
          name={who.label}
          actions={menuItems}
          disabled={busy}
          onSelect={(item) => {
            if (item.key === "allow_editing" || item.key === "stop_editing") void applyEditor(item.key === "allow_editing");
            else setPending(actions.find((a) => a.key === item.key) ?? null);
          }}
        />
      </div>

      {pending && confirm && (
        <ConfirmBar
          tone={confirm.tone}
          busy={busy}
          confirmLabel={confirm.confirmLabel}
          onConfirm={() => void apply(pending)}
          onCancel={() => setPending(null)}
        >
          {confirm.sentence}
        </ConfirmBar>
      )}
      {error && <p className="text-[11.5px] text-[var(--color-brand-danger)]">{error}</p>}
    </div>
  );
}

const MENU_WIDTH = 240;
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
  onSelect,
}: {
  /** Who the menu is about, for the button's accessible name. */
  name: string;
  actions: MenuItem[];
  disabled?: boolean;
  onSelect: (action: MenuItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();

  const close = useCallback(() => {
    setOpen(false);
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
    const width = Math.min(MENU_WIDTH, window.innerWidth - MENU_MARGIN * 2);
    menu.style.width = `${width}px`;
    const left = Math.min(Math.max(MENU_MARGIN, button.right - width), window.innerWidth - width - MENU_MARGIN);
    const height = menu.offsetHeight;
    const below = button.bottom + MENU_OFFSET;
    const fitsBelow = below + height <= window.innerHeight - MENU_MARGIN;
    const top = fitsBelow ? below : Math.max(MENU_MARGIN, button.top - MENU_OFFSET - height);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.visibility = "visible";
    itemRefs.current[0]?.focus({ preventScroll: true });
  }, [open]);

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
        e.stopPropagation();
        close();
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
  }, [open, close]);

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
        className="brand-focus flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--color-brand-muted)] hover:bg-[var(--color-brand-hover)] hover:text-[var(--color-brand-ink)] disabled:opacity-50"
      >
        <IconDotsVertical size={16} />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={`Access options for ${name}`}
            // Hidden until the layout effect above has measured and placed it,
            // so it never flashes at the top-left corner first.
            style={{ visibility: "hidden", top: 0, left: 0 }}
            className="fixed z-[60] overflow-hidden rounded-lg border border-[var(--color-brand-border)] bg-white p-1 shadow-[0_14px_44px_rgba(42,34,24,0.18)]"
          >
            {actions.map((action, index) => (
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
                  close();
                  onSelect(action);
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

/** The inline confirm every access change shares — same shape, two palettes. */
function ConfirmBar({
  tone,
  busy,
  confirmLabel,
  onConfirm,
  onCancel,
  children,
}: {
  tone: "warning" | "neutral";
  busy: boolean;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  const warning = tone === "warning";
  return (
    <div
      className={`flex flex-wrap items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11.5px] ${
        warning
          ? "border-[#F0D9B5] bg-[var(--color-brand-warning-soft)] text-[var(--color-brand-warning)]"
          : "border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] text-[var(--color-brand-ink)]"
      }`}
    >
      {children}
      <button
        type="button"
        disabled={busy}
        onClick={onConfirm}
        className="brand-focus rounded-md bg-[var(--color-brand-navy)] px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-[var(--color-brand-navy-deep)] disabled:opacity-60"
      >
        {busy ? "Working…" : confirmLabel}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={onCancel}
        className="brand-focus text-[11px] font-semibold text-[var(--color-brand-muted)] hover:text-[var(--color-brand-ink)] disabled:opacity-60"
      >
        Cancel
      </button>
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
      {level === "client" ? "Client" : level === "host" ? "Host" : "Guest"}
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
function hasPublicFolderWithPhotos(
  folders: CustomFolder[],
  folderCounts: Record<string, number>,
): boolean {
  return folders.some((f) => f.visibility === "public" && (folderCounts[f._id] ?? 0) > 0);
}

/**
 * The Gallery preferences card: a summary of what Guests can do, and the way
 * into the modal that changes it.
 *
 * The modal itself used to be a bare gear icon on the Media tab, next to the
 * uploader — a tab about FILES, holding the controls for what Guests may do
 * with them. Face search and the required visit each had a card of their own
 * here besides, so one question ("what does a Guest get?") had three answers in
 * two places. All of it is one modal now, opened from here.
 *
 * The summary earns the card its space: the common case is a studio checking
 * the settings rather than changing them, and that no longer costs a click.
 */
function PreferencesCard({
  onOpen,
  prefs,
  studioProfileOn,
  requiredVisitLabel,
  reviewsEnabledGlobally,
}: {
  onOpen: () => void;
  prefs: DeliveryPreferences;
  /** The saved `include_company_branding`, read `=== true` like the gallery. */
  studioProfileOn: boolean;
  /** Present only when this event has a live required-visit gate. */
  requiredVisitLabel?: string;
  /** The company-wide review switch — off overrides this event's own value, so
   *  the chip must show the EFFECTIVE state, not the stored one. */
  reviewsEnabledGlobally: boolean;
}) {
  const chips: { label: string; on: boolean }[] = [
    { label: "Studio profile", on: studioProfileOn },
    { label: "Face search", on: prefs.face_search_enabled },
    // The EFFECTIVE state, like Reviews: the filter needs face search.
    { label: "Face filter", on: prefs.face_search_enabled && prefs.face_filter_enabled },
    { label: "Downloads", on: prefs.allow_download },
    { label: "Reviews", on: prefs.show_google_review && reviewsEnabledGlobally },
    ...(requiredVisitLabel
      ? [{ label: requiredVisitLabel, on: prefs.require_social_visit }]
      : []),
  ];

  return (
    <section className="mt-4 flex shrink-0 flex-col overflow-hidden rounded-xl border border-[var(--color-brand-border)] bg-white">
      {/* Wraps to two lines on a narrow phone rather than squeezing the button
          to an unreadable sliver — the button keeps its full label. */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-4">
        <span
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px]"
          style={{ background: "var(--color-brand-navy-soft)", color: "var(--color-brand-navy)" }}
        >
          <IconGear size={18} />
        </span>
        <div className="min-w-[160px] flex-1">
          <h3 className="text-[15.5px] font-bold tracking-tight text-[var(--color-brand-ink)]">
            Gallery preferences
          </h3>
          <p className="mt-0.5 text-[13px] text-[var(--color-brand-body)]">What guests can do in this gallery.</p>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="brand-focus inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--color-brand-border)] bg-white px-3 text-[12.5px] font-semibold text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)]"
        >
          <IconGear size={14} />
          Manage
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5 border-t border-[#ECE5D8] px-4 py-3">
        {chips.map((c) => (
          <StateChip key={c.label} label={c.label} on={c.on} />
        ))}
      </div>
    </section>
  );
}

/** One setting's state, at a glance. On is the filled brand chip, off is a
 *  plain grey outline, so the two read differently even without colour; the
 *  word "On" / "Off" carries the meaning for anyone who can't tell them apart. */
function StateChip({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold ${
        on
          ? "border-transparent bg-[var(--color-brand-navy-soft)] text-[var(--color-brand-navy-deep)]"
          : "border-[var(--color-brand-border)] bg-transparent text-[var(--color-brand-muted)]"
      }`}
    >
      {label}
      <span className={on ? "opacity-80" : "font-medium"}>{on ? "On" : "Off"}</span>
    </span>
  );
}

function PasscodeCard({
  passcode,
  onRegenerate,
  description,
  eventName,
  shareUrl,
  lang,
}: {
  passcode: string;
  onRegenerate: () => Promise<string>;
  /** What the passcode does for this gallery, from describeGuestAccess. */
  description: string;
  eventName: string;
  /** The gallery link, put after the passcode in the WhatsApp message. */
  shareUrl: string | null;
  lang: ShareLang;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function regenerate() {
    setBusy(true);
    try {
      // The parent owns the passcode and re-renders this card with the new prop.
      await onRegenerate();
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-4 flex shrink-0 flex-col overflow-hidden rounded-xl border border-[var(--color-brand-border)] bg-white">
      <div className="flex items-center gap-3 border-b border-[#ECE5D8] px-4 py-4">
        <span
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px]"
          style={{ background: "var(--color-brand-navy-soft)", color: "var(--color-brand-navy)" }}
        >
          <IconLock size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-1.5 text-[15.5px] font-bold tracking-tight text-[var(--color-brand-ink)]">
            Master passcode
            <Tip text="Share this privately with the couple and close family. They enter it in the gallery to unlock every photo in every folder." />
          </h3>
          <p className="mt-0.5 text-[13px] text-[var(--color-brand-body)]">{description}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 p-4">
        <div className="inline-flex items-center gap-2.5 rounded-lg border border-[var(--color-brand-border)] bg-white px-3.5 py-2">
          <IconLock size={14} className="text-[var(--color-brand-navy)]" />
          <span className="font-mono text-[17px] font-bold tabular-nums tracking-[0.2em] text-[var(--color-brand-ink)]">
            {passcode || "······"}
          </span>
        </div>

        <button
          type="button"
          disabled={!passcode}
          onClick={() => {
            void navigator.clipboard?.writeText(passcode);
            trackEvent("passcode_shared", { channel: "copy" });
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          }}
          className="brand-focus inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-brand-border)] bg-white px-3 py-2 text-[12.5px] font-semibold text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)] disabled:opacity-50"
        >
          {copied ? <IconCheck size={14} className="text-[var(--color-brand-success)]" /> : <IconCopy size={14} />}
          {copied ? "Copied" : "Copy"}
        </button>

        <button
          type="button"
          disabled={!passcode}
          onClick={() => {
            trackEvent("passcode_shared", { channel: "whatsapp", language: lang });
            window.open(
              `https://wa.me/?text=${encodeURIComponent(passcodeShareMessage({ passcode, eventName, url: shareUrl, lang }))}`,
              "_blank",
              "noopener",
            );
          }}
          className="brand-focus inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-semibold text-white disabled:opacity-50"
          style={{ background: "#1FA855" }}
        >
          <IconWhatsApp size={15} />
          Send to family on WhatsApp
        </button>

        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="brand-focus inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-brand-border)] bg-white px-3 py-2 text-[12.5px] font-semibold text-[var(--color-brand-muted)] hover:border-[var(--color-brand-outline)] hover:text-[var(--color-brand-ink)]"
          >
            <IconRefresh size={13} /> Regenerate
          </button>
        ) : (
          <span className="inline-flex flex-wrap items-center gap-2 rounded-lg border border-[#F0D9B5] bg-[var(--color-brand-warning-soft)] px-3 py-1.5 text-[12.5px] text-[var(--color-brand-warning)]">
            Make a new passcode? {REGENERATE_PASSCODE_CONFIRM}
            <button
              type="button"
              disabled={busy}
              onClick={regenerate}
              className="brand-focus inline-flex items-center gap-1.5 rounded-md bg-[var(--color-brand-navy)] px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-[var(--color-brand-navy-deep)] disabled:opacity-60"
            >
              {busy ? "Working…" : "Confirm"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirming(false)}
              className="brand-focus text-[12px] font-semibold text-[var(--color-brand-muted)] hover:text-[var(--color-brand-ink)] disabled:opacity-60"
            >
              Cancel
            </button>
          </span>
        )}
      </div>
    </section>
  );
}

function UrlField({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-stretch overflow-hidden rounded-lg border border-[var(--color-brand-border)] bg-white">
      <div className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5">
        <IconLink size={14} className="shrink-0 text-[var(--color-brand-navy)]" />
        <span className="truncate font-mono text-[12.5px] text-[var(--color-brand-ink)]">{url}</span>
      </div>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(url);
          trackEvent("gallery_link_copied", { location: "access_tab" });
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        }}
        className="inline-flex shrink-0 items-center gap-1.5 border-l border-[var(--color-brand-border)] px-3.5 text-[12.5px] font-semibold"
        style={{
          background: copied ? "var(--color-brand-success-soft)" : "var(--color-brand-bg)",
          color: copied ? "var(--color-brand-success)" : "var(--color-brand-ink)",
        }}
      >
        {copied ? <IconCheck size={15} /> : <IconCopy size={14} />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function Dispatch({
  eventName,
  message,
  lang,
  onLangChange,
}: {
  eventName: string;
  message: string;
  lang: ShareLang;
  onLangChange: (lang: ShareLang) => void;
}) {
  // Seeded once from `message`; the parent remounts this via `key` if the
  // canonical message changes (a new share URL, or a new language, which
  // replaces any edits: a different language is a different message).
  const [text, setText] = useState(message);
  const [copied, setCopied] = useState(false);
  const langId = useId();

  const openWhatsApp = () => {
    trackEvent("invite_shared", { channel: "whatsapp", language: lang });
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  };
  const openEmail = () => {
    trackEvent("invite_shared", { channel: "email", language: lang });
    const subject = `Your photos from ${eventName} are ready`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
  };
  const copy = () => {
    void navigator.clipboard?.writeText(text);
    trackEvent("invite_shared", { channel: "copy", language: lang });
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <Label tip="This text is pre-loaded into WhatsApp or email when you send it.">Message to guests</Label>
        <button
          type="button"
          onClick={() => setText(message)}
          className="brand-focus inline-flex items-center gap-1 rounded text-[12px] font-semibold text-[var(--color-brand-muted)] hover:text-[var(--color-brand-ink)]"
        >
          Reset to default
        </button>
      </div>
      <div className="mb-2 flex items-center gap-2">
        <label htmlFor={langId} className="shrink-0 text-[12px] font-medium text-[var(--color-brand-body)]">
          Message language
        </label>
        <span className="relative min-w-0 max-w-[220px]">
          <select
            id={langId}
            value={lang}
            onChange={(e) => onLangChange(e.target.value as ShareLang)}
            className="brand-focus h-8 w-full min-w-0 cursor-pointer appearance-none truncate rounded-lg border border-[var(--color-brand-border)] bg-white pl-2.5 pr-8 text-[12.5px] text-[var(--color-brand-ink)]"
          >
            {SHARE_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-[var(--color-brand-muted)]">
            <IconCaretDown size={12} />
          </span>
        </span>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        aria-label="Message to guests"
        className="brand-focus block w-full resize-none rounded-lg border border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] px-3 py-2.5 font-[inherit] text-[13px] leading-relaxed text-[var(--color-brand-ink)] outline-none"
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={openWhatsApp}
          className="brand-focus inline-flex h-10 items-center justify-center gap-1.5 rounded-lg px-3.5 text-[12.5px] font-semibold text-white transition-colors"
          style={{ background: "#1FA855" }}
        >
          <IconWhatsApp size={16} />
          WhatsApp
        </button>
        <button
          type="button"
          onClick={openEmail}
          className="brand-focus inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border px-3.5 text-[12.5px] font-semibold transition-colors hover:bg-[var(--color-brand-navy-soft)]"
          style={{ borderColor: "var(--color-brand-navy)", color: "var(--color-brand-navy)" }}
        >
          <IconMail size={15} />
          Email
        </button>
        <button
          type="button"
          onClick={copy}
          className="brand-focus inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-[var(--color-brand-border)] bg-white px-3.5 text-[12.5px] font-semibold text-[var(--color-brand-ink)] transition-colors hover:border-[var(--color-brand-outline)]"
        >
          {copied ? <IconCheck size={15} className="text-[var(--color-brand-success)]" /> : <IconCopy size={15} />}
          {copied ? "Copied" : "Copy message"}
        </button>
      </div>
    </div>
  );
}

/**
 * QR visibility panel (1/4 of the message row). Linked → thumbnail + a single
 * Download (public `qr_image_url`, no proxy). Unlinked → one "Link QR" CTA
 * that navigates to the Reusable QR tab. Deliberately NO relink/change control
 * here — relinking lives exclusively on that tab (single-CTA rule).
 */
function QrPanel({
  qrUniqueId,
  qrImageUrl,
  eventName,
  eventDate,
  coverUrl,
}: {
  qrUniqueId?: string;
  qrImageUrl?: string;
  eventName: string;
  /** The event's date (epoch ms), for the standee. */
  eventDate?: number | null;
  /** The event cover, for the standee's photo design. */
  coverUrl?: string;
}) {
  const router = useRouter();
  const company = useCompany();
  const [downloading, setDownloading] = useState(false);
  const [standeeBusy, setStandeeBusy] = useState(false);
  const [standeeError, setStandeeError] = useState<string | null>(null);
  // A QR's identity (unique_id) is the "is one linked?" signal; the image URL
  // is how we render it. The backend always sets both together on linking.
  const assigned = Boolean(qrUniqueId) && Boolean(qrImageUrl);

  async function download() {
    if (!qrImageUrl) return;
    setDownloading(true);
    try {
      const slug = eventName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "event";
      await downloadImage(qrImageUrl, `qr-${slug}.png`);
      trackEvent("qr_downloaded", { format: "png" });
    } catch {
      /* best-effort download; the public URL is also visible on the QR tab */
    } finally {
      setDownloading(false);
    }
  }

  async function downloadStandee() {
    if (!qrImageUrl || standeeBusy) return;
    setStandeeBusy(true);
    setStandeeError(null);
    try {
      // The file builder (pptxgenjs) is loaded only now, on the click.
      const { downloadStandeeDesigns } = await import("@/lib/standee-download");
      await downloadStandeeDesigns({
        studioName: company?.name ?? "",
        eventName,
        eventDate,
        logoUrl: company?.logo,
        logoLightUrl: company?.logo_light,
        qrImageUrl,
        coverUrl,
      });
      trackEvent("qr_downloaded", { format: "pptx" });
    } catch (e) {
      setStandeeError(e instanceof Error ? e.message : "We couldn't build the standee designs. Try again.");
    } finally {
      setStandeeBusy(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col">
      <Label tip="A reusable QR is a printed code you generate once and point at whichever event is live. Link one to this event on the Reusable QR page.">
        Event QR
      </Label>
      {assigned ? (
        <div className="mt-1.5 flex flex-1 flex-col items-center justify-center gap-2.5 rounded-lg border border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrImageUrl} alt="Event QR code" className="h-24 w-24 rounded-md bg-white object-contain p-1" />
          <button
            type="button"
            onClick={() => void download()}
            disabled={downloading}
            className="brand-focus inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--color-brand-border)] bg-white px-3 text-[12.5px] font-semibold text-[var(--color-brand-ink)] transition-colors hover:border-[var(--color-brand-outline)] disabled:opacity-60"
          >
            {downloading ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-[2px] border-[var(--color-brand-border)] border-t-[var(--color-brand-navy)]" />
            ) : (
              <IconDownload size={14} />
            )}
            Download QR
          </button>
          <button
            type="button"
            onClick={() => void downloadStandee()}
            disabled={standeeBusy}
            title="Five editable PowerPoint designs, 2 by 5 feet, with this QR on them"
            className="brand-focus inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--color-brand-border)] bg-white px-3 py-1.5 text-center text-[12.5px] font-semibold leading-tight text-[var(--color-brand-ink)] transition-colors hover:border-[var(--color-brand-outline)] disabled:opacity-60"
          >
            {standeeBusy ? (
              <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-[2px] border-[var(--color-brand-border)] border-t-[var(--color-brand-navy)]" />
            ) : (
              <IconDownload size={14} className="shrink-0" />
            )}
            Download standee designs
          </button>
          {standeeError && (
            <p role="alert" className="text-[11.5px] leading-snug text-[var(--color-brand-danger)]">
              {standeeError}
            </p>
          )}
        </div>
      ) : (
        <div className="mt-1.5 flex flex-1 flex-col items-center justify-center gap-2.5 rounded-lg border border-dashed border-[var(--color-brand-outline)] bg-[var(--color-brand-bg)] p-3 text-center">
          <IconQrCode size={22} className="text-[var(--color-brand-outline)]" />
          <p className="text-[12px] leading-relaxed text-[var(--color-brand-body)]">
            No reusable QR is linked to this event. Link one and its code shows here to download and print.
          </p>
          <button
            type="button"
            onClick={() => router.push("/dashboard/reusable-qr")}
            className="brand-focus inline-flex h-9 w-full items-center justify-center rounded-lg bg-[var(--color-brand-navy)] px-3 text-[12.5px] font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)]"
          >
            Go to Reusable QR
          </button>
        </div>
      )}
    </div>
  );
}

function Label({ children, tip }: { children: React.ReactNode; tip?: string }) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-brand-muted)]">{children}</span>
      {tip && <Tip text={tip} />}
    </div>
  );
}
