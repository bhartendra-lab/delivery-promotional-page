"use client";

import { useState } from "react";
import { MediaGrid } from "./MediaGrid";
import { LikedFilters } from "./LikedFilters";
import { LocateOriginals } from "./LocateOriginals";
import { useEvent, hasActiveLikedFilters } from "./EventContext";
import { IconHeart, IconStar, IconTarget } from "./icons";

/**
 * Smart Selects — a top-level section (sibling of Media / Gallery Design /
 * Access & Sharing) for the photos guests liked. The studio filters them by who
 * liked, shortlists the best picks for delivery, locates their originals, and
 * downloads. The header stacks a title bar and the filter bar — the Liked /
 * Shortlisted counts live as badges on the filter bar's quick pills rather than
 * a separate full-width stat strip.
 */
export function SmartSelectsTab({ loading }: { loading: boolean }) {
  const {
    bookingId,
    meta,
    media,
    likedCount,
    shortlistedCount,
    likedFilters,
    setLikedFilters,
    setShortlisted,
    totalForView,
    hasMore,
    loadingMore,
    loadMore,
    activeLocked,
    toast,
  } = useEvent();

  const [locateOpen, setLocateOpen] = useState(false);

  const filtersActive = hasActiveLikedFilters(likedFilters);
  // "No likes at all" (vs. a filter that simply matched nothing) → the friendly
  // first-run empty state instead of the filter bar.
  const noLikesAtAll = !loading && likedCount === 0 && media.length === 0 && !filtersActive;

  const emptyMessage = likedFilters.shortlistedOnly
    ? "No shortlisted photos yet — select liked photos and tap Shortlist."
    : filtersActive
    ? "No liked photos match these filters."
    : "No liked photos yet.";

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
      {/* 1 — Title bar, locked. */}
      <div className="flex shrink-0 flex-col items-start justify-between gap-3 px-6 pt-6 sm:flex-row sm:items-center sm:px-10">
        <div>
          <h1 className="flex items-center gap-2 text-[22px] font-bold tracking-tight text-[var(--color-brand-ink)]">
            <IconStar size={19} filled className="text-[var(--color-brand-warning)]" />
            Smart Selects
          </h1>
          <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-brand-muted)]">
            The photos your clients loved. Filter by who liked them, shortlist the best with the
            host, then locate the originals.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setLocateOpen(true)}
          disabled={shortlistedCount === 0}
          title={shortlistedCount === 0 ? "Shortlist photos first to locate their originals." : undefined}
          className="brand-focus inline-flex shrink-0 items-center gap-2 rounded-lg border border-[var(--color-brand-navy)] bg-[var(--color-brand-navy-soft)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--color-brand-navy)] hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          <IconTarget size={15} />
          Locate Originals
        </button>
      </div>

      {loading && media.length === 0 ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-12 sm:px-10">
          <div className="mt-6">
            <SkeletonGrid />
          </div>
        </div>
      ) : noLikesAtAll ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-12 sm:px-10">
          <EmptyState />
        </div>
      ) : (
        <>
          {/* Locate Originals modal (mounts only while open — everything about a
              run lives inside it; nothing is persisted once it closes). */}
          <LocateOriginals
            bookingId={bookingId}
            eventName={meta.name}
            shortlistedCount={shortlistedCount}
            open={locateOpen}
            onOpenChange={setLocateOpen}
            toast={toast}
          />

          {/* 2 — Filter bar, locked (Liked / Shortlisted counts ride as pill badges). */}
          <div className="shrink-0 px-6 sm:px-10">
            <LikedFilters
              bookingId={bookingId}
              guestTypes={meta.guestTypes}
              filters={likedFilters}
              onChange={setLikedFilters}
              likedCount={likedCount}
              shortlistedCount={shortlistedCount}
            />

            {filtersActive && (
              <p className="-mt-2 mb-3 text-[12px] text-[var(--color-brand-muted)]">
                {totalForView.toLocaleString("en-IN")} shown
              </p>
            )}
          </div>

          {/* 3 — Grid, its own scroll region below the locked filters. */}
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-12 sm:px-10">
            <MediaGrid
              items={media}
              disabled={activeLocked}
              allowDelete={false}
              showLikes
              showShortlist
              onShortlistMany={setShortlisted}
              hasMore={hasMore}
              loadingMore={loadingMore}
              onLoadMore={loadMore}
              emptyMessage={emptyMessage}
              archiveName={`${meta.name || "Gallery"} — Smart Selects`}
              notify={toast}
            />
          </div>
        </>
      )}
    </section>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="skeleton aspect-square rounded" style={{ animationDelay: `${i * 0.05}s` }} />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto my-8 flex max-w-[480px] flex-col items-center gap-3.5 rounded-xl border-2 border-dashed border-[var(--color-brand-outline)] bg-white px-8 py-12 text-center">
      <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--color-brand-navy-soft)] text-[var(--color-brand-navy)]">
        <IconHeart size={30} />
      </div>
      <h3 className="text-[19px] font-bold tracking-tight text-[var(--color-brand-ink)]">No liked photos yet</h3>
      <p className="text-[14px] leading-relaxed text-[var(--color-brand-muted)]">
        When guests like photos in your live gallery, their favourites gather here — ready for you to
        shortlist the best picks with the host.
      </p>
    </div>
  );
}
