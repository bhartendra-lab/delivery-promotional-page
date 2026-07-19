"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { linkQr, getAllBookings } from "@/lib/api";
import type { AssignedEventSummary, Booking, QrCode } from "@/lib/types";

const PAGE_SIZE = 12;

/**
 * F1c — Link / relink a QR to a live event. Lists only `published` events
 * (the same "live" definition the Events list uses) as cover-fronted cards with
 * search + pagination. Relinking an already-linked QR requires a named
 * confirm ("removed from X"); a first link goes straight through.
 * Deactivated (published-but-paused) events stay selectable but are badged.
 */
export function LinkEventModal({
  qr,
  onClose,
  onLinked,
}: {
  qr: QrCode;
  onClose: () => void;
  /** Patches the QR card in place with the newly-linked event — no full reload. */
  onLinked: (qrUniqueId: string, assigned: AssignedEventSummary) => void;
}) {
  const currentBookingId = qr.assigned_event?.booking_id ?? null;
  const currentName = qr.assigned_event?.name ?? "";

  const [events, setEvents] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The "different event" the studio tapped while one is already linked —
  // holds the relink confirm open until they commit or back out.
  const [pending, setPending] = useState<Booking | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Body scroll lock + Esc-to-close (gated on submitting), mirroring AddEventModal.
  useEffect(() => {
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || submitting) return;
      if (pending) setPending(null);
      else onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [submitting, pending, onClose]);

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [search]);

  const loadFirstPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getAllBookings({
        status: "published",
        search: debouncedSearch || undefined,
        page: 1,
        limit: PAGE_SIZE,
      });
      setEvents(res.bookings);
      setHasMore(res.bookings.length === PAGE_SIZE);
      setPage(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load events");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  async function loadMore() {
    const next = page + 1;
    setLoadingMore(true);
    try {
      const res = await getAllBookings({
        status: "published",
        search: debouncedSearch || undefined,
        page: next,
        limit: PAGE_SIZE,
      });
      setEvents((prev) => [...prev, ...res.bookings]);
      setHasMore(res.bookings.length === PAGE_SIZE);
      setPage(next);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Couldn't load more events");
    } finally {
      setLoadingMore(false);
    }
  }

  function onPick(row: Booking) {
    if (submitting) return;
    setSubmitError(null);
    // Re-selecting the current event is a no-op — nothing to POST.
    if (row._id === currentBookingId) {
      onClose();
      return;
    }
    // Replacing an existing link needs the named confirm; a first
    // link (nothing to remove) goes straight through.
    if (currentBookingId) setPending(row);
    else void link(row);
  }

  async function link(row: Booking) {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await linkQr(qr.unique_id, row._id);
      // Optimistic summary built from the picked booking (getAllBookings already
      // carries name/cover/type/status). delivery_landing_page_id isn't returned
      // there and the card doesn't render it — the canonical value arrives on the
      // next natural reload.
      const assigned: AssignedEventSummary = {
        booking_id: row._id,
        delivery_landing_page_id: "",
        name: row.name,
        event_type: typeof row.event === "string" ? row.event : undefined,
        background_image: row.background_image,
        unique_identifier: row.unique_identifier,
        gallery_publish_status: row.gallery_publish_status,
        is_active: row.is_active,
      };
      onLinked(qr.unique_id, assigned);
      onClose();
    } catch (e) {
      // The event could have been archived, or the QR deleted/relinked, between
      // opening this modal and confirming — surface it inline, don't crash.
      setSubmitError(e instanceof Error ? e.message : "Couldn't link the QR. Please try again.");
      setPending(null);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Link QR to an event"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={submitting ? undefined : onClose}
        className="drawer-fade absolute inset-0 bg-[var(--color-brand-ink)]/40 backdrop-blur-[1px]"
      />
      <div className="dash-rise relative flex h-[90vh] w-full flex-col overflow-hidden rounded-t-2xl border border-[var(--color-brand-border)] bg-white shadow-[0_12px_40px_rgba(42,34,24,0.18)] sm:h-auto sm:max-h-[85vh] sm:max-w-[640px] sm:rounded-xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-brand-border)] px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-[17px] font-bold leading-tight tracking-tight text-[var(--color-brand-ink)]">
              {currentBookingId ? "Change linked event" : "Link to a live event"}
            </h2>
            <p className="mt-0.5 truncate text-[12.5px] text-[var(--color-brand-muted)]">
              {currentBookingId ? `Currently pointing at ${currentName}` : "Point this QR at whichever event is live now."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
            className="brand-focus flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--color-brand-muted)] hover:bg-[var(--color-brand-surface)] hover:text-[var(--color-brand-ink)] disabled:opacity-50"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="6" y1="18" x2="18" y2="6" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="border-b border-[var(--color-brand-border)] px-5 py-3">
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[var(--color-brand-muted)]">
              <SearchIcon />
            </span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search live events…"
              className="brand-focus h-10 w-full rounded-lg border border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] pl-9 pr-3 text-sm text-[var(--color-brand-ink)] outline-none placeholder:text-[var(--color-brand-muted)]/70"
            />
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {submitError && (
            <div role="alert" className="mb-3 rounded-lg border border-[var(--color-brand-danger)]/30 bg-[var(--color-brand-danger-soft)] px-3 py-2 text-[12.5px] text-[var(--color-brand-danger)]">
              {submitError}
            </div>
          )}

          {loading ? (
            <EventGridSkeleton />
          ) : error ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <p className="text-[13px] text-[var(--color-brand-muted)]">{error}</p>
              <button
                type="button"
                onClick={() => void loadFirstPage()}
                className="brand-focus inline-flex h-9 items-center rounded-lg border border-[var(--color-brand-border)] bg-white px-4 text-[13px] font-semibold text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)]"
              >
                Try again
              </button>
            </div>
          ) : events.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <p className="text-[15px] font-bold text-[var(--color-brand-ink)]">
                {debouncedSearch ? "No matching live events" : "No live events yet"}
              </p>
              <p className="max-w-xs text-[12.5px] text-[var(--color-brand-muted)]">
                {debouncedSearch
                  ? "Try a different search."
                  : "Publish an event first, then come back to point this QR at it."}
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
                {events.map((row) => (
                  <EventOption
                    key={row._id}
                    row={row}
                    // "Current" always stays on the actual current link — it
                    // doesn't move just because a different event was tapped.
                    // The tapped-but-not-yet-confirmed pick gets its own
                    // "Selected" badge/border instead.
                    isCurrent={row._id === currentBookingId}
                    isSelected={row._id === pending?._id}
                    disabled={submitting}
                    onClick={() => onPick(row)}
                  />
                ))}
              </div>
              {hasMore && (
                <div className="mt-4 flex justify-center">
                  <button
                    type="button"
                    onClick={() => void loadMore()}
                    disabled={loadingMore}
                    className="brand-focus inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--color-brand-border)] bg-white px-4 text-[13px] font-semibold text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)] disabled:opacity-60"
                  >
                    {loadingMore ? (
                      <>
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-[2px] border-[var(--color-brand-border)] border-t-[var(--color-brand-navy)]" />
                        Loading…
                      </>
                    ) : (
                      "Load more"
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Relink confirm — slides over the footer area when replacing. */}
        {pending && (
          <div className="border-t border-[var(--color-brand-border)] bg-[var(--color-brand-warning-soft)] px-5 py-4">
            <p className="text-[13px] leading-relaxed text-[var(--color-brand-ink)]">
              Relink this QR to{" "}
              <span className="font-semibold">{pending.name}</span>? It will be removed from{" "}
              <span className="font-semibold">{currentName}</span>.
            </p>
            <div className="mt-3 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setPending(null)}
                disabled={submitting}
                className="brand-focus inline-flex h-9 items-center rounded-lg border border-[var(--color-brand-border)] bg-white px-4 text-[13px] font-medium text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void link(pending)}
                disabled={submitting}
                className="brand-focus inline-flex h-9 items-center gap-2 rounded-lg bg-[var(--color-brand-navy)] px-4 text-[13px] font-semibold text-white hover:bg-[var(--color-brand-navy-deep)] disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-[2px] border-white/60 border-t-white" />
                    Relinking…
                  </>
                ) : (
                  "Relink"
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EventOption({
  row,
  isCurrent,
  isSelected,
  disabled,
  onClick,
}: {
  row: Booking;
  isCurrent: boolean;
  /** The tapped-but-unconfirmed reassign target — distinct from `isCurrent`. */
  isSelected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const filled = Boolean(row.background_image);
  const deactivated = row.is_active === false;
  const highlighted = isCurrent || isSelected;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={highlighted}
      className="brand-focus group relative flex flex-col overflow-hidden rounded-xl border bg-[var(--color-brand-surface-raised)] text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60"
      style={{
        borderColor: highlighted ? "var(--color-brand-navy)" : "var(--color-brand-border)",
        boxShadow: highlighted ? "0 0 0 1px var(--color-brand-navy)" : undefined,
      }}
    >
      <div
        className="relative aspect-[16/9] w-full"
        style={
          filled
            ? { backgroundImage: `url(${row.background_image})`, backgroundSize: "cover", backgroundPosition: "center" }
            : { backgroundImage: "repeating-linear-gradient(45deg, #C9AFA0 0 18px, #9E8475 18px 36px)" }
        }
      >
        {isCurrent ? (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-[var(--color-brand-navy)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            Current
          </span>
        ) : (
          isSelected && (
            <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-[var(--color-brand-navy)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              Selected
            </span>
          )
        )}
        {deactivated && (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
            Deactivated
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--color-brand-ink)]">
          {row.name}
        </span>
        {!highlighted && (
          <span className="shrink-0 text-[11.5px] font-semibold text-[var(--color-brand-navy)] opacity-0 transition-opacity group-hover:opacity-100">
            Select
          </span>
        )}
      </div>
    </button>
  );
}

function EventGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-xl border border-[var(--color-brand-border)]">
          <div className="skeleton aspect-[16/9] w-full rounded-none" />
          <div className="p-3">
            <div className="skeleton h-3.5 w-2/3 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.7" />
      <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
