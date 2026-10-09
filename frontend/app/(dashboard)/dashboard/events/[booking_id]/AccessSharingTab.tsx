"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ApiError, exportGuestsCsv, getAllGuests, setGuestAccessLevel } from "@/lib/api";
import { downloadImage } from "@/lib/media-actions";
import type { CustomFolder, Guest } from "@/lib/types";
import {
  accessActionsFor,
  fullAccessIsRedundant,
  levelOf,
  sortGuestsForList,
  type GuestAccessAction,
  type GuestAccessLevel,
} from "@/lib/guest-access";
import { Tip } from "@/components/ui/Tip";
import { useCompany } from "@/lib/useCompany";
import { galleryUrlFor } from "@/lib/gallery-url";
import {
  DELIVERY_PREFERENCE_DEFAULTS,
  normalizeDeliveryPreferences,
  type DeliveryPreferences,
} from "@/lib/delivery-preferences";
import { SOCIAL_PLATFORM_BY_KEY, isSocialPlatformKey } from "@/lib/social-platforms";
import { BrandingReminderDialog } from "./BrandingReminderDialog";
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
  IconShieldCheck,
  IconUsers,
  IconWhatsApp,
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
  const shareUrl = galleryUrlFor(company, uniqueIdentifier) ?? "";

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

  // Guests sign in with WhatsApp, not Google — the old message said Google, and
  // rewriting it for the switch is the moment to fix that too.
  const message = `Namaste! The photos from ${eventName} are ready. 🎉

${
    faceSearchOn
      ? "Open the gallery and sign in. Take a quick selfie to see every photo you're in:"
      : "Open the gallery and sign in to see them:"
  }
${shareUrl}`;

  return (
    // Breakpoints on this tab follow the width the TAB actually gets (a
    // container query on this box), not the viewport: the dashboard sidebar
    // takes a different share of the screen expanded vs collapsed, and a
    // viewport `lg` switched to two columns at widths where neither was usable.
    //
    // Narrow: the panels stack and this box scrolls as one region. Wide (@4xl,
    // ≥ 896px of tab): the left column and the guest panel each own a scroll
    // region bound to the tab's height, so this box has nothing left to scroll.
    <div className="@container h-full min-h-0 overflow-y-auto bg-[var(--color-brand-bg)]">
      <BrandingReminderDialog />
      <div className="mx-auto grid max-w-[1180px] grid-cols-1 gap-5 px-4 py-5 @2xl:gap-6 @2xl:px-6 @2xl:py-6 @4xl:h-full @4xl:min-h-0 @4xl:grid-cols-[minmax(0,720px)_minmax(320px,1fr)] @4xl:items-stretch @4xl:px-8">
        {/* Left — the link, then the passcode, then the preferences behind
            them both. Every card here is
            shrink-0: in the wide layout this column has a fixed height and
            scrolls, and a shrinkable card is squashed to fit instead, clipping
            its own contents behind overflow-hidden. */}
        <div className="flex flex-col @4xl:h-full @4xl:min-h-0 @4xl:overflow-y-auto @4xl:pr-1">
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
                  <Tip
                    text={
                      faceSearchOn
                        ? "One link for everyone. Guests sign in and can take a selfie to find their own photos. The family passcode unlocks the full gallery."
                        : "One link for everyone. Guests sign in and see your public folders. The family passcode unlocks the full gallery."
                    }
                  />
                </h3>
                <p className="mt-0.5 text-[12.5px] text-[var(--color-brand-muted)]">
                  Share this with the whole guest list — one link covers all photo access.
                </p>
              </div>
            </div>

            <div className="flex flex-col p-4">
              {shareUrl ? (
                <>
                  <Label>Shared gallery URL</Label>
                  <UrlField url={shareUrl} />
                  <div className="mt-2.5 flex items-center gap-2 text-[12.5px] text-[var(--color-brand-muted)]">
                    <IconShieldCheck size={15} className="shrink-0 text-[var(--color-brand-success)]" />
                    {/* Three states, because what a Guest can see without the
                        passcode genuinely differs: their own face matches, the
                        public folders, or (neither available) nothing at all. */}
                    <span>
                      {faceSearchOn
                        ? "Each Guest sees the photos they appear in and your public folders, until the passcode unlocks the rest."
                        : hasPublicPhotos
                          ? "Guests see your public folders until the passcode unlocks the rest."
                          : "Guests need the passcode to see any photos."}
                    </span>
                  </div>

                  {/* Compact message actions (3/4) beside a QR visibility panel
                      (1/4), once THIS CARD is wide enough (@xl, ≥ 576px) for the
                      QR panel to hold its button. Stacked below that — message
                      first, then the QR. */}
                  <div className="mt-4 grid grid-cols-1 gap-4 border-t border-[#ECE5D8] pt-4 @xl:grid-cols-[3fr_1fr]">
                    <Dispatch key={shareUrl} eventName={eventName} message={message} />
                    <QrPanel qrUniqueId={qrUniqueId} qrImageUrl={qrImageUrl} eventName={eventName} />
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

          <PasscodeCard passcode={familyPasscode ?? ""} onRegenerate={onRegenerate} />
          <PreferencesCard
            onOpen={() => setPrefsOpen(true)}
            prefs={prefs}
            studioProfileOn={studioProfileOn}
            requiredVisitLabel={requiredVisitLabel}
            reviewsEnabledGlobally={company?.google_review_enabled !== false}
          />
        </div>

        {/* Right — guest list, level filter, export, and each Guest's access. */}
        <GuestsPanel bookingId={bookingId} fullAccessRedundant={fullAccessRedundant} />
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

const EMPTY_LABEL: Record<GuestFilter, string> = {
  all: "No guests yet.",
  client: "No Clients yet.",
  host: "No Hosts yet.",
  guest: "No Guests yet.",
};

function GuestsPanel({
  bookingId,
  fullAccessRedundant,
}: {
  bookingId: string;
  /** Every photo is already public, so the full-access items are left out of
   *  each row's menu. See fullAccessIsRedundant. */
  fullAccessRedundant: boolean;
}) {
  const [guests, setGuests] = useState<Guest[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<GuestFilter>("all");
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load guests");
    } finally {
      setLoading(false);
    }
  }, [bookingId, filter]);

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
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  // Clients always lead the list (see compareGuestsForList), so under "All"
  // the first non-Client row is where everyone else begins. The divider is
  // shown only when BOTH groups have rows; a list of one kind needs no label.
  const firstOtherIndex = filter === "all" && guests ? guests.findIndex((g) => levelOf(g) !== "client") : -1;
  const showDivider = firstOtherIndex > 0;

  return (
    // Fills the grid cell's full height in the wide layout (stretched by the
    // parent grid) instead of growing with content — the row list below is the
    // only part that scrolls, so this box's on-screen height stays fixed.
    <section className="flex flex-col overflow-hidden rounded-xl border border-[var(--color-brand-border)] bg-white @4xl:h-full @4xl:min-h-0">
      <div className="flex items-center gap-3 border-b border-[#ECE5D8] px-4 py-4">
        <span
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px]"
          style={{ background: "var(--color-brand-navy-soft)", color: "var(--color-brand-navy)" }}
        >
          <IconUsers size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15.5px] font-bold tracking-tight text-[var(--color-brand-ink)]">Guests</h3>
          <p className="mt-0.5 text-[12.5px] text-[var(--color-brand-muted)]">
            Everyone who has opened the gallery link, plus the Clients you added.
          </p>
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
      {fullAccessRedundant && (
        <p className="border-b border-[#ECE5D8] bg-[var(--color-brand-bg)] px-4 py-2 text-[11.5px] leading-relaxed text-[var(--color-brand-muted)]">
          Every photo is in a public folder, so every Guest already sees the full gallery. Full access options are
          hidden.
        </p>
      )}

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
          <div className="px-4 py-8 text-center text-[12.5px] text-[var(--color-brand-muted)]">
            {EMPTY_LABEL[filter]}
          </div>
        )}
        {!loading &&
          !error &&
          guests?.map((g, index) => (
            <div key={g._id}>
              {showDivider && index === firstOtherIndex && (
                <div className="border-b border-[#F1ECE2] bg-[var(--color-brand-bg)] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-brand-muted)]">
                  Guests
                </div>
              )}
              <GuestRow
                guest={g}
                fullAccessRedundant={fullAccessRedundant}
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

/**
 * How to address a Guest in the confirm and toast copy: their first name, or
 * "this Guest" when there is nothing usable. "Guest" is the backend's default
 * name for someone who signed in with a phone number and never told us who they
 * are, so it reads as a placeholder rather than a name and is treated as one.
 */
function addressOf(name: string): { label: string; possessive: string; isNamed: boolean } {
  const first = name.trim().split(/\s+/)[0] ?? "";
  const isNamed = first.length > 0 && first.toLowerCase() !== "guest";
  return {
    label: isNamed ? first : "this Guest",
    possessive: isNamed ? `${first}'s` : "this Guest's",
    isNamed,
  };
}

/** "this Guest is now a Client" opens a toast, so it takes a capital. */
const sentenceStart = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const CLIENT_ROLE_LABEL: Record<string, string> = { bride: "Bride", groom: "Groom" };

/**
 * The confirm shown under a row for the change that was picked from its menu:
 * the sentence, its tone and the button's name. Giving is not a destructive
 * act, so it gets the neutral surface; anything that takes the full gallery
 * away keeps the warning one.
 */
function confirmCopyFor(
  action: GuestAccessAction,
  from: GuestAccessLevel,
  who: ReturnType<typeof addressOf>,
  givenByStudio: boolean,
): { tone: "warning" | "neutral"; sentence: string; confirmLabel: string } {
  if (action.to === "client") {
    return {
      tone: "neutral",
      sentence: `Mark ${who.label} as a Client? Clients always have the full gallery and keep it when the passcode changes.`,
      confirmLabel: "Mark as Client",
    };
  }
  if (action.to === "host") {
    return from === "client"
      ? {
          tone: "neutral",
          sentence: `Remove ${who.label} as a Client? They keep full access to the gallery.`,
          confirmLabel: "Remove Client",
        }
      : {
          tone: "neutral",
          sentence: `Give ${who.label} the full gallery? They will see every photo, the same as with the passcode.`,
          confirmLabel: "Give access",
        };
  }
  // To "guest". The sentence depends on what is being lost, and (for a Host)
  // on whether the passcode can undo it behind the Studio's back.
  if (from === "client") {
    return {
      tone: "warning",
      sentence: `Remove ${who.possessive} full access? They will also stop being a Client and go back to their own photos and public folders.`,
      confirmLabel: "Confirm",
    };
  }
  return {
    tone: "warning",
    sentence: givenByStudio
      ? `Remove ${who.possessive} full access? They will go back to their own photos and public folders.`
      : `Remove ${who.possessive} full access? They can unlock it again with the passcode. Regenerate the passcode if you need to keep them out.`,
    confirmLabel: "Confirm",
  };
}

function GuestRow({
  guest,
  fullAccessRedundant,
  onAccessChanged,
  onStale,
}: {
  guest: Guest;
  fullAccessRedundant: boolean;
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
  const contact = guest.email || guest.phone || "No contact info";
  // A Host promoted before the source was recorded can only have come in with
  // the passcode — it was the sole way in — so an absent value reads that way.
  const givenByStudio = guest.full_access_source === "studio";
  const who = addressOf(guest.name);
  const actions = accessActionsFor(level, { fullAccessRedundant });

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
        <Avatar name={guest.name} selfieUrl={guest.selfie_url} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[13.5px] font-semibold text-[var(--color-brand-ink)]">{guest.name}</span>
            <RoleBadge level={level} />
          </div>
          <p className="truncate text-[12px] text-[var(--color-brand-muted)]">{contact}</p>
          {/* Where this level came from. Quiet on purpose: it only matters when
              you are about to change it, and the badge above already says what
              they are. */}
          {level === "client" && (
            <p className="truncate text-[11px] text-[var(--color-brand-muted)]">
              Client{clientRole ? ` · ${clientRole}` : ""} ·{" "}
              {guest.client_source === "event_setup" ? "added at setup" : "marked by you"}
            </p>
          )}
          {level === "host" && (
            <p className="truncate text-[11px] text-[var(--color-brand-muted)]">
              Full access · {givenByStudio ? "given by you" : "passcode"}
            </p>
          )}
          {/* Someone the Studio added at event setup who has not signed in. */}
          {guest.invite_pending === true && (
            <p className="truncate text-[11px] text-[var(--color-brand-muted)]">Has not opened the gallery yet</p>
          )}
        </div>
        {/* Always visible, never a hover-only reveal: this list is used on
            phones. */}
        <GuestAccessMenu name={who.label} actions={actions} disabled={busy} onSelect={setPending} />
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
function GuestAccessMenu({
  name,
  actions,
  disabled,
  onSelect,
}: {
  /** Who the menu is about, for the button's accessible name. */
  name: string;
  actions: GuestAccessAction[];
  disabled?: boolean;
  onSelect: (action: GuestAccessAction) => void;
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
                onKeyDown={(e) => onItemKeyDown(e, index)}
                onClick={() => {
                  close();
                  onSelect(action);
                }}
                className={`brand-focus flex min-h-11 w-full flex-col justify-center rounded-md px-2.5 py-1.5 text-left ${
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
  const tone =
    level === "client"
      ? "bg-[var(--color-brand-navy)] text-white"
      : level === "host"
        ? "bg-[var(--color-brand-navy-soft)] text-[var(--color-brand-navy)]"
        : "bg-[#F2F0EB] text-[var(--color-brand-muted)]";
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-1.5 py-[1px] text-[10px] font-bold uppercase tracking-wide ${tone}`}
    >
      {level === "client" ? "Client" : level === "host" ? "Host" : "Guest"}
    </span>
  );
}

function Avatar({ name, selfieUrl }: { name: string; selfieUrl?: string | null }) {
  if (selfieUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={selfieUrl} alt={name} className="h-9 w-9 shrink-0 rounded-full object-cover" />;
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
          <p className="mt-0.5 text-[12.5px] text-[var(--color-brand-muted)]">
            What Guests can do in this gallery.
          </p>
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

/** One setting's state, at a glance. Never colour alone: the word "On"/"Off"
 *  carries the meaning for anyone who can't tell the two greens apart. */
function StateChip({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${
        on
          ? "bg-[var(--color-brand-navy-soft)] text-[var(--color-brand-navy)]"
          : "bg-[#F2F0EB] text-[var(--color-brand-muted)]"
      }`}
    >
      {label}
      <span className="opacity-70">{on ? "On" : "Off"}</span>
    </span>
  );
}

function PasscodeCard({
  passcode,
  onRegenerate,
}: {
  passcode: string;
  onRegenerate: () => Promise<string>;
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
            <Tip text="Share this privately with the couple / immediate family only. Entered inside the lounge, it unlocks the complete gallery (all folders, every photo)." />
          </h3>
          <p className="mt-0.5 text-[12.5px] text-[var(--color-brand-muted)]">
            Share separately — it unlocks the full gallery in-lounge.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 p-4">
        <div className="inline-flex items-center gap-2.5 rounded-lg border border-[var(--color-brand-border)] bg-white px-3.5 py-2">
          <IconLock size={14} className="text-[var(--color-brand-navy)]" />
          <span className="font-mono text-[17px] font-bold tabular-nums tracking-[0.2em] text-[var(--color-brand-ink)]">
            {passcode || "——————"}
          </span>
        </div>

        <button
          type="button"
          disabled={!passcode}
          onClick={() => {
            void navigator.clipboard?.writeText(passcode);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          }}
          className="brand-focus inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-brand-border)] bg-white px-3 py-2 text-[12.5px] font-semibold text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)] disabled:opacity-50"
        >
          {copied ? <IconCheck size={14} className="text-[var(--color-brand-success)]" /> : <IconCopy size={14} />}
          {copied ? "Copied" : "Copy"}
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
            Regenerate? The old code stops working and everyone who unlocked with it loses full access. Guests
            you gave access to keep it.
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

function Dispatch({ eventName, message }: { eventName: string; message: string }) {
  // Seeded once from `message`; the parent remounts this via `key` if the
  // canonical message changes (e.g. the share URL resolves late).
  const [text, setText] = useState(message);
  const [copied, setCopied] = useState(false);

  const openWhatsApp = () => window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  const openEmail = () => {
    const subject = `Your photos from ${eventName} are ready`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
  };
  const copy = () => {
    void navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-center justify-between">
        <Label tip="This text is pre-loaded into WhatsApp / email when you dispatch it.">Message to guests</Label>
        <button
          type="button"
          onClick={() => setText(message)}
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--color-brand-muted)] hover:text-[var(--color-brand-ink)]"
        >
          Reset
        </button>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        className="brand-focus block w-full resize-none rounded-lg border border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] px-3 py-2.5 font-[inherit] text-[12.5px] leading-relaxed text-[var(--color-brand-ink)] outline-none"
      />
      {/* Icon-only dispatch buttons — the label reveals on hover as a desktop
          nicety; title + aria-label are always set and tapping fires the action
          immediately, so touch / screen-reader users never depend on hover. */}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={openWhatsApp}
          title="Share on WhatsApp"
          aria-label="Share on WhatsApp"
          className="brand-focus group inline-flex h-10 items-center justify-center rounded-lg px-3 text-[12.5px] font-semibold text-white transition-colors"
          style={{ background: "#1FA855" }}
        >
          <IconWhatsApp size={16} />
          <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-150 group-hover:ml-1.5 group-hover:max-w-[90px] group-hover:opacity-100">
            WhatsApp
          </span>
        </button>
        <button
          type="button"
          onClick={openEmail}
          title="Share by email"
          aria-label="Share by email"
          className="brand-focus group inline-flex h-10 items-center justify-center rounded-lg border px-3 text-[12.5px] font-semibold transition-colors"
          style={{ borderColor: "var(--color-brand-navy)", color: "var(--color-brand-navy)" }}
        >
          <IconMail size={15} />
          <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-150 group-hover:ml-1.5 group-hover:max-w-[70px] group-hover:opacity-100">
            Email
          </span>
        </button>
        <button
          type="button"
          onClick={copy}
          title="Copy message"
          aria-label="Copy message"
          className="brand-focus inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-[var(--color-brand-border)] bg-white px-3 text-[12.5px] font-semibold text-[var(--color-brand-ink)] transition-colors hover:border-[var(--color-brand-outline)]"
        >
          {copied ? <IconCheck size={15} className="text-[var(--color-brand-success)]" /> : <IconCopy size={15} />}
          {copied ? "Copied" : "Copy"}
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
}: {
  qrUniqueId?: string;
  qrImageUrl?: string;
  eventName: string;
}) {
  const router = useRouter();
  const [downloading, setDownloading] = useState(false);
  // A QR's identity (unique_id) is the "is one linked?" signal; the image URL
  // is how we render it. The backend always sets both together on linking.
  const assigned = Boolean(qrUniqueId) && Boolean(qrImageUrl);

  async function download() {
    if (!qrImageUrl) return;
    setDownloading(true);
    try {
      const slug = eventName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "event";
      await downloadImage(qrImageUrl, `qr-${slug}.png`);
    } catch {
      /* best-effort download; the public URL is also visible on the QR tab */
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col">
      <Label tip="A reusable QR pointed at this event. Manage or re-point it from the Reusable QR tab.">
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
            Download
          </button>
        </div>
      ) : (
        <div className="mt-1.5 flex flex-1 flex-col items-center justify-center gap-2.5 rounded-lg border border-dashed border-[var(--color-brand-outline)] bg-[var(--color-brand-bg)] p-3 text-center">
          <IconQrCode size={22} className="text-[var(--color-brand-outline)]" />
          <p className="text-[11.5px] leading-relaxed text-[var(--color-brand-muted)]">
            No reusable QR points here yet.
          </p>
          <button
            type="button"
            onClick={() => router.push("/dashboard/reusable-qr")}
            className="brand-focus inline-flex h-9 w-full items-center justify-center rounded-lg bg-[var(--color-brand-navy)] px-3 text-[12.5px] font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)]"
          >
            Link QR
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
