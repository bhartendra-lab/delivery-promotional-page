"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  createStudioCollection,
  deleteStudioCollection,
  getStudioMembership,
  listStudioCollections,
  reopenStudioCollections,
  updateStudioCollection,
  writeStudioCollectionItems,
} from "@/lib/api";
import { MAX_MEMBERSHIP_IDS, MAX_WRITE_IDS, chunk } from "@/lib/collections/logic";
import type { CollectionList, GuestCollection, MembershipRef } from "@/lib/collections/types";

/**
 * The event's collections as Smart Selects sees them (`?visible=studio`:
 * empty ones the studio did not make are left out, so "New collection" never
 * appears to do nothing but defaults nobody used stay hidden).
 *
 * `status` is how the dashboard learns whether collections exist at all: the
 * server answers 404 while COLLECTIONS_ENABLED is off, and then this is "off"
 * and Smart Selects renders exactly what it did before.
 */
export function useStudioCollections(bookingId: string) {
  const [status, setStatus] = useState<"probing" | "on" | "off">("probing");
  const [list, setList] = useState<CollectionList | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await listStudioCollections(bookingId);
      setList(next);
      setStatus("on");
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setStatus("off");
      // Anything else (offline, a blip): keep what is on screen; the next
      // focus asks again.
    }
  }, [bookingId]);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) void refresh();
    });
    const onFocus = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refresh]);

  const collections = useMemo(() => list?.collections ?? [], [list]);
  const byId = useMemo(() => new Map(collections.map((c) => [c._id, c])), [collections]);

  const patch = useCallback((id: string, next: Partial<GuestCollection>) => {
    setList((l) => (l ? { ...l, collections: l.collections.map((c) => (c._id === id ? { ...c, ...next } : c)) } : l));
  }, []);

  const create = useCallback(
    async (name: string) => {
      const { collection } = await createStudioCollection(bookingId, name);
      setList((l) => (l ? { ...l, collections: [...l.collections, collection] } : l));
      return collection;
    },
    [bookingId],
  );

  const update = useCallback(
    async (id: string, next: { name?: string; target_count?: number | null }) => {
      const { collection } = await updateStudioCollection(bookingId, id, next);
      patch(id, { name: collection.name, target_count: collection.target_count ?? null });
      return collection;
    },
    [bookingId, patch],
  );

  const remove = useCallback(
    async (id: string) => {
      await deleteStudioCollection(bookingId, id);
      setList((l) => (l ? { ...l, collections: l.collections.filter((c) => c._id !== id) } : l));
    },
    [bookingId],
  );

  const reopen = useCallback(
    async (id: string) => {
      await reopenStudioCollections(bookingId, [id]);
      patch(id, { status: "draft", reopened_at: Date.now() });
    },
    [bookingId, patch],
  );

  /** Which collections these photos are in, chunked at the server's cap. */
  const membershipFor = useCallback(
    async (ids: readonly string[]): Promise<Map<string, MembershipRef[]>> => {
      const out = new Map<string, MembershipRef[]>();
      await Promise.all(
        chunk(ids, MAX_MEMBERSHIP_IDS).map(async (part) => {
          const res = await getStudioMembership(bookingId, part);
          for (const id of part) out.set(id, res.membership?.[id] ?? []);
        }),
      );
      return out;
    },
    [bookingId],
  );

  /** Add or remove photos (chunked); the collection's count comes back exact. */
  const write = useCallback(
    async (id: string, action: "add" | "remove", ids: readonly string[]) => {
      let count: number | null = null;
      for (const part of chunk(ids, MAX_WRITE_IDS)) {
        const res = await writeStudioCollectionItems(bookingId, id, action, part);
        count = res.count;
      }
      if (count != null) patch(id, { count });
    },
    [bookingId, patch],
  );

  return {
    status,
    loaded: list != null,
    collections,
    byId,
    maxCollections: list?.max_collections ?? 20,
    refresh,
    create,
    update,
    remove,
    reopen,
    membershipFor,
    write,
  };
}

export type StudioCollections = ReturnType<typeof useStudioCollections>;
