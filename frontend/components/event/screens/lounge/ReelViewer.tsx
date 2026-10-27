"use client";

import { useEffect, useRef, useState } from "react";
import type { GuestMediaItem } from "@/lib/types";
import { SIGNAL } from "@/lib/client-theme";
import { gridSrc } from "@/lib/media-actions";
import { useMediaQuery } from "@/lib/use-media-query";
import { useEventTheme } from "../../EventThemeContext";
import { ZoomImage } from "./ZoomImage";
import {
  DOUBLE_TAP_MS,
  REEL_ANIM_MS,
  REEL_DISTANCE_RATIO,
  TAP_SLOP,
  classifyTaps,
  isTap,
  reelStep,
  releaseVelocity,
  rubberBand,
  type Step,
  type Tap,
} from "./reelGestures";
import { REEL_HINT_EVERY_MS, REEL_HINT_LIFT_PX, REEL_HINT_MS, hintDone, markHintDone, sessionStore, wantsNudge } from "./reelHint";
import { IconCheck, IconChevronLeft, IconDownload, IconHeart, IconPlus, IconShare } from "@/components/ui/icons";

/** Ask the gallery for its next page this many photos before the end, so the
 *  guest rarely reaches a slide that is still loading. */
const LOAD_AHEAD = 5;
/** How long a double-tap heart stays on screen (the animation's length). */
const BURST_MS = 700;

type Gesture = {
  id: number;
  x0: number;
  y0: number;
  t0: number;
  samples: { t: number; y: number }[];
  /** pending: not yet a drag or a tap · drag: paging · ignore: sideways, or
   *  the zoomed photo panning · multi: a pinch, never a tap or a page */
  mode: "pending" | "drag" | "ignore" | "multi";
};

/**
 * The phone and tablet photo viewer (under 1024px; the desktop keeps
 * PhotoViewer): one photo per screen, swipe up for the next, like Instagram
 * Reels. Near-black by design (`SIGNAL.viewer`), never themed.
 *
 * A PAGER, NOT A SCROLL LIST. Only the previous, current and next photo are
 * mounted, stacked one screen apart in a track that follows the finger; on
 * release `reelStep` decides whether to move on, the track animates there,
 * and only then does the index change (the slides are keyed by photo, so the
 * one that was "next" simply becomes the one at 0, with nothing reloaded). A
 * scroll list with snap points would have to mount everything it can scroll
 * to, and cannot rubber-band at a list that is still loading.
 *
 * Gestures, all decided in reelGestures.ts:
 *   - single tap   toggles the buttons and scrims (after the double-tap window)
 *   - double tap   likes, never unlikes, with a heart where the finger was
 *   - pinch        zooms; while zoomed a drag pans the photo, and paging waits
 *   - swipe        up = next, down = previous; no wrap-around, a rubber band
 *                  at the ends, and the gallery's next page asked for early
 *
 * Closing is the back chevron, the system back gesture (see useViewerHistory),
 * or Escape. There is no swipe-down-to-close: vertical swipes are paging.
 */
export function ReelViewer({
  items,
  index,
  onNav,
  onClose,
  liked,
  onToggleLike,
  selectMode,
  isSelected,
  onToggleSelect,
  canDownload,
  onDownload,
  onShare,
  hasMore,
  loadingMore,
  onLoadMore,
  onCollect,
  attribution,
}: {
  items: GuestMediaItem[];
  index: number;
  onNav: (i: number) => void;
  onClose: () => void;
  liked: Set<string>;
  onToggleLike: (item: GuestMediaItem) => void;
  selectMode: boolean;
  /** Predicate, not a Set: see GalleryGrid. */
  isSelected: (id: string) => boolean;
  onToggleSelect: (item: GuestMediaItem) => void;
  /** The studio's preference. False renders no Download at all. */
  canDownload: boolean;
  /** The gallery's single-photo save: quality choice and required visit included. */
  onDownload: (item: GuestMediaItem) => void;
  onShare: (item: GuestMediaItem) => void;
  /** The gallery has more photos to load past the last one here. */
  hasMore: boolean;
  loadingMore: boolean;
  /** The gallery's own `loadMore`; it guards against double requests. */
  onLoadMore: () => void;
  /** "Add to collection", for curators only. Absent for everyone else, and
   *  then the rail is exactly what it was. */
  onCollect?: (item: GuestMediaItem) => void;
  /** The curator's "Added to Priya’s Side by Manish" line for a photo. */
  attribution?: (item: GuestMediaItem) => string | null;
}) {
  const { theme: t } = useEventTheme();
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const item = items[index];
  const canPrev = index > 0;
  const canNext = index < items.length - 1;

  /* ── size: slides are positioned in pixels, one viewport apart ── */
  const rootRef = useRef<HTMLDivElement>(null);
  const [vh, setVh] = useState(() => (typeof window === "undefined" ? 800 : window.innerHeight));
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const h = Math.round(entry.contentRect.height);
      if (h > 0) setVh(h);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [drag, setDrag] = useState(0);
  const [settling, setSettling] = useState(false);
  const [chrome, setChrome] = useState(true);
  /** Which photo is zoomed, by id: a zoom belongs to its photo, so moving on
   *  (or the list changing) can never leave paging switched off. */
  const [zoomedId, setZoomedId] = useState<string | null>(null);
  const zoomed = !!item && zoomedId === item._id;
  const [bursts, setBursts] = useState<{ id: number; x: number; y: number }[]>([]);
  const burstSeq = useRef(0);
  /** Bumped by a heart tap that likes, so the pop plays for that tap only. */
  const [pop, setPop] = useState(0);

  /* ── the swipe-up hint (see reelHint.ts) ── */
  const [swiped, setSwiped] = useState(() => hintDone(sessionStore()));
  const [nudges, setNudges] = useState(0);
  const nudgeRef = useRef<HTMLDivElement>(null);
  const nudgeDue = wantsNudge({ done: swiped, nudges, canNext, zoomed, reducedMotion: reduced });

  /* ── settling: animate the track to a step, then move the index ── */
  const settleRef = useRef<{ timer: ReturnType<typeof setTimeout>; done: () => void } | null>(null);
  /** Finish a settle in flight right now, so a new touch starts from it. */
  const completeSettle = () => {
    const s = settleRef.current;
    if (!s) return;
    clearTimeout(s.timer);
    settleRef.current = null;
    s.done();
  };
  const settleTo = (step: Step) => {
    completeSettle();
    if (step !== 0 && !swiped) {
      // The guest has found the reel's scroll: no more hints this session.
      setSwiped(true);
      markHintDone(sessionStore());
    }
    const target = index + step;
    const done = () => {
      setSettling(false);
      setDrag(0);
      if (step !== 0) onNav(target);
    };
    if (reduced) {
      done();
      return;
    }
    setSettling(true);
    setDrag(-step * vh);
    settleRef.current = {
      done,
      timer: setTimeout(() => {
        settleRef.current = null;
        done();
      }, REEL_ANIM_MS),
    };
  };

  /* ── taps ── */
  const pendingTap = useRef<Tap | null>(null);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearPendingTap = () => {
    if (tapTimer.current) clearTimeout(tapTimer.current);
    tapTimer.current = null;
    pendingTap.current = null;
  };
  const likeAt = (x: number, y: number) => {
    if (item && !liked.has(item._id)) {
      onToggleLike(item);
      navigator.vibrate?.(10);
    }
    // The heart shows on every double tap, liked already or not: it is the
    // answer to the gesture, and a gesture with no answer feels broken.
    const id = ++burstSeq.current;
    setBursts((b) => [...b, { id, x, y }]);
    setTimeout(() => setBursts((b) => b.filter((h) => h.id !== id)), BURST_MS + 50);
  };
  const onTap = (tap: Tap) => {
    const kind = classifyTaps(pendingTap.current, tap, tap.t);
    if (tapTimer.current) clearTimeout(tapTimer.current);
    tapTimer.current = null;
    if (kind === "double") {
      pendingTap.current = null;
      likeAt(tap.x, tap.y);
      return;
    }
    pendingTap.current = tap;
    tapTimer.current = setTimeout(() => {
      const lone = pendingTap.current;
      pendingTap.current = null;
      tapTimer.current = null;
      if (classifyTaps(null, lone, performance.now()) === "single") setChrome((c) => !c);
    }, DOUBLE_TAP_MS);
  };

  /* ── pointers ──
     The zoomable photo captures its own pointer; its events still bubble up
     here, which is what lets one handler tell a tap, a page and a pinch apart. */
  const gesture = useRef<Gesture | null>(null);
  const pointers = useRef(new Set<number>());

  const onPointerDown = (e: React.PointerEvent) => {
    // The back button and the side buttons are buttons, not photo taps.
    if ((e.target as Element).closest("[data-reel-control]")) return;
    pointers.current.add(e.pointerId);
    if (pointers.current.size > 1) {
      if (gesture.current?.mode === "drag") settleTo(0);
      if (gesture.current) gesture.current.mode = "multi";
      clearPendingTap();
      return;
    }
    completeSettle();
    // A nudge in flight gives way to the finger at once.
    for (const a of nudgeRef.current?.getAnimations?.() ?? []) a.cancel();
    const now = performance.now();
    gesture.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: now, samples: [{ t: now, y: e.clientY }], mode: "pending" };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId || g.mode === "multi" || g.mode === "ignore") return;
    const dx = e.clientX - g.x0;
    const dy = e.clientY - g.y0;
    g.samples.push({ t: performance.now(), y: e.clientY });
    if (g.samples.length > 12) g.samples.shift();
    if (g.mode === "pending") {
      if (Math.hypot(dx, dy) <= TAP_SLOP) return;
      // Zoomed: the photo pans itself. Sideways: nothing to do here.
      if (zoomed || Math.abs(dx) > Math.abs(dy)) {
        g.mode = "ignore";
        return;
      }
      g.mode = "drag";
    }
    setDrag(rubberBand(dy, vh, canPrev, canNext));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (!g) return;
    if (g.mode === "multi") {
      if (pointers.current.size === 0) gesture.current = null;
      return;
    }
    if (g.id !== e.pointerId) return;
    gesture.current = null;
    const now = performance.now();
    if (g.mode === "drag") {
      g.samples.push({ t: now, y: e.clientY });
      const dy = e.clientY - g.y0;
      // A real pull past the last photo, with more to load and nothing
      // loading, is the retry for a page that failed (see below).
      if (!canNext && hasMore && !loadingMore && dy < -REEL_DISTANCE_RATIO * vh) onLoadMore();
      settleTo(reelStep({ dy, velocity: releaseVelocity(g.samples), viewportHeight: vh, canPrev, canNext }));
      return;
    }
    if (g.mode === "pending") {
      const up = { t: now, x: e.clientX, y: e.clientY };
      if (isTap({ t: g.t0, x: g.x0, y: g.y0 }, up)) onTap(up);
    }
  };

  const onPointerCancel = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (g?.mode === "drag") settleTo(0);
    if (!g || g.mode !== "multi" || pointers.current.size === 0) gesture.current = null;
  };

  /* ── keyboard (a tablet with a keyboard, or a laptop narrower than 1024) ── */
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keyHandler.current = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (zoomed || settleRef.current) return;
      if ((e.key === "ArrowDown" || e.key === "PageDown") && canNext) {
        e.preventDefault();
        settleTo(1);
      } else if ((e.key === "ArrowUp" || e.key === "PageUp") && canPrev) {
        e.preventDefault();
        settleTo(-1);
      }
    };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyHandler.current(e);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Timers outlive nothing: a settle or a pending tap must not fire into a
  // closed viewer.
  useEffect(
    () => () => {
      if (settleRef.current) clearTimeout(settleRef.current.timer);
      if (tapTimer.current) clearTimeout(tapTimer.current);
    },
    [],
  );

  /* ── the hint's next nudge, three seconds after the opening or the last one ──
     Played with the Web Animations API on a wrapper around the track, so a
     nudge re-renders nothing and never remounts a slide. */
  useEffect(() => {
    if (!nudgeDue) return;
    const id = setTimeout(() => {
      // A finger on the photo, or a page settling: skip this one.
      if (!gesture.current && !settleRef.current) {
        nudgeRef.current?.animate(
          [
            { transform: "translate3d(0, 0, 0)", easing: "cubic-bezier(0.33, 0, 0.2, 1)" },
            { transform: `translate3d(0, ${-REEL_HINT_LIFT_PX}px, 0)`, offset: 0.4, easing: "cubic-bezier(0.45, 0, 0.25, 1)" },
            { transform: "translate3d(0, 0, 0)" },
          ],
          { duration: REEL_HINT_MS },
        );
      }
      setNudges((n) => n + 1);
    }, REEL_HINT_EVERY_MS);
    return () => clearTimeout(id);
  }, [nudgeDue, nudges, index]);

  /* ── the gallery's next page, asked for before it is needed ──
     Once per position: a page that fails (offline, say) leaves the count where
     it was, and asking again on every render would hammer the server in a
     loop. Moving to another photo asks again, and so does a pull past the
     last one. */
  const askedAt = useRef("");
  useEffect(() => {
    if (!hasMore || loadingMore || index < items.length - LOAD_AHEAD) return;
    const at = `${items.length}:${index}`;
    if (askedAt.current === at) return;
    askedAt.current = at;
    onLoadMore();
  }, [index, items.length, hasMore, loadingMore, onLoadMore]);

  // The neighbours load because they are mounted; the one after them is warmed
  // here, so a quick double swipe lands on a photo already in the cache.
  const warmNext = items[index + 2];
  const warmUrl = warmNext && warmNext.type !== "video" ? warmNext.url : null;
  useEffect(() => {
    if (!warmUrl) return;
    const img = new Image();
    img.decoding = "async";
    img.src = warmUrl;
  }, [warmUrl]);

  const backRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    backRef.current?.focus({ preventScroll: true });
  }, []);

  if (!item) return null;
  const isLiked = liked.has(item._id);
  const isSel = isSelected(item._id);
  // Already kept current by the gallery's optimistic like toggle.
  const likeCount = Math.max(0, item.likes_count ?? 0);
  const slides = [index - 1, index, index + 1].filter((i) => i >= 0 && i < items.length);
  const chromeStyle: React.CSSProperties = { opacity: chrome ? 1 : 0, pointerEvents: chrome ? "auto" : "none" };
  const attributionText = attribution?.(item) ?? null;

  const toggleLike = () => {
    if (!isLiked) {
      navigator.vibrate?.(10);
      setPop((n) => n + 1);
    }
    onToggleLike(item);
  };

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      className="fixed inset-0 z-[70] select-none overflow-hidden [-webkit-touch-callout:none]"
      // touch-action none: the browser must not scroll, zoom the page or pull
      // to refresh under a pager that is handling the finger itself.
      style={{ background: SIGNAL.viewer, touchAction: "none", overscrollBehavior: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {/* The swipe-up hint lifts this wrapper; the track inside follows the finger. */}
      <div ref={nudgeRef} className="absolute inset-0">
      <div
        className="absolute inset-0"
        style={{
          transform: `translate3d(0, ${drag}px, 0)`,
          transition: settling ? `transform ${REEL_ANIM_MS}ms cubic-bezier(0.22, 1, 0.36, 1)` : "none",
          willChange: "transform",
        }}
      >
        {slides.map((i) => (
          <ReelSlide
            key={items[i]._id}
            item={items[i]}
            top={(i - index) * vh}
            height={vh}
            active={i === index}
            onZoomChange={i === index ? (z) => setZoomedId(z ? items[i]._id : null) : undefined}
          />
        ))}
        {/* Under the last loaded photo, revealed by pulling past it. */}
        {!canNext && (
          <div
            className="absolute inset-x-0 flex flex-col items-center gap-3 pt-10 text-[13px] font-semibold"
            style={{ top: vh, color: "rgba(255,253,245,0.62)" }}
          >
            {loadingMore ? (
              <>
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Loading more photos
              </>
            ) : hasMore ? (
              "Pull up to load more"
            ) : (
              "That’s every photo"
            )}
          </div>
        )}
      </div>
      </div>

      {/* scrims, for the legibility of the white controls on bright photos */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-32 transition-opacity duration-200"
        style={{ opacity: chrome ? 1 : 0, background: "linear-gradient(to bottom, rgba(10,7,4,0.55), rgba(10,7,4,0))" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-60 transition-opacity duration-200"
        style={{ opacity: chrome ? 1 : 0, background: "linear-gradient(to top, rgba(10,7,4,0.6), rgba(10,7,4,0))" }}
      />

      <button
        ref={backRef}
        type="button"
        data-reel-control
        onClick={onClose}
        aria-label="Back to gallery"
        className="absolute flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-white outline-none transition-opacity duration-200 focus-visible:ring-2 focus-visible:ring-white/70"
        style={{
          ...chromeStyle,
          top: "calc(6px + env(safe-area-inset-top))",
          left: "calc(6px + env(safe-area-inset-left))",
          filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.55))",
        }}
      >
        <IconChevronLeft size={26} weight="bold" />
      </button>

      {/* The right rail. In select mode the selection toggle takes its place,
          as the selection toggle replaced the viewer's actions before. */}
      <div
        data-reel-control
        className="absolute flex flex-col items-center gap-[18px] transition-opacity duration-200"
        style={{
          ...chromeStyle,
          right: "calc(16px + env(safe-area-inset-right))",
          bottom: "calc(28px + env(safe-area-inset-bottom))",
        }}
      >
        {selectMode ? (
          <RailButton label={isSel ? "Selected" : "Select"} ariaLabel={isSel ? "Deselect" : "Select"} pressed={isSel} onClick={() => onToggleSelect(item)}>
            {isSel ? (
              <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: t.brand, color: t.onBrand }}>
                <IconCheck size={18} weight="bold" />
              </span>
            ) : (
              <span className="h-8 w-8 rounded-full border-[2.5px] border-white" />
            )}
          </RailButton>
        ) : (
          <>
            <RailButton label={likeCount > 0 ? likeCount.toLocaleString("en-IN") : "Like"} ariaLabel={isLiked ? "Unlike" : "Like"} pressed={isLiked} onClick={toggleLike}>
              <span key={pop} className={`flex ${pop > 0 && isLiked ? "like-pop" : ""}`}>
                <IconHeart size={31} filled={isLiked} weight="bold" style={{ color: isLiked ? SIGNAL.liked : "#fff" }} />
              </span>
            </RailButton>
            {canDownload && (
              <RailButton label="Download" onClick={() => onDownload(item)}>
                <IconDownload size={29} weight="bold" />
              </RailButton>
            )}
            {onCollect && (
              <RailButton label="Add" ariaLabel="Add to collection" onClick={() => onCollect(item)}>
                <IconPlus size={30} weight="bold" />
              </RailButton>
            )}
            <RailButton label="Share" onClick={() => onShare(item)}>
              <IconShare size={29} weight="bold" />
            </RailButton>
          </>
        )}
      </div>

      {/* Curators only: which collection this photo is in, and who put it
          there. Bottom-left, clear of the rail; a tap opens the Save sheet. */}
      {attributionText && (
        <button
          type="button"
          data-reel-control
          onClick={() => onCollect?.(item)}
          className="absolute truncate text-left text-[13px] font-semibold text-white outline-none transition-opacity duration-200 focus-visible:underline"
          style={{
            ...chromeStyle,
            left: "calc(16px + env(safe-area-inset-left))",
            right: "calc(84px + env(safe-area-inset-right))",
            bottom: "calc(34px + env(safe-area-inset-bottom))",
            filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.6))",
          }}
        >
          {attributionText}
        </button>
      )}

      {bursts.map((b) => (
        <span
          key={b.id}
          aria-hidden
          className="reel-heart pointer-events-none absolute"
          style={{ left: b.x, top: b.y, color: SIGNAL.liked, filter: "drop-shadow(0 6px 18px rgba(0,0,0,0.35))" }}
        >
          <IconHeart size={104} filled />
        </span>
      ))}
    </div>
  );
}

function ReelSlide({
  item,
  top,
  height,
  active,
  onZoomChange,
}: {
  item: GuestMediaItem;
  top: number;
  height: number;
  active: boolean;
  onZoomChange?: (zoomed: boolean) => void;
}) {
  const isVideo = item.type === "video";
  // A landscape photo leaves most of a phone screen empty. A blurred, darkened
  // copy of its own thumbnail behind it makes the frame feel full without
  // cropping the photo itself.
  const landscape = !isVideo && !!item.width && !!item.height && item.width > item.height;
  return (
    <div className="absolute inset-x-0 overflow-hidden" style={{ top, height }}>
      {landscape && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          aria-hidden
          src={gridSrc(item)}
          alt=""
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          style={{ filter: "blur(32px) brightness(0.45)", transform: "scale(1.1)" }}
        />
      )}
      {isVideo ? (
        <ReelVideo src={item.url} active={active} />
      ) : (
        <ZoomImage src={item.url} doubleTapZoom={false} rounded={false} onZoomChange={onZoomChange} />
      )}
    </div>
  );
}

/** Plays muted, inline and looped while it is the photo on screen; paused
 *  otherwise, so the neighbours cost nothing but their first frame. */
function ReelVideo({ src, active }: { src: string; active: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (active) v.play()?.catch(() => {});
    else v.pause();
  }, [active]);
  return (
    <video
      ref={ref}
      src={src}
      muted
      playsInline
      loop
      preload={active ? "auto" : "metadata"}
      disablePictureInPicture
      className="pointer-events-none absolute inset-0 h-full w-full object-contain"
    />
  );
}

function RailButton({
  label,
  ariaLabel,
  pressed,
  onClick,
  children,
}: {
  label: string;
  ariaLabel?: string;
  pressed?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel ?? label}
      aria-pressed={pressed}
      className="flex cursor-pointer flex-col items-center gap-1 rounded-xl text-white outline-none focus-visible:ring-2 focus-visible:ring-white/70"
      style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.55))" }}
    >
      <span className="flex h-11 w-11 items-center justify-center">{children}</span>
      <span className="text-[12px] font-semibold leading-none tabular-nums">{label}</span>
    </button>
  );
}
