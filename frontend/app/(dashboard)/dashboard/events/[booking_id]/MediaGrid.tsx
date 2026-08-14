"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MediaItem } from "@/lib/types";
import { coldFallback, downloadImage, nameFromUrl, streamZipToDisk } from "@/lib/media-actions";
import { Lightbox } from "./Lightbox";
import { IconCheck, IconDotsVertical, IconDownload, IconHeart, IconImage, IconStar, IconTrash, IconX } from "./icons";

/** Optimistic, not-yet-persisted items can't be deleted (no real id yet). */
function isPersisted(m: MediaItem): boolean {
  return !!m._id && !m._id.startsWith("optimistic-");
}

/**
 * A thumbnail that shows a warm shimmer placeholder while the photo loads, then
 * fades it in — so the grid fills smoothly instead of images popping in. Handles
 * already-cached images (whose `onLoad` may fire before React attaches).
 */
function GridImage({ src }: { src: string }) {
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if (ref.current?.complete) setLoaded(true);
  }, []);
  return (
    <>
      {!loaded && <span aria-hidden className="skeleton absolute inset-0" />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={ref}
        src={src}
        alt=""
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={(e) => {
          const el = e.currentTarget;
          if (!el.dataset.fellBack) {
            el.dataset.fellBack = "1";
            el.src = coldFallback(src);
          }
        }}
        className={`h-full w-full object-cover transition-[opacity,transform] duration-500 ease-out group-hover:scale-[1.02] ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
      />
    </>
  );
}

export function MediaGrid({
  items,
  disabled = false,
  onDeleteMany,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  showLikes = false,
  showShortlist = false,
  onShortlistMany,
  allowDelete = true,
  emptyMessage,
  archiveName,
  coverUrl,
  onSetCover,
  notify,
}: {
  items: MediaItem[];
  disabled?: boolean;
  /** Delete the given Media ids (optimistic removal + reconcile lives upstream). */
  onDeleteMany?: (ids: string[]) => Promise<void>;
  /** True while more pages exist for this view (drives the infinite-scroll sentinel). */
  hasMore?: boolean;
  /** True while the next page is loading (shows a spinner at the grid foot). */
  loadingMore?: boolean;
  /** Append the next page — fired when the sentinel scrolls into view. */
  onLoadMore?: () => void;
  /** Show each tile's like count (the Smart Selects view). */
  showLikes?: boolean;
  /** Show the per-tile shortlist star + the bulk Shortlist action (Smart Selects). */
  showShortlist?: boolean;
  /** Flag/unflag Media ids as shortlisted. Required for shortlist affordances. */
  onShortlistMany?: (ids: string[], shortlisted: boolean) => Promise<void>;
  /** Whether Delete is offered (false on Smart Selects). */
  allowDelete?: boolean;
  /** Custom empty-state content for this view (text, or a richer node with a next-step action). */
  emptyMessage?: React.ReactNode;
  /** Base name for the multi-select ZIP (e.g. the folder or event name). */
  archiveName?: string;
  /** Current event cover URL — flags the matching tile. */
  coverUrl?: string;
  /**
   * Set a photo as the event cover. When provided (the Media tab), each tile's
   * download button becomes a "⋮" menu offering Download + Set as cover photo.
   */
  onSetCover?: (item: MediaItem) => void | Promise<void>;
  /** Transient status messages (e.g. download progress). */
  notify?: (msg: string) => void;
}) {
  const [rawSelected, setSelected] = useState<Set<string>>(new Set());
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<{ ids: string[]; fromLightbox: boolean } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Infinite scroll: observe a sentinel below the grid and pull the next page
  // when it nears the viewport. `onLoadMore` is read through a ref so the
  // observer doesn't re-subscribe on every render.
  const sentinelRef = useRef<HTMLDivElement>(null);
  const onLoadMoreRef = useRef(onLoadMore);
  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
  }, [onLoadMore]);
  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMoreRef.current?.();
      },
      { rootMargin: "600px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore]);

  const liveIds = useMemo(() => new Set(items.map((m) => m._id)), [items]);
  const selectableIds = useMemo(() => items.filter(isPersisted).map((m) => m._id), [items]);

  // Stale selections (items removed by a reload/delete) are dropped at read
  // time rather than via a sync effect.
  const selected = useMemo(() => {
    if (rawSelected.size === 0) return rawSelected;
    const next = new Set<string>();
    for (const id of rawSelected) if (liveIds.has(id)) next.add(id);
    return next;
  }, [rawSelected, liveIds]);

  const allSelected = selectableIds.length > 0 && selected.size === selectableIds.length;
  // Clamp the lightbox index as items shrink; an empty folder closes it.
  const safeIndex = lightboxIndex == null ? null : Math.min(lightboxIndex, items.length - 1);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const runDelete = useCallback(async () => {
    if (!confirm || !onDeleteMany) return;
    setDeleting(true);
    try {
      await onDeleteMany(confirm.ids);
      setSelected(new Set());
      if (confirm.fromLightbox && items.length - confirm.ids.length <= 0) setLightboxIndex(null);
      setConfirm(null);
    } finally {
      setDeleting(false);
    }
  }, [confirm, onDeleteMany, items.length]);

  // Download the selection: one photo saves directly; several are packed into a
  // single ZIP built in the browser (client-zip) — streamed to disk via the File
  // System Access API where available, else an in-memory Blob. No server-side zip.
  const downloadSelected = useCallback(async () => {
    const chosen = items.filter((m) => selected.has(m._id) && m.url);
    if (chosen.length === 0 || downloading) return;
    setDownloading(true);
    try {
      if (chosen.length === 1) {
        notify?.("Downloading 1 photo…");
        downloadImage(chosen[0].url, chosen[0].filename);
        setSelected(new Set());
        return;
      }
      const entries = chosen.map((m) => ({ url: m.url, name: m.filename || nameFromUrl(m.url) }));
      const base = (archiveName || "photos").trim() || "photos";
      notify?.("Preparing your download…");
      const { zipped, failed, cancelled } = await streamZipToDisk(entries, `${base}.zip`, (done, total) =>
        notify?.(`Downloading ${done.toLocaleString("en-IN")}/${total.toLocaleString("en-IN")}…`),
      );
      if (cancelled) {
        notify?.("");
        return;
      }
      notify?.(
        failed > 0
          ? `Saved ${zipped.toLocaleString("en-IN")}, ${failed.toLocaleString("en-IN")} skipped`
          : "Saved to your downloads",
      );
      setSelected(new Set());
    } catch (err) {
      console.warn("[downloadSelected] failed", err);
      notify?.("Download failed — please try again");
    } finally {
      setDownloading(false);
    }
  }, [items, selected, downloading, archiveName, notify]);

  // Shortlist toggle for the selection. If every selected photo is already
  // shortlisted the button removes them; otherwise it shortlists all of them.
  const selectedItems = useMemo(() => items.filter((m) => selected.has(m._id)), [items, selected]);
  const allSelectedShortlisted =
    selectedItems.length > 0 && selectedItems.every((m) => m.shortlisted);

  // Single entry point for every shortlist action (tile star, selection bar,
  // lightbox).
  const requestShortlist = useCallback(
    (ids: string[], next: boolean, opts?: { clearSelection?: boolean }) => {
      if (!onShortlistMany) return;
      const real = items.filter((m) => ids.includes(m._id) && isPersisted(m)).map((m) => m._id);
      if (real.length === 0) return;
      const clearSelection = !!opts?.clearSelection;
      void onShortlistMany(real, next).then(() => clearSelection && setSelected(new Set()));
    },
    [items, onShortlistMany],
  );

  const shortlistSelected = useCallback(() => {
    const ids = selectedItems.filter(isPersisted).map((m) => m._id);
    if (ids.length === 0) return;
    requestShortlist(ids, !allSelectedShortlisted, { clearSelection: true });
  }, [selectedItems, allSelectedShortlisted, requestShortlist]);

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--color-brand-border)] bg-white px-6 py-12 text-center text-[13px] text-[var(--color-brand-muted)]">
        {emptyMessage ?? "No photos in this folder yet."}
      </div>
    );
  }

  return (
    <>
      {/* Selection toolbar */}
      {selected.size > 0 && (
        <div className="dash-rise sticky top-2 z-20 mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-[var(--color-brand-border)] bg-white px-3.5 py-2.5 shadow-[0_4px_16px_rgba(42,34,24,0.08)]">
          <span className="text-[13px] font-semibold text-[var(--color-brand-ink)]">
            {selected.size.toLocaleString("en-IN")} selected
          </span>
          <span className="h-4 w-px bg-[var(--color-brand-border)]" />
          <button
            type="button"
            onClick={() => setSelected(new Set(selectableIds))}
            disabled={allSelected}
            className="brand-focus rounded text-[12.5px] font-semibold text-[var(--color-brand-navy)] hover:underline disabled:opacity-40 disabled:no-underline"
          >
            Select all ({selectableIds.length})
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="brand-focus rounded text-[12.5px] font-semibold text-[var(--color-brand-muted)] hover:text-[var(--color-brand-ink)]"
          >
            Clear
          </button>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={downloadSelected}
              disabled={downloading}
              className="brand-focus inline-flex items-center gap-1.5 rounded-md border border-[var(--color-brand-border)] bg-white px-3 py-1.5 text-[12.5px] font-semibold text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {downloading ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-[2px] border-[var(--color-brand-border)] border-t-[var(--color-brand-navy)]" />
              ) : (
                <IconDownload size={14} />
              )}
              Download
            </button>
            {showShortlist && onShortlistMany && (
              <button
                type="button"
                onClick={shortlistSelected}
                className={`brand-focus inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-semibold text-white hover:opacity-90 ${
                  allSelectedShortlisted
                    ? "bg-[var(--color-brand-muted)]"
                    : "bg-[var(--color-brand-warning)]"
                }`}
              >
                <IconStar size={14} filled={!allSelectedShortlisted} />
                {allSelectedShortlisted ? "Remove from shortlist" : "Shortlist"}
              </button>
            )}
            {allowDelete && onDeleteMany && (
              <button
                type="button"
                onClick={() => setConfirm({ ids: Array.from(selected), fromLightbox: false })}
                className="brand-focus inline-flex items-center gap-1.5 rounded-md bg-[var(--color-brand-danger)] px-3 py-1.5 text-[12.5px] font-semibold text-white hover:opacity-90"
              >
                <IconTrash size={14} /> Delete selected
              </button>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {items.map((m, i) => {
          const persisted = isPersisted(m);
          const isSel = selected.has(m._id);
          return (
            <div
              key={m._id}
              className={`group relative aspect-square rounded ${
                isSel ? "ring-2 ring-[var(--color-brand-navy)] ring-offset-1" : ""
              }`}
            >
              {/* Clips the image + its hover zoom; kept separate from the tile
                  wrapper so the "⋮" menu below can pop out past this corner
                  radius instead of being clipped. */}
              <div className="absolute inset-0 overflow-hidden rounded bg-[var(--color-brand-surface)]">
                <button
                  type="button"
                  onClick={() => setLightboxIndex(i)}
                  aria-label="Open preview"
                  className="block h-full w-full"
                >
                  <GridImage src={m.url} />
                </button>
              </div>

              {persisted && !disabled && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(m._id);
                  }}
                  aria-label={isSel ? "Deselect photo" : "Select photo"}
                  aria-pressed={isSel}
                  className={`absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded border transition-opacity ${
                    isSel
                      ? "border-[var(--color-brand-navy)] bg-[var(--color-brand-navy)] text-white opacity-100"
                      : "border-white/80 bg-black/30 text-transparent opacity-0 group-hover:opacity-100"
                  }`}
                >
                  <IconCheck size={12} />
                </button>
              )}

              {/* Persistent status star (top-right) — the single status signal.
                  Not shortlisted → hover-only outline star. Shortlisted → amber.
                  One click toggles the shortlist. */}
              {showShortlist && onShortlistMany && persisted && (
                <StatusStar
                  shortlisted={!!m.shortlisted}
                  onToggle={() => requestShortlist([m._id], !m.shortlisted)}
                />
              )}

              {/* Per-photo actions (hover): a "⋮" menu (top-right) with
                  Download + Set as cover photo where cover-setting is offered
                  (the Media tab, and only for persisted images); a plain
                  download button (bottom-right) elsewhere (e.g. Smart
                  Selects, videos). */}
              {onSetCover && persisted && m.type === "image" ? (
                <PhotoMenu
                  isCover={!!coverUrl && m.url === coverUrl}
                  onDownload={() =>
                    void downloadImage(m.url).catch(() => notify?.("Download failed — please try again"))
                  }
                  onSetCover={() => void onSetCover(m)}
                  onDelete={
                    allowDelete && onDeleteMany
                      ? () => setConfirm({ ids: [m._id], fromLightbox: false })
                      : undefined
                  }
                />
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    downloadImage(m.url);
                  }}
                  aria-label="Download photo"
                  title="Download"
                  className="absolute bottom-2 right-2 flex h-6 w-6 items-center justify-center rounded-md bg-black/40 text-white opacity-0 transition-opacity hover:bg-black/60 focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <IconDownload size={13} />
                </button>
              )}

              {/* Persistent like signal (bottom-left). Heart fills brand-navy when
                  a host liked the photo; outline when it's guests-only. */}
              {showLikes && (m.likes_count ?? 0) > 0 && (
                <span
                  className="pointer-events-none absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-1.5 py-[3px] text-[11px] font-semibold text-white"
                  title={m.host_liked ? "Liked by the host" : "Liked by guests"}
                >
                  <IconHeart
                    size={11}
                    filled={!!m.host_liked}
                    className={m.host_liked ? "text-[var(--color-brand-navy)]" : undefined}
                  />
                  {(m.likes_count ?? 0).toLocaleString("en-IN")}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {hasMore && (
        <div ref={sentinelRef} className="flex items-center justify-center py-8" aria-hidden>
          <span className="inline-flex items-center gap-2 text-[12.5px] text-[var(--color-brand-muted)]">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-[2px] border-[var(--color-brand-border)] border-t-[var(--color-brand-navy)]" />
            {loadingMore ? "Loading more photos…" : "Scroll to load more"}
          </span>
        </div>
      )}

      {safeIndex != null && items.length > 0 && (
        <Lightbox
          items={items}
          index={safeIndex}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onDelete={
            allowDelete && onDeleteMany
              ? (item) => {
                  if (isPersisted(item)) setConfirm({ ids: [item._id], fromLightbox: true });
                }
              : undefined
          }
          onToggleShortlist={
            showShortlist && onShortlistMany
              ? (item) => {
                  if (isPersisted(item)) requestShortlist([item._id], !item.shortlisted);
                }
              : undefined
          }
        />
      )}

      {confirm && (
        <DeleteConfirm
          count={confirm.ids.length}
          busy={deleting}
          onCancel={() => !deleting && setConfirm(null)}
          onConfirm={runDelete}
        />
      )}
    </>
  );
}

/** Top-right status star. Renders nothing persistent when not shortlisted (an
 *  outline star fades in on tile hover); amber once shortlisted. One click
 *  toggles the shortlist. */
function StatusStar({
  shortlisted,
  onToggle,
}: {
  shortlisted: boolean;
  onToggle: () => void;
}) {
  const label = shortlisted ? "Remove from shortlist" : "Shortlist photo";
  const tone = shortlisted
    ? "bg-[var(--color-brand-warning)] text-white opacity-100"
    : "bg-black/40 text-white opacity-0 hover:bg-black/60 focus-visible:opacity-100 group-hover:opacity-100";
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-label={label}
      aria-pressed={shortlisted}
      title={label}
      className={`absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-md transition-opacity ${tone}`}
    >
      <IconStar size={13} filled={shortlisted} />
    </button>
  );
}

function DeleteConfirm({
  count,
  busy,
  onCancel,
  onConfirm,
}: {
  count: number;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-confirm-title"
      className="fixed inset-0 z-[220] flex items-center justify-center px-4"
      style={{ background: "rgba(42,34,24,0.48)", backdropFilter: "blur(3px)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        className="dash-rise w-full max-w-[420px] rounded-[14px] border border-[var(--color-brand-border)] bg-white p-6 shadow-[0_24px_64px_rgba(42,34,24,0.24)] outline-none"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-brand-danger-soft)] text-[var(--color-brand-danger)]">
            <IconTrash size={18} />
          </span>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label="Close"
            className="brand-focus flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-brand-muted)] hover:bg-[var(--color-brand-surface)] hover:text-[var(--color-brand-ink)] disabled:opacity-50"
          >
            <IconX size={16} />
          </button>
        </div>
        <h3 id="delete-confirm-title" className="mb-1.5 text-[17px] font-bold tracking-tight text-[var(--color-brand-ink)]">
          Delete {count.toLocaleString("en-IN")} photo{count === 1 ? "" : "s"}?
        </h3>
        <p className="text-[13px] leading-relaxed text-[var(--color-brand-muted)]">
          {count === 1 ? "This photo" : "These photos"} will be permanently removed from this event and the gallery.
          This can’t be undone.
        </p>
        <div className="mt-6 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="brand-focus inline-flex h-10 items-center rounded-lg border border-[var(--color-brand-border)] bg-white px-4 text-[13px] font-medium text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="brand-focus inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--color-brand-danger)] px-4 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {busy ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-[2px] border-white/60 border-t-white" />
                Deleting…
              </>
            ) : (
              <>
                <IconTrash size={14} /> Delete
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Per-tile "⋮" menu (Download / Set as cover photo), anchored top-right.
 * Opens downward so it isn't clipped by the tile's rounded corner mask, and
 * closes on an outside click — mirrors the CoverBanner's own dropdown.
 */
function PhotoMenu({
  isCover,
  onDownload,
  onSetCover,
  onDelete,
}: {
  isCover: boolean;
  onDownload: () => void;
  onSetCover: () => void;
  onDelete?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={wrapRef} className="absolute right-2 top-2 z-10">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-label="Photo options"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Photo options"
        className={`flex h-6 w-6 items-center justify-center rounded-md bg-black/40 text-white transition-opacity hover:bg-black/60 focus-visible:opacity-100 group-hover:opacity-100 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      >
        <IconDotsVertical size={14} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+6px)] z-20 w-[176px] overflow-hidden rounded-[10px] border border-[var(--color-brand-border)] bg-white shadow-[0_8px_28px_rgba(42,34,24,0.16)]"
        >
          <button
            type="button"
            role="menuitem"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onDownload();
            }}
            className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[12.5px] font-medium text-[var(--color-brand-ink)] hover:bg-[var(--color-brand-bg)]"
          >
            <IconDownload size={14} className="text-[var(--color-brand-muted)]" />
            Download
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={isCover}
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onSetCover();
            }}
            className="flex w-full items-center gap-2.5 border-t border-[var(--color-brand-border)] px-3.5 py-2.5 text-left text-[12.5px] font-medium text-[var(--color-brand-ink)] hover:bg-[var(--color-brand-bg)] disabled:cursor-default disabled:text-[var(--color-brand-muted)] disabled:hover:bg-transparent"
          >
            <IconImage size={14} className="text-[var(--color-brand-muted)]" />
            {isCover ? "Current cover photo" : "Set as cover photo"}
          </button>
          {onDelete && (
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                onDelete();
              }}
              className="flex w-full items-center gap-2.5 border-t border-[var(--color-brand-border)] px-3.5 py-2.5 text-left text-[12.5px] font-medium text-[var(--color-brand-danger)] hover:bg-[var(--color-brand-danger-soft)]"
            >
              <IconTrash size={14} />
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}
