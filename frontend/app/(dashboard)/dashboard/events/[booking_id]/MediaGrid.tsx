"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MediaItem } from "@/lib/types";
import { downloadImage, downloadMany } from "@/lib/media-actions";
import { Lightbox } from "./Lightbox";
import { IconCheck, IconDownload, IconHeart, IconStar, IconTrash, IconX } from "./icons";

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
  /** Custom empty-state copy for this view. */
  emptyMessage?: string;
  /** Transient status messages (e.g. download progress). */
  notify?: (msg: string) => void;
}) {
  const [rawSelected, setSelected] = useState<Set<string>>(new Set());
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<{ ids: string[]; fromLightbox: boolean } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [shortlisting, setShortlisting] = useState(false);

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

  // Download every selected photo (sequential individual files, via the same
  // proxy the guest gallery uses). The browser handles each save.
  const downloadSelected = useCallback(async () => {
    const urls = items.filter((m) => selected.has(m._id)).map((m) => m.url).filter(Boolean);
    if (urls.length === 0 || downloading) return;
    setDownloading(true);
    notify?.(`Downloading ${urls.length.toLocaleString("en-IN")} photo${urls.length === 1 ? "" : "s"}…`);
    try {
      await downloadMany(urls);
    } finally {
      setDownloading(false);
    }
  }, [items, selected, downloading, notify]);

  // Shortlist toggle for the selection. If every selected photo is already
  // shortlisted the button removes them; otherwise it shortlists all of them.
  const selectedItems = useMemo(() => items.filter((m) => selected.has(m._id)), [items, selected]);
  const allSelectedShortlisted =
    selectedItems.length > 0 && selectedItems.every((m) => m.shortlisted);
  const shortlistSelected = useCallback(async () => {
    if (!onShortlistMany || shortlisting) return;
    const ids = selectedItems.filter(isPersisted).map((m) => m._id);
    if (ids.length === 0) return;
    setShortlisting(true);
    try {
      await onShortlistMany(ids, !allSelectedShortlisted);
      setSelected(new Set());
    } finally {
      setShortlisting(false);
    }
  }, [onShortlistMany, shortlisting, selectedItems, allSelectedShortlisted]);

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
                disabled={shortlisting}
                className={`brand-focus inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 ${
                  allSelectedShortlisted
                    ? "bg-[var(--color-brand-muted)]"
                    : "bg-[var(--color-brand-warning)]"
                }`}
              >
                {shortlisting ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-[2px] border-white/50 border-t-white" />
                ) : (
                  <IconStar size={14} filled={!allSelectedShortlisted} />
                )}
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
              className={`group relative aspect-square overflow-hidden rounded bg-[var(--color-brand-surface)] ${
                isSel ? "ring-2 ring-[var(--color-brand-navy)] ring-offset-1" : ""
              }`}
            >
              <button
                type="button"
                onClick={() => setLightboxIndex(i)}
                aria-label="Open preview"
                className="block h-full w-full"
              >
                <GridImage src={m.url} />
              </button>

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

              {/* Per-photo shortlist star (top-right). Persistent + amber when
                  shortlisted; otherwise a hover toggle. One-click curation. */}
              {showShortlist && onShortlistMany && persisted && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void onShortlistMany([m._id], !m.shortlisted);
                  }}
                  aria-label={m.shortlisted ? "Remove from shortlist" : "Shortlist photo"}
                  aria-pressed={!!m.shortlisted}
                  title={m.shortlisted ? "Shortlisted" : "Shortlist"}
                  className={`absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-md transition-opacity ${
                    m.shortlisted
                      ? "bg-[var(--color-brand-warning)] text-white opacity-100"
                      : "bg-black/40 text-white opacity-0 hover:bg-black/60 focus-visible:opacity-100 group-hover:opacity-100"
                  }`}
                >
                  <IconStar size={13} filled={!!m.shortlisted} />
                </button>
              )}

              {/* Per-photo download (hover, bottom-right). */}
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

              {showLikes && (m.likes_count ?? 0) > 0 && (
                <span className="pointer-events-none absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-1.5 py-[3px] text-[11px] font-semibold text-white">
                  <IconHeart size={11} filled />
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
                  if (isPersisted(item)) void onShortlistMany([item._id], !item.shortlisted);
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
