"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GuestAuthError } from "@/lib/guest-api";
import { getCuratorFeed } from "@/lib/collections/api";
import type { CuratorFeedPage, CuratorFeedQuery, CuratorItem } from "@/lib/collections/types";

const PAGE = 60;

type Loaded = {
  key: string;
  items: CuratorItem[];
  total: number;
  folders: NonNullable<CuratorFeedPage["folders"]>;
  folderCounts: Record<string, number>;
  unsorted: number;
  error: boolean;
};

/**
 * One view of the curator feed (`GET /collections/:id/media`), paged.
 *
 * `loading` is derived (the loaded view is not the one asked for), never set
 * from the effect, so a filter change shows the skeleton on the very render it
 * happens in, and a stale answer for an old filter can never land on a new one.
 */
export function useCuratorFeed({
  uid,
  bookingId,
  query,
  onPage,
  onReauth,
}: {
  uid: string;
  bookingId: string;
  /** Null: nothing to load (the Collections cards are showing). */
  query: CuratorFeedQuery | null;
  /** Every page as it lands, for likes and membership seeding. */
  onPage: (media: CuratorItem[]) => void;
  onReauth: () => void;
}) {
  const key = query ? JSON.stringify(query) : null;
  const [page, setPage] = useState<Loaded | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const onPageRef = useRef(onPage);
  const onReauthRef = useRef(onReauth);
  useEffect(() => {
    onPageRef.current = onPage;
    onReauthRef.current = onReauth;
  });

  useEffect(() => {
    if (!key) return;
    const q = JSON.parse(key) as CuratorFeedQuery;
    const ctl = new AbortController();
    getCuratorFeed(uid, bookingId, { ...q, skip: 0, limit: PAGE }, ctl.signal)
      .then((res) => {
        if (ctl.signal.aborted) return;
        onPageRef.current(res.media ?? []);
        setPage({
          key,
          items: res.media ?? [],
          total: res.total ?? res.media?.length ?? 0,
          folders: res.folders ?? [],
          folderCounts: res.folderCounts ?? {},
          unsorted: res.unsorted_count ?? 0,
          error: false,
        });
      })
      .catch((err) => {
        if (ctl.signal.aborted) return;
        if (err instanceof GuestAuthError) onReauthRef.current();
        setPage({ key, items: [], total: 0, folders: [], folderCounts: {}, unsorted: 0, error: true });
      });
    return () => ctl.abort();
  }, [key, uid, bookingId, reloadTick]);

  const current = page && page.key === key ? page : null;
  const items = current?.items ?? EMPTY;
  const total = current?.total ?? 0;
  const hasMore = !!current && items.length < total;

  const loadMore = useCallback(async () => {
    if (!key || !current || loadingMore || current.items.length >= current.total) return;
    setLoadingMore(true);
    const q = JSON.parse(key) as CuratorFeedQuery;
    try {
      const res = await getCuratorFeed(uid, bookingId, { ...q, skip: current.items.length, limit: PAGE });
      onPageRef.current(res.media ?? []);
      setPage((p) => {
        if (!p || p.key !== key) return p;
        const seen = new Set(p.items.map((m) => m._id));
        return { ...p, items: [...p.items, ...(res.media ?? []).filter((m) => !seen.has(m._id))] };
      });
    } catch (err) {
      if (err instanceof GuestAuthError) onReauthRef.current();
      // The next scroll asks again.
    } finally {
      setLoadingMore(false);
    }
  }, [key, current, loadingMore, uid, bookingId]);

  /** Photos removed from the view (a collection's own Remove). */
  const dropIds = useCallback((ids: readonly string[]) => {
    const gone = new Set(ids);
    setPage((p) => {
      if (!p) return p;
      const items = p.items.filter((m) => !gone.has(m._id));
      return { ...p, items, total: Math.max(0, p.total - (p.items.length - items.length)) };
    });
  }, []);

  /** A like count changed on screen. */
  const bumpLikes = useCallback((ids: readonly string[], delta: number) => {
    const hit = new Set(ids);
    setPage((p) =>
      p ? { ...p, items: p.items.map((m) => (hit.has(m._id) ? { ...m, likes_count: Math.max(0, (m.likes_count ?? 0) + delta) } : m)) } : p,
    );
  }, []);

  const reload = useCallback(() => setReloadTick((n) => n + 1), []);

  return {
    loading: !!key && !current,
    error: current?.error ?? false,
    items,
    total,
    hasMore,
    loadingMore,
    folders: current?.folders ?? EMPTY_FOLDERS,
    folderCounts: current?.folderCounts ?? EMPTY_COUNTS,
    unsorted: current?.unsorted ?? 0,
    loadMore,
    dropIds,
    bumpLikes,
    reload,
  };
}

const EMPTY: CuratorItem[] = [];
const EMPTY_FOLDERS: NonNullable<CuratorFeedPage["folders"]> = [];
const EMPTY_COUNTS: Record<string, number> = {};

export type CuratorFeed = ReturnType<typeof useCuratorFeed>;
