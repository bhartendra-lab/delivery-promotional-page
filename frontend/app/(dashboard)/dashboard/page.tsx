"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getAllBookings } from "@/lib/api";
import type { Booking, BookingsListResponse, DlpUsage } from "@/lib/types";
import { isCountBasedPlan, isStorageBasedPlan, getUsageSeverity } from "@/lib/types";
import { useCompany } from "@/lib/useCompany";
import { StatsBar } from "@/components/dashboard/StatsBar";
import { EventCard } from "@/components/dashboard/EventCard";
import { useChrome } from "@/components/dashboard/ChromeContext";
import { useUploadingBookingIds } from "@/lib/r2-upload/useActiveUploads";
import { useBookingLifecycle } from "@/components/dashboard/useBookingLifecycle";
import { Pagination } from "@/components/ui/Pagination";
import { AddEventModal } from "@/components/dashboard/AddEventModal";
import { useUpgradeModal } from "@/components/billing/UpgradeModalProvider";
import { WelcomeDialog } from "@/components/onboarding/WelcomeDialog";
import {
  IconArchive,
  IconPlus,
  IconSearch,
  IconX,
  IconWarningCircle,
  IconArticle,
  IconGlobe,
} from "@/components/ui/icons";

const PAGE_SIZE = 20;

export default function DashboardHomePage() {
  const router = useRouter();
  // Events meter / usage shared via ChromeContext — single fetch for the whole
  // dashboard (Sidebar meter + header pill read the same value).
  const { dlpUsage, dlpLoading } = useChrome();
  const { openUpgradeModal } = useUpgradeModal();
  const company = useCompany();
  // Session-only (not localStorage) — the nudge should come back next visit
  // until the studio actually links a Google listing.
  const [gmbNudgeDismissed, setGmbNudgeDismissed] = useState(false);
  // Uploads survive navigation, so cards stay openable while one runs. Only
  // the uploading event holds back its own lifecycle actions.
  const uploadingIds = useUploadingBookingIds();
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
    if (isCountBasedPlan(dlpUsage?.service_type) && dlpUsage?.remaining === 0) {
      openUpgradeModal({ preset: "event" });
      return;
    }
    setModalOpen(true);
  }

  const isEmpty = !loading && data && data.bookings.length === 0;

  // Event creation is only ever gated on count-based plans (Free/Event-based)
  // when the event allowance is used up. Storage plans (Monthly/Yearly) can
  // always create events — only uploads are gated (in the upload modal).
  const createBlocked =
    isCountBasedPlan(dlpUsage?.service_type) && dlpUsage?.remaining === 0;
  const lowRemaining =
    isCountBasedPlan(dlpUsage?.service_type) && dlpUsage?.remaining != null && dlpUsage.remaining > 0 && dlpUsage.remaining <= 2;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
      {company?.gmb_skipped === true && !company?.google_place_id && !gmbNudgeDismissed && (
        <div className="flex items-start gap-3 rounded-xl border border-[var(--color-brand-border)] bg-[var(--color-brand-surface)] px-4 py-3">
          <IconGlobe className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-brand-muted)]" />
          <div className="flex-1 text-sm">
            <p className="font-semibold text-[var(--color-brand-ink)]">Add your Google listing to collect reviews.</p>
            <p className="mt-0.5 text-xs text-[var(--color-brand-muted)]">
              Clients can leave a review straight from their gallery once it&apos;s linked.
            </p>
          </div>
          <a
            href="/dashboard/settings"
            className="brand-focus shrink-0 text-sm font-semibold text-[var(--color-brand-navy)] underline-offset-2 hover:underline"
          >
            Add it now
          </a>
          <button
            type="button"
            onClick={() => setGmbNudgeDismissed(true)}
            aria-label="Dismiss"
            className="brand-focus flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[var(--color-brand-muted)] hover:bg-[var(--color-brand-border)] hover:text-[var(--color-brand-ink)]"
          >
            <IconX size={13} />
          </button>
        </div>
      )}

      {/* Limit exhausted disclaimer (count-based plans only) */}
      {!dlpLoading && createBlocked && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-[var(--color-brand-danger)]/30 bg-[var(--color-brand-danger-soft)] px-4 py-3 text-sm text-[var(--color-brand-danger)]"
        >
          <IconWarningCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">
            You&apos;ve reached the maximum number of events for your current plan.
          </span>
          <button
            type="button"
            onClick={() => openUpgradeModal({ preset: "event" })}
            className="brand-focus shrink-0 rounded-lg border border-current px-3 py-1 text-xs font-semibold"
          >
            Buy more events
          </button>
        </div>
      )}

      {/* Page header + stats — scrolls away normally with the rest of the
          page; only the search bar below stays sticky. */}
      <div className="space-y-6 pb-6">
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
              className="brand-focus inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--color-brand-navy)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)]"
            >
              <IconPlus />
              {createBlocked ? "Buy more events" : "Add event"}
            </button>
            {lowRemaining && (
              <p className="text-xs text-[var(--color-brand-muted)]">{dlpUsage?.remaining} events left</p>
            )}
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

      {/* Search + count row — stays sticky under the (now normally-scrolling)
          header, with a static bottom border. */}
      <section className="sticky top-0 z-10 flex flex-col gap-3 border-b border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[var(--color-brand-muted)]">
            <IconSearch size={15} />
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
              <IconX size={13} />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div
            role="group"
            aria-label="Filter by status"
            className="inline-flex shrink-0 items-center rounded-full border border-[var(--color-brand-border)] p-0.5"
          >
            <button
              type="button"
              onClick={() => {
                setShowArchived(false);
                setPage(1);
              }}
              aria-pressed={!showArchived}
              className={`brand-focus h-7 rounded-full px-3 text-xs font-semibold transition-colors ${
                !showArchived
                  ? "bg-[var(--color-brand-navy-soft)] text-[var(--color-brand-navy)]"
                  : "text-[var(--color-brand-muted)] hover:text-[var(--color-brand-ink)]"
              }`}
            >
              Active
            </button>
            <button
              type="button"
              onClick={() => {
                setShowArchived(true);
                setPage(1);
              }}
              aria-pressed={showArchived}
              className={`brand-focus h-7 rounded-full px-3 text-xs font-semibold transition-colors ${
                showArchived
                  ? "bg-[var(--color-brand-navy-soft)] text-[var(--color-brand-navy)]"
                  : "text-[var(--color-brand-muted)] hover:text-[var(--color-brand-ink)]"
              }`}
            >
              Archived
            </button>
          </div>

          {data && (
            <p className="shrink-0 text-xs text-[var(--color-brand-muted)]">
              Showing{" "}
              <span className="font-semibold text-[var(--color-brand-ink)]">
                {data.bookings.length}
              </span>{" "}
              {data.bookings.length === 1 ? "event" : "events"}
            </p>
          )}
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

      {/* Content */}
      <section>
        {loading && !data ? (
          <CardGridSkeleton />
        ) : isEmpty ? (
          showArchived ? (
            <ArchivedEmpty onClear={() => { setShowArchived(false); setPage(1); }} />
          ) : (
            <EmptyState onCreate={openCreate} />
          )
        ) : (
          data && data.bookings.length > 0 && (
            <div className="dash-stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
        <Pagination current={page} totalPages={totalPages} onChange={(p) => setPage(p)} />
      )}

      <AddEventModal open={modalOpen} onClose={() => setModalOpen(false)} />
      <WelcomeDialog />
    </div>
  );
}

function EmptyState({ onCreate, disabled }: { onCreate: () => void; disabled?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-5 rounded-xl border border-dashed border-[var(--color-brand-border)] bg-[var(--color-brand-surface)] px-6 py-14 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[var(--color-brand-bg)] text-[var(--color-brand-muted)]">
        <IconArticle size={28} />
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
        <IconPlus />
        Create your first event
      </button>
    </div>
  );
}

function ArchivedEmpty({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-5 rounded-xl border border-dashed border-[var(--color-brand-border)] bg-[var(--color-brand-surface)] px-6 py-14 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[var(--color-brand-bg)] text-[var(--color-brand-muted)]">
        <IconArchive size={26} />
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
        {isExhausted ? <IconWarningCircle size={12} /> : <CountDot />}
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
