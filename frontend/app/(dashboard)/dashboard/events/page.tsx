"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getAllBookings } from "@/lib/api";
import type { Booking, BookingsListResponse } from "@/lib/types";
import { isCountBasedPlan } from "@/lib/types";
import { EventCard } from "@/components/dashboard/EventCard";
import { useChrome, useScrollCollapsed } from "@/components/dashboard/ChromeContext";
import { useBookingLifecycle } from "@/components/dashboard/useBookingLifecycle";
import { Pagination } from "@/components/ui/Pagination";
import { AddEventModal } from "@/components/dashboard/AddEventModal";

const PAGE_SIZE = 20;

export default function EventsListPage() {
  const router = useRouter();
  // Mirror the dashboard-home gating: count-based plans (Free/Event-based)
  // block new events once the allowance is used up. Storage plans are never
  // gated on creation.
  const { dlpUsage, locked } = useChrome();
  const createBlocked =
    isCountBasedPlan(dlpUsage?.service_type) && dlpUsage?.remaining === 0;
  // Drives the hero-collapse + locked-toolbar scroll animation below.
  const collapsed = useScrollCollapsed(24);
  const [data, setData] = useState<BookingsListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  // The only two views: live (default) and archived+expired (opt-in). There is
  // no draft/unpublished state, so the old All/Live/Expired chips are gone.
  const [showArchived, setShowArchived] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getAllBookings({
        page,
        limit: PAGE_SIZE,
        search: debouncedSearch || undefined,
        // "archived" is the combined archived+expired view (backend maps it to
        // $in: ["archived", "expired"]); otherwise the live/published set.
        status: showArchived ? "archived" : "published",
      });
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, showArchived]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const { onArchive, onRestore, onClearData, toastNode } = useBookingLifecycle(reload);

  const totalPages = useMemo(() => {
    if (!data) return 1;
    return data.bookings.length === PAGE_SIZE ? page + 1 : page;
  }, [data, page]);

  const isEmpty = !loading && data && data.bookings.length === 0;

  // A filter/search is narrowing the list — an empty result here means "nothing
  // matched", not "no events exist". Only the truly-unfiltered empty list should
  // show the create-your-first-event call to action.
  const filtersActive = showArchived || debouncedSearch.length > 0;

  function clearFilters() {
    setShowArchived(false);
    setSearch("");
    setPage(1);
  }

  function openEvent(row: Booking) {
    router.push(`/dashboard/events/${row._id}`);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
      {/* Hero text — collapses away (height + fade) once the list scrolls past it. */}
      <div className={`scroll-collapse ${collapsed ? "is-collapsed" : ""}`}>
        <div className="scroll-collapse-inner">
          <section className="scroll-collapse-fade dash-rise flex flex-col gap-4 pb-6 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-brand-muted)]">
                Events · All clients
              </p>
              <h1 className="mt-1.5 text-3xl font-bold leading-tight text-[var(--color-brand-ink)]">
                Your events,<br className="hidden sm:block" /> in one place.
              </h1>
              <p className="mt-1.5 max-w-lg text-sm text-[var(--color-brand-muted)]">
                Create a page per booking. Upload media, organise by folder, share with your client.
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                disabled={createBlocked}
                className="brand-focus inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--color-brand-navy)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <PlusIcon />
                Add event
              </button>
            </div>
          </section>
        </div>
      </div>

      {/* Search — locks to a single compact line once the hero above has scrolled
          out; Pagination + Add event fold into it so both stay reachable without
          scrolling back up or down. */}
      <section
        className={`sticky top-0 z-10 flex flex-col gap-3 bg-[var(--color-brand-bg)] py-3 transition-[box-shadow,border-color] duration-300 sm:flex-row sm:items-center sm:justify-between ${
          collapsed
            ? "border-b border-[var(--color-brand-border)] shadow-[0_6px_18px_rgba(42,34,24,0.08)]"
            : "border-b border-transparent"
        }`}
      >
        <div className="relative w-full sm:max-w-sm">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[var(--color-brand-muted)]">
            <SearchIcon />
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search events…"
            className="brand-focus h-10 w-full rounded-lg border border-[var(--color-brand-border)] bg-[var(--color-brand-surface)] pl-9 pr-3 text-sm text-[var(--color-brand-ink)] outline-none placeholder:text-[var(--color-brand-muted)]/70"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute inset-y-0 right-2 my-auto flex h-6 w-6 items-center justify-center rounded-full text-[var(--color-brand-muted)] hover:bg-[var(--color-brand-border)]"
              aria-label="Clear search"
            >
              <ClearIcon />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setShowArchived((v) => !v);
              setPage(1);
            }}
            aria-pressed={showArchived}
            title="Show archived & expired events"
            className={`brand-focus inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors ${
              showArchived
                ? "border-[var(--color-brand-navy)] bg-[var(--color-brand-navy-soft)] text-[var(--color-brand-navy)]"
                : "border-[var(--color-brand-border)] bg-[var(--color-brand-surface-raised)] text-[var(--color-brand-muted)] hover:border-[var(--color-brand-outline)]"
            }`}
          >
            <ArchiveIcon />
            <span className="hidden sm:inline">{showArchived ? "Archived & expired" : "Show archived"}</span>
          </button>

          {data && (
            <p className="shrink-0 text-xs text-[var(--color-brand-muted)]">
              Showing{" "}
              <span className="font-semibold text-[var(--color-brand-ink)]">
                {data.bookings.length}
              </span>{" "}
              {data.bookings.length === 1 ? "event" : "events"}
            </p>
          )}

          {/* Folded in once locked — Pagination + Add event stay reachable while scrolling. */}
          {collapsed && (
            <div className="dash-rise flex shrink-0 items-center gap-2 border-l border-[var(--color-brand-border)] pl-3">
              {data && data.bookings.length > 0 && (
                <Pagination current={page} totalPages={totalPages} onChange={setPage} compact />
              )}
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                disabled={createBlocked}
                className="brand-focus inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-[var(--color-brand-navy)] px-3 text-xs font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <PlusIcon />
                <span className="hidden sm:inline">Add event</span>
              </button>
            </div>
          )}
        </div>
      </section>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-[var(--color-brand-danger)]/30 bg-[var(--color-brand-danger-soft)] px-4 py-3 text-sm text-[var(--color-brand-danger)]"
        >
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <section>
        {loading && !data ? (
          <CardGridSkeleton />
        ) : isEmpty ? (
          filtersActive ? (
            <NoResults
              showArchived={showArchived}
              hasSearch={debouncedSearch.length > 0}
              onClear={clearFilters}
            />
          ) : (
            <EmptyState onCreate={() => setModalOpen(true)} />
          )
        ) : (
          data &&
          data.bookings.length > 0 && (
            <div className="dash-stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {data.bookings.map((row) => (
                <EventCard
                  key={row._id}
                  row={row}
                  onOpen={openEvent}
                  locked={locked}
                  onArchive={onArchive}
                  onRestore={onRestore}
                  onClearData={onClearData}
                />
              ))}
            </div>
          )
        )}
      </section>

      {toastNode}

      {data && data.bookings.length > 0 && (
        <Pagination current={page} totalPages={totalPages} onChange={setPage} />
      )}

      <AddEventModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-5 rounded-xl border border-dashed border-[var(--color-brand-border)] bg-[var(--color-brand-surface)] px-6 py-14 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[var(--color-brand-bg)] text-[var(--color-brand-muted)]">
        <CalendarIcon />
      </div>
      <div className="space-y-1">
        <p className="text-xl font-bold text-[var(--color-brand-ink)]">No events yet</p>
        <p className="max-w-sm text-sm text-[var(--color-brand-muted)]">
          Create your first event to start organising photos and sharing with clients.
        </p>
      </div>
      <button
        type="button"
        onClick={onCreate}
        className="brand-focus inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--color-brand-navy)] px-5 text-sm font-semibold text-white hover:bg-[var(--color-brand-navy-deep)]"
      >
        <PlusIcon />
        Create your first event
      </button>
    </div>
  );
}

function NoResults({
  showArchived,
  hasSearch,
  onClear,
}: {
  showArchived: boolean;
  hasSearch: boolean;
  onClear: () => void;
}) {
  const title = showArchived ? "No archived or expired events" : "No matching events";
  const description = hasSearch
    ? "No events match your search and filters. Try adjusting them."
    : showArchived
      ? "Nothing has been archived or expired yet."
      : "No events match this filter. Try adjusting it.";
  return (
    <div className="flex flex-col items-center justify-center gap-5 rounded-xl border border-dashed border-[var(--color-brand-border)] bg-[var(--color-brand-surface)] px-6 py-14 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[var(--color-brand-bg)] text-[var(--color-brand-muted)]">
        <NoResultsIcon />
      </div>
      <div className="space-y-1">
        <p className="text-xl font-bold text-[var(--color-brand-ink)]">{title}</p>
        <p className="max-w-sm text-sm text-[var(--color-brand-muted)]">{description}</p>
      </div>
      <button
        type="button"
        onClick={onClear}
        className="brand-focus inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--color-brand-border)] bg-[var(--color-brand-surface-raised)] px-5 text-sm font-semibold text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)]"
      >
        Clear filters
      </button>
    </div>
  );
}

function CardGridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-xl border border-[var(--color-brand-border)] bg-[var(--color-brand-surface-raised)]"
          style={{ animationDelay: `${i * 0.06}s` }}
        >
          <div className="skeleton aspect-[16/9] w-full rounded-none" />
          <div className="space-y-3 p-4">
            <div className="skeleton h-4 w-2/3 rounded" />
            <div className="skeleton h-3 w-1/2 rounded" />
            <div className="grid grid-cols-3 gap-2 pt-1">
              <div className="skeleton h-8 rounded" />
              <div className="skeleton h-8 rounded" />
              <div className="skeleton h-8 rounded" />
            </div>
            <div className="flex gap-2 pt-1">
              <div className="skeleton h-10 w-24 rounded-lg" />
              <div className="skeleton h-10 flex-1 rounded-lg" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function PlusIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function ArchiveIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
      <path d="M10 12h4" />
    </svg>
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

function ClearIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 8v5M12 16.5v.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function NoResultsIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
      <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M20 20l-4.5-4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M8 10.5h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <rect x="3.5" y="5" width="17" height="15" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <line x1="3.5" y1="10" x2="20.5" y2="10" stroke="currentColor" strokeWidth="1.5" />
      <line x1="8" y1="3" x2="8" y2="6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="16" y1="3" x2="16" y2="6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
