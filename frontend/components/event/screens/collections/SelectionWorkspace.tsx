"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClientTheme } from "@/lib/client-theme";
import type { CustomFolder, GuestMediaItem } from "@/lib/types";
import type { PlanSource } from "@/lib/download/plan";
import { GuestAuthError } from "@/lib/guest-api";
import { getCuratorFeed, getCuratorFeedIds, reviewCollections } from "@/lib/collections/api";
import { attributionLine, bulkLikeMode, shortDate, statusLabel, targetStatus, unsortedLabel } from "@/lib/collections/logic";
import type { CuratorFeedQuery, CuratorItem, ReviewCollection } from "@/lib/collections/types";
import { IconCaretDown, IconChevronLeft, IconLock, IconWhatsApp } from "@/components/ui/icons";
import { GalleryGrid, GallerySkeleton } from "../gallery/GalleryGrid";
import { PhotoViewer } from "../lounge/PhotoViewer";
import { ReelViewer } from "../lounge/ReelViewer";
import { useViewerHistory } from "../lounge/useViewerHistory";
import { CollectionsSegment, TargetBar } from "./CollectionsSegment";
import { CuratorSelectionBar } from "./CuratorSelectionBar";
import { LikersSheet, PickerSheet } from "./PickerSheets";
import { useCuratorActions, type BulkTarget, type Notify } from "./useCuratorActions";
import { useCuratorFeed } from "./useCuratorFeed";
import type { CollectionsApi } from "./useCollections";

/** How far from the bottom the next page is asked for. */
const LOAD_AHEAD_PX = 600;
/** Ids per page when a bulk download walks a scope that is not all loaded. */
const WALK_PAGE = 200;
/** Clears the phone's bottom nav plus a selection bar or the send button. */
const MOBILE_BOTTOM_PAD = "calc(160px + env(safe-area-inset-bottom))";

type Segment = "liked" | "collections";
type Lens = "unsorted" | "all";
type Picker = "people" | "folders" | "incollection" | "sort" | null;

export type WorkspaceEntry = { segment: Segment; collectionId: string | null };

/**
 * "Your selection": the curator's Liked workspace, opened from Liked (the
 * bottom nav on a phone, the Liked pill on desktop). Non-curators never reach
 * this; their Liked view is the gallery's, untouched.
 *
 * Its own feed, paging, selection and viewer, because its photos are not the
 * gallery's (they come from the curator feed, ranked by likes, with
 * collection data). Everything a photo can be done to is the gallery's,
 * passed in: the like toggle and set, single and bulk download behind the
 * required visit, Share, and the toast.
 *
 *   Liked        "To sort" by default (liked, in no collection), most liked
 *                first, narrowed by people, folder or collection.
 *   Collections  a card per collection, then a collection's own view, its
 *                photos grouped by folder.
 */
export function SelectionWorkspace({
  t,
  desktop,
  uid,
  bookingId,
  studio,
  eventName,
  col,
  folders: galleryFolders,
  liked,
  toggleLike,
  applyLikes,
  seedLikes,
  canDownload,
  onDownloadOne,
  onShare,
  onBulkDownload,
  toPlanSource,
  notify,
  onReauth,
  scrollRef,
  stickyTop,
  contactUrl,
  onReview,
  onViewerOpenChange,
  onLoadedIds,
  entry,
}: {
  t: ClientTheme;
  desktop: boolean;
  uid: string;
  bookingId: string;
  studio: string;
  eventName: string;
  col: CollectionsApi;
  folders: CustomFolder[];
  liked: Set<string>;
  toggleLike: (item: GuestMediaItem, extraBump?: (delta: number) => void) => void;
  applyLikes: (ids: readonly string[], on: boolean) => void;
  seedLikes: (media: GuestMediaItem[]) => void;
  canDownload: boolean;
  onDownloadOne: (item: GuestMediaItem) => void;
  onShare: (item: GuestMediaItem) => void;
  /** The gallery's bulk download, behind the required visit. */
  onBulkDownload: (name: string, resolve: (signal: AbortSignal) => Promise<PlanSource[]>) => void;
  toPlanSource: (m: GuestMediaItem) => PlanSource;
  notify: Notify;
  onReauth: () => void;
  /** Desktop: the gallery's own scroller, which this flows inside. */
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  /** Where sticky headers pin (under the desktop control row). */
  stickyTop: number;
  contactUrl: string | null;
  onReview: () => void;
  onViewerOpenChange: (open: boolean) => void;
  onLoadedIds: (ids: string[]) => void;
  entry: WorkspaceEntry;
}) {
  const [segment, setSegment] = useState<Segment>(entry.segment);
  const [detailId, setDetailId] = useState<string | null>(entry.collectionId);
  const [lens, setLens] = useState<Lens>("unsorted");
  const [likedBy, setLikedBy] = useState<string[]>([]);
  const [likerNames, setLikerNames] = useState<Map<string, string>>(() => new Map());
  const [folderId, setFolderId] = useState<string | null>(null);
  const [inColl, setInColl] = useState<string | null>(null);
  const [sort, setSort] = useState<"likes" | "captured">("likes");
  const [picker, setPicker] = useState<Picker>(null);

  const detail = detailId ? col.collectionsById.get(detailId) ?? null : null;
  // A collection deleted elsewhere while open: back to the cards.
  if (detailId && col.loaded && !detail) setDetailId(null);

  const query: CuratorFeedQuery | null = detailId
    ? { view: "collection", collectionId: detailId, sort: "folder" }
    : segment === "liked"
      ? {
          view: "liked",
          inCollection: lens === "unsorted" ? "none" : null,
          collectionId: lens === "all" ? inColl : null,
          likedBy: likedBy.length ? [...likedBy].sort() : undefined,
          folderId,
          sort,
        }
      : null;

  const onPage = useCallback(
    (media: CuratorItem[]) => {
      seedLikes(media);
      col.seedMembership(media);
    },
    [seedLikes, col],
  );
  const feed = useCuratorFeed({ uid, bookingId, query, onPage, onReauth });

  /* ── header counts: all liked, and how many are still to sort ── */
  const [counts, setCounts] = useState<{ liked: number; unsorted: number } | null>(null);
  const collectionsSig = col.collections.map((c) => `${c._id}:${c.count}:${c.status}:${c.name}`).join("|");
  useEffect(() => {
    let cancelled = false;
    // A beat after the change, so a burst of writes costs one read.
    const id = window.setTimeout(() => {
      getCuratorFeed(uid, bookingId, { view: "liked", limit: 1 })
        .then((res) => {
          if (!cancelled) setCounts({ liked: res.total ?? 0, unsorted: res.unsorted_count ?? 0 });
        })
        .catch((err) => {
          if (err instanceof GuestAuthError) onReauth();
        });
    }, counts ? 800 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
    // `counts` only decides the first delay; re-reading on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, bookingId, collectionsSig, onReauth]);

  /* ── per-collection folder breakdowns, for the cards and section headers ── */
  const [review, setReview] = useState<ReviewCollection[] | null>(null);
  const wantsReview = segment === "collections" || !!detailId;
  useEffect(() => {
    if (!wantsReview) return;
    let cancelled = false;
    const id = window.setTimeout(() => {
      reviewCollections(uid, bookingId)
        .then((res) => {
          if (!cancelled) setReview(res.collections ?? []);
        })
        .catch((err) => {
          if (err instanceof GuestAuthError) onReauth();
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [wantsReview, uid, bookingId, collectionsSig, onReauth]);

  /* ── selection: scope minus exclusions, as in the gallery ── */
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());
  const exitSelect = useCallback(() => {
    setSelectMode(false);
    setSelected(new Set());
    setSelectAll(false);
    setExcluded(new Set());
  }, []);
  const isSelected = useCallback((id: string) => (selectAll ? !excluded.has(id) : selected.has(id)), [selectAll, excluded, selected]);
  const toggleSel = useCallback(
    (item: GuestMediaItem) => {
      const flip = (prev: Set<string>) => {
        const n = new Set(prev);
        if (n.has(item._id)) n.delete(item._id);
        else n.add(item._id);
        return n;
      };
      if (selectAll) setExcluded(flip);
      else setSelected(flip);
    },
    [selectAll],
  );
  const enterSelectWith = useCallback((item: GuestMediaItem) => {
    setSelectMode(true);
    setSelectAll(false);
    setExcluded(new Set());
    setSelected(new Set([item._id]));
  }, []);
  const takeAll = useCallback(() => {
    setSelectMode(true);
    setSelected(new Set());
    setExcluded(new Set());
    setSelectAll(true);
  }, []);
  const selectedCount = selectAll ? Math.max(0, feed.total - excluded.size) : selected.size;
  const allSelected = selectAll && excluded.size === 0;
  const selectionLabel = allSelected
    ? `All ${selectedCount.toLocaleString("en-IN")} selected`
    : `${selectedCount.toLocaleString("en-IN")} selected`;
  const known = !(selectAll && feed.hasMore);
  const loadedSelectedIds = feed.items.filter((i) => isSelected(i._id)).map((i) => i._id);

  // Any change of view is a new result set: the selection goes with it.
  const changeView = (fn: () => void) => {
    exitSelect();
    fn();
  };

  /* ── likes, keeping this feed's counts in step with the gallery's ── */
  const likedRef = useRef(liked);
  useEffect(() => {
    likedRef.current = liked;
  }, [liked]);
  const bumpLikes = feed.bumpLikes;
  const wsApplyLikes = useCallback(
    (ids: readonly string[], on: boolean) => {
      const changing = ids.filter((id) => likedRef.current.has(id) !== on);
      applyLikes(ids, on);
      bumpLikes(changing, on ? 1 : -1);
    },
    [applyLikes, bumpLikes],
  );
  const onToggleLike = useCallback(
    (item: GuestMediaItem) => toggleLike(item, (delta) => bumpLikes([item._id], delta)),
    [toggleLike, bumpLikes],
  );
  const actions = useCuratorActions({ t, desktop, studio, uid, col, notify, liked, applyLikes: wsApplyLikes, onReauth });

  const target = (): BulkTarget => {
    if (selectAll && feed.hasMore && query) {
      const q = query;
      const ex = excluded;
      return {
        count: selectedCount,
        resolve: async (signal) => (await getCuratorFeedIds(uid, bookingId, q, signal)).ids.filter((id) => !ex.has(id)),
      };
    }
    return { ids: loadedSelectedIds };
  };

  const downloadSelection = () => {
    const base = (eventName || "gallery").trim() || "gallery";
    const scopeName = detail ? detail.name : "selection";
    const nameFor = (n: number) => `${base} - ${scopeName} (${n.toLocaleString("en-IN")} photo${n === 1 ? "" : "s"})`;
    if (known) {
      const chosen = feed.items.filter((i) => isSelected(i._id));
      exitSelect();
      if (chosen.length === 1) return onDownloadOne(chosen[0]);
      if (chosen.length) onBulkDownload(nameFor(chosen.length), async () => chosen.map(toPlanSource));
      return;
    }
    const q = query!;
    const ex = excluded;
    const n = selectedCount;
    exitSelect();
    onBulkDownload(nameFor(n), async (signal) => {
      const out: PlanSource[] = [];
      for (let skip = 0; ; skip += WALK_PAGE) {
        if (signal.aborted) break;
        const res = await getCuratorFeed(uid, bookingId, { ...q, skip, limit: WALK_PAGE }, signal);
        for (const m of res.media ?? []) if (!ex.has(m._id)) out.push(toPlanSource(m));
        if ((res.media?.length ?? 0) < WALK_PAGE) break;
      }
      return out;
    });
  };

  /* ── viewer ── */
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [reveal, setReveal] = useState<{ id: string; seq: number } | null>(null);
  // A plain function: useViewerHistory reads it through a ref.
  const closeViewer = () => {
    const id = viewerIndex != null ? feed.items[viewerIndex]?._id : undefined;
    setViewerIndex(null);
    if (id) setReveal((r) => ({ id, seq: (r?.seq ?? 0) + 1 }));
  };
  useViewerHistory(viewerIndex != null, closeViewer);
  const viewerOpen = viewerIndex != null && !!feed.items[viewerIndex];
  useEffect(() => {
    onViewerOpenChange(viewerOpen);
  }, [viewerOpen, onViewerOpenChange]);
  useEffect(() => () => onViewerOpenChange(false), [onViewerOpenChange]);
  useEffect(() => {
    onLoadedIds(feed.items.map((i) => i._id));
  }, [feed.items, onLoadedIds]);
  const attribution = useCallback(
    (item: GuestMediaItem) => attributionLine(col.membership.get(item._id), col.collectionsById),
    [col.membership, col.collectionsById],
  );
  const openSaveFor = useCallback((item: GuestMediaItem) => actions.openSave({ ids: [item._id] }), [actions]);

  /* ── infinite scroll, on whichever scroller this view lives in ── */
  const ownScrollRef = useRef<HTMLDivElement>(null);
  const scroller = desktop ? scrollRef : ownScrollRef;
  const loadMoreRef = useRef(feed.loadMore);
  const canLoadRef = useRef(false);
  useEffect(() => {
    loadMoreRef.current = feed.loadMore;
    canLoadRef.current = feed.hasMore && !feed.loadingMore;
  });
  useEffect(() => {
    const el = scroller?.current;
    if (!el) return;
    const onScroll = () => {
      if (canLoadRef.current && el.scrollTop + el.clientHeight >= el.scrollHeight - LOAD_AHEAD_PX) void loadMoreRef.current();
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [scroller]);

  /* ── keyboard (desktop): Escape leaves select mode, Cmd/Ctrl+A takes all ── */
  const overlay = viewerOpen || actions.saveOpen || picker != null;
  useEffect(() => {
    if (!desktop) return;
    const onKey = (e: KeyboardEvent) => {
      if (overlay) return;
      const el = e.target as HTMLElement | null;
      if (el?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el?.tagName ?? "")) return;
      if (e.key === "Escape" && selectMode) exitSelect();
      else if ((e.metaKey || e.ctrlKey) && (e.key === "a" || e.key === "A") && selectMode) {
        e.preventDefault();
        takeAll();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [desktop, overlay, selectMode, exitSelect, takeAll]);

  const badges = useCallback(
    (item: GuestMediaItem) => ({ likes: item.likes_count ?? 0, sorted: (col.membership.get(item._id)?.length ?? 0) > 0 }),
    [col.membership],
  );

  const folderList = feed.folders.length ? feed.folders : galleryFolders;
  const folderName = (id: string | null) => (id ? folderList.find((f) => f._id === id)?.name ?? "Other" : "Other");
  const narrowed = likedBy.length > 0 || !!folderId || !!inColl;
  const resetFilters = () =>
    changeView(() => {
      setLens("unsorted");
      setLikedBy([]);
      setFolderId(null);
      setInColl(null);
    });

  const gridProps = {
    t,
    selectMode,
    isSelected,
    liked,
    onToggleSelect: toggleSel,
    onToggleLike,
    onEnterSelectWith: enterSelectWith,
    onDownload: canDownload ? onDownloadOne : undefined,
    onShare,
    onCollect: openSaveFor,
    scrollRef: scroller,
    reveal,
    revealInset: desktop ? { top: stickyTop, bottom: 0 } : { top: 0, bottom: 96 },
    badges,
  };

  /* ── body ── */
  let body: React.ReactNode;
  if (segment === "collections" && !detailId) {
    body = (
      <CollectionsSegment
        t={t}
        desktop={desktop}
        studio={studio}
        col={col}
        review={review}
        onOpen={(id) => changeView(() => setDetailId(id))}
        onReview={onReview}
        notify={notify}
      />
    );
  } else if (feed.loading) {
    body = <GallerySkeleton t={t} />;
  } else if (feed.error) {
    body = (
      <Empty t={t} text="Couldn’t load these photos.">
        <ChipButton t={t} onClick={feed.reload}>
          Try again
        </ChipButton>
      </Empty>
    );
  } else if (feed.items.length === 0) {
    body = detail ? (
      <Empty t={t} text={`No photos in ${detail.name} yet. Add some from Liked or the gallery.`} />
    ) : narrowed ? (
      <Empty t={t} text="No liked photos match these filters.">
        <ChipButton t={t} onClick={resetFilters}>
          Reset
        </ChipButton>
      </Empty>
    ) : lens === "unsorted" && (counts?.liked ?? 0) > 0 ? (
      <Empty t={t} text="All sorted. Every liked photo is in a collection." />
    ) : (
      <Empty t={t} text="Nothing liked yet. Tap the heart on photos you love, and ask family to do the same." />
    );
  } else if (detail) {
    body = (
      <FolderSections
        t={t}
        items={feed.items}
        stickyTop={desktop ? stickyTop : 0}
        folderName={folderName}
        counts={new Map((review?.find((r) => r._id === detail._id)?.folders ?? []).map((f) => [f.folder_id, f.count]))}
        onOpen={(i) => setViewerIndex(i)}
        grid={gridProps}
      />
    );
  } else {
    body = <GalleryGrid {...gridProps} items={feed.items} onOpen={(i) => setViewerIndex(i)} />;
  }

  const sentLocked = !!detail && detail.status === "final";
  const header = detail ? (
    <DetailHeader t={t} c={detail} studio={studio} contactUrl={contactUrl} onBack={() => changeView(() => setDetailId(null))} />
  ) : (
    <>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[19px] font-extrabold lg:text-[22px]" style={{ color: t.text }}>
          Your selection
        </h2>
        {segment === "liked" && feed.items.length > 0 && <SelectToggle t={t} selectMode={selectMode} onToggle={() => (selectMode ? exitSelect() : setSelectMode(true))} />}
      </div>
      <div className="mt-3 flex rounded-full p-1" style={{ background: t.sunken }} role="tablist" aria-label="Your selection">
        {(
          [
            ["liked", "Liked", counts?.liked],
            ["collections", "Collections", col.collections.length],
          ] as const
        ).map(([key, label, n]) => {
          const on = segment === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => changeView(() => setSegment(key))}
              className="flex-1 cursor-pointer rounded-full py-2 text-[13px] transition-colors"
              style={{ background: on ? t.card : "transparent", color: on ? t.text : t.muted, fontWeight: on ? 800 : 600, boxShadow: on ? t.shadowSm : undefined }}
            >
              {label}
              {n != null && <span className="ml-1 tabular-nums" style={{ color: on ? t.muted : t.faint }}>{n.toLocaleString("en-IN")}</span>}
            </button>
          );
        })}
      </div>
      {segment === "liked" && (
        <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1" style={{ scrollbarWidth: "none" }}>
          <Chip t={t} on={lens === "unsorted"} onClick={() => changeView(() => { setLens("unsorted"); setInColl(null); })}>
            To sort{counts ? ` · ${counts.unsorted.toLocaleString("en-IN")}` : ""}
          </Chip>
          <Chip t={t} on={lens === "all" && !inColl} onClick={() => changeView(() => { setLens("all"); setInColl(null); })}>
            All liked
          </Chip>
          <Chip t={t} on={likedBy.length > 0} caret onClick={() => setPicker("people")}>
            {likedBy.length === 1 ? likerNames.get(likedBy[0]) ?? "1 person" : likedBy.length > 1 ? `${likedBy.length} people` : "People"}
          </Chip>
          <Chip t={t} on={!!folderId} caret onClick={() => setPicker("folders")}>
            {folderId ? folderName(folderId) : "Folders"}
          </Chip>
          {col.collections.length > 0 && (
            <Chip t={t} on={!!inColl} caret onClick={() => setPicker("incollection")}>
              {inColl ? col.collectionsById.get(inColl)?.name ?? "In collection" : "In collection"}
            </Chip>
          )}
          {narrowed && (
            <Chip t={t} on={false} onClick={resetFilters}>
              Reset
            </Chip>
          )}
          <Chip t={t} on={false} caret onClick={() => setPicker("sort")}>
            {sort === "likes" ? "Most liked" : "Date taken"}
          </Chip>
        </div>
      )}
      {segment === "liked" && lens === "unsorted" && !narrowed && counts && counts.unsorted > 0 && (
        <p className="mt-2 text-[12.5px] font-semibold" style={{ color: t.muted }}>
          {unsortedLabel(counts.unsorted)}
        </p>
      )}
    </>
  );

  const selectionSummary = selectMode && (
    <div className="mt-3 flex items-center gap-3 text-[12.5px] font-bold" style={{ color: t.muted }}>
      <span style={{ color: t.text }}>{selectionLabel}</span>
      {!allSelected && feed.total > 0 && (
        <button type="button" onClick={takeAll} className="cursor-pointer underline-offset-2 hover:underline" style={{ color: t.brand }}>
          Select all {feed.total.toLocaleString("en-IN")}
        </button>
      )}
    </div>
  );

  return (
    <>
      {desktop ? (
        <div className="pb-24">
          <div className="mb-5">
            {header}
            {selectionSummary}
          </div>
          {body}
          {feed.loadingMore && <Spinner t={t} />}
        </div>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="fx-rise relative z-20 px-4 pb-2 pt-3" style={{ background: t.bg }}>
            {header}
            {selectionSummary}
          </div>
          <div
            ref={ownScrollRef}
            className="min-h-0 flex-1 overflow-y-auto px-3 pt-1"
            style={{ scrollbarWidth: "none", overscrollBehavior: "contain", paddingBottom: MOBILE_BOTTOM_PAD }}
          >
            {body}
            {feed.loadingMore && <Spinner t={t} />}
          </div>
        </div>
      )}

      {selectMode && (
        <CuratorSelectionBar
          t={t}
          label={selectionLabel}
          count={selectedCount}
          likeMode={bulkLikeMode(loadedSelectedIds, liked, known)}
          onCancel={exitSelect}
          onLike={() => {
            const tg = target();
            exitSelect();
            void actions.bulkLike(tg, { known });
          }}
          onCollect={() => actions.openSave(target(), exitSelect)}
          onDownload={canDownload ? downloadSelection : undefined}
          onRemove={
            detail && !sentLocked
              ? () => {
                  const tg = target();
                  exitSelect();
                  void actions.removeFrom(detail._id, tg, { onRemoved: feed.dropIds, onUndone: feed.reload });
                }
              : undefined
          }
          aboveNav={!desktop}
        />
      )}

      {actions.saveSheet}

      {picker === "people" && (
        <LikersSheet
          t={t}
          desktop={desktop}
          uid={uid}
          bookingId={bookingId}
          selected={likedBy}
          onReauth={onReauth}
          onClose={() => setPicker(null)}
          onApply={(ids, names) => {
            setPicker(null);
            changeView(() => {
              setLikedBy(ids);
              setLikerNames(names);
            });
          }}
        />
      )}
      {picker === "folders" && (
        <PickerSheet
          t={t}
          desktop={desktop}
          title="Folders"
          allLabel="All folders"
          value={folderId}
          options={folderList.map((f) => ({ id: f._id, label: f.name, detail: feed.folderCounts[f._id] ? feed.folderCounts[f._id].toLocaleString("en-IN") : null }))}
          onClose={() => setPicker(null)}
          onPick={(id) => {
            setPicker(null);
            changeView(() => setFolderId(id));
          }}
        />
      )}
      {picker === "incollection" && (
        <PickerSheet
          t={t}
          desktop={desktop}
          title="In collection"
          allLabel="Any or none"
          value={inColl}
          options={col.collections.map((c) => ({ id: c._id, label: c.name, detail: c.count.toLocaleString("en-IN") }))}
          onClose={() => setPicker(null)}
          onPick={(id) => {
            setPicker(null);
            changeView(() => {
              setInColl(id);
              setLens("all");
            });
          }}
        />
      )}
      {picker === "sort" && (
        <PickerSheet
          t={t}
          desktop={desktop}
          title="Sort"
          value={sort}
          options={[
            { id: "likes", label: "Most liked" },
            { id: "captured", label: "Date taken" },
          ]}
          onClose={() => setPicker(null)}
          onPick={(id) => {
            setPicker(null);
            changeView(() => setSort(id === "captured" ? "captured" : "likes"));
          }}
        />
      )}

      {viewerOpen && !desktop && (
        <ReelViewer
          items={feed.items}
          index={viewerIndex!}
          onNav={setViewerIndex}
          onClose={closeViewer}
          liked={liked}
          onToggleLike={onToggleLike}
          selectMode={selectMode}
          isSelected={isSelected}
          onToggleSelect={toggleSel}
          canDownload={canDownload}
          onDownload={onDownloadOne}
          onShare={onShare}
          hasMore={feed.hasMore}
          loadingMore={feed.loadingMore}
          onLoadMore={() => void feed.loadMore()}
          onCollect={openSaveFor}
          attribution={attribution}
        />
      )}
      {viewerOpen && desktop && (
        <PhotoViewer
          items={feed.items}
          index={viewerIndex!}
          onClose={closeViewer}
          onNav={setViewerIndex}
          liked={liked}
          onToggleLike={onToggleLike}
          selectMode={selectMode}
          isSelected={isSelected}
          onToggleSelect={toggleSel}
          onToast={(m) => notify(m)}
          canDownload={canDownload}
          onDownload={onDownloadOne}
          onCollect={openSaveFor}
          attribution={attribution}
        />
      )}
    </>
  );
}

/* ── pieces ─────────────────────────────────────────────────────────────── */

/**
 * A collection's photos, grouped by folder with sticky section headers
 * ("Haldi · 24"). The feed arrives in folder order, so each run of one folder
 * is one masonry, each windowed against the same scroller.
 */
function FolderSections({
  t,
  items,
  stickyTop,
  folderName,
  counts,
  onOpen,
  grid,
}: {
  t: ClientTheme;
  items: CuratorItem[];
  stickyTop: number;
  folderName: (id: string | null) => string;
  counts: Map<string | null, number>;
  onOpen: (index: number) => void;
  grid: Omit<React.ComponentProps<typeof GalleryGrid>, "items" | "onOpen">;
}) {
  const runs = useMemo(() => {
    const out: { folder: string | null; start: number; end: number }[] = [];
    items.forEach((m, i) => {
      const f = m.primary_folder_id ?? null;
      const last = out[out.length - 1];
      if (last && last.folder === f) last.end = i + 1;
      else out.push({ folder: f, start: i, end: i + 1 });
    });
    return out;
  }, [items]);
  return (
    <div className="flex flex-col">
      {runs.map((run) => (
        <section key={`${run.folder}-${run.start}`} className={run.start > 0 ? "mt-4" : ""}>
          <h3
            className="sticky z-20 -mx-1 mb-2 px-1 py-2 text-[13px] font-extrabold"
            style={{ top: stickyTop, background: t.bg, color: t.text }}
          >
            {folderName(run.folder)}
            <span className="font-bold" style={{ color: t.muted }}>
              {" "}
              · {(counts.get(run.folder) ?? run.end - run.start).toLocaleString("en-IN")}
            </span>
          </h3>
          <GalleryGrid {...grid} items={items.slice(run.start, run.end)} onOpen={(i) => onOpen(run.start + i)} />
        </section>
      ))}
    </div>
  );
}

function DetailHeader({
  t,
  c,
  studio,
  contactUrl,
  onBack,
}: {
  t: ClientTheme;
  c: { name: string; count: number; status: "draft" | "final"; finalized_at: number | null; target_count: number | null };
  studio: string;
  contactUrl: string | null;
  onBack: () => void;
}) {
  const target = targetStatus(c.count, c.target_count);
  const sent = c.status === "final";
  return (
    <div>
      <button type="button" onClick={onBack} className="-ml-1 flex cursor-pointer items-center gap-1 py-1 text-[13px] font-bold" style={{ color: t.muted }}>
        <IconChevronLeft size={17} />
        Collections
      </button>
      <h2 className="mt-1 truncate text-[20px] font-extrabold lg:text-[24px]" style={{ color: t.text }}>
        {c.name}
      </h2>
      <div className="mt-1 flex items-center gap-2 text-[12.5px] font-semibold" style={{ color: t.muted }}>
        <span>
          {c.count.toLocaleString("en-IN")} {c.count === 1 ? "photo" : "photos"}
        </span>
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-extrabold"
          style={sent ? { background: t.accentWash, color: t.brand } : { background: t.sunken, color: t.muted }}
        >
          {sent && <IconLock size={11} />}
          {statusLabel(c)}
        </span>
      </div>
      {target && (
        <div className="max-w-[420px]">
          <TargetBar t={t} label={target.label} progress={target.progress} note={target.note} />
        </div>
      )}
      {sent && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl px-4 py-3 text-[12.5px] font-semibold" style={{ background: t.accentWash, color: t.text }}>
          <span>
            Sent to {studio}
            {shortDate(c.finalized_at) ? ` on ${shortDate(c.finalized_at)}` : ""}. Ask them to reopen it for changes.
          </span>
          {contactUrl && (
            <a href={contactUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-extrabold" style={{ color: t.brand }}>
              <IconWhatsApp size={14} />
              Message on WhatsApp
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function Chip({ t, on, caret, onClick, children }: { t: ClientTheme; on: boolean; caret?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className="flex shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-full px-3.5 py-2 text-[12.5px] transition-colors"
      style={{
        background: on ? t.accentWash : t.card,
        color: on ? t.brand : t.text,
        fontWeight: on ? 800 : 600,
        border: `1px solid ${on ? "transparent" : t.border}`,
      }}
    >
      <span className="max-w-[160px] truncate">{children}</span>
      {caret && <IconCaretDown size={12} />}
    </button>
  );
}

function SelectToggle({ t, selectMode, onToggle }: { t: ClientTheme; selectMode: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="shrink-0 cursor-pointer rounded-full px-3.5 py-1.5 text-[12.5px] font-extrabold"
      style={selectMode ? { color: t.muted } : { background: t.accentWash, color: t.brand }}
    >
      {selectMode ? "Cancel" : "Select"}
    </button>
  );
}

function ChipButton({ t, onClick, children }: { t: ClientTheme; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="mt-4 cursor-pointer rounded-full px-5 py-2.5 text-[13px] font-extrabold" style={{ background: t.brand, color: t.onBrand }}>
      {children}
    </button>
  );
}

function Empty({ t, text, children }: { t: ClientTheme; text: string; children?: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-[360px] flex-col items-center py-16 text-center">
      <p className="text-[14px] font-semibold leading-relaxed" style={{ color: t.muted }}>
        {text}
      </p>
      {children}
    </div>
  );
}

function Spinner({ t }: { t: ClientTheme }) {
  return (
    <div className="flex justify-center py-6">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" style={{ color: t.brand }} />
    </div>
  );
}
