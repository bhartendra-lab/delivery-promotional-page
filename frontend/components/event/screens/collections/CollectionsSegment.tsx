"use client";

import { useState } from "react";
import type { ClientTheme } from "@/lib/client-theme";
import { useHoverPointer } from "@/lib/use-media-query";
import { COLLECTION_NAME_MAX, editorNote, folderSummary, statusLabel, targetStatus } from "@/lib/collections/logic";
import type { GuestCollection, ReviewCollection } from "@/lib/collections/types";
import { IconDotsThree, IconEdit, IconImages, IconLock, IconPlus, IconTrash } from "@/components/ui/icons";
import { TileMenu } from "../gallery/TileMenu";
import { CollectionSheet, PrimaryButton } from "./CollectionSheet";
import type { CollectionsApi } from "./useCollections";
import type { Notify } from "./useCuratorActions";

/**
 * The Collections half of "Your selection": one card per collection (a
 * four-photo cover, name, count, folders, status, target), a New collection
 * card for Clients, and the way to the handoff. Clients get "Review and send";
 * editors get a quiet line saying who will.
 */
export function CollectionsSegment({
  t,
  desktop,
  studio,
  col,
  review,
  onOpen,
  onReview,
  notify,
}: {
  t: ClientTheme;
  desktop: boolean;
  studio: string;
  col: CollectionsApi;
  /** Per-collection folder breakdowns (GET /review), or null while loading. */
  review: ReviewCollection[] | null;
  onOpen: (collectionId: string) => void;
  onReview: () => void;
  notify: Notify;
}) {
  const hoverPointer = useHoverPointer();
  const [menu, setMenu] = useState<{ c: GuestCollection; anchor: HTMLElement; rect: DOMRect } | null>(null);
  const [naming, setNaming] = useState<{ mode: "new" } | { mode: "rename"; c: GuestCollection } | null>(null);
  const [deleting, setDeleting] = useState<GuestCollection | null>(null);
  const breakdown = new Map((review ?? []).map((r) => [r._id, r.folders]));
  const { collections, caps } = col;
  const anySendable = collections.some((c) => c.status === "draft" && c.count > 0);

  return (
    <div className="pb-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {collections.map((c) => {
          const target = targetStatus(c.count, c.target_count);
          const folders = breakdown.get(c._id);
          const sent = c.status === "final";
          return (
            <div key={c._id} className="relative">
              <button
                type="button"
                onClick={() => onOpen(c._id)}
                className="lounge-card w-full cursor-pointer overflow-hidden rounded-2xl text-left"
                style={{ background: t.card, boxShadow: t.shadowSm }}
              >
                <Mosaic t={t} urls={c.cover_urls} />
                <div className="px-4 pb-4 pt-3">
                  <div className="flex items-center gap-2 pr-8">
                    <span className="min-w-0 flex-1 truncate text-[15.5px] font-extrabold" style={{ color: t.text }}>
                      {c.name}
                    </span>
                  </div>
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
                  {folders && folders.length > 0 && (
                    <div className="mt-1.5 truncate text-[12px] font-semibold" style={{ color: t.faint }}>
                      {folderSummary(folders)}
                    </div>
                  )}
                  {target && <TargetBar t={t} label={target.label} progress={target.progress} note={target.note} />}
                </div>
              </button>
              {caps.canManage && !sent && (
                <button
                  type="button"
                  aria-label={`Options for ${c.name}`}
                  aria-haspopup="menu"
                  onClick={(e) => setMenu({ c, anchor: e.currentTarget, rect: e.currentTarget.getBoundingClientRect() })}
                  className="absolute right-2 top-2 flex h-10 w-10 cursor-pointer items-center justify-center"
                >
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-full text-white"
                    style={{ background: "rgba(18,14,10,0.36)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
                  >
                    <IconDotsThree size={18} weight="bold" />
                  </span>
                </button>
              )}
            </div>
          );
        })}

        {caps.canManage && collections.length < col.maxCollections && (
          <button
            type="button"
            onClick={() => setNaming({ mode: "new" })}
            className="flex min-h-[200px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl text-[14.5px] font-extrabold transition-colors"
            style={{ border: `1.5px dashed ${t.border}`, color: t.brand }}
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full" style={{ background: t.accentWash }}>
              <IconPlus size={20} weight="bold" />
            </span>
            New collection
          </button>
        )}
      </div>

      {collections.length === 0 && !caps.canManage && (
        <p className="py-10 text-center text-[13.5px] font-semibold" style={{ color: t.muted }}>
          No collections yet.
        </p>
      )}

      {/* The handoff. Sticky, so it is there however far the cards scroll:
          above the bottom nav on a phone, at the foot of the view on desktop. */}
      {collections.length > 0 &&
        (caps.canSend ? (
          <div
            className={desktop ? "sticky bottom-6 z-20 mt-8 flex justify-center" : "fixed inset-x-0 z-30 flex justify-center px-5"}
            style={desktop ? undefined : { bottom: "calc(84px + env(safe-area-inset-bottom))" }}
          >
            <button
              type="button"
              onClick={onReview}
              className="cta-shine w-full max-w-[460px] cursor-pointer rounded-full px-6 py-3.5 text-[14.5px] font-extrabold transition-transform active:scale-[0.99]"
              style={{ background: anySendable ? t.brand : t.card, color: anySendable ? t.onBrand : t.brand, boxShadow: t.shadow }}
            >
              Review and send to {studio}
            </button>
          </div>
        ) : (
          <p className="mt-8 text-center text-[13px] font-semibold" style={{ color: t.muted }}>
            {editorNote(col.clientNames, studio)}
          </p>
        ))}

      {menu && (
        <TileMenu
          t={t}
          mode={hoverPointer ? "popover" : "sheet"}
          anchor={menu.anchor}
          anchorRect={menu.rect}
          items={[
            { key: "rename", label: "Rename", icon: <IconEdit size={19} />, onSelect: () => setNaming({ mode: "rename", c: menu.c }) },
            { key: "delete", label: "Delete", icon: <IconTrash size={19} />, onSelect: () => setDeleting(menu.c) },
          ]}
          onClose={() => setMenu(null)}
        />
      )}

      {naming && (
        <NameDialog
          t={t}
          desktop={desktop}
          title={naming.mode === "new" ? "New collection" : "Rename collection"}
          initial={naming.mode === "rename" ? naming.c.name : ""}
          action={naming.mode === "new" ? "Create" : "Save"}
          onClose={() => setNaming(null)}
          onSubmit={async (name) => {
            if (naming.mode === "rename") {
              await col.rename(naming.c._id, name);
              notify(`Renamed to ${name}`);
              return null;
            }
            const res = await col.create(name);
            if ("collection" in res) {
              notify(`Created ${res.collection.name}`);
              return null;
            }
            return "exists" in res ? res.message : res.limit;
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          t={t}
          desktop={desktop}
          title="Delete collection"
          sentence={`Delete ${deleting.name}? Its ${deleting.count.toLocaleString("en-IN")} ${deleting.count === 1 ? "photo stays" : "photos stay"} in the gallery.`}
          confirm="Delete"
          danger
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await col.remove(deleting._id);
            notify(`Deleted ${deleting.name}`);
          }}
        />
      )}
    </div>
  );
}

/** Four recent photos as a 2×2 cover, 16px radius. Fewer photos leave warm
 *  empty cells; none shows a quiet placeholder. */
export function Mosaic({ t, urls, height = 168 }: { t: ClientTheme; urls: string[]; height?: number }) {
  if (!urls.length) {
    return (
      <div className="flex items-center justify-center" style={{ height, background: t.sunken, color: t.faint }}>
        <IconImages size={30} />
      </div>
    );
  }
  const cells = [0, 1, 2, 3];
  return (
    <div className="grid grid-cols-2 grid-rows-2 gap-0.5" style={{ height, background: t.card }}>
      {cells.map((i) =>
        urls[i] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={urls[i]} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover" />
        ) : (
          <span key={i} style={{ background: t.sunken }} />
        ),
      )}
    </div>
  );
}

/** "182 of 250" with a thin bar, and the gentle over note. */
export function TargetBar({ t, label, progress, note }: { t: ClientTheme; label: string; progress: number; note: string | null }) {
  return (
    <div className="mt-2.5">
      <div className="flex items-center justify-between text-[11.5px] font-bold" style={{ color: t.muted }}>
        <span>{label}</span>
        {note && <span style={{ color: t.brand }}>{note}</span>}
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full" style={{ background: t.sunken }}>
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.round(progress * 100)}%`, background: t.brand }} />
      </div>
    </div>
  );
}

/** A name field in a small sheet: New collection and Rename. Resolves to an
 *  error message to show, or null when it worked (and the dialog closes). */
export function NameDialog({
  t,
  desktop,
  title,
  initial,
  action,
  onSubmit,
  onClose,
}: {
  t: ClientTheme;
  desktop: boolean;
  title: string;
  initial: string;
  action: string;
  onSubmit: (name: string) => Promise<string | null>;
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
      const message = await onSubmit(trimmed);
      if (message) setError(message);
      else onClose();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Couldn’t save that. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <CollectionSheet
      t={t}
      desktop={desktop}
      title={title}
      onClose={onClose}
      z={78}
      footer={
        <PrimaryButton t={t} onClick={() => void submit()} disabled={!trimmed || tooLong || trimmed === initial} busy={busy}>
          {busy ? "Saving…" : action}
        </PrimaryButton>
      }
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
        }}
        placeholder="e.g. Haldi table book"
        aria-label="Collection name"
        className="mb-2 w-full rounded-xl px-3.5 py-3 text-[15px] font-semibold outline-none"
        style={{ background: t.sunken, color: t.text, border: `1.5px solid ${tooLong || error ? t.error : t.border}` }}
      />
      {(tooLong || error) && (
        <p className="pb-2 text-[12.5px] font-semibold" style={{ color: t.error }}>
          {tooLong ? `Keep it to ${COLLECTION_NAME_MAX} characters.` : error}
        </p>
      )}
    </CollectionSheet>
  );
}

/** One sentence and one decision: delete a collection, regenerate the
 *  passcode, send to the studio. Everything reversible uses Undo instead. */
export function ConfirmDialog({
  t,
  desktop,
  title,
  sentence,
  confirm,
  danger,
  onConfirm,
  onClose,
}: {
  t: ClientTheme;
  desktop: boolean;
  title: string;
  sentence: string;
  confirm: string;
  danger?: boolean;
  /** Throws to keep the dialog open with an error. */
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
      setError(err instanceof Error && err.message ? err.message : "That didn’t work. Try again.");
      setBusy(false);
    }
  };
  return (
    <CollectionSheet
      t={t}
      desktop={desktop}
      title={title}
      onClose={onClose}
      width={400}
      z={78}
      footer={
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void run()}
            disabled={busy}
            className="w-full cursor-pointer rounded-full py-3.5 text-[14.5px] font-extrabold transition-transform active:scale-[0.99] disabled:opacity-50"
            style={danger ? { background: t.error, color: "#fff" } : { background: t.brand, color: t.onBrand }}
          >
            {busy ? "One moment…" : confirm}
          </button>
          <button type="button" onClick={onClose} className="w-full cursor-pointer rounded-full py-3 text-[14px] font-bold" style={{ color: t.muted }}>
            Cancel
          </button>
        </div>
      }
    >
      <p className="pb-3 text-[14.5px] font-semibold leading-relaxed" style={{ color: t.text }}>
        {sentence}
      </p>
      {error && (
        <p className="pb-2 text-[12.5px] font-semibold" style={{ color: t.error }}>
          {error}
        </p>
      )}
    </CollectionSheet>
  );
}
