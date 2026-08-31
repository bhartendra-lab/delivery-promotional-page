"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { GuestMediaItem } from "@/lib/types";
import { SIGNAL, type ClientTheme } from "@/lib/client-theme";
import { degradeGridSrc, gridSrc } from "@/lib/media-actions";
import { justifyRows, targetRowHeightFor, JUSTIFY_GAP } from "./justifyRows";
import { IconHeart, IconCheck, IconDownload } from "@/components/ui/icons";

/**
 * The guest gallery's photo layout — isolated behind a `layout` prop so the
 * studio can later choose the presentation without touching LoungeGallery.
 *
 * - "justified" (default): a row-packed layout (Pic-Time/Samaro style) that
 *   fills each row to a target height using every item's aspect ratio, then
 *   scales the row to fill the container width exactly. Preserves API order
 *   (row-major), unlike CSS-column masonry which flows column-major. Legacy
 *   media without captured width/height falls back to a 3:2 aspect ratio so
 *   it still lays out — see `justifyRows.ts`.
 * - "grid": the original square-cropped grid, kept as a fallback so the seam
 *   exists for future layouts.
 *
 * Infinite scroll is owned by the parent scroll container; this component just
 * renders whatever `items` it's given, so appended pages flow in naturally.
 */
export function GalleryGrid({
  t,
  layout = "justified",
  items,
  selectMode,
  isSelected,
  liked,
  onOpen,
  onToggleSelect,
  onToggleLike,
  onEnterSelectWith,
  onDownload,
}: {
  t: ClientTheme;
  layout?: "justified" | "grid";
  items: GuestMediaItem[];
  selectMode: boolean;
  /** Predicate rather than a Set: under "select all" the selection is a SCOPE
   *  minus exclusions, so a tile that arrives with a later page must resolve
   *  as checked without anything having to enumerate it first. */
  isSelected: (id: string) => boolean;
  liked: Set<string>;
  onOpen: (index: number) => void;
  onToggleSelect: (item: GuestMediaItem) => void;
  onToggleLike: (item: GuestMediaItem) => void;
  /** Absent when select mode is unavailable (its only action is Download, and
   *  the studio has turned downloads off) — the select badge then only toggles
   *  an already-active selection. */
  onEnterSelectWith?: (item: GuestMediaItem) => void;
  /** Absent when the studio has turned downloads off. The tile then renders NO
   *  download button — a control that exists but refuses is worse than none. */
  onDownload?: (item: GuestMediaItem) => void;
}) {
  if (layout === "grid") {
    return (
      <div className="grid grid-cols-3 gap-1 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 2xl:grid-cols-7 lg:gap-1.5">
        {items.map((item, index) => (
          <PhotoTile
            key={item._id}
            t={t}
            layout="grid"
            item={item}
            index={index}
            selectMode={selectMode}
            isSel={isSelected(item._id)}
            isLiked={liked.has(item._id)}
            onOpen={() => onOpen(index)}
            onToggleSelect={() => onToggleSelect(item)}
            onToggleLike={() => onToggleLike(item)}
            onEnterSelectWith={onEnterSelectWith && (() => onEnterSelectWith(item))}
            onDownload={onDownload && (() => onDownload(item))}
          />
        ))}
      </div>
    );
  }

  return (
    <JustifiedGrid
      t={t}
      items={items}
      selectMode={selectMode}
      isSelected={isSelected}
      liked={liked}
      onOpen={onOpen}
      onToggleSelect={onToggleSelect}
      onToggleLike={onToggleLike}
      onEnterSelectWith={onEnterSelectWith}
      onDownload={onDownload}
    />
  );
}

/** Measures its own width (initial synchronous read + ResizeObserver for
 *  later changes — sidebar toggles, window resize) so the packing algorithm
 *  always runs against the real available width. */
function useContainerWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w != null) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function JustifiedGrid({
  t,
  items,
  selectMode,
  isSelected,
  liked,
  onOpen,
  onToggleSelect,
  onToggleLike,
  onEnterSelectWith,
  onDownload,
}: {
  t: ClientTheme;
  items: GuestMediaItem[];
  selectMode: boolean;
  /** Predicate rather than a Set: under "select all" the selection is a SCOPE
   *  minus exclusions, so a tile that arrives with a later page must resolve
   *  as checked without anything having to enumerate it first. */
  isSelected: (id: string) => boolean;
  liked: Set<string>;
  onOpen: (index: number) => void;
  onToggleSelect: (item: GuestMediaItem) => void;
  onToggleLike: (item: GuestMediaItem) => void;
  /** Absent when select mode is unavailable (its only action is Download, and
   *  the studio has turned downloads off) — the select badge then only toggles
   *  an already-active selection. */
  onEnterSelectWith?: (item: GuestMediaItem) => void;
  /** Absent when the studio has turned downloads off. The tile then renders NO
   *  download button — a control that exists but refuses is worse than none. */
  onDownload?: (item: GuestMediaItem) => void;
}) {
  const [containerRef, width] = useContainerWidth();
  // Flatten the index onto each item (rather than wrapping) so it still carries
  // its own width/height for justifyRows to read.
  const indexed = items.map((item, index) => ({ ...item, _index: index }));
  const rows = justifyRows(indexed, width, targetRowHeightFor(width), JUSTIFY_GAP);

  return (
    <div ref={containerRef} className="flex flex-col" style={{ gap: JUSTIFY_GAP, minHeight: width > 0 ? undefined : 1 }}>
      {rows.map((row, ri) => (
        <div key={ri} className="flex" style={{ gap: JUSTIFY_GAP, height: row.height }}>
          {row.items.map((tile) => (
            <PhotoTile
              key={tile._id}
              t={t}
              layout="justified"
              item={tile}
              index={tile._index}
              boxWidth={tile.boxWidth}
              boxHeight={tile.boxHeight}
              selectMode={selectMode}
              isSel={isSelected(tile._id)}
              isLiked={liked.has(tile._id)}
              onOpen={() => onOpen(tile._index)}
              onToggleSelect={() => onToggleSelect(tile)}
              onToggleLike={() => onToggleLike(tile)}
              onEnterSelectWith={onEnterSelectWith && (() => onEnterSelectWith(tile))}
              onDownload={onDownload && (() => onDownload(tile))}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function PhotoTile({
  t,
  layout,
  item,
  index,
  boxWidth,
  boxHeight,
  selectMode,
  isSel,
  isLiked,
  onOpen,
  onToggleSelect,
  onToggleLike,
  onEnterSelectWith,
  onDownload,
}: {
  t: ClientTheme;
  layout: "justified" | "grid";
  item: GuestMediaItem;
  index: number;
  boxWidth?: number;
  boxHeight?: number;
  selectMode: boolean;
  isSel: boolean;
  isLiked: boolean;
  onOpen: () => void;
  onToggleSelect: () => void;
  onToggleLike: () => void;
  onEnterSelectWith?: () => void;
  /** Absent → no download button on this tile at all. */
  onDownload?: () => void;
}) {
  const isJustified = layout === "justified";
  const pad = selectMode && isSel ? 4 : 0;
  // Keep a liked heart visible on desktop; other controls reveal on hover so the
  // photos stay the focus. Mobile keeps everything tappable (opacity-100 below sm).
  const revealCls = "sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100";

  // Every tile carries a resolved box size in justified mode (real dims or the
  // 3:2 fallback from justifyRows), so the box is reserved up front — no
  // layout shift as the image loads. Mirrors the dashboard's GridImage
  // skeleton-shimmer + fade-in-on-load pattern.
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if (imgRef.current?.complete) setLoaded(true);
  }, []);

  return (
    <div
      className={`group tile-in relative cursor-pointer ${isJustified ? "shrink-0" : "aspect-square transition-colors"}`}
      style={{
        // grid uses the wrapper as the selected-state frame; justified frames the inner box.
        background: !isJustified && selectMode && isSel ? t.brand : "transparent",
        width: isJustified ? boxWidth : undefined,
        height: isJustified ? boxHeight : undefined,
        animationDelay: `${(index % 14) * 0.03}s`,
      }}
      onClick={() => (selectMode ? onToggleSelect() : onOpen())}
    >
      <div
        className={`overflow-hidden transition-all ${isJustified ? "relative h-full w-full" : "absolute"}`}
        style={
          isJustified
            ? {
                padding: pad,
                background: selectMode && isSel ? t.brand : "transparent",
                borderRadius: selectMode && isSel ? 12 : 10,
              }
            : { inset: pad, borderRadius: selectMode && isSel ? 9 : 8 }
        }
      >
        {isJustified && !loaded && <span aria-hidden className="skeleton absolute inset-0 rounded-[8px]" />}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={gridSrc(item)}
          alt=""
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={(e) => degradeGridSrc(e.currentTarget, item)}
          className={
            isJustified
              ? `absolute inset-0 h-full w-full rounded-[8px] object-cover transition-opacity duration-300 ease-out ${loaded ? "opacity-100" : "opacity-0"}`
              : "h-full w-full object-cover transition-opacity duration-300 ease-out group-hover:opacity-[0.94]"
          }
        />
        {/* soft theme-tinted wash on hover (replaces the old zoom) */}
        <div
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{ background: t.accentWash, borderRadius: isJustified ? 8 : undefined }}
        />
      </div>

      {/* select badge — always in select mode; desktop hover otherwise */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (selectMode) onToggleSelect();
          else onEnterSelectWith?.();
        }}
        aria-label="Select photo"
        className={`absolute left-1.5 top-1.5 z-10 flex h-[22px] w-[22px] cursor-pointer items-center justify-center rounded-full ${
          selectMode ? "flex" : onEnterSelectWith ? `hidden sm:flex ${revealCls}` : "hidden"
        }`}
        style={{
          background: isSel ? t.brand : "rgba(20,16,8,0.3)",
          border: isSel ? "none" : "2px solid rgba(255,255,255,0.9)",
          color: t.onBrand,
        }}
      >
        {isSel && <IconCheck size={13} weight="bold" />}
      </button>

      {/* like + download, together bottom-right. Like stays visible when liked;
          both reveal on desktop hover otherwise, lighter on mobile. */}
      {!selectMode && (
        <div className="absolute bottom-1.5 right-1.5 z-10 flex items-center gap-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleLike();
            }}
            aria-label={isLiked ? "Unlike photo" : "Like photo"}
            className={`flex cursor-pointer items-center gap-1 rounded-full px-1.5 py-1 transition-transform active:scale-95 ${
              isLiked ? "" : revealCls
            }`}
            style={{ background: isLiked ? "rgba(255,255,255,0.92)" : "rgba(20,16,8,0.38)" }}
          >
            <IconHeart size={14} filled={isLiked} style={{ color: isLiked ? SIGNAL.liked : "#fff" }} />
            {(item.likes_count ?? 0) > 0 && (
              <span className="pr-0.5 text-[11px] font-bold tabular-nums" style={{ color: isLiked ? SIGNAL.viewer : "#fff" }}>
                {item.likes_count}
              </span>
            )}
          </button>
          {onDownload && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDownload();
              }}
              aria-label="Download photo"
              className={`flex h-[22px] w-[22px] cursor-pointer items-center justify-center rounded-full transition-transform active:scale-95 ${revealCls}`}
              style={{ background: "rgba(20,16,8,0.38)" }}
            >
              <IconDownload size={12} style={{ color: "#fff" }} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

