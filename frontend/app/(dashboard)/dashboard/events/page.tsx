"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getAllBookings } from "@/lib/api";
import type { Booking, BookingsListResponse } from "@/lib/types";
import { PagesTable } from "@/components/dashboard/PagesTable";
import { PageCard } from "@/components/dashboard/PageCard";
import { Pagination } from "@/components/ui/Pagination";
import { AddEventModal } from "@/components/dashboard/AddEventModal";

const PAGE_SIZE = 20;

export default function EventsListPage() {
  const router = useRouter();
  const [data, setData] = useState<BookingsListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
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
      });
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const totalPages = useMemo(() => {
    if (!data) return 1;
    return data.bookings.length === PAGE_SIZE ? page + 1 : page;
  }, [data, page]);

  const isEmpty = !loading && data && data.bookings.length === 0;

  function openEvent(row: Booking) {
    router.push(`/dashboard/events/${row._id}`);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
      <section className="dash-rise flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
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
            className="brand-focus inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--color-brand-navy)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)]"
          >
            <PlusIcon />
            Add event
          </button>
        </div>
      </section>

      {/* Search */}
      <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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

        {data && (
          <p className="text-xs text-[var(--color-brand-muted)]">
            Showing{" "}
            <span className="font-semibold text-[var(--color-brand-ink)]">
              {data.bookings.length}
            </span>{" "}
            {data.bookings.length === 1 ? "event" : "events"}
          </p>
        )}
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
          <TableSkeleton />
        ) : isEmpty ? (
          <EmptyState onCreate={() => setModalOpen(true)} />
        ) : (
          data &&
          data.bookings.length > 0 && (
            <>
              <div className="hidden sm:block">
                <PagesTable rows={data.bookings} onOpen={openEvent} />
              </div>
              <div className="space-y-2 sm:hidden">
                {data.bookings.map((row) => (
                  <PageCard key={row._id} row={row} onOpen={openEvent} />
                ))}
              </div>
            </>
          )
        )}
      </section>

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

function TableSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="skeleton h-14 rounded-lg" style={{ animationDelay: `${i * 0.06}s` }} />
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
