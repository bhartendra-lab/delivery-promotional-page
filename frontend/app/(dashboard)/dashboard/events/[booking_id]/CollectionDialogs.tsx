"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  COLLECTION_NAME_MAX,
  applyMembershipWrite,
  idsToChange,
  recordChange,
  rowTapAction,
  saveSummary,
  sheetRowState,
  type ChangeLedger,
} from "@/lib/collections/logic";
import { parseAlbumSize } from "@/lib/collections/studio";
import type { GuestCollection, MembershipRef } from "@/lib/collections/types";
import { IconLock, IconPlus, IconTrash, IconX } from "./icons";
import type { StudioCollections } from "./useStudioCollections";

/**
 * The dashboard's small dialogs for collections, in the studio's own
 * clothing (flat, terracotta, 250ms at most): a centred card on a laptop, a
 * bottom sheet on a phone. Escape and the scrim close it.
 */
export function DashDialog({
  title,
  onClose,
  busy,
  width = 420,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  busy?: boolean;
  width?: number;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  useEffect(() => {
    closeRef.current = onClose;
    busyRef.current = busy;
  });
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busyRef.current) closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    if (!ref.current?.contains(document.activeElement)) ref.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      if (before?.isConnected) before.focus();
    };
  }, []);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-[220] flex items-end justify-center sm:items-center sm:px-4"
      style={{ background: "rgba(42,34,24,0.48)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        className="dash-rise flex max-h-[85vh] w-full flex-col rounded-t-[14px] border border-[var(--color-brand-border)] bg-white shadow-[0_24px_64px_rgba(42,34,24,0.24)] outline-none sm:rounded-[14px]"
        style={{ maxWidth: width, paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-5">
          <h3 id={titleId} className="text-[17px] font-bold tracking-tight text-[var(--color-brand-ink)]">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="brand-focus -mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--color-brand-muted)] hover:bg-[var(--color-brand-hover)] hover:text-[var(--color-brand-ink)] disabled:opacity-50"
          >
            <IconX size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-2 pt-3">{children}</div>
        {footer && <div className="flex justify-end gap-2.5 px-6 pb-5 pt-3">{footer}</div>}
      </div>
    </div>
  );
}

const btnBase =
  "brand-focus inline-flex h-10 items-center justify-center gap-1.5 rounded-lg px-4 text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-50";
export const btnSecondary = `${btnBase} border border-[var(--color-brand-border)] bg-white text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)]`;
export const btnPrimary = `${btnBase} bg-[var(--color-brand-navy)] text-white hover:bg-[var(--color-brand-navy-deep)]`;
const btnDanger = `${btnBase} bg-[var(--color-brand-danger)] text-white hover:opacity-90`;
const inputCls =
  "brand-focus h-11 w-full rounded-lg border border-[var(--color-brand-border)] bg-white px-3.5 text-[14px] text-[var(--color-brand-ink)] outline-none focus:border-[var(--color-brand-navy)]";

const messageOf = (err: unknown, fallback: string) =>
  err instanceof ApiError && err.message ? err.message : err instanceof Error && err.message ? err.message : fallback;

/** New collection, or Rename. Resolves when saved; the dialog shows the
 *  server's own message (a duplicate name, the 20-collection cap) otherwise. */
export function NameDialog({
  title,
  initial,
  action,
  onSubmit,
  onClose,
}: {
  title: string;
  initial: string;
  action: string;
  onSubmit: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = name.replace(/\s+/g, " ").trim();
  const tooLong = trimmed.length > COLLECTION_NAME_MAX;
  const submit = async () => {
    if (!trimmed || tooLong || busy || trimmed === initial) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(trimmed);
      onClose();
    } catch (err) {
      setError(messageOf(err, "Could not save the name. Try again."));
      setBusy(false);
    }
  };
  return (
    <DashDialog
      title={title}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className={btnSecondary}>
            Cancel
          </button>
          <button type="button" onClick={() => void submit()} disabled={!trimmed || tooLong || busy || trimmed === initial} className={btnPrimary}>
            {busy ? "Saving…" : action}
          </button>
        </>
      }
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setError(null);
        }}
        onKeyDown={(e) => e.key === "Enter" && void submit()}
        placeholder="e.g. Haldi table book"
        aria-label="Collection name"
        className={inputCls}
      />
      {(tooLong || error) && (
        <p className="mt-2 text-[12.5px] text-[var(--color-brand-danger)]">{tooLong ? `Keep it to ${COLLECTION_NAME_MAX} characters.` : error}</p>
      )}
    </DashDialog>
  );
}

/** The album size: a soft target the Client sees as "182 of 250". */
export function AlbumSizeDialog({
  collection,
  onSubmit,
  onClose,
}: {
  collection: GuestCollection;
  onSubmit: (value: number | null) => Promise<void>;
  onClose: () => void;
}) {
  const [raw, setRaw] = useState(collection.target_count ? String(collection.target_count) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parsed = parseAlbumSize(raw);
  const submit = async () => {
    if (!parsed.ok || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(parsed.value);
      onClose();
    } catch (err) {
      setError(messageOf(err, "Could not save the album size. Try again."));
      setBusy(false);
    }
  };
  return (
    <DashDialog
      title={`Album size for ${collection.name}`}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className={btnSecondary}>
            Cancel
          </button>
          <button type="button" onClick={() => void submit()} disabled={!parsed.ok || busy} className={btnPrimary}>
            {busy ? "Saving…" : parsed.ok && parsed.value == null ? "Clear album size" : "Save"}
          </button>
        </>
      }
    >
      <p className="mb-3 text-[13px] leading-relaxed text-[var(--color-brand-muted)]">
        How many photos the album holds. The Client sees their progress towards it. It never stops them adding or sending.
      </p>
      <input
        autoFocus
        inputMode="numeric"
        value={raw}
        onChange={(e) => {
          setRaw(e.target.value);
          setError(null);
        }}
        onKeyDown={(e) => e.key === "Enter" && void submit()}
        placeholder="e.g. 250"
        aria-label="Album size in photos"
        className={inputCls}
      />
      {(!parsed.ok || error) && (
        <p className="mt-2 text-[12.5px] text-[var(--color-brand-danger)]">{!parsed.ok ? parsed.message : error}</p>
      )}
    </DashDialog>
  );
}

export function DeleteCollectionDialog({
  collection,
  onConfirm,
  onClose,
}: {
  collection: GuestCollection;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(messageOf(err, "Could not delete the collection. Try again."));
      setBusy(false);
    }
  };
  const n = collection.count;
  return (
    <DashDialog
      title="Delete collection"
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className={btnSecondary}>
            Cancel
          </button>
          <button type="button" onClick={() => void run()} disabled={busy} className={btnDanger}>
            <IconTrash size={14} />
            {busy ? "Deleting…" : "Delete"}
          </button>
        </>
      }
    >
      <p className="text-[13.5px] leading-relaxed text-[var(--color-brand-ink)]">
        Delete {collection.name}? Its {n.toLocaleString("en-IN")} {n === 1 ? "photo stays" : "photos stay"} in the gallery.
        {collection.status === "final" ? " The Client already sent it to you." : ""}
      </p>
      {error && <p className="mt-2 text-[12.5px] text-[var(--color-brand-danger)]">{error}</p>}
    </DashDialog>
  );
}

/**
 * "Add to collection" from Smart Selects' selection bar: the guest gallery's
 * save sheet in dashboard clothing. Every collection with this selection's
 * state in it; a click applies at once. The studio may change a sent
 * collection without reopening it, so sent rows stay editable and just say
 * when they were sent. Closing reports one summary for the toast.
 */
export function StudioCollectionSheet({
  studio,
  ids,
  studioName,
  onClose,
}: {
  studio: StudioCollections;
  ids: string[];
  studioName: string;
  onClose: (summary: string | null, changed: boolean) => void;
}) {
  const [membership, setMembership] = useState<Map<string, MembershipRef[]> | null>(null);
  const [failed, setFailed] = useState(false);
  const [ledger, setLedger] = useState<ChangeLedger>(() => new Map());
  const [busy, setBusy] = useState<ReadonlySet<string>>(() => new Set());
  const [rowError, setRowError] = useState<{ id: string | null; text: string } | null>(null);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  const { membershipFor } = studio;
  useEffect(() => {
    let cancelled = false;
    membershipFor(ids)
      .then((m) => {
        if (!cancelled) setMembership(m);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [ids, membershipFor]);

  const close = () => onClose(saveSummary(ledger, (id) => studio.byId.get(id)?.name ?? "the collection"), ledger.size > 0);

  const apply = useCallback(async (c: GuestCollection) => {
    if (!membership || busy.has(c._id)) return;
    const info = sheetRowState(c, ids, membership, { studio: studioName, viewer: "studio" });
    const action = rowTapAction(info.state);
    const moving = idsToChange(c._id, action, ids, membership);
    if (!moving.length) return;
    const before = membership;
    setRowError(null);
    setBusy((b) => new Set(b).add(c._id));
    setMembership(applyMembershipWrite(membership, c._id, action, moving, Date.now()));
    setLedger((l) => recordChange(l, c._id, action, moving));
    try {
      await studio.write(c._id, action, moving);
    } catch (err) {
      setMembership(before);
      setLedger((l) => recordChange(l, c._id, action === "add" ? "remove" : "add", moving));
      setRowError({ id: c._id, text: messageOf(err, "Could not save that. Try again.") });
    } finally {
      setBusy((b) => {
        const n = new Set(b);
        n.delete(c._id);
        return n;
      });
    }
  }, [membership, busy, ids, studio, studioName]);

  const trimmed = name.replace(/\s+/g, " ").trim();
  const createAndAdd = async () => {
    if (!trimmed || trimmed.length > COLLECTION_NAME_MAX || creating) return;
    setCreating(true);
    setRowError(null);
    try {
      const created = await studio.create(trimmed);
      setNaming(false);
      setName("");
      await apply({ ...created, count: 0 });
    } catch (err) {
      setRowError({ id: null, text: messageOf(err, "Could not create that collection. Try again.") });
    } finally {
      setCreating(false);
    }
  };

  const n = ids.length;
  return (
    <DashDialog
      title="Add to collection"
      onClose={close}
      footer={
        <button type="button" onClick={close} className={btnPrimary}>
          Done
        </button>
      }
    >
      <p className="-mt-1 mb-3 text-[12.5px] text-[var(--color-brand-muted)]">
        {n.toLocaleString("en-IN")} {n === 1 ? "photo" : "photos"}. Your adds show as added by {studioName}.
      </p>
      {rowError?.id == null && rowError && <p className="mb-2 text-[12.5px] text-[var(--color-brand-danger)]">{rowError.text}</p>}
      {failed ? (
        <p className="py-6 text-center text-[13px] text-[var(--color-brand-muted)]">Could not load the collections. Close this and try again.</p>
      ) : !membership ? (
        <div className="flex flex-col gap-2 py-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-11 rounded-lg" />
          ))}
        </div>
      ) : (
        <ul className="-mx-2" role="list">
          {studio.collections.map((c) => {
            const info = sheetRowState(c, ids, membership, { studio: studioName, viewer: "studio" });
            return (
              <li key={c._id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={info.state === "checked" ? true : info.state === "indeterminate" ? "mixed" : false}
                  disabled={busy.has(c._id)}
                  onClick={() => void apply(c)}
                  className="brand-focus flex min-h-[48px] w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-[var(--color-brand-hover)] disabled:opacity-60"
                >
                  <DashCheck state={info.state} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-[var(--color-brand-ink)]">{c.name}</span>
                    {info.secondary && (
                      <span className="flex items-center gap-1 truncate text-[12px] text-[var(--color-brand-muted)]">
                        {c.status === "final" && <IconLock size={11} />}
                        {info.secondary}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-[12px] font-semibold tabular-nums text-[var(--color-brand-muted)]">
                    {c.count.toLocaleString("en-IN")}
                  </span>
                </button>
                {rowError?.id === c._id && <p className="mx-2 mb-1 text-[12px] text-[var(--color-brand-danger)]">{rowError.text}</p>}
              </li>
            );
          })}
          {studio.collections.length < studio.maxCollections && (
            <li className="mt-1">
              {naming ? (
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void createAndAdd();
                      if (e.key === "Escape") {
                        e.stopPropagation();
                        setNaming(false);
                      }
                    }}
                    placeholder="e.g. Haldi table book"
                    aria-label="New collection name"
                    className={`${inputCls} h-10`}
                  />
                  <button
                    type="button"
                    onClick={() => void createAndAdd()}
                    disabled={!trimmed || trimmed.length > COLLECTION_NAME_MAX || creating}
                    className={btnPrimary}
                  >
                    {creating ? "Creating…" : "Create"}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setNaming(true)}
                  className="brand-focus flex min-h-[44px] w-full items-center gap-3 rounded-lg px-2 text-left text-[13.5px] font-semibold text-[var(--color-brand-navy)] hover:bg-[var(--color-brand-hover)]"
                >
                  <span className="flex h-[18px] w-[18px] items-center justify-center">
                    <IconPlus size={16} />
                  </span>
                  New collection
                </button>
              )}
            </li>
          )}
        </ul>
      )}
    </DashDialog>
  );
}

function DashCheck({ state }: { state: "checked" | "unchecked" | "indeterminate" }) {
  const on = state !== "unchecked";
  return (
    <span
      aria-hidden
      className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] text-white ${
        on ? "bg-[var(--color-brand-navy)]" : "border-[1.5px] border-[var(--color-brand-outline)] bg-white"
      }`}
    >
      {state === "checked" && (
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
          <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {state === "indeterminate" && <span className="block h-[2px] w-[8px] rounded-full bg-white" />}
    </span>
  );
}
