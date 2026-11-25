"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ApiError, exportAllLeadsCsv, getAllBookings } from "@/lib/api";
import { trackEvent } from "@/lib/analytics";
import type { Booking, BookingsListResponse } from "@/lib/types";
import { isCountBasedPlan } from "@/lib/types";
import type { EventsFilter } from "@/lib/event-status";
import {
  EVENTS_FILTERS,
  EVENTS_SORTS,
  FILTER_LABEL,
  SORT_LABEL,
  eventsViewQuery,
  parseEventsView,
  totalPagesFor,
  withChange,
  type EventsSort,
  type EventsView,
} from "@/lib/events-query";
import { EventCard } from "@/components/dashboard/EventCard";
import { useChrome } from "@/components/dashboard/ChromeContext";
import { useUploadingBookingIds } from "@/lib/r2-upload/useActiveUploads";
import { useBookingLifecycle } from "@/components/dashboard/useBookingLifecycle";
import { Pagination } from "@/components/ui/Pagination";
import { AddEventModal } from "@/components/dashboard/AddEventModal";
import { FirstPurchaseNotice } from "@/components/billing/FirstPurchaseNotice";
import {
  IconDownload,
  IconPlus,
  IconSearch,
  IconX,
  IconWarningCircle,
  IconCalendar,
  IconZoomOut,
} from "@/components/ui/icons";

const PAGE_SIZE = 20;

/**
 * Events: manage every event. The full list with filters (All, Active,
 * Deactivated, Archived, each with its count), sort, search and pagination.
 * The view lives in the URL (?filter=&sort=&q=&page=), so Back and a refresh
 * keep it. The studio's day-to-day picture (what needs attention, how the
 * month is going) is on the Dashboard, not here.
 */
export default function EventsListPage() {
  // useSearchParams needs a Suspense boundary under the app router.
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10"><CardGridSkeleton /></div>}>
      <EventsList />
    </Suspense>
  );
}

function EventsList() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = parseEventsView(searchParams);
  // Mirror the dashboard-home gating: count-based plans (Free/Event-based)
  // block new events once the allowance is used up. Storage plans are never
  // gated on creation.
  const { dlpUsage } = useChrome();
  // Uploads keep running as you move around the dashboard, so cards stay fully
  // openable. Only the event that's actually uploading holds back its
  // lifecycle actions (archive / restore / clear data).
  const uploadingIds = useUploadingBookingIds();
  // With no events left the button still opens Add event: the studio fills it
  // in and pays for this one event from there ("Continue to pay").
  const lowRemaining =
    isCountBasedPlan(dlpUsage?.service_type) && dlpUsage?.remaining != null && dlpUsage.remaining > 0 && dlpUsage.remaining <= 2;
  const [data, setData] = useState<BookingsListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  /** Moves to a new view. A filter, sort or page change is a step Back returns to; typing a search replaces. */
  const go = useCallback(
    (next: EventsView, mode: "push" | "replace" = "push") => {
      const url = `${pathname}${eventsViewQuery(next)}`;
      if (mode === "replace") router.replace(url, { scroll: false });
      else router.push(url, { scroll: false });
    },
    [pathname, router],
  );

  // The search box: typed text is held here and written to the URL after a pause.
  const [searchText, setSearchText] = useState(view.q);
  const committedQ = useRef(view.q);
  useEffect(() => {
    // Back or a pasted link changed the URL's search: show it in the box.
    if (view.q !== committedQ.current) {
      committedQ.current = view.q;
      setSearchText(view.q);
    }
  }, [view.q]);
  useEffect(() => {
    const t = setTimeout(() => {
      const next = searchText.trim();
      if (next !== committedQ.current) {
        committedQ.current = next;
        go(withChange(view, { q: next }), "replace");
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchText, view, go]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getAllBookings({
        page: view.page,
        limit: PAGE_SIZE,
        search: view.q || undefined,
        view: view.filter,
        sort: view.sort,
      });
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [view.page, view.q, view.filter, view.sort]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-then-setState is the documented React pattern for effects
    void reload();
  }, [reload]);

  const { onArchive, onRestore, onClearData, toastNode } = useBookingLifecycle(reload);

  const totalPages = totalPagesFor({ total: data?.total, pageSize: PAGE_SIZE, page: view.page, returned: data?.bookings.length ?? 0 });
  const isEmpty = !loading && data && data.bookings.length === 0;

  // A filter or search is narrowing the list: an empty result then means "nothing matched", not "no events
  // exist". Only a truly empty studio shows the create-your-first-event call to action.
  const noEventsAtAll = data?.counts ? data.counts.all === 0 : false;
  const filtersActive = view.filter !== "all" || view.q.length > 0;

  function pickFilter(filter: EventsFilter) {
    if (filter === view.filter) return;
    trackEvent("events_filter_changed", { filter });
    go(withChange(view, { filter }));
  }

  function pickSort(sort: EventsSort) {
    if (sort === view.sort) return;
    trackEvent("events_sort_changed", { sort });
    go(withChange(view, { sort }));
  }

  function clearFilters() {
    setSearchText("");
    committedQ.current = "";
    go(withChange(view, { filter: "all", q: "" }));
  }

  // One CSV of every guest and Client across the studio's events. The server
  // streams it and names it; a failure (or the hourly limit) says so here.
  const [exportingLeads, setExportingLeads] = useState(false);
  const [exportLeadsError, setExportLeadsError] = useState<string | null>(null);
  async function exportLeads() {
    if (exportingLeads) return;
    setExportingLeads(true);
    setExportLeadsError(null);
    try {
      await exportAllLeadsCsv();
      trackEvent("leads_exported", { scope: "all" });
    } catch (e) {
      setExportLeadsError(e instanceof ApiError || e instanceof Error ? e.message : "The export did not work. Please try again.");
    } finally {
      setExportingLeads(false);
    }
  }

  function openEvent(row: Booking) {
    router.push(`/dashboard/events/${row._id}`);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
      <FirstPurchaseNotice />

      {/* Header: the title and the page's actions. Scrolls away normally; only the filter bar below stays sticky. */}
      <section className="dash-rise flex flex-col gap-4 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold leading-tight text-[var(--color-brand-ink)]">Events</h1>
        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void exportLeads()}
              disabled={exportingLeads}
              title="One file with every guest and Client from all your events"
              className="brand-focus inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--color-brand-border)] bg-white px-4 text-sm font-semibold text-[var(--color-brand-ink)] transition-colors hover:border-[var(--color-brand-outline)] disabled:opacity-60"
            >
              {exportingLeads ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-[2px] border-[var(--color-brand-border)] border-t-[var(--color-brand-navy)]" />
              ) : (
                <IconDownload size={15} />
              )}
              Export all leads
            </button>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="brand-focus inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--color-brand-navy)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)]"
            >
              <IconPlus />
              Add event
            </button>
          </div>
          {exportLeadsError && (
            <p role="alert" className="max-w-xs text-xs text-[var(--color-brand-danger)] sm:text-right">
              {exportLeadsError}
            </p>
          )}
          {lowRemaining && (
            <p className="text-xs text-[var(--color-brand-muted)]">{dlpUsage?.remaining} events left</p>
          )}
        </div>
      </section>

      {/* Search, filters and sort: stays sticky under the hero, with a static bottom border. */}
      <section className="sticky top-0 z-10 flex flex-col gap-3 border-b border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] py-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[var(--color-brand-muted)]">
              <IconSearch size={15} />
            </span>
            <input
              type="search"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search events…"
              aria-label="Search events"
              className="brand-focus h-10 w-full rounded-field border border-[var(--color-brand-border)] bg-[var(--color-brand-surface-raised)] pl-9 pr-3 text-sm text-[var(--color-brand-ink)] outline-none placeholder:text-[var(--color-brand-muted)]/70"
            />
            {searchText && (
              <button
                type="button"
                onClick={() => setSearchText("")}
                className="absolute inset-y-0 right-2 my-auto flex h-6 w-6 items-center justify-center rounded-full text-[var(--color-brand-muted)] hover:bg-[var(--color-brand-border)]"
                aria-label="Clear search"
              >
                <IconX size={13} />
              </button>
            )}
          </div>

          <label className="flex shrink-0 items-center gap-2 text-xs text-[var(--color-brand-muted)]">
            Sort
            <select
              value={view.sort}
              onChange={(e) => pickSort(e.target.value as EventsSort)}
              className="brand-focus h-10 rounded-field border border-[var(--color-brand-border)] bg-[var(--color-brand-surface-raised)] px-3 text-sm font-medium text-[var(--color-brand-ink)]"
            >
              {EVENTS_SORTS.map((s) => (
                <option key={s} value={s}>
                  {SORT_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div role="group" aria-label="Filter by status" className="flex flex-wrap items-center gap-2">
          {EVENTS_FILTERS.map((f) => {
            const on = view.filter === f;
            const count = data?.counts?.[f];
            return (
              <button
                key={f}
                type="button"
                onClick={() => pickFilter(f)}
                aria-pressed={on}
                className={`brand-focus inline-flex h-8 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold transition-colors ${
                  on
                    ? "border-[var(--color-brand-navy)] bg-[var(--color-brand-navy-soft)] text-[var(--color-brand-navy)]"
                    : "border-[var(--color-brand-border)] text-[var(--color-brand-muted)] hover:text-[var(--color-brand-ink)]"
                }`}
              >
                {FILTER_LABEL[f]}
                {typeof count === "number" && <span className="tabular-nums opacity-70">{count}</span>}
              </button>
            );
          })}
        </div>
      </section>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-[var(--color-brand-danger)]/30 bg-[var(--color-brand-danger-soft)] px-4 py-3 text-sm text-[var(--color-brand-danger)]"
        >
          <IconWarningCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <section>
        {loading && !data ? (
          <CardGridSkeleton />
        ) : isEmpty ? (
          noEventsAtAll || !filtersActive ? (
            <EmptyState onCreate={() => setModalOpen(true)} />
          ) : (
            <NoResults filter={view.filter} hasSearch={view.q.length > 0} onClear={clearFilters} />
          )
        ) : (
          data &&
          data.bookings.length > 0 && (
            <div className={`dash-stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3 ${loading ? "opacity-60 transition-opacity" : ""}`}>
              {data.bookings.map((row) => (
                <EventCard
                  key={row._id}
                  row={row}
                  onOpen={openEvent}
                  locked={uploadingIds.has(row._id)}
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
        <Pagination current={view.page} totalPages={totalPages} onChange={(page) => go({ ...view, page })} />
      )}

      <AddEventModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-5 rounded-xl border border-dashed border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] px-6 py-14 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[var(--color-brand-bg)] text-[var(--color-brand-muted)]">
        <IconCalendar size={28} />
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
        <IconPlus />
        Create your first event
      </button>
    </div>
  );
}

const EMPTY_TITLE: Record<EventsFilter, string> = {
  all: "No matching events",
  active: "No active events",
  deactivated: "No deactivated events",
  archived: "No archived or expired events",
};
const EMPTY_TEXT: Record<EventsFilter, string> = {
  all: "No events match your search.",
  active: "None of your events are live right now.",
  deactivated: "None of your galleries are switched off.",
  archived: "Nothing has been archived or expired yet.",
};

function NoResults({ filter, hasSearch, onClear }: { filter: EventsFilter; hasSearch: boolean; onClear: () => void }) {
  const title = hasSearch ? "No matching events" : EMPTY_TITLE[filter];
  const description = hasSearch ? "No events match your search and filter. Try changing them." : EMPTY_TEXT[filter];
  return (
    <div className="flex flex-col items-center justify-center gap-5 rounded-xl border border-dashed border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] px-6 py-14 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[var(--color-brand-bg)] text-[var(--color-brand-muted)]">
        <IconZoomOut size={26} />
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
            <div className="flex items-center justify-between pt-1">
              <div className="skeleton h-3 w-24 rounded" />
              <div className="skeleton h-9 w-9 rounded-lg" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
