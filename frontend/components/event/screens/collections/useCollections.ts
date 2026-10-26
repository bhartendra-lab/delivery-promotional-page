"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { GuestAuthError } from "@/lib/guest-api";
import * as api from "@/lib/collections/api";
import {
  MAX_MEMBERSHIP_IDS,
  MAX_WRITE_IDS,
  applyMembershipWrite,
  chunk,
  forgetCollection,
  idsToChange,
  mergeMembership,
  type ChangeLedger,
  type CuratorCaps,
} from "@/lib/collections/logic";
import type { CollectionList, GuestCollection, Membership, MembershipRef } from "@/lib/collections/types";

/** How often an open Selection workspace re-reads the list (two family
 *  members often work at the same time). */
const LIVE_REFRESH_MS = 30_000;
/** At most this many loaded photos have their membership re-read on a tick. */
const LIVE_MEMBERSHIP_IDS = 600;

export type WriteFailure = "locked" | "gone" | "failed";

/** Why a write did not land, for the caller's wording. */
export class CollectionWriteError extends Error {
  constructor(readonly reason: WriteFailure) {
    super(reason);
  }
}

export type CreateResult = { collection: GuestCollection } | { exists: string | null; message: string } | { limit: string };

const lastUsedKey = (uid: string) => `vyv:collections:last:${uid}`;
function readLastUsed(uid: string): string | null {
  try {
    return sessionStorage.getItem(lastUsedKey(uid));
  } catch {
    return null;
  }
}

/**
 * The curator's collections: the list, which collections each loaded photo is
 * in, and every write, applied optimistically and rolled back on failure.
 *
 * Inert unless `enabled` (the caller passes `capabilities(...).curator`): no
 * request, no timer, no listener. That is the line that keeps a plain Guest's
 * gallery exactly as it was.
 */
export function useCollections({
  uid,
  bookingId,
  enabled,
  caps,
  live,
  liveIdsRef,
  onReauth,
}: {
  uid: string;
  bookingId: string;
  enabled: boolean;
  /** From the session; the list's own `can_manage` / `can_send` win once loaded. */
  caps: CuratorCaps;
  /** The Selection workspace is open: refresh every 30s as well. */
  live: boolean;
  /** The photos to keep current on a live refresh (the workspace's loaded ones). */
  liveIdsRef?: React.RefObject<string[]>;
  onReauth: () => void;
}) {
  const [list, setList] = useState<CollectionList | null>(null);
  const [listError, setListError] = useState(false);
  const [membership, setMembership] = useState<Map<string, MembershipRef[]>>(() => new Map());
  const [lastUsedId, setLastUsedId] = useState<string | null>(() => (typeof window === "undefined" ? null : readLastUsed(uid)));

  // Read in async callbacks without making them change identity.
  const membershipRef = useRef(membership);
  const listRef = useRef(list);
  const onReauthRef = useRef(onReauth);
  useEffect(() => {
    membershipRef.current = membership;
    listRef.current = list;
    onReauthRef.current = onReauth;
  });

  const authCheck = useCallback((err: unknown) => {
    if (err instanceof GuestAuthError) onReauthRef.current();
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const next = await api.listCollections(uid, bookingId);
      setList(next);
      setListError(false);
    } catch (err) {
      authCheck(err);
      if (!listRef.current) setListError(true);
    }
  }, [enabled, uid, bookingId, authCheck]);

  /** One membership read, chunked at the server's cap; merged into the map
   *  and handed back, so a caller can act on it before React re-renders. */
  const fetchMembership = useCallback(
    async (ids: readonly string[]): Promise<Record<string, MembershipRef[]>> => {
      const out: Record<string, MembershipRef[]> = {};
      await Promise.all(
        chunk(ids, MAX_MEMBERSHIP_IDS).map(async (part) => {
          const res = await api.getMembership(uid, bookingId, part);
          Object.assign(out, res.membership ?? {});
          setMembership((m) => mergeMembership(m, part, res.membership ?? {}));
        }),
      );
      return out;
    },
    [uid, bookingId],
  );

  /** Fetch membership for photos not known yet (or all of them with `force`). */
  const inFlight = useRef(new Set<string>());
  const ensureMembership = useCallback(
    async (ids: readonly string[], { force = false }: { force?: boolean } = {}) => {
      if (!enabled) return;
      const want = [...new Set(ids)].filter((id) => (force || !membershipRef.current.has(id)) && !inFlight.current.has(id));
      if (!want.length) return;
      for (const id of want) inFlight.current.add(id);
      try {
        await fetchMembership(want);
      } catch (err) {
        authCheck(err);
        // A background read: the next page or the next tick asks again.
      } finally {
        for (const id of want) inFlight.current.delete(id);
      }
    },
    [enabled, fetchMembership, authCheck],
  );

  /** Seed membership the feed already returned with its photos. */
  const seedMembership = useCallback((entries: { _id: string; collection_refs?: MembershipRef[] }[]) => {
    setMembership((m) => {
      const next = new Map(m);
      for (const e of entries) if (e.collection_refs) next.set(e._id, e.collection_refs);
      return next;
    });
  }, []);

  // First load, and again whenever the tab comes back (someone else may have
  // sorted, renamed or sent in the meantime).
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) void refresh();
    });
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, refresh]);

  // While the workspace is open: the list and what's on screen, every 30s.
  useEffect(() => {
    if (!enabled || !live) return;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      void refresh();
      const ids = liveIdsRef?.current ?? [];
      if (ids.length) void ensureMembership(ids.slice(0, LIVE_MEMBERSHIP_IDS), { force: true });
    };
    const id = window.setInterval(tick, LIVE_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [enabled, live, refresh, ensureMembership, liveIdsRef]);

  const rememberLastUsed = useCallback(
    (collectionId: string) => {
      setLastUsedId(collectionId);
      try {
        sessionStorage.setItem(lastUsedKey(uid), collectionId);
      } catch {
        /* private window: the order just isn't remembered */
      }
    },
    [uid],
  );

  const patchCollection = useCallback((id: string, patch: Partial<GuestCollection> | ((c: GuestCollection) => Partial<GuestCollection>)) => {
    setList((l) =>
      l
        ? {
            ...l,
            collections: l.collections.map((c) => (c._id === id ? { ...c, ...(typeof patch === "function" ? patch(c) : patch) } : c)),
          }
        : l,
    );
  }, []);

  /**
   * Add or remove photos, optimistically. Resolves to the ids that actually
   * moved (the ones not already in, or not already out), which is what an
   * Undo must reverse. On failure the map and the count go back to exactly
   * what they were for these photos, and the error says why.
   */
  const write = useCallback(
    async (collectionId: string, action: "add" | "remove", ids: readonly string[]): Promise<string[]> => {
      // Photos whose membership was never loaded (a select-all over pages not
      // fetched yet) are looked up first: "not in the map" is not "not in
      // the collection", and a remove must not skip them.
      let known: Membership = membershipRef.current;
      const unknown = ids.filter((id) => !known.has(id));
      if (unknown.length) {
        try {
          known = mergeMembership(known, unknown, await fetchMembership(unknown));
        } catch (err) {
          authCheck(err);
          throw new CollectionWriteError("failed");
        }
      }
      const moving = idsToChange(collectionId, action, ids, known);
      if (!moving.length) return [];
      const before = new Map(moving.map((id) => [id, known.get(id)]));
      const delta = action === "add" ? moving.length : -moving.length;
      setMembership((m) => applyMembershipWrite(m, collectionId, action, moving, Date.now()));
      patchCollection(collectionId, (c) => ({ count: Math.max(0, c.count + delta) }));
      if (action === "add") rememberLastUsed(collectionId);

      let landed = 0;
      try {
        let count: number | null = null;
        for (const part of chunk(moving, MAX_WRITE_IDS)) {
          const res = await api.writeItems(uid, bookingId, collectionId, action, part);
          landed += part.length;
          count = res.count;
        }
        if (count != null) patchCollection(collectionId, { count });
        return moving;
      } catch (err) {
        authCheck(err);
        // Roll back what did not land. Chunks that did are real, and stay.
        const lost = moving.slice(landed);
        setMembership((m) => {
          const next = new Map(m);
          for (const id of lost) {
            const prev = before.get(id);
            if (prev) next.set(id, prev);
            else next.delete(id);
          }
          return next;
        });
        patchCollection(collectionId, (c) => ({ count: Math.max(0, c.count - (action === "add" ? lost.length : -lost.length)) }));
        if (err instanceof ApiError && err.status === 423) {
          patchCollection(collectionId, { status: "final" });
          throw new CollectionWriteError("locked");
        }
        if (err instanceof ApiError && err.status === 404) {
          void refresh();
          throw new CollectionWriteError("gone");
        }
        throw new CollectionWriteError("failed");
      }
    },
    [uid, bookingId, patchCollection, rememberLastUsed, authCheck, refresh, fetchMembership],
  );

  /** Reverse a sheet session or a bulk action. Best effort: what still can be
   *  reversed is, and the caller is told if anything could not. */
  const undo = useCallback(
    async (ledger: ChangeLedger): Promise<boolean> => {
      let ok = true;
      for (const [collectionId, change] of ledger) {
        try {
          if (change.added.size) await write(collectionId, "remove", [...change.added]);
          if (change.removed.size) await write(collectionId, "add", [...change.removed]);
        } catch {
          ok = false;
        }
      }
      return ok;
    },
    [write],
  );

  const create = useCallback(
    async (name: string): Promise<CreateResult> => {
      try {
        const { collection } = await api.createCollection(uid, bookingId, name);
        setList((l) => (l ? { ...l, collections: [...l.collections, collection] } : l));
        return { collection };
      } catch (err) {
        authCheck(err);
        if (err instanceof ApiError && err.status === 409) {
          const body = (err.body ?? {}) as { code?: string; collection_id?: string | null };
          if (body.code === "collection_limit") return { limit: err.message };
          return { exists: body.collection_id ?? null, message: err.message };
        }
        throw err;
      }
    },
    [uid, bookingId, authCheck],
  );

  const rename = useCallback(
    async (collectionId: string, name: string) => {
      const { collection } = await api.renameCollection(uid, bookingId, collectionId, name);
      patchCollection(collectionId, { name: collection.name });
      return collection;
    },
    [uid, bookingId, patchCollection],
  );

  const remove = useCallback(
    async (collectionId: string) => {
      await api.deleteCollection(uid, bookingId, collectionId);
      setList((l) => (l ? { ...l, collections: l.collections.filter((c) => c._id !== collectionId) } : l));
      setMembership((m) => forgetCollection(m, collectionId));
    },
    [uid, bookingId],
  );

  const send = useCallback(
    async (collectionIds: string[]) => {
      const res = await api.sendSelection(uid, bookingId, collectionIds);
      const now = Date.now();
      for (const id of [...res.sent, ...res.already_sent]) patchCollection(id, (c) => ({ status: "final", finalized_at: c.finalized_at ?? now }));
      void refresh();
      return res;
    },
    [uid, bookingId, patchCollection, refresh],
  );

  const collections = useMemo(() => list?.collections ?? [], [list]);
  const collectionsById = useMemo(() => new Map(collections.map((c) => [c._id, c])), [collections]);
  const effectiveCaps: CuratorCaps = useMemo(
    () =>
      list
        ? { curator: caps.curator, canManage: caps.curator && list.can_manage, canSend: caps.curator && list.can_send }
        : caps,
    [list, caps],
  );

  return {
    loaded: list != null,
    listError,
    collections,
    collectionsById,
    clientNames: list?.client_names ?? [],
    maxCollections: list?.max_collections ?? 20,
    caps: effectiveCaps,
    membership,
    lastUsedId,
    refresh,
    ensureMembership,
    seedMembership,
    write,
    undo,
    create,
    rename,
    remove,
    send,
  };
}

export type CollectionsApi = ReturnType<typeof useCollections>;
