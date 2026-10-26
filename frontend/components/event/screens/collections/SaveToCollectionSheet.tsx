"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ClientTheme } from "@/lib/client-theme";
import { IconLock, IconPlus } from "@/components/ui/icons";
import {
  COLLECTION_NAME_MAX,
  idsToChange,
  lastUsedFirst,
  lockedMessage,
  recordChange,
  rowTapAction,
  sheetRowState,
  type ChangeLedger,
} from "@/lib/collections/logic";
import type { GuestCollection } from "@/lib/collections/types";
import { CheckBox, CollectionSheet, PrimaryButton } from "./CollectionSheet";
import { CollectionWriteError, type CollectionsApi } from "./useCollections";

/**
 * "Save to collection": one sheet for adding AND removing (spec §4.1). Every
 * collection is a row with this selection's state in it (checked, partly in,
 * not in); tapping a row applies at once, optimistically. Partly in adds the
 * rest; checked removes all the selected photos from it. So "which collection
 * should it be removed from?" never needs asking: the answer is on screen.
 *
 * Closing (Done, the scrim, a drag, Escape) hands back what changed, and the
 * caller shows ONE toast for the whole session with an Undo that reverses
 * exactly those changes.
 *
 * `ids` is null while a select-all scope is still being resolved: the rows
 * wait, and the header says what it is doing.
 */
export function SaveToCollectionSheet({
  t,
  desktop,
  studio,
  col,
  ids,
  count,
  onClose,
}: {
  t: ClientTheme;
  desktop: boolean;
  studio: string;
  col: CollectionsApi;
  ids: string[] | null;
  count: number;
  onClose: (ledger: ChangeLedger) => void;
}) {
  const [ledger, setLedger] = useState<ChangeLedger>(() => new Map());
  const ledgerRef = useRef(ledger);
  useEffect(() => {
    ledgerRef.current = ledger;
  }, [ledger]);
  const [busy, setBusy] = useState<ReadonlySet<string>>(() => new Set());
  const [notice, setNotice] = useState<{ id: string | null; text: string } | null>(null);

  // The order is fixed when the sheet opens (last used first), so a row never
  // jumps away from under a thumb mid-session. New collections join the top.
  const [order, setOrder] = useState<string[] | null>(null);
  const { collections, membership, lastUsedId, ensureMembership } = col;
  if (order == null && col.loaded) setOrder(lastUsedFirst(collections, lastUsedId).map((c) => c._id));
  const rows = useMemo(() => {
    if (!order) return [];
    const byId = new Map(collections.map((c) => [c._id, c]));
    const placed = order.map((id) => byId.get(id)).filter((c): c is GuestCollection => !!c);
    const extra = collections.filter((c) => !order.includes(c._id));
    return [...placed, ...extra];
  }, [order, collections]);

  useEffect(() => {
    if (ids?.length) void ensureMembership(ids);
  }, [ids, ensureMembership]);
  const ready = !!ids && ids.every((id) => membership.has(id));

  const close = () => onClose(ledgerRef.current);

  const apply = async (c: GuestCollection) => {
    if (!ids || !ready || busy.has(c._id)) return;
    const info = sheetRowState(c, ids, membership, { studio });
    if (info.locked) {
      setNotice({ id: c._id, text: lockedMessage(studio) });
      return;
    }
    const action = rowTapAction(info.state);
    const moving = idsToChange(c._id, action, ids, membership);
    setNotice(null);
    setBusy((b) => new Set(b).add(c._id));
    setLedger((l) => recordChange(l, c._id, action, moving));
    try {
      await col.write(c._id, action, ids);
    } catch (err) {
      setLedger((l) => recordChange(l, c._id, action === "add" ? "remove" : "add", moving));
      const reason = err instanceof CollectionWriteError ? err.reason : "failed";
      setNotice({
        id: c._id,
        text: reason === "locked" ? lockedMessage(studio) : reason === "gone" ? "That collection was just deleted." : "Couldn’t save. Try again.",
      });
    } finally {
      setBusy((b) => {
        const n = new Set(b);
        n.delete(c._id);
        return n;
      });
    }
  };

  /* new collection (Clients only) */
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [clash, setClash] = useState<GuestCollection | null>(null);
  const trimmed = name.replace(/\s+/g, " ").trim();
  const submitNew = async () => {
    if (!trimmed || trimmed.length > COLLECTION_NAME_MAX || creating) return;
    setCreating(true);
    setClash(null);
    setNotice(null);
    try {
      const res = await col.create(trimmed);
      if ("collection" in res) {
        setOrder((o) => [res.collection._id, ...(o ?? [])]);
        setNaming(false);
        setName("");
        await apply(res.collection);
      } else if ("exists" in res) {
        const existing = collections.find((c) => c._id === res.exists) ?? null;
        setClash(existing);
        setNotice({ id: null, text: res.message });
      } else {
        setNotice({ id: null, text: res.limit });
      }
    } catch {
      setNotice({ id: null, text: "Couldn’t create that collection. Try again." });
    } finally {
      setCreating(false);
    }
  };

  const subtitle = ids ? `${count.toLocaleString("en-IN")} ${count === 1 ? "photo" : "photos"}` : `Getting ${count.toLocaleString("en-IN")} photos ready`;

  return (
    <CollectionSheet t={t} desktop={desktop} title="Save to collection" subtitle={subtitle} onClose={close} footer={<PrimaryButton t={t} onClick={close}>Done</PrimaryButton>}>
      {notice && notice.id == null && (
        <p className="mb-2 rounded-xl px-3 py-2 text-[12.5px] font-semibold" style={{ background: t.sunken, color: t.text }}>
          {notice.text}
          {clash && (
            <button
              type="button"
              onClick={() => {
                setNaming(false);
                setName("");
                setClash(null);
                void apply(clash);
              }}
              className="ml-1 cursor-pointer font-extrabold underline underline-offset-2"
              style={{ color: t.brand }}
            >
              Add to {clash.name}
            </button>
          )}
        </p>
      )}

      {!col.loaded ? (
        <RowSkeleton t={t} />
      ) : (
        <ul className="-mx-2 pb-1" role="list">
          {rows.map((c) => {
            const info = ids ? sheetRowState(c, ids, membership, { studio }) : null;
            const disabled = !ready || busy.has(c._id);
            return (
              <li key={c._id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={info?.state === "checked" ? true : info?.state === "indeterminate" ? "mixed" : false}
                  aria-disabled={info?.locked || disabled}
                  onClick={() => void apply(c)}
                  className="flex min-h-[56px] w-full cursor-pointer items-center gap-3 rounded-2xl px-2 py-2 text-left active:bg-[var(--row-hover)] can-hover:hover:bg-[var(--row-hover)]"
                  style={{ ["--row-hover" as string]: t.sunken, opacity: !ready ? 0.55 : 1 }}
                >
                  {info?.locked ? (
                    <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center" style={{ color: t.muted }}>
                      <IconLock size={17} />
                    </span>
                  ) : (
                    <CheckBox t={t} state={info?.state ?? "unchecked"} />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-bold" style={{ color: info?.locked ? t.muted : t.text }}>
                      {c.name}
                    </span>
                    {info?.secondary && (
                      <span className="mt-0.5 block truncate text-[12px] font-semibold" style={{ color: t.muted }}>
                        {info.secondary}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-[12.5px] font-bold tabular-nums" style={{ color: t.faint }}>
                    {c.count.toLocaleString("en-IN")}
                  </span>
                </button>
                {notice?.id === c._id && (
                  <p className="mx-2 mb-2 mt-0.5 rounded-xl px-3 py-2 text-[12.5px] font-semibold" style={{ background: t.sunken, color: t.text }}>
                    {notice.text}
                  </p>
                )}
              </li>
            );
          })}

          {rows.length === 0 && !col.caps.canManage && (
            <li className="px-2 py-6 text-center text-[13px] font-semibold" style={{ color: t.muted }}>
              No collections yet.
            </li>
          )}

          {col.caps.canManage && rows.length < col.maxCollections && (
            <li className="mt-1">
              {naming ? (
                <div className="flex items-center gap-2 px-2 py-2">
                  <input
                    autoFocus
                    value={name}
                    maxLength={COLLECTION_NAME_MAX + 10}
                    onChange={(e) => {
                      setName(e.target.value);
                      setClash(null);
                      if (notice?.id == null) setNotice(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void submitNew();
                      if (e.key === "Escape") {
                        e.stopPropagation();
                        e.preventDefault();
                        setNaming(false);
                        setName("");
                      }
                    }}
                    placeholder="e.g. Haldi table book"
                    aria-label="New collection name"
                    className="min-w-0 flex-1 rounded-xl px-3 py-2.5 text-[14.5px] font-semibold outline-none"
                    style={{ background: t.sunken, color: t.text, border: `1.5px solid ${trimmed.length > COLLECTION_NAME_MAX ? t.error : t.border}` }}
                  />
                  <button
                    type="button"
                    onClick={() => void submitNew()}
                    disabled={!trimmed || trimmed.length > COLLECTION_NAME_MAX || creating}
                    className="shrink-0 cursor-pointer rounded-full px-4 py-2.5 text-[13px] font-extrabold disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ background: t.brand, color: t.onBrand }}
                  >
                    {creating ? "Creating…" : "Create"}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setNaming(true)}
                  disabled={!ready}
                  className="flex min-h-[52px] w-full cursor-pointer items-center gap-3 rounded-2xl px-2 text-left text-[14.5px] font-bold disabled:opacity-55 active:bg-[var(--row-hover)] can-hover:hover:bg-[var(--row-hover)]"
                  style={{ color: t.brand, ["--row-hover" as string]: t.sunken }}
                >
                  <span className="flex h-[22px] w-[22px] items-center justify-center">
                    <IconPlus size={18} />
                  </span>
                  New collection
                </button>
              )}
              {naming && trimmed.length > COLLECTION_NAME_MAX && (
                <p className="px-2 pb-1 text-[12px] font-semibold" style={{ color: t.error }}>
                  Keep it to {COLLECTION_NAME_MAX} characters.
                </p>
              )}
            </li>
          )}
        </ul>
      )}
    </CollectionSheet>
  );
}

function RowSkeleton({ t }: { t: ClientTheme }) {
  return (
    <div className="flex flex-col gap-2 py-2" aria-label="Loading collections">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="tile-skeleton h-12 rounded-2xl"
          style={{ ["--skel-a" as string]: t.sunken, ["--skel-b" as string]: t.card }}
        />
      ))}
    </div>
  );
}
