"use client";

import { useState } from "react";
import { useCompany } from "@/lib/useCompany";
import { studioLabel } from "@/lib/collections/logic";
import { MediaGrid } from "./MediaGrid";
import { LikedFilters } from "./LikedFilters";
import { LocateOriginals } from "./LocateOriginals";
import { useEvent, hasActiveLikedFilters, resetLikedScope } from "./EventContext";
import { IconHeart, IconPlus, IconTarget } from "./icons";
import { CollectionsPills, CollectionsRail, type SmartView } from "./CollectionsRail";
import { CollectionView } from "./CollectionView";
import { NameDialog, StudioCollectionSheet } from "./CollectionDialogs";
import { useStudioCollections } from "./useStudioCollections";

/**
 * Smart Selects — a top-level section (sibling of Media / Gallery Design /
 * Access & Sharing) for the photos guests liked. The studio filters them by who
 * liked, shortlists the best picks for delivery, locates their originals, and
 * downloads. The header stacks a title bar and the filter bar — the Liked /
 * Shortlisted counts live as badges on the filter bar's quick pills rather than
 * a separate full-width stat strip.
 *
 * With collections switched on (the server's COLLECTIONS_ENABLED), the tab
 * gains a left rail on a laptop and a pill row on a phone: All liked,
 * Shortlisted, the Client's collections and New collection. All liked and
 * Shortlisted are the same liked feed and filters as always; a collection
 * opens its own view. With the switch off none of that renders and the tab is
 * exactly what it was.
 */
export function SmartSelectsTab({
  loading,
  focus,
}: {
  loading: boolean;
  /** Open this collection (the bell's deep link). `seq` makes a repeat count. */
  focus?: { collectionId: string | null; seq: number } | null;
}) {
  const {
    bookingId,
    meta,
    media,
    folders,
    likedCount,
    shortlistedCount,
    likedFilters,
    setLikedFilters,
    setShortlisted,
    selectAllIds,
    totalForView,
    hasMore,
    loadingMore,
    loadMore,
    activeLocked,
    toast,
  } = useEvent();
  const company = useCompany();
  const studioName = studioLabel(company?.name);

  const [locateOpen, setLocateOpen] = useState(false);
  const studio = useStudioCollections(bookingId);
  const collectionsOn = studio.status === "on";
  const [view, setView] = useState<SmartView>({ kind: "liked" });
  const [adding, setAdding] = useState<{ ids: string[]; done: () => void } | null>(null);
  const [naming, setNaming] = useState(false);

  // The bell's deep link: open that collection once the list is in hand. A
  // collection that is no longer there (deleted, or emptied and hidden) leaves
  // the tab on All liked.
  const [handledFocus, setHandledFocus] = useState<number | null>(null);
  if (focus && focus.seq !== handledFocus && studio.status !== "probing" && (studio.loaded || studio.status === "off")) {
    setHandledFocus(focus.seq);
    if (focus.collectionId && studio.byId.has(focus.collectionId)) setView({ kind: "collection", id: focus.collectionId });
    else setView({ kind: "liked" });
  }

  // A collection deleted, or hidden, while open: back to All liked.
  const openCollection = view.kind === "collection" ? studio.byId.get(view.id) ?? null : null;
  if (view.kind === "collection" && studio.loaded && !openCollection) setView({ kind: "liked" });

  const filtersActive = hasActiveLikedFilters(likedFilters);
  // "No likes at all" (vs. a filter that simply matched nothing) → the friendly
  // first-run empty state instead of the filter bar.
  const noLikesAtAll = !loading && likedCount === 0 && media.length === 0 && !filtersActive;

  // Locate Originals has work to do when anything is shortlisted, or (with
  // collections) when any collection has photos.
  const collectionPhotos = collectionsOn && studio.collections.some((c) => c.count > 0);
  const canLocate = shortlistedCount > 0 || collectionPhotos;

  const emptyMessage: React.ReactNode = !filtersActive
    ? "No liked photos yet."
    : (
      <div className="flex flex-col items-center gap-2">
        <p>
          {likedFilters.shortlistedOnly
            ? "No shortlisted photos match these filters yet."
            : "No liked photos match these filters."}
        </p>
        <button
          type="button"
          onClick={() => setLikedFilters(resetLikedScope)}
          className="brand-focus text-[12.5px] font-semibold text-[var(--color-brand-navy)] hover:underline"
        >
          Clear filters to see all liked photos
        </button>
      </div>
    );

  const railProps = {
    view,
    shortlistedOnly: likedFilters.shortlistedOnly,
    likedCount,
    shortlistedCount,
    collections: studio.collections,
    canCreate: studio.collections.length < studio.maxCollections,
    onAllLiked: () => {
      setView({ kind: "liked" });
      setLikedFilters(resetLikedScope);
    },
    onShortlisted: () => {
      setView({ kind: "liked" });
      setLikedFilters((f) => ({ ...f, shortlistedOnly: true }));
    },
    onCollection: (id: string) => setView({ kind: "collection", id }),
    onNew: () => setNaming(true),
  };

  /** "Add to collection" in the liked feed's selection bar. */
  const addAction = collectionsOn
    ? ({ ids, clear }: { ids: string[]; clear: () => void }) => (
        <button
          type="button"
          onClick={() => setAdding({ ids, done: clear })}
          className="brand-focus inline-flex items-center gap-1.5 rounded-md border border-[var(--color-brand-border)] bg-white px-3 py-1.5 text-[12.5px] font-semibold text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)]"
        >
          <IconPlus size={14} /> Add to collection
        </button>
      )
    : undefined;

  const likedBody =
    loading && media.length === 0 ? (
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
            allowDelete={false}
            showLikes
            showShortlist
            onShortlistMany={setShortlisted}
            onSelectAll={selectAllIds}
            totalForView={totalForView}
            viewKey={`smart:${JSON.stringify(likedFilters)}`}
            hasMore={hasMore}
            loadingMore={loadingMore}
            onLoadMore={loadMore}
            emptyMessage={emptyMessage}
            archiveName={`${meta.name || "Gallery"} — Smart Selects`}
            notify={toast}
            selectionActions={addAction}
          />
        </div>
      </>
    );

  return (
    <section className="flex h-full min-w-0 flex-1 overflow-hidden">
      {collectionsOn && (
        <div className="hidden lg:flex">
          <CollectionsRail {...railProps} />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* 1 — Title bar, locked. */}
        <div className="flex shrink-0 flex-col items-start justify-between gap-3 px-6 pt-6 sm:flex-row sm:items-center sm:px-10">
          <div>
            <h1 className="text-[22px] font-bold tracking-tight text-[var(--color-brand-ink)]">
              Smart Selects
            </h1>
            <p className="mt-1 max-w-[560px] text-[13px] leading-relaxed text-[var(--color-brand-muted)]">
              Every like here comes from a guest who scanned their face to find their own photos — no
              manual sorting needed. Flag the best with Host picks or Shortlisted, then jump to Locate
              Originals when you&apos;re ready to edit.
            </p>
          </div>
          {/* Locate Originals walks your whole photo drive and copies files out.
              Running that against a saturated compressor pool would crawl and
              slow the upload down with it — so it waits, while everything else
              on this tab stays usable mid-upload. */}
          <button
            type="button"
            onClick={() => setLocateOpen(true)}
            disabled={!canLocate || activeLocked}
            title={
              activeLocked
                ? "Available once the upload finishes — scanning your drive mid-upload would slow both down."
                : !canLocate
                  ? collectionsOn
                    ? "Shortlist photos, or wait for the Client to add photos to a collection."
                    : "Shortlist photos first to locate their originals."
                  : undefined
            }
            className="brand-focus inline-flex h-11 shrink-0 items-center gap-2 rounded-lg bg-[var(--color-brand-navy)] px-5 text-[13.5px] font-semibold text-white hover:bg-[var(--color-brand-navy-deep)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <IconTarget size={16} />
            Locate Originals{!collectionPhotos && shortlistedCount > 0 ? ` (${shortlistedCount.toLocaleString("en-IN")})` : ""}
          </button>
        </div>

        {collectionsOn && (
          <div className="shrink-0 px-6 pt-4 sm:px-10 lg:hidden">
            <CollectionsPills {...railProps} />
          </div>
        )}

        {/* Locate Originals modal (mounts only while open — everything about a
            run lives inside it; nothing is persisted once it closes). */}
        <LocateOriginals
          bookingId={bookingId}
          eventName={meta.name}
          shortlistedCount={shortlistedCount}
          collections={collectionsOn ? studio.collections : null}
          open={locateOpen}
          onOpenChange={setLocateOpen}
          toast={toast}
        />

        {openCollection ? (
          <div className="flex min-h-0 flex-1 flex-col px-6 pt-5 sm:px-10">
            <CollectionView
              key={openCollection._id}
              bookingId={bookingId}
              eventName={meta.name}
              collection={openCollection}
              studio={studio}
              folders={folders}
              toast={toast}
              onAddToCollection={(ids, done) => setAdding({ ids, done })}
              onDeleted={() => setView({ kind: "liked" })}
            />
          </div>
        ) : (
          likedBody
        )}
      </div>

      {adding && (
        <StudioCollectionSheet
          studio={studio}
          ids={adding.ids}
          studioName={studioName}
          onClose={(summary, changed) => {
            const done = adding.done;
            setAdding(null);
            if (changed) done();
            if (summary) toast(summary);
          }}
        />
      )}
      {naming && (
        <NameDialog
          title="New collection"
          initial=""
          action="Create"
          onClose={() => setNaming(false)}
          onSubmit={async (name) => {
            const created = await studio.create(name);
            setView({ kind: "collection", id: created._id });
            toast(`Created ${created.name}`);
          }}
        />
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
