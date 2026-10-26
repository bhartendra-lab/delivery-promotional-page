"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getStudioCollectionFeed, getStudioCollectionFeedIds, getStudioCollectionReview } from "@/lib/api";
import { triggerBlobDownload } from "@/lib/media-actions";
import { shortDate, targetStatus } from "@/lib/collections/logic";
import { collectionCsv, csvFileName, filenamesLine } from "@/lib/collections/studio";
import type { CuratorFeedQuery, CuratorItem, GuestCollection } from "@/lib/collections/types";
import type { CustomFolder, MediaItem } from "@/lib/types";
import { MediaGrid } from "./MediaGrid";
import { StatusChip } from "./CollectionsRail";
import { AlbumSizeDialog, DeleteCollectionDialog, NameDialog } from "./CollectionDialogs";
import { IconCopy, IconDownload, IconEdit, IconMinus, IconPlus, IconRestore, IconTarget, IconTrash } from "./icons";
import type { StudioCollections } from "./useStudioCollections";

const PAGE = 60;
const WALK = 200;

/**
 * One client collection inside Smart Selects: its photos grouped by folder
 * under sticky headers, and the studio's tools for it. Its own feed (the
 * curator feed's collection view, getMedia's item shape), so the shared
 * liked feed behind All liked is never touched.
 *
 * The studio may add and remove photos in a sent collection without
 * reopening it; Reopen is for handing it back to the Client.
 */
export function CollectionView({
  bookingId,
  eventName,
  collection,
  studio,
  folders,
  toast,
  onAddToCollection,
  onDeleted,
}: {
  bookingId: string;
  eventName: string;
  collection: GuestCollection;
  studio: StudioCollections;
  folders: CustomFolder[];
  toast: (msg: string, type?: "success" | "error") => void;
  /** Open the studio's Add to collection sheet for these ids. */
  onAddToCollection: (ids: string[], done: () => void) => void;
  onDeleted: () => void;
}) {
  const query: CuratorFeedQuery = useMemo(() => ({ view: "collection", collectionId: collection._id, sort: "folder" }), [collection._id]);
  const [items, setItems] = useState<CuratorItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [breakdown, setBreakdown] = useState<Map<string | null, number>>(() => new Map());
  const [dialog, setDialog] = useState<"rename" | "size" | "delete" | null>(null);
  const [working, setWorking] = useState<string | null>(null);

  // First page, and again whenever the collection's count moves (a write here,
  // in the add sheet, or by the Client, seen on the next refresh).
  const countKey = collection.count;
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getStudioCollectionFeed(bookingId, { ...query, skip: 0, limit: PAGE }),
      getStudioCollectionReview(bookingId).catch(() => null),
    ])
      .then(([page, review]) => {
        if (cancelled) return;
        setItems(page.media ?? []);
        setTotal(page.total ?? page.media?.length ?? 0);
        const mine = review?.collections.find((c) => c._id === collection._id);
        setBreakdown(new Map((mine?.folders ?? []).map((f) => [f.folder_id, f.count])));
      })
      .catch(() => {
        if (!cancelled) toast("Could not load this collection. Try again.", "error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bookingId, query, collection._id, countKey, toast]);

  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  const loadMore = useCallback(async () => {
    if (loadingMore || itemsRef.current.length >= total) return;
    setLoadingMore(true);
    try {
      const page = await getStudioCollectionFeed(bookingId, { ...query, skip: itemsRef.current.length, limit: PAGE });
      setItems((prev) => {
        const seen = new Set(prev.map((m) => m._id));
        return [...prev, ...(page.media ?? []).filter((m) => !seen.has(m._id))];
      });
    } catch {
      /* scrolling again retries */
    } finally {
      setLoadingMore(false);
    }
  }, [bookingId, query, loadingMore, total]);

  /** Every photo in the collection, for the filenames line and the CSV. */
  const walkAll = useCallback(async () => {
    const out: CuratorItem[] = [];
    for (let skip = 0; ; skip += WALK) {
      const page = await getStudioCollectionFeed(bookingId, { ...query, skip, limit: WALK });
      out.push(...(page.media ?? []));
      if ((page.media?.length ?? 0) < WALK) break;
    }
    return out;
  }, [bookingId, query]);

  const folderName = useCallback(
    (id: string | null) => (id ? folders.find((f) => f._id === id)?.name ?? "Other" : "Other"),
    [folders],
  );

  const copyFilenames = async () => {
    setWorking("copy");
    try {
      const all = await walkAll();
      await navigator.clipboard.writeText(filenamesLine(all, bookingId));
      toast(`Copied ${all.length.toLocaleString("en-IN")} file names`);
    } catch {
      toast("Could not copy the file names. Try again.", "error");
    } finally {
      setWorking(null);
    }
  };
  const downloadCsv = async () => {
    setWorking("csv");
    try {
      const all = await walkAll();
      const csv = collectionCsv(all, { collectionId: collection._id, bookingId, folderName });
      triggerBlobDownload(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }), csvFileName(eventName, collection.name));
    } catch {
      toast("Could not build the CSV. Try again.", "error");
    } finally {
      setWorking(null);
    }
  };
  const reopen = async () => {
    setWorking("reopen");
    try {
      await studio.reopen(collection._id);
      toast(`Reopened ${collection.name}. The Client can change it again.`);
    } catch {
      toast("Could not reopen the collection. Try again.", "error");
    } finally {
      setWorking(null);
    }
  };

  const removeFromHere = async (ids: string[], clear: () => void) => {
    setWorking("remove");
    try {
      await studio.write(collection._id, "remove", ids);
      clear();
      toast(`Removed ${ids.length.toLocaleString("en-IN")} ${ids.length === 1 ? "photo" : "photos"} from ${collection.name}`);
    } catch {
      toast("Could not remove those photos. Try again.", "error");
    } finally {
      setWorking(null);
    }
  };

  const target = targetStatus(collection.count, collection.target_count);
  const sent = collection.status === "final";
  const asMedia = useMemo(() => items.map((m) => ({ ...m, booking_id: bookingId }) as MediaItem & CuratorItem), [items, bookingId]);

  const tool = "brand-focus inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--color-brand-border)] bg-white px-3 text-[12.5px] font-semibold text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)] disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 pb-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="min-w-0 truncate text-[18px] font-bold tracking-tight text-[var(--color-brand-ink)]">{collection.name}</h2>
          <StatusChip c={collection} />
          <span className="text-[12.5px] text-[var(--color-brand-muted)]">
            {collection.count.toLocaleString("en-IN")} {collection.count === 1 ? "photo" : "photos"}
            {sent && collection.finalized_by?.name ? ` · sent by ${collection.finalized_by.name}${shortDate(collection.finalized_at) ? ` on ${shortDate(collection.finalized_at)}` : ""}` : ""}
          </span>
        </div>
        {target && (
          <div className="mt-2 max-w-[360px]">
            <div className="flex justify-between text-[11.5px] font-semibold text-[var(--color-brand-muted)]">
              <span>{target.label}</span>
              {target.note && <span className="text-[var(--color-brand-navy)]">{target.note}</span>}
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--color-brand-track)]">
              <div className="h-full bg-[var(--color-brand-navy)]" style={{ width: `${Math.round(target.progress * 100)}%` }} />
            </div>
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={tool} onClick={() => setDialog("rename")}>
            <IconEdit size={13} /> Rename
          </button>
          <button type="button" className={tool} onClick={() => setDialog("size")}>
            <IconTarget size={13} /> {collection.target_count ? "Album size" : "Set album size"}
          </button>
          {sent && (
            <button type="button" className={tool} onClick={() => void reopen()} disabled={working === "reopen"}>
              <IconRestore size={13} /> Reopen
            </button>
          )}
          <button type="button" className={tool} onClick={() => void copyFilenames()} disabled={!collection.count || working === "copy"}>
            <IconCopy size={13} /> {working === "copy" ? "Copying…" : "Copy filenames"}
          </button>
          <button type="button" className={tool} onClick={() => void downloadCsv()} disabled={!collection.count || working === "csv"}>
            <IconDownload size={13} /> {working === "csv" ? "Preparing…" : "Download CSV"}
          </button>
          <button type="button" className={`${tool} text-[var(--color-brand-danger)]`} onClick={() => setDialog("delete")}>
            <IconTrash size={13} /> Delete
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-12">
        {loading && items.length === 0 ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="skeleton aspect-square rounded" style={{ animationDelay: `${i * 0.05}s` }} />
            ))}
          </div>
        ) : (
          <MediaGrid
            items={asMedia}
            allowDelete={false}
            showLikes
            onSelectAll={async () => (await getStudioCollectionFeedIds(bookingId, query)).ids}
            totalForView={total}
            viewKey={`collection:${collection._id}`}
            hasMore={items.length < total}
            loadingMore={loadingMore}
            onLoadMore={() => void loadMore()}
            emptyMessage={`No photos in ${collection.name} yet. Add some from All liked with "Add to collection".`}
            archiveName={`${eventName || "Gallery"} - ${collection.name}`}
            notify={toast}
            sectionOf={(m) => {
              const id = (m as CuratorItem).primary_folder_id ?? null;
              const n = breakdown.get(id);
              return {
                key: id ?? "none",
                label: (
                  <>
                    {folderName(id)}
                    {n != null && <span className="font-normal text-[var(--color-brand-muted)]"> · {n.toLocaleString("en-IN")}</span>}
                  </>
                ),
              };
            }}
            selectionActions={({ ids, clear }) => (
              <>
                <button
                  type="button"
                  onClick={() => onAddToCollection(ids, clear)}
                  className="brand-focus inline-flex items-center gap-1.5 rounded-md border border-[var(--color-brand-border)] bg-white px-3 py-1.5 text-[12.5px] font-semibold text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)]"
                >
                  <IconPlus size={14} /> Add to collection
                </button>
                <button
                  type="button"
                  onClick={() => void removeFromHere(ids, clear)}
                  disabled={working === "remove"}
                  className="brand-focus inline-flex items-center gap-1.5 rounded-md bg-[var(--color-brand-navy)] px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-[var(--color-brand-navy-deep)] disabled:opacity-60"
                >
                  <IconMinus size={14} /> Remove from {collection.name}
                </button>
              </>
            )}
          />
        )}
      </div>

      {dialog === "rename" && (
        <NameDialog
          title="Rename collection"
          initial={collection.name}
          action="Save"
          onClose={() => setDialog(null)}
          onSubmit={async (name) => {
            await studio.update(collection._id, { name });
            toast(`Renamed to ${name}`);
          }}
        />
      )}
      {dialog === "size" && (
        <AlbumSizeDialog
          collection={collection}
          onClose={() => setDialog(null)}
          onSubmit={async (value) => {
            await studio.update(collection._id, { target_count: value });
            toast(value == null ? "Album size cleared" : `Album size set to ${value.toLocaleString("en-IN")} photos`);
          }}
        />
      )}
      {dialog === "delete" && (
        <DeleteCollectionDialog
          collection={collection}
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await studio.remove(collection._id);
            toast(`Deleted ${collection.name}`);
            onDeleted();
          }}
        />
      )}
    </div>
  );
}
