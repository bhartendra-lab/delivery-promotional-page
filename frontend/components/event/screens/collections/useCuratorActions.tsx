"use client";

import { useCallback, useRef, useState } from "react";
import type { ClientTheme } from "@/lib/client-theme";
import { GuestAuthError } from "@/lib/guest-api";
import { likePhotos } from "@/lib/collections/api";
import {
  MAX_LIKE_IDS,
  bulkLikeMode,
  chunk,
  likedToast,
  lockedMessage,
  recordChange,
  saveSummary,
  type ChangeLedger,
} from "@/lib/collections/logic";
import { SaveToCollectionSheet } from "./SaveToCollectionSheet";
import { CollectionWriteError, type CollectionsApi } from "./useCollections";

/** The gallery's toast, with an optional Undo. */
export type Notify = (text: string, undo?: () => void) => void;

/** What a bulk action acts on: ids in hand, or a scope still to be walked. */
export type BulkTarget =
  | { ids: string[] }
  | { resolve: (signal: AbortSignal) => Promise<string[]>; count: number };

/**
 * The curator's actions that the gallery and the Selection workspace share:
 * the Save sheet (opened from a tile, the viewers or the selection bar), bulk
 * like and unlike, and removing photos from one collection. Each ends in ONE
 * toast with an Undo that reverses exactly what it did.
 */
export function useCuratorActions({
  t,
  desktop,
  studio,
  uid,
  col,
  notify,
  liked,
  applyLikes,
  onReauth,
}: {
  t: ClientTheme;
  desktop: boolean;
  studio: string;
  uid: string;
  col: CollectionsApi;
  notify: Notify;
  /** Photos this guest has liked, by Media `_id` (the gallery's own set). */
  liked: ReadonlySet<string>;
  /** Show these as liked or not, before (or without) the server's answer. */
  applyLikes: (ids: readonly string[], on: boolean) => void;
  onReauth: () => void;
}) {
  const [save, setSave] = useState<{ ids: string[] | null; count: number; onDone?: () => void } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const resolveTarget = useCallback(async (target: BulkTarget, signal: AbortSignal): Promise<string[]> => {
    return "ids" in target ? target.ids : target.resolve(signal);
  }, []);

  /** Open the Save sheet. `onDone` runs when it closes (the selection bar
   *  leaves select mode then, so the photos stay selected while it is open). */
  const openSave = useCallback(
    (target: BulkTarget, onDone?: () => void) => {
      abortRef.current?.abort();
      if ("ids" in target) {
        setSave({ ids: target.ids, count: target.ids.length, onDone });
        return;
      }
      const ctl = new AbortController();
      abortRef.current = ctl;
      setSave({ ids: null, count: target.count, onDone });
      target
        .resolve(ctl.signal)
        .then((ids) => {
          if (!ctl.signal.aborted) setSave({ ids, count: ids.length, onDone });
        })
        .catch((err) => {
          if (ctl.signal.aborted) return;
          if (err instanceof GuestAuthError) onReauth();
          setSave(null);
          notify("Couldn’t get those photos ready. Try again.");
        });
    },
    [notify, onReauth],
  );

  const closeSave = useCallback(
    (ledger: ChangeLedger) => {
      abortRef.current?.abort();
      const done = save?.onDone;
      setSave(null);
      done?.();
      const text = saveSummary(ledger, (id) => col.collectionsById.get(id)?.name ?? "the collection");
      if (!text) return;
      notify(text, () => {
        void col.undo(ledger).then((ok) => {
          if (!ok) notify("Couldn’t undo all of that. Check your collections.");
        });
      });
    },
    [save, col, notify],
  );

  const saveSheet = save ? (
    <SaveToCollectionSheet t={t} desktop={desktop} studio={studio} col={col} ids={save.ids} count={save.count} onClose={closeSave} />
  ) : null;

  /**
   * Like or unlike many photos. `known` says whether every photo's current
   * state is known here (all of them loaded): only then is there an Undo,
   * because an Undo built on guesses could take away a like this guest made
   * on a photo that never reached the screen.
   */
  const bulkLike = useCallback(
    async (target: BulkTarget, { known }: { known: boolean }) => {
      const ctl = new AbortController();
      let ids: string[];
      try {
        ids = await resolveTarget(target, ctl.signal);
      } catch (err) {
        if (err instanceof GuestAuthError) onReauth();
        notify("Couldn’t get those photos ready. Try again.");
        return;
      }
      if (!ids.length) return;
      const mode = bulkLikeMode(ids, liked, known);
      const on = mode === "like";
      const changing = ids.filter((id) => liked.has(id) !== on);
      applyLikes(ids, on);
      try {
        for (const part of chunk(ids, MAX_LIKE_IDS)) await likePhotos(uid, part, on);
      } catch (err) {
        if (err instanceof GuestAuthError) onReauth();
        applyLikes(changing, !on);
        notify("Couldn’t save your likes. Try again.");
        return;
      }
      const undo =
        known && changing.length
          ? () => {
              applyLikes(changing, !on);
              void Promise.all(chunk(changing, MAX_LIKE_IDS).map((part) => likePhotos(uid, part, !on))).catch(() => {
                applyLikes(changing, on);
                notify("Couldn’t undo that. Try again.");
              });
            }
          : undefined;
      notify(likedToast(ids.length, mode), undo);
    },
    [resolveTarget, liked, applyLikes, uid, notify, onReauth],
  );

  /** Remove photos from one collection (its own view), with Undo. */
  const removeFrom = useCallback(
    async (collectionId: string, target: BulkTarget, { onRemoved, onUndone }: { onRemoved?: (ids: string[]) => void; onUndone?: () => void } = {}) => {
      const ctl = new AbortController();
      let ids: string[];
      try {
        ids = await resolveTarget(target, ctl.signal);
      } catch {
        notify("Couldn’t get those photos ready. Try again.");
        return;
      }
      const name = col.collectionsById.get(collectionId)?.name ?? "the collection";
      try {
        const moved = await col.write(collectionId, "remove", ids);
        if (!moved.length) return;
        onRemoved?.(moved);
        const ledger = recordChange(new Map(), collectionId, "remove", moved);
        notify(`Removed from ${name}`, () => {
          void col.undo(ledger).then((ok) => {
            if (ok) onUndone?.();
            else notify("Couldn’t undo that. Try again.");
          });
        });
      } catch (err) {
        const reason = err instanceof CollectionWriteError ? err.reason : "failed";
        notify(reason === "locked" ? lockedMessage(studio) : "Couldn’t remove those photos. Try again.");
      }
    },
    [resolveTarget, col, notify, studio],
  );

  return { openSave, saveSheet, saveOpen: save != null, bulkLike, removeFrom };
}

export type CuratorActions = ReturnType<typeof useCuratorActions>;
