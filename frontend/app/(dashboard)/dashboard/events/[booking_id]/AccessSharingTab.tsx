"use client";

import { useCallback, useEffect, useState } from "react";
import { exportGuestsCsv, getAllGuests, revokeGuestAccess } from "@/lib/api";
import type { Guest } from "@/lib/types";
import {
  IconCheck,
  IconCopy,
  IconDownload,
  IconInfo,
  IconLink,
  IconLock,
  IconMail,
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
  onRegenerate,
}: {
  bookingId: string;
  eventName: string;
  uniqueIdentifier?: string;
  familyPasscode?: string;
  /** Mint a fresh passcode server-side; resolves to the new code. */
  onRegenerate: () => Promise<string>;
}) {
  const base = (
    process.env.NEXT_PUBLIC_BASE_URL || (typeof window !== "undefined" ? window.location.origin : "")
  ).replace(/\/$/, "");
  const shareUrl = uniqueIdentifier ? `${base}/event/${uniqueIdentifier}` : "";

  const message = `Namaste! The photos from ${eventName} are ready. 🎉

Open the gallery, sign in with Google and take one quick selfie — you'll instantly see every photo you appear in:
${shareUrl}`;

  return (
    <div className="flex-1 overflow-auto bg-[var(--color-brand-bg)]">
      <div className="mx-auto grid max-w-[1180px] grid-cols-1 gap-6 px-6 py-6 sm:px-8 lg:grid-cols-[minmax(0,720px)_minmax(320px,1fr)] lg:items-start">
        {/* Left — existing sharing link + passcode. */}
        <div className="flex flex-col">
          <section className="flex flex-col overflow-hidden rounded-xl border border-[var(--color-brand-border)] bg-white">
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

                  <Dispatch key={shareUrl} eventName={eventName} message={message} />
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
    <section className="flex flex-col overflow-hidden rounded-xl border border-[var(--color-brand-border)] bg-white lg:sticky lg:top-6">
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

      <div className="max-h-[560px] overflow-y-auto">
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
      className={`brand-focus rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors ${
        active
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
      className={`inline-flex shrink-0 items-center rounded-full px-1.5 py-[1px] text-[10px] font-bold uppercase tracking-wide ${
        isHost
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
    <section className="mt-4 flex flex-col overflow-hidden rounded-xl border border-[var(--color-brand-border)] bg-white">
      <div className="flex items-center gap-3 border-b border-[#ECE5D8] px-4 py-4">
        <span
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px]"
          style={{ background: "var(--color-brand-navy-soft)", color: "var(--color-brand-navy)" }}
        >
          <IconLock size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-1.5 text-[15.5px] font-bold tracking-tight text-[var(--color-brand-ink)]">
            Family passcode
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
            <RefreshIcon size={13} /> Regenerate
          </button>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-lg border border-[#F0D9B5] bg-[var(--color-brand-warning-soft)] px-3 py-1.5 text-[12.5px] text-[var(--color-brand-warning)]">
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

  const openWhatsApp = () => window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  const openEmail = () => {
    const subject = `Your photos from ${eventName} are ready`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
  };

  return (
    <div className="mt-4 border-t border-[#ECE5D8] pt-3.5">
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
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={openWhatsApp}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-[12.5px] font-semibold text-white"
          style={{ background: "#1FA855" }}
        >
          <IconWhatsApp size={16} /> WhatsApp
        </button>
        <button
          type="button"
          onClick={openEmail}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-[12.5px] font-semibold"
          style={{ borderColor: "var(--color-brand-navy)", color: "var(--color-brand-navy)" }}
        >
          <IconMail size={15} /> Email
        </button>
        <button
          type="button"
          onClick={() => void navigator.clipboard?.writeText(text)}
          title="Copy message"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--color-brand-border)] bg-white text-[var(--color-brand-ink)]"
        >
          <IconCopy size={15} />
        </button>
      </div>
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

function Tip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span
      className="relative inline-flex items-center"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <IconInfo size={14} className="cursor-help text-[#B5ADA4]" />
      {show && (
        <span className="absolute bottom-[calc(100%+8px)] left-1/2 z-50 w-[250px] -translate-x-1/2 rounded-lg bg-[var(--color-brand-ink)] px-3 py-2.5 text-left text-[11.5px] font-medium leading-relaxed text-white shadow-[0_6px_20px_rgba(42,34,24,0.22)]">
          {text}
        </span>
      )}
    </span>
  );
}

function RefreshIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}
