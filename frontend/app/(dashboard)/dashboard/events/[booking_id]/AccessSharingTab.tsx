"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { exportGuestsCsv, getAllGuests, revokeGuestAccess } from "@/lib/api";
import { downloadImage } from "@/lib/media-actions";
import type { Guest } from "@/lib/types";
import { useCompany } from "@/lib/useCompany";
import { galleryUrlFor } from "@/lib/gallery-url";
import { normalizeDeliveryPreferences, type DeliveryPreferences } from "@/lib/delivery-preferences";
import { SOCIAL_PLATFORM_BY_KEY, isSocialPlatformKey } from "@/lib/social-platforms";
import { SocialChip } from "@/components/event/screens/lounge/SocialIcons";
import { BrandingReminderDialog } from "./BrandingReminderDialog";
import { DeliveryPreferencesPanel } from "./DeliveryPreferencesPanel";
import { useEvent } from "./EventContext";
import {
  IconCheck,
  IconCopy,
  IconDownload,
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

  const message = `Namaste! The photos from ${eventName} are ready. 🎉

Open the gallery, sign in with Google and take one quick selfie — you'll instantly see every photo you appear in:
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
        {/* Left — sharing link, passcode, required visit. Every card here is
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
                  <Tip text="One link for everyone. Guests sign in and take a selfie to find their own photos. The family passcode unlocks the full gallery from inside the lounge." />
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
                    <span>Each guest sees only the photos they appear in — until the passcode unlocks the rest.</span>
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
          <RequiredVisitCard />
        </div>

        {/* Right — guest list, host/guest filter, export, revoke access. */}
        <GuestsPanel bookingId={bookingId} />
      </div>
    </div>
  );
}

/* ── guest list panel ───────────────────────────────────────────── */

type GuestFilter = "all" | "host" | "guest";

function GuestsPanel({ bookingId }: { bookingId: string }) {
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
      setGuests(res.guests ?? []);
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

  const handleRevoked = (guestId: string, updated: Guest) => {
    setGuests((prev) => {
      if (!prev) return prev;
      // The host filter is server-side, so a just-revoked guest no longer
      // belongs in a "Host" scoped list — drop it instead of relabeling it.
      if (filter === "host") return prev.filter((g) => g._id !== guestId);
      return prev.map((g) => (g._id === guestId ? { ...g, ...updated } : g));
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
            Everyone who&apos;s opened the gallery link.
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

      <div className="flex items-center gap-1.5 border-b border-[#ECE5D8] px-4 py-2.5">
        <FilterPill active={filter === "all"} onClick={() => setFilter("all")}>
          All
        </FilterPill>
        <FilterPill active={filter === "host"} onClick={() => setFilter("host")}>
          Host
        </FilterPill>
        <FilterPill active={filter === "guest"} onClick={() => setFilter("guest")}>
          Guest
        </FilterPill>
      </div>

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
            {filter === "all" ? "No guests yet." : `No ${filter}s yet.`}
          </div>
        )}
        {!loading &&
          !error &&
          guests?.map((g) => <GuestRow key={g._id} guest={g} onRevoked={(updated) => handleRevoked(g._id, updated)} />)}
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
      className={`brand-focus rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors ${active
          ? "border-[var(--color-brand-navy)] bg-[var(--color-brand-navy)] text-white"
          : "border-[var(--color-brand-border)] bg-white text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)]"
        }`}
    >
      {children}
    </button>
  );
}

function GuestRow({ guest, onRevoked }: { guest: Guest; onRevoked: (updated: Guest) => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isHost = guest.guest_type === "host";
  const contact = guest.email || guest.phone || "No contact info";

  const revoke = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await revokeGuestAccess(guest._id);
      onRevoked(res.guest);
      setConfirming(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't revoke access");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 border-b border-[#F1ECE2] px-4 py-3 last:border-b-0">
      <div className="flex items-center gap-3">
        <Avatar name={guest.name} selfieUrl={guest.selfie_url} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[13.5px] font-semibold text-[var(--color-brand-ink)]">{guest.name}</span>
            <RoleBadge isHost={isHost} />
          </div>
          <p className="truncate text-[12px] text-[var(--color-brand-muted)]">{contact}</p>
        </div>
      </div>

      {isHost &&
        (!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="brand-focus self-start rounded-md border border-[var(--color-brand-border)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--color-brand-muted)] hover:border-[var(--color-brand-outline)] hover:text-[var(--color-brand-ink)]"
          >
            Remove full access
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[#F0D9B5] bg-[var(--color-brand-warning-soft)] px-2.5 py-1.5 text-[11.5px] text-[var(--color-brand-warning)]">
            Revoke {guest.name.split(" ")[0]}&apos;s full gallery access?
            <button
              type="button"
              disabled={busy}
              onClick={revoke}
              className="brand-focus rounded-md bg-[var(--color-brand-navy)] px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-[var(--color-brand-navy-deep)] disabled:opacity-60"
            >
              {busy ? "Working…" : "Confirm"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirming(false)}
              className="brand-focus text-[11px] font-semibold text-[var(--color-brand-muted)] hover:text-[var(--color-brand-ink)] disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        ))}
      {error && <p className="text-[11.5px] text-[var(--color-brand-danger)]">{error}</p>}
    </div>
  );
}

function RoleBadge({ isHost }: { isHost: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-1.5 py-[1px] text-[10px] font-bold uppercase tracking-wide ${isHost
          ? "bg-[var(--color-brand-navy-soft)] text-[var(--color-brand-navy)]"
          : "bg-[#F2F0EB] text-[var(--color-brand-muted)]"
        }`}
    >
      {isHost ? "Host" : "Guest"}
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
 * This event's off switch for the Studio's required visit link. The link itself
 * is chosen Studio-wide in Settings → Social Links; an event can only opt out of
 * it, never point somewhere else.
 *
 * Renders nothing unless there is a live gate to switch off: no required
 * platform, a platform whose link is gone, or an event that hides Studio
 * branding (the gallery never gates those — see resolveSocialVisitGate). An
 * off switch for something already off is noise, and there is nothing for the
 * Studio to do about it on this tab.
 *
 * Saves the moment it is toggled, with a toast. It is a single switch — the
 * control for an immediately-applied setting — and a Save button beside it
 * would leave a changed-but-unsaved state that is easy to navigate away from.
 */
function RequiredVisitCard() {
  const { meta, saveDeliveryPreferences, toast } = useEvent();
  const company = useCompany();
  // The value being saved, shown optimistically; null once the save settles and
  // `meta` (refreshed by the save) is the truth again.
  const [pending, setPending] = useState<DeliveryPreferences | null>(null);

  const platform = company?.mandatory_visit_platform;
  const spec = isSocialPlatformKey(platform) ? SOCIAL_PLATFORM_BY_KEY[platform] : null;
  const hasLink = !!(spec && company?.social_links?.[spec.key]?.trim());
  // `=== true`, as the guest gallery reads it.
  if (!spec || !hasLink || meta.includeBranding !== true) return null;

  const value = pending ?? normalizeDeliveryPreferences(meta.deliveryPreferences);

  async function change(next: DeliveryPreferences) {
    if (!spec) return;
    setPending(next);
    try {
      await saveDeliveryPreferences(next);
      toast(
        next.require_social_visit
          ? `Guests of this event will be asked to open ${spec.label}`
          : "Guests of this event go straight to their photos",
      );
    } catch (err) {
      // Reverts on its own: clearing `pending` shows the saved value again.
      toast(err instanceof Error ? err.message : "Couldn’t save — try again", "error");
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="mt-4 flex shrink-0 flex-col overflow-hidden rounded-xl border border-[var(--color-brand-border)] bg-white">
      <div className="flex items-center gap-3 border-b border-[#ECE5D8] px-4 py-4">
        <SocialChip platform={spec.key} size={36} />
        <div className="min-w-0 flex-1">
          <h3 className="text-[15.5px] font-bold tracking-tight text-[var(--color-brand-ink)]">Required visit</h3>
          <p className="mt-0.5 text-[12.5px] text-[var(--color-brand-muted)]">
            {spec.label} · set for all your galleries in Settings → Social Links.
          </p>
        </div>
      </div>
      <div className="p-4">
        <DeliveryPreferencesPanel
          value={value}
          onChange={(next) => void change(next)}
          disabled={pending !== null}
          context={{ archiveTiers: [], requiredVisitLabel: spec.label }}
          surface="access"
        />
      </div>
    </section>
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
            Regenerate? This invalidates the shared code.
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

const TIP_WIDTH = 250;
/** Room a tip needs below its icon before it flips above instead. */
const TIP_FLIP_AT = 120;

/**
 * Info tip. Rendered into <body> at a fixed, viewport-clamped position rather
 * than absolutely inside its card: on this tab every card sits in a scrolling
 * column (and the cards clip their own overflow), so an in-place tooltip was
 * cut off at those edges — and a centred 250px one ran off a phone screen.
 *
 * Opens on hover, keyboard focus, and tap. Its position is a snapshot of the
 * icon's, so it closes on any scroll or resize rather than drifting away.
 */
function Tip({ text }: { text: string }) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const tipId = useId();
  const [pos, setPos] = useState<{ top: number; left: number; width: number; above: boolean } | null>(null);

  const open = () => {
    const r = anchorRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(TIP_WIDTH, window.innerWidth - 16);
    const left = Math.min(Math.max(8, r.left + r.width / 2 - width / 2), window.innerWidth - width - 8);
    const above = r.bottom + TIP_FLIP_AT > window.innerHeight;
    setPos({ top: above ? r.top - 8 : r.bottom + 8, left, width, above });
  };
  const close = () => setPos(null);

  useEffect(() => {
    if (!pos) return;
    const dismiss = () => setPos(null);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [pos]);

  return (
    <span className="inline-flex items-center" onMouseEnter={open} onMouseLeave={close}>
      <button
        ref={anchorRef}
        type="button"
        aria-label="More info"
        aria-describedby={pos ? tipId : undefined}
        onFocus={open}
        onBlur={close}
        onClick={() => (pos ? close() : open())}
        className="brand-focus inline-flex cursor-help items-center rounded-full"
      >
        <IconInfo size={14} className="text-[#B5ADA4]" />
      </button>
      {pos &&
        createPortal(
          <span
            id={tipId}
            role="tooltip"
            className="pointer-events-none fixed z-[70] rounded-lg bg-[var(--color-brand-ink)] px-3 py-2.5 text-left text-[11.5px] font-medium normal-case leading-relaxed tracking-normal text-white shadow-[0_6px_20px_rgba(42,34,24,0.22)]"
            style={{ top: pos.top, left: pos.left, width: pos.width, transform: pos.above ? "translateY(-100%)" : undefined }}
          >
            {text}
          </span>,
          document.body,
        )}
    </span>
  );
}

