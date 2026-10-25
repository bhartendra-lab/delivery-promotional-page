"use client";

/**
 * The face filter's state and requests, for the gallery.
 *
 * TWO SCOPES, held side by side: "mine" (My Photos, for anyone with a selfie)
 * and "all" (All Photos, hosts only). Each keeps its own chips, its own
 * selection and its own last answer, so a host moving between the tabs finds
 * each one as they left it. The gallery tells this hook which scope the
 * visible tab filters (`scope`), or null where no bar belongs (Liked, a
 * guest's All Photos, My People, face search off).
 *
 * WHEN IT ASKS:
 *   - chips: once per scope per visit, the first time that scope's tab shows,
 *     and never before this visit's `search-selfie` has answered (the backend
 *     stores the viewer's own face during that search, which is what keeps
 *     them off their own bar). The cached chips paint before that.
 *   - a selection's photos: 250 ms after the last tap, with the previous
 *     request aborted. Only the answer for the selection still on the bar is
 *     ever applied. Never with nothing selected. This one does NOT wait for
 *     the search: the server drops the viewer's own face and scopes "mine"
 *     to their stored photos either way, and if the search then changes
 *     those photos the chip key changes and the selection is asked again. So
 *     a reload with a selection kept paints as soon as it can.
 *   - refresh: the gallery's own access re-check carries the chip query for
 *     the scope in view (`refreshRequest`), with `if_key`, so an unchanged bar
 *     costs a few bytes.
 *
 * The answer becomes a pager with My People's shape (`GroupFeed`), which the
 * gallery drives with the machinery it already has.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GuestAuthError, getGuestMedia } from "@/lib/guest-api";
import type { GroupFeed } from "@/lib/friend-finder/feed";
import type { GuestMediaItem } from "@/lib/types";
import { getFaceFilter, getFaceFilterMedia } from "@/lib/face-filter/api";
import { buildFaceFeed } from "@/lib/face-filter/feed";
import {
  applyChipAnswer,
  faceFilterQuery,
  isFaceFilterMedia,
  reconcileSelection,
  SELECTION_DEBOUNCE_MS,
  selectionKey,
  toggleSelection,
  visibleChips,
} from "@/lib/face-filter/query";
import { readFaceChips, readFaceSelection, writeFaceChips, writeFaceSelection } from "@/lib/face-filter/storage";
import type { FaceChips, FaceFilterBlock, FaceFilterScope } from "@/lib/face-filter/types";
import type { FaceFilterFace } from "./FaceFilterBar";

type ScopeState = {
  chips: FaceChips | null;
  selected: string[];
  /** The last answer's pager. Kept while a newer selection is in flight, so
   *  the grid does not blank between taps; dropped when the selection empties
   *  or a request fails. */
  feed: GroupFeed | null;
  /** `${chips key}|${selection}` the feed answers. */
  feedFor: string | null;
  failed: boolean;
};

type States = Record<FaceFilterScope, ScopeState>;

/** A server that keeps answering "the chips changed" is not converging; stop
 *  asking after this many in a row and show the error state instead. */
const MAX_CHIP_CHANGES = 3;

function initialScope(uid: string, scope: FaceFilterScope): ScopeState {
  const chips = readFaceChips(uid, scope);
  return {
    chips,
    selected: reconcileSelection(readFaceSelection(uid, scope), chips),
    feed: null,
    feedFor: null,
    failed: false,
  };
}

export type FaceFilter = {
  /** The bar's faces for the scope in view, or null for no bar. */
  faces: FaceFilterFace[] | null;
  selected: ReadonlySet<string>;
  /** A chip is selected on the tab in view: the grid is the filter's. */
  active: boolean;
  /** The pager for the selection on screen; null while the first answer for a
   *  selection is on its way. */
  feed: GroupFeed | null;
  /** The last request for this selection failed. The gallery's Retry asks again. */
  failed: boolean;
  toggle: (id: string) => void;
  clear: () => void;
  /** The chip query to ride on the gallery's session refresh, and where its
   *  answer goes. Null when there is nothing to refresh yet. */
  refreshRequest: () => { query: string; apply: (block: FaceFilterBlock | undefined) => void } | null;
};

export function useFaceFilter({
  uid,
  bookingId,
  enabled,
  searchSettled,
  scope,
  onReauth,
  retryKey,
}: {
  uid: string;
  bookingId: string;
  /** Face search is on for the event. Off: no bar and no requests. */
  enabled: boolean;
  /** This visit's `search-selfie` has answered, or there was nothing to search. */
  searchSettled: boolean;
  scope: FaceFilterScope | null;
  onReauth: () => void;
  /** The gallery's reload counter; a bump retries a failed selection. */
  retryKey: number;
}): FaceFilter {
  const [states, setStates] = useState<States>(() => ({ mine: initialScope(uid, "mine"), all: initialScope(uid, "all") }));

  const statesRef = useRef(states);
  const onReauthRef = useRef(onReauth);
  useEffect(() => {
    statesRef.current = states;
    onReauthRef.current = onReauth;
  });
  /** Scopes whose chips were asked for during this visit. */
  const fetchedRef = useRef(new Set<FaceFilterScope>());
  const chipChangesRef = useRef(0);

  /* ── the cache ── */
  const mineChips = states.mine.chips;
  const allChips = states.all.chips;
  const mineSelected = states.mine.selected;
  const allSelected = states.all.selected;
  useEffect(() => writeFaceChips(uid, "mine", mineChips), [uid, mineChips]);
  useEffect(() => writeFaceChips(uid, "all", allChips), [uid, allChips]);
  useEffect(() => writeFaceSelection(uid, "mine", mineSelected), [uid, mineSelected]);
  useEffect(() => writeFaceSelection(uid, "all", allSelected), [uid, allSelected]);

  /** One chip answer for one scope. A selection loses any chip that is gone;
   *  if it survives, the selection effect asks for it again under the new key. */
  const applyBlock = useCallback((target: FaceFilterScope, block: FaceFilterBlock | null | undefined) => {
    setStates((prev) => {
      const cur = prev[target];
      const chips = applyChipAnswer(cur.chips, block);
      if (chips === cur.chips) return prev;
      const selected = reconcileSelection(cur.selected, chips);
      const emptied = selected.length === 0;
      return {
        ...prev,
        [target]: { ...cur, chips, selected, ...(emptied ? { feed: null, feedFor: null, failed: false } : {}) },
      };
    });
  }, []);

  /* ── the chips, once per scope per visit ── */
  useEffect(() => {
    if (!enabled || !searchSettled || !scope || fetchedRef.current.has(scope)) return;
    fetchedRef.current.add(scope);
    const target = scope;
    getFaceFilter(uid, { scope: target, ifKey: statesRef.current[target].chips?.key ?? null })
      .then((res) => applyBlock(target, res.face_filter))
      .catch((err) => {
        // Asked again the next time this tab shows. Until then the cached
        // chips (if any) stand; with none there is simply no bar.
        fetchedRef.current.delete(target);
        if (err instanceof GuestAuthError) onReauthRef.current();
      });
  }, [enabled, searchSettled, scope, uid, applyBlock]);

  const fetchPageFor = useCallback(
    (target: FaceFilterScope) =>
      async (ids: string[]): Promise<GuestMediaItem[]> => {
        // My Photos: `mine`, so the server keeps only the viewer's own photos.
        // A host's All Photos: `faceFilter`, so the ids are kept inside the
        // booking. The ONLY place `face_filter: true` is ever sent.
        const res = await getGuestMedia(
          uid,
          bookingId,
          target === "all" ? { faceFilter: true, skip: 0, limit: ids.length } : { mine: true, skip: 0, limit: ids.length },
          ids,
        );
        return res.media ?? [];
      },
    [uid, bookingId],
  );

  /* ── a selection's photos ── */
  const cur = scope ? states[scope] : null;
  const selKey = cur ? selectionKey(cur.selected) : "";
  const chipsKey = cur?.chips?.key ?? null;
  const answered = !!cur?.feed && cur.feedFor === `${chipsKey}|${selKey}`;

  useEffect(() => {
    if (!enabled || !scope || !selKey || !chipsKey || answered) return;
    const target = scope;
    const faces = selKey.split(",");
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await getFaceFilterMedia(uid, { scope: target, faces, ifKey: chipsKey, signal: controller.signal });
          if (controller.signal.aborted) return;
          const block = res.face_filter;
          if (!block || !("unchanged" in block)) {
            // The chips changed under the selection, or the filter is gone.
            // Apply that; a surviving selection is asked for again.
            chipChangesRef.current += 1;
            if (chipChangesRef.current > MAX_CHIP_CHANGES) throw new Error("face filter: the chips keep changing");
            applyBlock(target, block);
            return;
          }
          chipChangesRef.current = 0;
          const media = res.face_filter_media;
          if (!isFaceFilterMedia(media)) throw new Error("face filter: no selection in the answer");
          const feed = buildFaceFeed({ scope: target, selected: faces, answer: media, fetchPage: fetchPageFor(target) });
          setStates((prev) => {
            const now = prev[target];
            // The selection moved on while this was in flight.
            if (selectionKey(now.selected) !== selKey) return prev;
            return { ...prev, [target]: { ...now, feed, feedFor: `${chipsKey}|${selKey}`, failed: false } };
          });
        } catch (err) {
          if (controller.signal.aborted) return;
          if (err instanceof GuestAuthError) {
            onReauthRef.current();
            return;
          }
          setStates((prev) => {
            const now = prev[target];
            if (selectionKey(now.selected) !== selKey) return prev;
            return { ...prev, [target]: { ...now, feed: null, feedFor: null, failed: true } };
          });
        }
      })();
    }, SELECTION_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // `retryKey` re-runs a failed request; an answered one returns above.
  }, [enabled, scope, selKey, chipsKey, answered, retryKey, uid, applyBlock, fetchPageFor]);

  /* ── taps ── */
  const toggle = useCallback(
    (id: string) => {
      if (!scope) return;
      const target = scope;
      setStates((prev) => {
        const now = prev[target];
        const selected = toggleSelection(now.selected, id);
        if (selected === now.selected) return prev;
        // An empty selection drops its feed, so the next first pick starts
        // clean rather than flashing the photos of the last one.
        const emptied = selected.length === 0;
        return { ...prev, [target]: { ...now, selected, failed: false, ...(emptied ? { feed: null, feedFor: null } : {}) } };
      });
    },
    [scope],
  );

  const clear = useCallback(() => {
    if (!scope) return;
    const target = scope;
    setStates((prev) =>
      prev[target].selected.length === 0
        ? prev
        : { ...prev, [target]: { ...prev[target], selected: [], feed: null, feedFor: null, failed: false } },
    );
  }, [scope]);

  const refreshRequest = useCallback(() => {
    if (!enabled || !scope || !fetchedRef.current.has(scope)) return null;
    const target = scope;
    return {
      query: faceFilterQuery({ scope: target, ifKey: statesRef.current[target].chips?.key ?? null }),
      apply: (block: FaceFilterBlock | undefined) => applyBlock(target, block),
    };
  }, [enabled, scope, applyBlock]);

  /* ── what the gallery reads ── */
  const chips = enabled && cur ? visibleChips(cur.chips) : null;
  const faces = useMemo<FaceFilterFace[] | null>(
    () =>
      chips?.map((chip, i) => ({
        id: chip.id,
        thumb_url: chip.thumb_url,
        // No names, ever: a screen reader hears a number and how many photos.
        label: `Person ${i + 1}, ${chip.count.toLocaleString("en-IN")} photo${chip.count === 1 ? "" : "s"}`,
      })) ?? null,
    [chips],
  );
  const selectedIds = cur?.selected;
  const selected = useMemo(() => new Set(selectedIds ?? []), [selectedIds]);
  const active = !!faces && selected.size > 0;

  return {
    faces,
    selected,
    active,
    feed: active ? (cur?.feed ?? null) : null,
    failed: active && !!cur?.failed,
    toggle,
    clear,
    refreshRequest,
  };
}
