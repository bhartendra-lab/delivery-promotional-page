"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listDeliveryPages, getDeliveryPageById } from "@/lib/api";
import type {
  DeliveryLandingPage,
  DeliveryLandingPageListItem,
  ListResponse,
} from "@/lib/types";
import { StatsBar } from "@/components/dashboard/StatsBar";
import { PagesTable } from "@/components/dashboard/PagesTable";
import { PageCard } from "@/components/dashboard/PageCard";
import { Pagination } from "@/components/ui/Pagination";
import { CreateEditDrawer } from "@/components/dashboard/CreateEditDrawer";

const PAGE_SIZE = 20;

export default function DashboardHomePage() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<DeliveryLandingPage | null>(null);

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
      const res = await listDeliveryPages({
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
    return Math.max(1, Math.ceil(data.totalPages / PAGE_SIZE));
  }, [data]);

  async function openEdit(row: DeliveryLandingPageListItem) {
    try {
      const res = await getDeliveryPageById(row._id);
      res.deliveryLandingPage.background_image = `${res.deliveryLandingPage.background_image}?v=${Date.now()}`;
      setEditTarget(res.deliveryLandingPage);
      setDrawerOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load page");
    }
  }

  function openCreate() {
    setEditTarget(null);
    setDrawerOpen(true);
  }

  const isEmpty = !loading && data && data.deliveryLandingPages.length === 0;

  return (
    <div className="space-y-8">
      {/* Welcome banner */}
      <section className="dash-rise">
        <div className="relative overflow-hidden rounded-2xl bg-[var(--color-brand-navy)] p-6 text-white sm:p-8">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-32 -top-32 h-80 w-80 rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(212,175,99,0.25), transparent 60%)",
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-24 -left-20 h-60 w-60 rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(212,175,99,0.12), transparent 60%)",
            }}
          />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[var(--color-brand-gold)]">
                Dashboard
              </p>
              <h1
                className="mt-2 text-3xl font-medium leading-tight sm:text-4xl"
                style={{ fontFamily: "var(--font-cormorant)" }}
              >
                Your delivery pages
              </h1>
              <p className="mt-2 max-w-xl text-sm text-white/80">
                Generate branded delivery links, share them with clients, and
                track every visit, click and review in real time.
              </p>
            </div>
            <button
              type="button"
              onClick={openCreate}
              className="brand-focus group inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--color-brand-gold)] px-5 text-sm font-semibold text-[var(--color-brand-navy)] shadow-[0_8px_20px_-8px_rgba(212,175,99,0.6)] transition-transform hover:-translate-y-0.5 sm:self-end"
            >
              <PlusIcon />
              New delivery page
              <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
            </button>
          </div>
        </div>
      </section>

      {/* Stats */}
      <StatsBar
        visits={data?.visitTrackings ?? 0}
        deliveries={data?.deliveryTrackings ?? 0}
        reviews={data?.reviewTrackings ?? 0}
        total={data?.totalTrackings ?? 0}
      />

      {/* Search & filters row */}
      <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[var(--color-brand-muted)]">
            <SearchIcon />
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by client name…"
            className="brand-focus h-11 w-full rounded-xl border border-[var(--color-brand-border)] bg-white pl-10 pr-3 text-sm text-[var(--color-brand-ink)] outline-none placeholder:text-[var(--color-brand-muted)]/70"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute inset-y-0 right-2 my-auto flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-brand-muted)] hover:bg-[var(--color-brand-navy-soft)]"
              aria-label="Clear search"
            >
              <ClearIcon />
            </button>
          )}
        </div>

        {data && (
          <p className="text-xs text-[var(--color-brand-muted)]">
            <span className="font-semibold text-[var(--color-brand-ink)]">
              {data.deliveryLandingPages.length}
            </span>{" "}
            of <span className="font-semibold text-[var(--color-brand-ink)]">{data.totalPages}</span>{" "}
            {data.totalPages === 1 ? "page" : "pages"}
          </p>
        )}
      </section>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-[var(--color-brand-danger)]/30 bg-[var(--color-brand-danger-soft)] px-4 py-3 text-sm text-[var(--color-brand-danger)]"
        >
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Content */}
      <section>
        {loading && !data ? (
          <TableSkeleton />
        ) : isEmpty ? (
          <EmptyState onCreate={openCreate} />
        ) : (
          data &&
          data.deliveryLandingPages.length > 0 && (
            <>
              <div className="hidden sm:block">
                <PagesTable rows={data.deliveryLandingPages} onEdit={openEdit} />
              </div>
              <div className="space-y-3 sm:hidden">
                {data.deliveryLandingPages.map((row) => (
                  <PageCard key={row._id} row={row} onEdit={openEdit} />
                ))}
              </div>
            </>
          )
        )}
      </section>

      {data && data.deliveryLandingPages.length > 0 && (
        <Pagination
          current={page}
          totalPages={totalPages}
          onChange={(p) => setPage(p)}
        />
      )}

      <CreateEditDrawer
        open={drawerOpen}
        target={editTarget}
        onClose={() => {
          setDrawerOpen(false);
          setEditTarget(null);
        }}
        onSaved={() => {
          setDrawerOpen(false);
          setEditTarget(null);
          void reload();
        }}
      />
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-5 rounded-2xl border border-dashed border-[var(--color-brand-outline)] bg-white px-6 py-14 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--color-brand-navy-soft)] text-[var(--color-brand-navy)]">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
          <rect
            x="3"
            y="4"
            width="18"
            height="16"
            rx="3"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="M3 8h18M8 4v4M16 4v4M9 14h6M9 17h4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div className="space-y-1">
        <p
          className="text-xl text-[var(--color-brand-ink)]"
          style={{ fontFamily: "var(--font-cormorant)", fontWeight: 600 }}
        >
          No delivery pages yet
        </p>
        <p className="max-w-md text-sm text-[var(--color-brand-muted)]">
          Create your first branded delivery page in under a minute. Share the
          link with your client and watch the engagement light up.
        </p>
      </div>
      <button
        type="button"
        onClick={onCreate}
        className="brand-focus inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--color-brand-navy)] px-5 text-sm font-semibold text-white hover:bg-[var(--color-brand-navy-deep)]"
      >
        <PlusIcon />
        Create your first page
      </button>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="skeleton h-16 rounded-xl"
          style={{ animationDelay: `${i * 0.1}s` }}
        />
      ))}
    </div>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M20 20l-3.5-3.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M12 8v5M12 16.5v.01"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
