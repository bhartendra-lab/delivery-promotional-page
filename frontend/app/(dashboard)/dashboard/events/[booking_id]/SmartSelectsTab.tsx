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
 * downloads. The header stacks a title bar, a Liked→Shortlisted→Located progress
 * strip, and the filter bar.
 */
export function SmartSelectsTab({ loading }: { loading: boolean }) {
  const {
    bookingId,
    meta,
    media,
    likedCount,
    shortlistedCount,
    locatedCount,
    likedFilters,
    setLikedFilters,
    setShortlisted,
    totalForView,
    hasMore,
    loadingMore,
    loadMore,
    activeLocked,
    reload,
    toast,
  } = useEvent();

  const [locateOpen, setLocateOpen] = useState(false);

  // Awaiting original = shortlisted photos whose originals aren't located yet.
  // Drives the Locate button pill and the "Awaiting original" filter pill — both
  // must always show this same number.
  const awaitingCount = Math.max(0, shortlistedCount - locatedCount);

  const filtersActive = hasActiveLikedFilters(likedFilters);
  // "No likes at all" (vs. a filter that simply matched nothing) → the friendly
  // first-run empty state instead of the filter bar.
  const noLikesAtAll = !loading && likedCount === 0 && media.length === 0 && !filtersActive;

  const emptyMessage = likedFilters.awaitingOnly
    ? "No photos awaiting an original — every shortlisted photo is located."
    : likedFilters.shortlistedOnly
    ? "No shortlisted photos yet — select liked photos and tap Shortlist."
    : filtersActive
    ? "No liked photos match these filters."
    : "No liked photos yet.";

  return (
    <section className="flex min-w-0 flex-1 flex-col px-6 pb-12 pt-6 sm:px-10">
      {/* 1 — Title bar */}
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
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
          disabled={awaitingCount === 0}
          title={
            awaitingCount === 0
              ? shortlistedCount === 0
                ? "Shortlist photos first to locate their originals."
                : "Every shortlisted photo's original is already located."
              : undefined
          }
          className="brand-focus inline-flex shrink-0 items-center gap-2 rounded-lg border border-[var(--color-brand-navy)] bg-[var(--color-brand-navy-soft)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--color-brand-navy)] hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          <IconTarget size={15} />
          Locate Originals
          {awaitingCount > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--color-brand-navy)] px-1.5 text-[11px] font-bold text-white">
              {awaitingCount.toLocaleString("en-IN")}
            </span>
          )}
        </button>
      </div>

      {loading && media.length === 0 ? (
        <div className="mt-6">
          <SkeletonGrid />
        </div>
      ) : noLikesAtAll ? (
        <EmptyState />
      ) : (
        <>
          {/* 2 — Progress strip */}
          <ProgressStrip liked={likedCount} shortlisted={shortlistedCount} located={locatedCount} />

          {/* Locate report + modal (renders only once something is shortlisted). */}
          <LocateOriginals
            bookingId={bookingId}
            eventName={meta.name}
            shortlistedCount={shortlistedCount}
            open={locateOpen}
            onOpenChange={setLocateOpen}
            onLocated={reload}
            toast={toast}
          />

          {/* 3 — Filter bar */}
          <LikedFilters
            bookingId={bookingId}
            guestTypes={meta.guestTypes}
            filters={likedFilters}
            onChange={setLikedFilters}
            shortlistedCount={shortlistedCount}
            awaitingCount={awaitingCount}
          />

          {filtersActive && (
            <p className="mb-3 -mt-1 text-[12px] text-[var(--color-brand-muted)]">
              {totalForView.toLocaleString("en-IN")} shown
            </p>
          )}

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
        </>
      )}
    </section>
  );
}

/* ── progress strip ───────────────────────────────────────────────── */

/**
 * Liked → Shortlisted → Located, as three connected stat cards. Located ≤
 * Shortlisted ≤ Liked always holds, so the funnel reads left-to-right. No
 * "Exported" — download tracking is intentionally not part of Smart Selects.
 */
function ProgressStrip({
  liked,
  shortlisted,
  located,
}: {
  liked: number;
  shortlisted: number;
  located: number;
}) {
  return (
    <div className="mb-4 mt-6 flex items-stretch gap-1.5 rounded-xl border border-[var(--color-brand-border)] bg-white p-1.5 sm:gap-0">
      <Stat
        icon={<IconHeart size={15} />}
        label="Liked"
        value={liked}
        tint="var(--color-brand-navy)"
        soft="var(--color-brand-navy-soft)"
      />
      <Connector />
      <Stat
        icon={<IconStar size={15} filled />}
        label="Shortlisted"
        value={shortlisted}
        of={liked}
        tint="var(--color-brand-warning)"
        soft="var(--color-brand-warning-soft)"
      />
      <Connector />
      <Stat
        icon={<IconTarget size={15} />}
        label="Located"
        value={located}
        of={shortlisted}
        tint="var(--color-brand-success)"
        soft="var(--color-brand-success-soft)"
      />
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  of,
  tint,
  soft,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  /** Denominator for the mini progress bar (previous stage's count). */
  of?: number;
  tint: string;
  soft: string;
}) {
  const pct = of == null ? null : of === 0 ? 0 : Math.round((value / of) * 100);
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2.5">
      <span
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        style={{ background: soft, color: tint }}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[19px] font-bold leading-none tracking-tight text-[var(--color-brand-ink)]">
            {value.toLocaleString("en-IN")}
          </span>
          {pct != null && (
            <span className="text-[11px] font-semibold text-[var(--color-brand-muted)]">{pct}%</span>
          )}
        </div>
        <div className="mt-1 text-[11.5px] font-medium text-[var(--color-brand-muted)]">{label}</div>
        {pct != null && (
          <div className="mt-1.5 h-1 w-full max-w-[120px] overflow-hidden rounded-full bg-[var(--color-brand-surface)]">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{ width: `${pct}%`, background: tint }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function Connector() {
  return (
    <div className="hidden items-center px-1 sm:flex" aria-hidden>
      <span className="h-px w-6 bg-[var(--color-brand-border)]" />
    </div>
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
