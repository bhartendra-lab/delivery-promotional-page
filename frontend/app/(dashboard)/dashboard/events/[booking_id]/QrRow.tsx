"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getAllQrCodes, linkQr, unlinkQr } from "@/lib/api";
import type { QrCode } from "@/lib/types";
import { downloadImage } from "@/lib/media-actions";
import { useCompany } from "@/lib/useCompany";
import { trackEvent } from "@/lib/analytics";
import { Tip } from "@/components/ui/Tip";
import { Modal } from "@/components/ui/Modal";
import { IconCaretDown } from "@/components/ui/icons";
import { useEvent } from "./EventContext";
import { IconDownload, IconQrCode } from "./icons";

const BTN =
  "brand-focus inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-[var(--color-brand-border)] bg-white px-3.5 text-[12.5px] font-semibold text-[var(--color-brand-ink)] transition-colors hover:border-[var(--color-brand-outline)] disabled:opacity-50";

/**
 * The Share view's QR row: the event's reusable QR, its downloads, and linking
 * from the EVENT's side (the Reusable QR page does it from the QR's side; both
 * follow the same rules and say the same things).
 *
 * The rules, from the backend (assignQR / redirectQR):
 *  - A QR points at one event. Linking it here MOVES it off the event it was
 *    on, and every printed copy follows, because a scan looks the link up then.
 *    So a QR in use elsewhere is only moved after a confirm that names it.
 *  - An event holds one QR. "Use a different QR" sends `replace: true`, so the
 *    backend frees this event's current QR and links the new one in one request.
 */
export function QrRow({
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
  const company = useCompany();
  const { setLinkedQr, toast } = useEvent();
  const [downloading, setDownloading] = useState(false);
  const [standeeBusy, setStandeeBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
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
      /* best-effort download; the public URL is also visible on the QR page */
    } finally {
      setDownloading(false);
    }
  }

  async function downloadStandee() {
    if (!qrImageUrl || standeeBusy) return;
    setStandeeBusy(true);
    setError(null);
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
      setError(e instanceof Error ? e.message : "We couldn't build the standee designs. Try again.");
    } finally {
      setStandeeBusy(false);
    }
  }

  async function unlink() {
    if (!qrUniqueId) return;
    setUnlinking(true);
    setError(null);
    try {
      await unlinkQr(qrUniqueId);
      setLinkedQr(null);
      setConfirmUnlink(false);
      toast("QR unlinked from this event");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't unlink the QR. Try again.");
    } finally {
      setUnlinking(false);
    }
  }

  return (
    <section className="rounded-xl border border-[var(--color-brand-border)] bg-white">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        {assigned ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qrImageUrl} alt="Event QR code" className="h-14 w-14 shrink-0 rounded-md border border-[var(--color-brand-border)] bg-white object-contain p-0.5" />
        ) : (
          <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-dashed border-[var(--color-brand-outline)] text-[var(--color-brand-muted)]">
            <IconQrCode size={22} />
          </span>
        )}
        <div className="min-w-[160px] flex-1">
          <h3 className="flex items-center gap-1.5 text-[14px] font-bold text-[var(--color-brand-ink)]">
            QR code for the venue
            <Tip text="A reusable QR is a code you print once and point at whichever event is on. Scanning it opens the event it is linked to at that moment." />
          </h3>
          <p className="mt-0.5 text-[13px] text-[var(--color-brand-body)]">
            {assigned ? "Print it so guests can scan to open the gallery." : "No QR is linked to this event yet."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {assigned ? (
            <>
              <button type="button" onClick={() => void download()} disabled={downloading} className={BTN}>
                <IconDownload size={14} />
                {downloading ? "Downloading…" : "Download QR"}
              </button>
              <button
                type="button"
                onClick={() => void downloadStandee()}
                disabled={standeeBusy}
                title="Five editable PowerPoint designs, 2 by 5 feet, with this QR on them"
                className={BTN}
              >
                <IconDownload size={14} />
                {standeeBusy ? "Building…" : "Standee designs"}
              </button>
              <div className="relative">
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((v) => !v)}
                  onBlur={(e) => {
                    if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node)) setMenuOpen(false);
                  }}
                  className={BTN}
                >
                  Change
                  <IconCaretDown size={11} />
                </button>
                {menuOpen && (
                  <div role="menu" className="absolute right-0 top-[calc(100%+4px)] z-30 w-[200px] rounded-lg border border-[var(--color-brand-border)] bg-white p-1 shadow-[0_14px_44px_rgba(42,34,24,0.18)]">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        setPickerOpen(true);
                      }}
                      className="brand-focus flex min-h-10 w-full items-center rounded-md px-2.5 text-left text-[12.5px] font-semibold text-[var(--color-brand-ink)] hover:bg-[var(--color-brand-hover)]"
                    >
                      Use a different QR
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        setConfirmUnlink(true);
                      }}
                      className="brand-focus flex min-h-10 w-full items-center rounded-md px-2.5 text-left text-[12.5px] font-semibold text-[var(--color-brand-danger)] hover:bg-[var(--color-brand-danger-soft)]"
                    >
                      Unlink
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <button type="button" onClick={() => setPickerOpen(true)} className={BTN}>
              Link a QR
            </button>
          )}
        </div>
      </div>

      {confirmUnlink && (
        <div className="flex flex-wrap items-center gap-3 border-t border-[#F0D9B5] bg-[var(--color-brand-warning-soft)] px-4 py-3 text-[12.5px] text-[var(--color-brand-warning)]">
          <p className="min-w-0 flex-1">
            Unlink this QR? Printed copies will show &ldquo;not linked&rdquo; until you link it to an event again.
          </p>
          <button
            type="button"
            disabled={unlinking}
            onClick={() => void unlink()}
            className="brand-focus rounded-md bg-[var(--color-brand-navy)] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[var(--color-brand-navy-deep)] disabled:opacity-60"
          >
            {unlinking ? "Unlinking…" : "Unlink"}
          </button>
          <button
            type="button"
            disabled={unlinking}
            onClick={() => setConfirmUnlink(false)}
            className="brand-focus text-[12px] font-semibold text-[var(--color-brand-muted)] hover:text-[var(--color-brand-ink)] disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="border-t border-[#ECE5D8] px-4 py-2 text-[12px] text-[var(--color-brand-danger)]">
          {error}
        </p>
      )}

      {pickerOpen && (
        <QrPicker
          eventName={eventName}
          currentQrId={qrUniqueId}
          onClose={() => setPickerOpen(false)}
          onLinked={(qr) => {
            setLinkedQr({ uniqueId: qr.unique_id, imageUrl: qr.qr_image_url });
            setPickerOpen(false);
            toast("QR linked to this event");
          }}
        />
      )}
    </section>
  );
}

/** Live means a guest scanning it right now reaches that event's gallery. */
function isLive(qr: QrCode): boolean {
  return qr.assigned_event?.is_active !== false && qr.assigned_event?.gallery_publish_status !== "archived";
}

/**
 * The studio's QRs, to link one to this event. Free QRs first. Picking one in
 * use elsewhere asks first, naming that event, because the move is what every
 * printed copy of it will do from then on.
 */
function QrPicker({
  eventName,
  currentQrId,
  onClose,
  onLinked,
}: {
  eventName: string;
  currentQrId?: string;
  onClose: () => void;
  onLinked: (qr: QrCode) => void;
}) {
  const { bookingId } = useEvent();
  const [qrs, setQrs] = useState<QrCode[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState<QrCode | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getAllQrCodes()
      .then((res) => {
        if (!alive) return;
        const others = res.qrs.filter((q) => q.unique_id !== currentQrId);
        // Free ones first: picking one moves nothing.
        setQrs([...others.filter((q) => !q.assigned_event), ...others.filter((q) => q.assigned_event)]);
      })
      .catch((e) => alive && setLoadError(e instanceof Error ? e.message : "Couldn't load your QR codes"));
    return () => {
      alive = false;
    };
  }, [currentQrId]);

  async function link(qr: QrCode) {
    setBusy(true);
    setError(null);
    try {
      // `replace` frees this event's current QR in the same request.
      await linkQr(qr.unique_id, bookingId, { replace: Boolean(currentQrId) });
      onLinked(qr);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't link the QR. Try again.");
      setBusy(false);
    }
  }

  const otherEvent = pending?.assigned_event;

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title={currentQrId ? "Use a different QR" : "Link a QR"}
      subtitle={eventName}
      size="md"
      footer={
        pending ? (
          <div
            className={`flex flex-col gap-3 rounded-lg border px-3.5 py-3 text-[13px] ${
              otherEvent && isLive(pending)
                ? "border-[#F0D9B5] bg-[var(--color-brand-warning-soft)] text-[var(--color-brand-ink)]"
                : "border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] text-[var(--color-brand-ink)]"
            }`}
          >
            <p>
              {otherEvent ? (
                <>
                  Move this QR from <span className="font-semibold">{otherEvent.name}</span> to{" "}
                  <span className="font-semibold">{eventName}</span>? From now on, scanning it, printed copies included,
                  opens {eventName}. {otherEvent.name} will have no QR.
                  {isLive(pending) && (
                    <span className="font-semibold"> {otherEvent.name} is still live, so guests there may still be scanning it.</span>
                  )}
                </>
              ) : (
                <>Use this QR for {eventName} instead?</>
              )}
              {currentQrId && (
                <> This event&apos;s current QR will be unlinked, and printed copies of it will show &ldquo;not linked&rdquo;.</>
              )}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setPending(null)}
                className="brand-focus inline-flex h-9 items-center rounded-lg px-3 text-[12.5px] font-semibold text-[var(--color-brand-muted)] hover:text-[var(--color-brand-ink)] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void link(pending)}
                className="brand-focus inline-flex h-9 items-center rounded-lg bg-[var(--color-brand-navy)] px-4 text-[12.5px] font-semibold text-white hover:bg-[var(--color-brand-navy-deep)] disabled:opacity-60"
              >
                {busy ? "Saving…" : otherEvent ? "Move QR" : "Use this QR"}
              </button>
            </div>
          </div>
        ) : undefined
      }
    >
      {loadError && <p className="text-[13px] text-[var(--color-brand-danger)]">{loadError}</p>}
      {!loadError && !qrs && <p className="text-[13px] text-[var(--color-brand-muted)]">Loading your QR codes…</p>}
      {qrs && qrs.length === 0 && (
        <div className="flex flex-col items-start gap-2 text-[13px] text-[var(--color-brand-body)]">
          <p>{currentQrId ? "You have no other QR codes." : "You don't have a QR code yet."}</p>
          <Link href="/dashboard/reusable-qr" className="brand-focus font-semibold text-[var(--color-brand-navy)] hover:underline">
            Create a QR
          </Link>
        </div>
      )}
      {qrs && qrs.length > 0 && (
        <ul className="divide-y divide-[var(--color-brand-border)] overflow-hidden rounded-lg border border-[var(--color-brand-border)]">
          {qrs.map((qr) => {
            const ev = qr.assigned_event;
            const selected = pending?.unique_id === qr.unique_id;
            return (
              <li key={qr.unique_id}>
                <button
                  type="button"
                  disabled={busy}
                  aria-pressed={selected}
                  onClick={() => {
                    setError(null);
                    // Straight through only when nothing moves: a free QR on an
                    // event that has none. Anything else names what changes.
                    if (ev || currentQrId) setPending(qr);
                    else void link(qr);
                  }}
                  className={`brand-focus flex w-full items-center gap-3 px-3 py-2.5 text-left disabled:opacity-60 ${
                    selected ? "bg-[var(--color-brand-navy-soft)]" : "hover:bg-[var(--color-brand-hover)]"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qr.qr_image_url} alt="" className="h-11 w-11 shrink-0 rounded border border-[var(--color-brand-border)] bg-white object-contain p-0.5" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-[var(--color-brand-ink)]">
                      {ev ? `Linked to ${ev.name}` : "Not linked"}
                    </span>
                    <span className="block text-[12px] text-[var(--color-brand-muted)]">
                      {ev ? (isLive(qr) ? "Live event · picking it moves the QR" : "Event not live · picking it moves the QR") : "Free to use"}
                    </span>
                  </span>
                  <span className="shrink-0 text-[12.5px] font-semibold text-[var(--color-brand-navy)]">{ev ? "Move here" : "Link"}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {error && (
        <p role="alert" className="mt-3 text-[12.5px] text-[var(--color-brand-danger)]">
          {error}
        </p>
      )}
    </Modal>
  );
}
