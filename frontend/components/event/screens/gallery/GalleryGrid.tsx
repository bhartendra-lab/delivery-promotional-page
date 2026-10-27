"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { GuestMediaItem } from "@/lib/types";
import { SIGNAL, type ClientTheme } from "@/lib/client-theme";
import { degradeGridSrc, gridSrc } from "@/lib/media-actions";
import { useHoverPointer } from "@/lib/use-media-query";
import { justifyRows, targetRowHeightFor, JUSTIFY_GAP } from "./justifyRows";
import { createMasonryCache, displayAspect, masonryLayout, masonryWindow, radiusFor, revealScrollTop } from "./masonry";
import { tileMenuActions } from "./tileMenuActions";
import { TileMenu, type TileMenuItem } from "./TileMenu";
import { IconHeart, IconCheck, IconDownload, IconDotsThree, IconPlay, IconPlus, IconShare } from "@/components/ui/icons";

/**
 * The guest gallery's photo layout, isolated behind a `layout` prop so the
 * studio can later choose the presentation without touching LoungeGallery.
 *
 * - "masonry" (default): Pinterest-style columns, each photo dropped into the
 *   shortest one. Photos never move once placed, and every tile has an
 *   absolute position, which is what lets the grid render only the tiles near
 *   the viewport. See masonry.ts for why it replaced the justified rows.
 * - "justified": the row-packed layout that was the default before (see
 *   justifyRows.ts). Kept working as a studio choice.
 * - "grid": the original square-cropped grid, kept as a fallback.
 *
 * Infinite scroll is owned by the parent scroll container; this component just
 * renders whatever `items` it's given, so appended pages flow in naturally.
 * Given that container as `scrollRef`, the masonry renders only the tiles in
 * and around view; without it, it renders them all.
 */
export function GalleryGrid({
  t,
  layout = "masonry",
  items,
  selectMode,
  isSelected,
  liked,
  onOpen,
  onToggleSelect,
  onToggleLike,
  onEnterSelectWith,
  onDownload,
  onShare,
  onCollect,
  scrollRef,
  reveal,
  revealInset,
  badges,
  footer = false,
}: {
  t: ClientTheme;
  layout?: "masonry" | "justified" | "grid";
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
   *  the studio has turned downloads off). The select badge then only toggles
   *  an already-active selection, and a long-press does nothing. */
  onEnterSelectWith?: (item: GuestMediaItem) => void;
  /** Absent when the studio has turned downloads off. The menu then has no
   *  Download item: a control that exists but refuses is worse than none. */
  onDownload?: (item: GuestMediaItem) => void;
  /** The native share sheet. Offered on touch devices only (see tileMenuActions.ts). */
  onShare?: (item: GuestMediaItem) => void;
  /** "Add to collection", for curators only (see lib/collections). */
  onCollect?: (item: GuestMediaItem) => void;
  /** The scroll container this grid sits in, for windowing. */
  scrollRef?: React.RefObject<HTMLElement | null>;
  /**
   * "Make sure this photo is in view", sent when the viewer closes so the
   * guest lands on the photo they were last looking at. Acted on once per
   * `seq`; a grid that mounts later treats the current one as already done.
   * Masonry only (the fallback layouts ignore it).
   */
  reveal?: { id: string; seq: number } | null;
  /** What covers the scroll container's edges without scrolling with it (the
   *  desktop's pinned control row, the phone's bottom nav). */
  revealInset?: { top: number; bottom: number };
  /**
   * The curator's Selection workspace only: a like-count pill bottom-left and
   * a brand check when the photo is in a collection. Absent everywhere else,
   * so every other grid's tiles are exactly as Phase 1 left them.
   */
  badges?: (item: GuestMediaItem) => { likes: number; sorted: boolean } | null;
  /**
   * The gallery's tiles (masonry only), on phones and laptops: a line under
   * each photo with its like count on the left and the 3-dot menu on the
   * right, Pinterest-style, in place of the heart and menu drawn over the
   * photo. Liking moves into the menu. The masonry reserves the line in every
   * box, so nothing shifts. A mouse keeps the hover circle that selects.
   */
  footer?: boolean;
}) {
  const hoverPointer = useHoverPointer();
  const footerPx = footer && layout === "masonry" ? TILE_FOOTER : 0;
  const actions = tileMenuActions({
    canLike: footerPx > 0,
    canDownload: !!onDownload,
    canCollect: !!onCollect,
    canShare: !!onShare && !hoverPointer,
  });

  /** A like made from the menu, so that tile's heart plays the pop once. */
  const [pop, setPop] = useState<{ id: string; seq: number } | null>(null);

  // One menu for the whole grid (see TileMenu for why not one per tile).
  const [menu, setMenu] = useState<{ item: GuestMediaItem; anchor: HTMLElement; rect: DOMRect } | null>(null);
  const onOpenMenu =
    actions.length > 0
      ? (item: GuestMediaItem, anchor: HTMLElement) =>
          setMenu((m) => (m?.item._id === item._id ? null : { item, anchor, rect: anchor.getBoundingClientRect() }))
      : undefined;

  const menuItems = (item: GuestMediaItem): TileMenuItem[] =>
    actions.map((action) => {
      if (action === "like") {
        const on = liked.has(item._id);
        return {
          key: action,
          label: on ? "Unlike" : "Like",
          icon: <IconHeart size={19} filled={on} style={on ? { color: SIGNAL.liked } : undefined} />,
          onSelect: () => {
            if (!on) setPop((p) => ({ id: item._id, seq: (p?.seq ?? 0) + 1 }));
            onToggleLike(item);
          },
        };
      }
      if (action === "download") return { key: action, label: "Download", icon: <IconDownload size={19} />, onSelect: () => onDownload?.(item) };
      if (action === "collect") return { key: action, label: "Add to collection", icon: <IconPlus size={19} />, onSelect: () => onCollect?.(item) };
      return { key: action, label: "Share", icon: <IconShare size={19} />, onSelect: () => onShare?.(item) };
    });

  const tile = {
    t,
    selectMode,
    isSelected,
    liked,
    openMenuId: menu?.item._id ?? null,
    onToggleSelect,
    onToggleLike,
    onEnterSelectWith,
    onOpenMenu,
    badges,
    footerPx,
    popSeq: (id: string) => (pop?.id === id ? pop.seq : 0),
  };

  let body: React.ReactNode;
  if (layout === "grid") {
    body = (
      <div className="grid grid-cols-3 gap-1 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 2xl:grid-cols-7 lg:gap-1.5">
        {items.map((item, index) => (
          <PhotoTile key={item._id} {...tile} shape={{ kind: "grid" }} item={item} index={index} onOpen={() => onOpen(index)} />
        ))}
      </div>
    );
  } else if (layout === "justified") {
    body = <JustifiedGrid tile={tile} items={items} onOpen={onOpen} />;
  } else {
    body = <MasonryGrid tile={tile} items={items} onOpen={onOpen} scrollRef={scrollRef} reveal={reveal} revealInset={revealInset} />;
  }

  return (
    <>
      {body}
      {/* Never in select mode: the 3-dot button is hidden there, so a menu
          could only be left over from before. */}
      {menu && !selectMode && (
        <TileMenu
          t={t}
          mode={hoverPointer ? "popover" : "sheet"}
          anchor={menu.anchor}
          anchorRect={menu.rect}
          items={menuItems(menu.item)}
          // The Pinterest sheet: the photo floats above the actions. A mouse
          // gets the small popover by the button, with no photo: the tile is
          // right there.
          preview={footerPx > 0 ? { src: gridSrc(menu.item), aspect: displayAspect(menu.item).ar } : undefined}
          onClose={() => setMenu(null)}
        />
      )}
    </>
  );
}

/** Everything a tile needs from the grid, shared by all three layouts. */
type TileContext = {
  t: ClientTheme;
  selectMode: boolean;
  isSelected: (id: string) => boolean;
  liked: Set<string>;
  /** The tile whose menu is open, so its trigger stays visible meanwhile. */
  openMenuId: string | null;
  onToggleSelect: (item: GuestMediaItem) => void;
  onToggleLike: (item: GuestMediaItem) => void;
  onEnterSelectWith?: (item: GuestMediaItem) => void;
  onOpenMenu?: (item: GuestMediaItem, anchor: HTMLElement) => void;
  badges?: (item: GuestMediaItem) => { likes: number; sorted: boolean } | null;
  /** Height of the like-and-menu line under each photo; 0 for none. */
  footerPx: number;
  /** Bumped for a tile liked from the menu, so its heart pops once. */
  popSeq: (id: string) => number;
};

/**
 * Measures its own width (initial synchronous read + ResizeObserver for later
 * changes: sidebar toggles, window resize) so the layout always runs against
 * the real available width.
 *
 * FLOORED, and read from the same box on both paths. It used to seed from
 * `clientWidth`, which is an INTEGER the browser rounds, while the observer
 * that replaced it reports `contentRect.width`, which is fractional. On a
 * container whose true width is, say, 342.67px, `clientWidth` says 343, the
 * layout is solved to fill 343, and the extra third of a pixel pushes the last
 * tile under the scroll container's clip. Flooring a fractional read makes the
 * layout a hair narrower than the space it has, which can never clip, and
 * makes the two measurements agree so the first paint matches the second.
 */
function useContainerWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(Math.floor(el.getBoundingClientRect().width));
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w != null) setWidth(Math.floor(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** How much beyond the viewport stays rendered, in viewport heights. Above is
 *  smaller than below because guests scroll down far more than up. */
const WINDOW_ABOVE = 1.5;
const WINDOW_BELOW = 2;
/** The band moves in quarter-viewport steps, so scrolling re-renders the grid
 *  about four times per screen rather than on every frame. */
const WINDOW_STEPS_PER_VIEWPORT = 4;

const viewportHeight = () => (typeof window === "undefined" ? 800 : window.innerHeight);

/**
 * The vertical band of the grid worth rendering, in the grid's own coordinates,
 * or null for "everything" (no scroll container to watch).
 *
 * Measured from two rects per animation frame (the scroller's top and the
 * grid's), not from `scrollTop` alone: the grid sits under other content (the
 * desktop cover, the match banner, the face filter bar) whose height changes,
 * and the rects always say where the grid really is. The band is snapped to
 * quarter-viewport steps and padded by one step, so the real viewport is always
 * covered by at least the promised 1.5 and 2 viewports either side, and state
 * only changes when the snapped band does.
 */
function useViewportBand(
  scrollRef: React.RefObject<HTMLElement | null> | undefined,
  gridRef: React.RefObject<HTMLDivElement | null>,
  contentHeight: number,
) {
  // Before the first measurement, assume the grid starts at the top of view.
  const [band, setBand] = useState<{ from: number; to: number } | null>(() => {
    if (!scrollRef) return null;
    const vh = viewportHeight();
    return { from: -Math.ceil(WINDOW_ABOVE * vh), to: Math.ceil((1 + WINDOW_BELOW) * vh) };
  });

  useEffect(() => {
    const scroller = scrollRef?.current;
    const grid = gridRef.current;
    if (!scroller || !grid) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const vh = scroller.clientHeight || viewportHeight();
      const step = Math.max(1, Math.round(vh / WINDOW_STEPS_PER_VIEWPORT));
      const viewTop = scroller.getBoundingClientRect().top - grid.getBoundingClientRect().top;
      const snapped = Math.floor(viewTop / step) * step;
      const from = snapped - Math.ceil(WINDOW_ABOVE * vh);
      const to = snapped + step + Math.ceil((1 + WINDOW_BELOW) * vh);
      setBand((prev) => (prev && prev.from === from && prev.to === to ? prev : { from, to }));
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    schedule();
    scroller.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const ro = new ResizeObserver(schedule);
    ro.observe(scroller);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      scroller.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      ro.disconnect();
    };
    // contentHeight: a new page (or a resize) is a reason to look again.
  }, [scrollRef, gridRef, contentHeight]);

  return band;
}

function MasonryGrid({
  tile,
  items,
  onOpen,
  scrollRef,
  reveal,
  revealInset,
}: {
  tile: TileContext;
  items: GuestMediaItem[];
  onOpen: (index: number) => void;
  scrollRef?: React.RefObject<HTMLElement | null>;
  reveal?: { id: string; seq: number } | null;
  revealInset?: { top: number; bottom: number };
}) {
  const [containerRef, width] = useContainerWidth();
  // Appending a page lays out only the new page (see createMasonryCache).
  const [layoutFor] = useState(() => createMasonryCache<GuestMediaItem>());
  const layout = useMemo(() => layoutFor(items, width, tile.footerPx), [layoutFor, items, width, tile.footerPx]);
  const band = useViewportBand(scrollRef, containerRef, layout.height);
  const visible = useMemo(
    () => (band ? masonryWindow(layout, band.from, band.to) : layout.boxes.map((_, i) => i)),
    [layout, band],
  );
  const radius = radiusFor(width);

  // Return from the viewer. The layout knows where every photo is, mounted or
  // not, so this works however far the reel travelled from the grid's window.
  const handledReveal = useRef(reveal?.seq ?? 0);
  const insetTop = revealInset?.top ?? 0;
  const insetBottom = revealInset?.bottom ?? 0;
  useEffect(() => {
    if (!reveal || reveal.seq === handledReveal.current) return;
    handledReveal.current = reveal.seq;
    const scroller = scrollRef?.current;
    const grid = containerRef.current;
    const i = items.findIndex((m) => m._id === reveal.id);
    const box = i >= 0 ? layout.boxes[i] : undefined;
    // Not in this grid (My People renders one grid per run): another has it.
    if (!scroller || !grid || !box) return;
    const gridTop = grid.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    const top = revealScrollTop({
      boxTop: gridTop + box.top,
      boxHeight: box.height,
      scrollTop: scroller.scrollTop,
      viewportHeight: scroller.clientHeight,
      insetTop,
      insetBottom,
    });
    if (top != null) scroller.scrollTo({ top, behavior: "auto" });
  }, [reveal, items, layout, scrollRef, containerRef, insetTop, insetBottom]);

  return (
    <div ref={containerRef} className="relative w-full" style={{ height: layout.height, minHeight: width > 0 ? undefined : 1 }}>
      {visible.map((i) => {
        const item = items[i];
        const box = layout.boxes[i];
        if (!item || !box) return null;
        return (
          <PhotoTile
            key={item._id}
            {...tile}
            shape={{ kind: "masonry", left: box.left, top: box.top, width: box.width, height: box.height, radius }}
            item={item}
            index={i}
            onOpen={() => onOpen(i)}
          />
        );
      })}
    </div>
  );
}

function JustifiedGrid({ tile, items, onOpen }: { tile: TileContext; items: GuestMediaItem[]; onOpen: (index: number) => void }) {
  const [containerRef, width] = useContainerWidth();
  // Flatten the index onto each item (rather than wrapping) so it still carries
  // its own width/height for justifyRows to read.
  const indexed = items.map((item, index) => ({ ...item, _index: index }));
  const rows = justifyRows(indexed, width, targetRowHeightFor(width), JUSTIFY_GAP);

  return (
    <div ref={containerRef} className="flex flex-col" style={{ gap: JUSTIFY_GAP, minHeight: width > 0 ? undefined : 1 }}>
      {rows.map((row, ri) => (
        <div key={ri} className="flex" style={{ gap: JUSTIFY_GAP, height: row.height }}>
          {row.items.map((cell) => (
            <PhotoTile
              key={cell._id}
              {...tile}
              shape={{ kind: "justified", width: cell.boxWidth, height: cell.boxHeight }}
              item={cell}
              index={cell._index}
              onOpen={() => onOpen(cell._index)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Display skeleton for the first load: the same masonry, filled with
 * placeholders of mixed shapes, so the wall the guest is about to see is the
 * one they are already looking at.
 */
export function GallerySkeleton({ t, count = 12 }: { t: ClientTheme; count?: number }) {
  const [ref, width] = useContainerWidth();
  const layout = useMemo(() => masonryLayout(Array.from({ length: count }, (_, i) => SKELETON_SHAPES[i % SKELETON_SHAPES.length]), width), [count, width]);
  const radius = radiusFor(width);
  return (
    <div ref={ref} aria-hidden className="relative w-full" style={{ height: layout.height, minHeight: width > 0 ? undefined : 1 }}>
      {layout.boxes.map((b, i) => (
        <div
          key={i}
          className="tile-skeleton absolute"
          style={{ ...skeletonVars(t), left: b.left, top: b.top, width: b.width, height: b.height, borderRadius: radius, animationDelay: `${i * 0.04}s` }}
        />
      ))}
    </div>
  );
}
const SKELETON_SHAPES = [
  { width: 2, height: 3 },
  { width: 3, height: 2 },
  { width: 4, height: 5 },
  { width: 1, height: 1 },
  { width: 3, height: 4 },
  { width: 16, height: 9 },
];

/** The theme colours `.tile-skeleton` shimmers between. */
const skeletonVars = (t: ClientTheme) => ({ "--skel-a": t.sunken, "--skel-b": t.border }) as React.CSSProperties;

/* ── tiles ───────────────────────────────────────────────────────────── */

/** Photos that have already played their entrance. Module-level so a tile that
 *  windowing unmounts and later remounts does not play it again: `tile-in` is
 *  for a photo's first appearance, not for every scroll back past it. */
const enteredTiles = new Set<string>();
/** Grid sources that have finished loading once this visit, so a remounted
 *  tile starts visible instead of flashing its skeleton for a cached image. */
const loadedSrcs = new Set<string>();

/** Long-press: how long, and how far the finger may drift before it is a
 *  scroll instead. */
const LONG_PRESS_MS = 450;
const LONG_PRESS_SLOP = 8;

/** The phone's line under each photo: the like count and the 3-dot menu. */
const TILE_FOOTER = 34;

/** The translucent circle behind the tile's white glyphs. */
const CONTROL_TINT: React.CSSProperties = {
  background: "rgba(18,14,10,0.32)",
  backdropFilter: "blur(6px)",
  WebkitBackdropFilter: "blur(6px)",
};

type TileShape =
  | { kind: "masonry"; left: number; top: number; width: number; height: number; radius: number }
  | { kind: "justified"; width: number; height: number }
  | { kind: "grid" };

function PhotoTile({
  t,
  shape,
  item,
  index,
  selectMode,
  isSelected,
  liked,
  openMenuId,
  onOpen,
  onToggleSelect,
  onToggleLike,
  onEnterSelectWith,
  onOpenMenu,
  badges,
  footerPx,
  popSeq,
}: TileContext & {
  shape: TileShape;
  item: GuestMediaItem;
  index: number;
  onOpen: () => void;
}) {
  const isSel = isSelected(item._id);
  const isLiked = liked.has(item._id);
  const menuOpen = openMenuId === item._id;
  const badge = badges?.(item) ?? null;
  const radius = shape.kind === "masonry" ? shape.radius : shape.kind === "justified" ? 10 : 8;
  const pad = selectMode && isSel ? 4 : 0;
  const innerRadius = pad ? Math.max(4, radius - 3) : radius;

  /* Controls on a device with a real hover fade in on hover (or keyboard
     focus inside the tile). On touch devices, phones and iPads alike, there is
     no hover to wait for, so they are simply there. */
  const reveal = "transition-opacity duration-200 can-hover:opacity-0 can-hover:group-hover:opacity-100 can-hover:group-focus-within:opacity-100";

  const src = gridSrc(item);
  const isVideo = item.type === "video";
  const videoFrame = isVideo && !item.thumbnail_url;
  const [loaded, setLoaded] = useState(() => loadedSrcs.has(src));
  const markLoaded = () => {
    loadedSrcs.add(src);
    setLoaded(true);
  };
  const imgRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) setLoaded(true);
  }, []);

  const [animate] = useState(() => !enteredTiles.has(item._id));
  useEffect(() => {
    enteredTiles.add(item._id);
  }, [item._id]);

  // Bumped by a tap that LIKES (never by one that unlikes, and never on mount),
  // so the pop plays for the guest's own gesture only, not for every already
  // liked photo that scrolls into view.
  const [pop, setPop] = useState(0);

  /* ── long-press to select (touch only) ── */
  const press = useRef<{ x: number; y: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const swallowClick = useRef(false);
  const cancelPress = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  };
  useEffect(
    () => () => {
      if (press.current) clearTimeout(press.current.timer);
    },
    [],
  );
  const onPointerDown = (e: React.PointerEvent) => {
    swallowClick.current = false;
    const enter = onEnterSelectWith;
    if (e.pointerType !== "touch" || selectMode || !enter) return;
    // A press that starts on the heart or the menu belongs to that button.
    if ((e.target as Element).closest("button")) return;
    const start = { x: e.clientX, y: e.clientY };
    cancelPress();
    press.current = {
      ...start,
      timer: setTimeout(() => {
        press.current = null;
        // The finger is still down; the click its release produces would
        // toggle the tile straight back out of the selection it just joined.
        swallowClick.current = true;
        navigator.vibrate?.(10);
        enter(item);
      }, LONG_PRESS_MS),
    };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const p = press.current;
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > LONG_PRESS_SLOP) cancelPress();
  };
  const onClickCapture = (e: React.MouseEvent) => {
    if (!swallowClick.current) return;
    swallowClick.current = false;
    e.preventDefault();
    e.stopPropagation();
  };

  // With the line under the photo, this box is the photo alone and the line
  // hangs below it, inside the masonry slot that was sized for both.
  const outer: React.CSSProperties =
    shape.kind === "masonry"
      ? { position: "absolute", left: shape.left, top: shape.top, width: shape.width, height: shape.height - footerPx }
      : shape.kind === "justified"
        ? { width: shape.width, height: shape.height }
        : {};

  return (
    <div
      className={`group relative cursor-pointer select-none [-webkit-touch-callout:none] ${animate ? "tile-in" : ""} ${
        shape.kind === "justified" ? "shrink-0" : shape.kind === "grid" ? "aspect-square" : ""
      }`}
      style={{ ...outer, animationDelay: animate ? `${(index % 14) * 0.03}s` : undefined }}
      onClick={() => (selectMode ? onToggleSelect(item) : onOpen())}
      onClickCapture={onClickCapture}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={cancelPress}
      onPointerCancel={cancelPress}
      onPointerLeave={cancelPress}
    >
      {/* The selected frame: the photo insets and the brand colour shows
          around it. */}
      <div
        className="relative h-full w-full transition-[padding,background-color] duration-200"
        style={{ padding: pad, background: pad ? t.brand : "transparent", borderRadius: radius }}
      >
        <div className="relative h-full w-full overflow-hidden" style={{ borderRadius: innerRadius }}>
          {!loaded && <span aria-hidden className="tile-skeleton absolute inset-0" style={skeletonVars(t)} />}
          {videoFrame ? (
            // A video with no thumbnail: let the browser show its first frame.
            // `#t=0.1` is what makes iOS Safari paint one at all.
            <video
              src={`${item.url}#t=0.1`}
              preload="metadata"
              muted
              playsInline
              disablePictureInPicture
              tabIndex={-1}
              onLoadedMetadata={markLoaded}
              onLoadedData={markLoaded}
              className={`pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ease-out ${loaded ? "opacity-100" : "opacity-0"}`}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              ref={imgRef}
              src={src}
              alt=""
              loading="lazy"
              decoding="async"
              // Casual-save deterrent (see GuestInspectDeterrent): no drag-out,
              // no iOS long-press save sheet, no selection highlight.
              draggable={false}
              onLoad={markLoaded}
              onError={(e) => degradeGridSrc(e.currentTarget, item)}
              className={`absolute inset-0 h-full w-full select-none object-cover transition-opacity duration-300 ease-out [-webkit-touch-callout:none] ${loaded ? "opacity-100" : "opacity-0"}`}
            />
          )}
          {/* Soft theme-tinted wash on hover. Mouse devices only: on iOS a tap
              leaves :hover stuck on, and the wash with it. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 can-hover:group-hover:opacity-100"
            style={{ background: t.accentWash }}
          />
        </div>
      </div>

      {isVideo && (
        <span aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-white" style={CONTROL_TINT}>
          <IconPlay size={15} weight="fill" />
        </span>
      )}

      {/* Select badge: always in select mode. Otherwise a hover reveal on
          mouse devices; on touch the way in is a long-press (or the Select
          control above the grid), so the badge stays out of the photo. */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (selectMode) onToggleSelect(item);
          else onEnterSelectWith?.(item);
        }}
        aria-label={isSel ? "Deselect photo" : "Select photo"}
        className={`absolute left-2 top-2 z-10 h-[24px] w-[24px] cursor-pointer items-center justify-center rounded-full ${
          selectMode ? "flex" : onEnterSelectWith ? `hidden can-hover:flex ${reveal}` : "hidden"
        }`}
        style={{
          background: isSel ? t.brand : "rgba(20,16,8,0.3)",
          border: isSel ? "none" : "2px solid rgba(255,255,255,0.9)",
          color: t.onBrand,
        }}
      >
        {isSel && <IconCheck size={14} weight="bold" />}
      </button>

      {/* Curator badges (Selection workspace only). The check gives way to
          the select badge, which reveals in the same corner on hover. */}
      {badge?.sorted && !selectMode && (
        <span
          aria-label="In a collection"
          className={`pointer-events-none absolute left-2 top-2 z-[5] flex h-[22px] w-[22px] items-center justify-center rounded-full transition-opacity duration-200 ${
            onEnterSelectWith ? "can-hover:group-hover:opacity-0" : ""
          }`}
          style={{ background: t.brand, color: t.onBrand, boxShadow: "0 1px 4px rgba(0,0,0,0.25)" }}
        >
          <IconCheck size={13} weight="bold" />
        </span>
      )}
      {badge && badge.likes > 0 && !footerPx && (
        <span
          className="pointer-events-none absolute bottom-2 left-2 z-[5] flex h-7 items-center gap-1 rounded-full px-2 text-[11.5px] font-extrabold tabular-nums text-white"
          style={CONTROL_TINT}
        >
          <IconHeart size={12} filled style={{ color: "#fff" }} />
          {badge.likes.toLocaleString("en-IN")}
        </span>
      )}

      {!selectMode && onOpenMenu && !footerPx && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenMenu(item, e.currentTarget);
          }}
          aria-label="Photo options"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className={`absolute right-1 top-1 z-10 flex h-10 w-10 cursor-pointer items-center justify-center ${menuOpen ? "" : reveal}`}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full text-white" style={CONTROL_TINT}>
            <IconDotsThree size={18} weight="bold" />
          </span>
        </button>
      )}

      {!selectMode && !footerPx && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (!isLiked) setPop((n) => n + 1);
            onToggleLike(item);
          }}
          aria-label={isLiked ? "Unlike photo" : "Like photo"}
          aria-pressed={isLiked}
          // A liked heart stays visible on mouse devices too: it is the one
          // control that says something about the photo.
          className={`absolute bottom-1 right-1 z-10 flex h-10 w-10 cursor-pointer items-center justify-center ${isLiked ? "" : reveal}`}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full transition-transform active:scale-90" style={CONTROL_TINT}>
            <span key={pop} className={`flex ${pop > 0 && isLiked ? "like-pop" : ""}`}>
              <IconHeart size={17} filled={isLiked} weight={isLiked ? undefined : "bold"} style={{ color: isLiked ? SIGNAL.liked : "#fff" }} />
            </span>
          </span>
        </button>
      )}

      {footerPx > 0 && (
        <TileFooter
          t={t}
          height={footerPx}
          // Kept current by the gallery's optimistic like toggle, as in the reel.
          count={Math.max(0, item.likes_count ?? 0)}
          liked={isLiked}
          pop={popSeq(item._id)}
          menuOpen={menuOpen}
          onOpenMenu={!selectMode && onOpenMenu ? (anchor) => onOpenMenu(item, anchor) : undefined}
        />
      )}
    </div>
  );
}

/**
 * The line under a tile, Pinterest-style: the like count on the left
 * (red when the guest liked it, nothing at all while no one has), the 3-dot
 * menu on the right. Not a place to open the photo or start a long-press:
 * presses here stay here.
 */
function TileFooter({
  t,
  height,
  count,
  liked,
  pop,
  menuOpen,
  onOpenMenu,
}: {
  t: ClientTheme;
  height: number;
  count: number;
  liked: boolean;
  /** Bumped by a like from the menu, so the heart pops once for it. */
  pop: number;
  menuOpen: boolean;
  /** Absent in select mode, where the menu is not offered. */
  onOpenMenu?: (anchor: HTMLElement) => void;
}) {
  return (
    <div
      className="absolute inset-x-0 top-full flex items-center justify-between"
      style={{ height }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {count > 0 ? (
        <span
          className="flex items-center gap-1 pl-1 text-[12px] font-bold tabular-nums"
          style={{ color: liked ? t.text : t.muted }}
          aria-label={`${count.toLocaleString("en-IN")} ${count === 1 ? "like" : "likes"}${liked ? ", including yours" : ""}`}
        >
          <span key={pop} className={`flex ${pop > 0 && liked ? "like-pop" : ""}`} aria-hidden>
            <IconHeart size={14} filled={liked} weight={liked ? undefined : "bold"} style={{ color: liked ? SIGNAL.liked : t.muted }} />
          </span>
          {count.toLocaleString("en-IN")}
        </span>
      ) : (
        <span />
      )}
      {onOpenMenu && (
        <button
          type="button"
          onClick={(e) => onOpenMenu(e.currentTarget)}
          aria-label="Photo options"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          // A full 44px target, wider than the line looks.
          className="-mr-1 flex h-[44px] w-11 cursor-pointer items-center justify-center rounded-full"
          style={{ color: t.text, background: menuOpen ? t.sunken : "transparent" }}
        >
          <IconDotsThree size={20} weight="bold" />
        </button>
      )}
    </div>
  );
}

