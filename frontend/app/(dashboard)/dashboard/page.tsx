"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getAllBookings } from "@/lib/api";
import type { Booking, BookingsListResponse, DlpUsage } from "@/lib/types";
import { isCountBasedPlan, isStorageBasedPlan, getUsageSeverity } from "@/lib/types";
import { StatsBar } from "@/components/dashboard/StatsBar";
import { EventCard } from "@/components/dashboard/EventCard";
import { useChrome, useScrollCollapsed } from "@/components/dashboard/ChromeContext";
import { useBookingLifecycle } from "@/components/dashboard/useBookingLifecycle";
import { Pagination } from "@/components/ui/Pagination";
import { AddEventModal } from "@/components/dashboard/AddEventModal";

const PAGE_SIZE = 20;

export default function DashboardHomePage() {
  const router = useRouter();
  // Events meter / usage shared via ChromeContext — single fetch for the whole
  // dashboard (Sidebar meter + header pill read the same value).
  const { dlpUsage, dlpLoading, locked } = useChrome();
  // Drives the hero/stats-collapse + locked-toolbar scroll animation below.
  const collapsed = useScrollCollapsed(24);
  const [data, setData] = useState<BookingsListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  // Opt-in archived+expired view (parity with the events tab).
  const [showArchived, setShowArchived] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, [search]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Status is filtered server-side so pagination reflects the filtered set
      // (the page only ever holds one paginated page). "archived" resolves to
      // the combined archived+expired view on the backend.
      const res = await getAllBookings({
        page,
        limit: PAGE_SIZE,
        search: debouncedSearch || undefined,
        status: showArchived ? "archived" : "published",
      });
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, showArchived]);

  useEffect(() => { void reload(); }, [reload]);

  const { onArchive, onRestore, onClearData, toastNode } = useBookingLifecycle(reload);

  // The bookings endpoint doesn't return a total count; allow paging forward
  // while a full page comes back and back to page 1.
  const totalPages = useMemo(() => {
    if (!data) return 1;
    return data.bookings.length === PAGE_SIZE ? page + 1 : page;
  }, [data, page]);

  // No aggregate tracking totals from the API — sum what's on this page.
  // `total` is the visible event count (the ≤20 rows on this page), not a sum
  // of trackings. True company-wide totals need a backend aggregate endpoint.
  const stats = useMemo(() => {
    const rows = data?.bookings ?? [];
    const visits = rows.reduce((s, b) => s + (b.trackings?.visit ?? 0), 0);
    const contacts = rows.reduce((s, b) => s + (b.trackings?.contact ?? 0), 0);
    const reviews = rows.reduce((s, b) => s + (b.trackings?.review ?? 0), 0);
    return { visits, contacts, reviews, total: rows.length };
  }, [data]);

  function openEvent(row: Booking) {
    router.push(`/dashboard/events/${row._id}`);
  }

  function openCreate() {
    setModalOpen(true);
  }

  const isEmpty = !loading && data && data.bookings.length === 0;

  // Event creation is only ever gated on count-based plans (Free/Event-based)
  // when the event allowance is used up. Storage plans (Monthly/Yearly) can
  // always create events — only uploads are gated (in the upload modal).
  const createBlocked =
    isCountBasedPlan(dlpUsage?.service_type) && dlpUsage?.remaining === 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
      {/* Limit exhausted disclaimer (count-based plans only) */}
      {!dlpLoading && createBlocked && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-[var(--color-brand-danger)]/30 bg-[var(--color-brand-danger-soft)] px-4 py-3 text-sm text-[var(--color-brand-danger)]"
        >
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            You&apos;ve used all your events for this plan. New events cannot be created until your plan is upgraded or renewed. Contact your account manager.
          </span>
        </div>
      )}

      {/* Page header + stats — collapse away (height + fade) once the list
          scrolls past them. */}
      <div className={`scroll-collapse ${collapsed ? "is-collapsed" : ""}`}>
        <div className="scroll-collapse-inner">
          <div className="scroll-collapse-fade space-y-6 pb-6">
            <section className="dash-rise flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-brand-muted)]">
                  Delivery Hub · Published
                </p>
                <h1 className="mt-1.5 text-3xl font-bold leading-tight text-[var(--color-brand-ink)]">
                  Your events,<br className="hidden sm:block" /> in one place.
                </h1>
                <p className="mt-1.5 max-w-lg text-sm text-[var(--color-brand-muted)]">
                  Branded links for every booking. Track who opens what, when.
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                <button
                  type="button"
                  onClick={openCreate}
                  disabled={createBlocked}
                  className="brand-focus inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--color-brand-navy)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <PlusIcon />
                  Add event
                </button>
                <UsagePill usage={dlpUsage} loading={dlpLoading} />
              </div>
            </section>

            <StatsBar
              visits={stats.visits}
              contacts={stats.contacts}
              reviews={stats.reviews}
              total={stats.total}
            />
          </div>
        </div>
      </div>

      {/* Search + count row — locks to a single compact line once the header
          above has scrolled out; Pagination + Add event fold into it so both
          stay reachable without scrolling back up or down. */}
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
            placeholder="Search by client name…"
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
                <Pagination current={page} totalPages={totalPages} onChange={(p) => setPage(p)} compact />
              )}
              <button
                type="button"
                onClick={openCreate}
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

      {/* Content */}
      <section>
        {loading && !data ? (
          <CardGridSkeleton />
        ) : isEmpty ? (
          showArchived ? (
            <ArchivedEmpty onClear={() => { setShowArchived(false); setPage(1); }} />
          ) : (
            <EmptyState onCreate={openCreate} disabled={createBlocked} />
          )
        ) : (
          data && data.bookings.length > 0 && (
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
        <Pagination current={page} totalPages={totalPages} onChange={(p) => setPage(p)} />
      )}

      <AddEventModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}

function EmptyState({ onCreate, disabled }: { onCreate: () => void; disabled?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-5 rounded-xl border border-dashed border-[var(--color-brand-border)] bg-[var(--color-brand-surface)] px-6 py-14 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[var(--color-brand-bg)] text-[var(--color-brand-muted)]">
        <PageIcon />
      </div>
      <div className="space-y-1">
        <p className="text-xl font-bold text-[var(--color-brand-ink)]">No events yet</p>
        <p className="max-w-sm text-sm text-[var(--color-brand-muted)]">
          Create your first event in under a minute and share the link with your client.
        </p>
      </div>
      <button
        type="button"
        onClick={onCreate}
        disabled={disabled}
        className="brand-focus inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--color-brand-navy)] px-5 text-sm font-semibold text-white hover:bg-[var(--color-brand-navy-deep)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <PlusIcon />
        Create your first event
      </button>
    </div>
  );
}

function ArchivedEmpty({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-5 rounded-xl border border-dashed border-[var(--color-brand-border)] bg-[var(--color-brand-surface)] px-6 py-14 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[var(--color-brand-bg)] text-[var(--color-brand-muted)]">
        <ArchiveIcon size={26} />
      </div>
      <div className="space-y-1">
        <p className="text-xl font-bold text-[var(--color-brand-ink)]">No archived or expired events</p>
        <p className="max-w-sm text-sm text-[var(--color-brand-muted)]">
          Nothing has been archived or expired yet.
        </p>
      </div>
      <button
        type="button"
        onClick={onClear}
        className="brand-focus inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--color-brand-border)] bg-[var(--color-brand-surface-raised)] px-5 text-sm font-semibold text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)]"
      >
        Back to live events
      </button>
    </div>
  );
}

function ArchiveIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
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

function UsagePill({ usage, loading }: { usage: DlpUsage | null; loading: boolean }) {
  if (loading) {
    return <div className="skeleton h-5 w-24 rounded-full" />;
  }
  if (!usage) return null;

  // Count-based plans (Free / Event-based): "{remaining} remaining" (events).
  if (isCountBasedPlan(usage.service_type)) {
    const remaining = usage.remaining ?? 0;
    const isExhausted = remaining === 0;
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold"
        style={
          isExhausted
            ? { color: "var(--color-brand-danger)", background: "var(--color-brand-danger-soft)" }
            : { color: "var(--color-brand-navy)", background: "var(--color-brand-navy-soft)" }
        }
      >
        {isExhausted ? <WarnDot /> : <CountDot />}
        {remaining} remaining
      </span>
    );
  }

  // Storage-based plans (Monthly / Yearly): "{used}/{limit} GB" with the shared
  // green → orange → red severity. Never framed as "exhausted" — event creation
  // isn't gated here.
  if (isStorageBasedPlan(usage.service_type) && typeof usage.limit === "number") {
    const limit = usage.limit;
    const pct = limit > 0 ? Math.min((usage.used / limit) * 100, 100) : 0;
    const severity = getUsageSeverity(pct);
    const palette =
      severity === "danger"
        ? { color: "var(--color-brand-danger)", background: "var(--color-brand-danger-soft)" }
        : severity === "warning"
          ? { color: "var(--color-brand-warning)", background: "var(--color-brand-warning-soft)" }
          : { color: "var(--color-brand-success)", background: "var(--color-brand-success-soft)" };
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums"
        style={palette}
      >
        <CountDot />
        {usage.used.toFixed(1)} / {limit.toFixed(1)} GB
      </span>
    );
  }

  // Malformed/absent subscription (no plan type or missing limit): bare count.
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={{ color: "var(--color-brand-muted)", background: "var(--color-brand-surface)" }}
    >
      <CountDot />
      {usage.used} this month
    </span>
  );
}

function CountDot() {
  return <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />;
}

function WarnDot() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M12 8v5M12 16.5v.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
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

function PageIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="4" width="18" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 8h18M9 14h6M9 17h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
