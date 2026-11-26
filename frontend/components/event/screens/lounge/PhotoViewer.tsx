"use client";

import { useEffect, useRef, useState } from "react";
import type { GuestMediaItem } from "@/lib/types";
import { SIGNAL } from "@/lib/client-theme";
import { shareImage } from "@/lib/media-actions";
import { useMediaQuery } from "@/lib/use-media-query";
import { useEventTheme } from "../../EventThemeContext";
import { ZoomImage } from "./ZoomImage";
import { PhotoStage } from "@/components/viewer/PhotoStage";
import { gridSrc } from "@/lib/media-actions";
import { useImageWindow, useWindowSize } from "@/lib/use-image-window";
import { windowIndices, windowNeedsMore } from "@/lib/viewer-window";
import { ARROW_HINT_SHIFT_PX, REEL_HINT_EVERY_MS, REEL_HINT_MS, hintDone, markHintDone, sessionStore, wantsNudge } from "./reelHint";
import {
  IconX,
  IconHeart,
  IconDownload,
  IconShare,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconPlus,
} from "@/components/ui/icons";

/**
 * Immersive fullscreen viewer (near-black ground — never themed). Carries Like
 * (locked heart-red), Share (Web Share → local sheet, fallback copy-link) and —
 * when the studio allows it — Download. In select mode the right action becomes
 * the selection toggle.
 */
export function PhotoViewer({
  items,
  index,
  onClose,
  onNav,
  liked,
  onToggleLike,
  selectMode,
  isSelected,
  onToggleSelect,
  onToast,
  canDownload,
  onDownload,
  onCollect,
  attribution,
  hasMore = false,
  onLoadMore,
}: {
  items: GuestMediaItem[];
  index: number;
  onClose: () => void;
  onNav: (i: number) => void;
  liked: Set<string>;
  onToggleLike: (item: GuestMediaItem) => void;
  selectMode: boolean;
  /** Predicate, not a Set — see GalleryGrid: under "select all" the selection
   *  is a scope minus exclusions, not an enumerated id list. */
  isSelected: (id: string) => boolean;
  onToggleSelect: (item: GuestMediaItem) => void;
  onToast: (msg: string) => void;
  /** The event's studio preference. False renders no Download chip at all —
   *  applies to every guest, passcode-unlocked hosts included. */
  canDownload: boolean;
  /**
   * Save this photo. Owned by the gallery, not by this viewer, so the chip
   * behaves exactly like the grid tile's download button: it offers the quality
   * choice where the guest is entitled to the unwatermarked copy and the photo
   * has one, and saves straight away where it doesn't. Also owns the toast and
   * the post-download review nudge.
   */
  onDownload: (item: GuestMediaItem) => void;
  /** "Add to collection", for curators only (absent for everyone else). */
  onCollect?: (item: GuestMediaItem) => void;
  /** The curator's "Added to Priya’s Side by Manish" line for a photo. */
  attribution?: (item: GuestMediaItem) => string | null;
  /** More photos exist past the last loaded one. While true, Next on the last
   *  photo asks for the next page and waits for it instead of wrapping. */
  hasMore?: boolean;
  /** The gallery's own page loader; it guards against double requests. */
  onLoadMore?: () => void;
}) {
  const { theme: t, event } = useEventTheme();
  const item = items[index];
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");

  /* ── the Next arrow's hint (see reelHint.ts) ── */
  const [moved, setMoved] = useState(() => hintDone(sessionStore()));
  const [nudges, setNudges] = useState(0);
  const nextRef = useRef<HTMLButtonElement>(null);
  // The arrow moves, not the photo, so a zoomed photo does not stop it.
  const nudgeDue = wantsNudge({ done: moved, nudges, canNext: items.length > 1, zoomed: false, reducedMotion: reduced });

  /* ── Next on the last loaded photo while more exist: wait for the page ── */
  // Waiting is "Next was pressed on this photo": derived, so moving to any
  // other photo (or the set ending) clears it without another state write.
  const [waitingAt, setWaitingAt] = useState<number | null>(null);
  const canPage = hasMore && !!onLoadMore;
  const waitingNext = waitingAt === index && canPage;
  useEffect(() => {
    if (waitingAt !== index) return;
    if (items.length > index + 1) onNav(index + 1);
    // The set turned out to end here: wrap, as it would have.
    else if (!hasMore && items.length > 1) onNav(0);
  }, [waitingAt, items.length, hasMore, index, onNav]);

  const step = (d: number) => {
    if (items.length < 2 && !canPage) return;
    if (!moved) {
      // The guest has found the arrows: no more hints this session.
      setMoved(true);
      markHintDone(sessionStore());
    }
    setWaitingAt(null);
    if (canPage) {
      // No wrap while the list is incomplete: the "first" and "last" photos
      // are not the real ends of the gallery yet.
      if (d > 0 && index >= items.length - 1) {
        setWaitingAt(index);
        onLoadMore!();
        return;
      }
      if (d < 0 && index === 0) return;
      onNav(index + d);
      return;
    }
    onNav((index + d + items.length) % items.length);
  };

  /* ── the sliding window: 5 ahead, 3 behind, wrapping like the arrows ── */
  const win = useWindowSize();
  const windowEntries = windowIndices(index, items.length, { ...win, wrap: !canPage }).map((i) => {
    const m = items[i];
    return { full: m.type === "video" ? null : m.url, thumb: gridSrc(m) };
  });
  useImageWindow(windowEntries);
  // Ask for the next page once the window reaches past the loaded photos.
  // Once per position, as in the reel: a page that fails must not be asked
  // for again on every render.
  const askedAt = useRef("");
  useEffect(() => {
    if (!onLoadMore || !windowNeedsMore(index, items.length, hasMore, win.ahead)) return;
    const at = `${items.length}:${index}`;
    if (askedAt.current === at) return;
    askedAt.current = at;
    onLoadMore();
  }, [index, items.length, hasMore, onLoadMore, win.ahead]);

  // Three seconds after the opening or the last nudge. Played with the Web
  // Animations API on the button, so a nudge re-renders nothing.
  useEffect(() => {
    if (!nudgeDue) return;
    const id = setTimeout(() => {
      nextRef.current?.animate(
        [
          { transform: "translateX(0)" },
          { transform: `translateX(${ARROW_HINT_SHIFT_PX}px)`, offset: 0.25 },
          { transform: "translateX(0)", offset: 0.5 },
          { transform: `translateX(${ARROW_HINT_SHIFT_PX}px)`, offset: 0.75 },
          { transform: "translateX(0)" },
        ],
        { duration: REEL_HINT_MS, easing: "ease-in-out" },
      );
      setNudges((n) => n + 1);
    }, REEL_HINT_EVERY_MS);
    return () => clearTimeout(id);
  }, [nudgeDue, nudges]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, items.length, canPage]);

  if (!item) return null;
  const isLiked = liked.has(item._id);
  const isSel = isSelected(item._id);
  const likeCount = Math.max(0, item.likes_count ?? 0);
  const attributionText = attribution?.(item) ?? null;

  async function onShare() {
    const r = await shareImage(item.url, event.event_name);
    if (r === "copied") onToast("Link copied");
    else if (r === "failed") onToast("Couldn’t share");
  }
  return (
    <div className="fixed inset-0 z-[70] flex flex-col" style={{ background: SIGNAL.viewer }}>
      {/* top chrome */}
      <div className="flex items-center justify-between px-4 pt-4">
        <button type="button" onClick={onClose} aria-label="Close" className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-white" style={{ background: "rgba(255,255,255,0.14)" }}>
          <IconX size={18} />
        </button>
        <span className="text-[12.5px] font-extrabold tabular-nums" style={{ color: "rgba(255,253,245,0.7)" }}>
          {String(index + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}
        </span>
        {selectMode ? (
          <button
            type="button"
            onClick={() => onToggleSelect(item)}
            aria-label={isSel ? "Deselect" : "Select"}
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full"
            style={{ background: isSel ? t.brand : "rgba(255,255,255,0.14)", color: t.onBrand }}
          >
            {isSel ? <IconCheck size={18} weight="bold" /> : <span className="h-4 w-4 rounded-full border-2" style={{ borderColor: "rgba(255,253,245,0.75)" }} />}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            {/* The like count lives here (and not on the grid tile) since the
                masonry grid went calm. `likes_count` is already kept current
                by the gallery's optimistic like toggle, so it is read as is. */}
            <button
              type="button"
              onClick={() => onToggleLike(item)}
              aria-label={isLiked ? "Unlike" : "Like"}
              aria-pressed={isLiked}
              className={`flex h-10 cursor-pointer items-center justify-center rounded-full text-white ${likeCount > 0 ? "gap-1.5 pl-2.5 pr-3" : "w-10"}`}
              style={{ background: "rgba(255,255,255,0.14)" }}
            >
              <IconHeart size={19} filled={isLiked} style={{ color: isLiked ? SIGNAL.liked : "#fff" }} />
              {likeCount > 0 && <span className="text-[13px] font-extrabold tabular-nums">{likeCount.toLocaleString("en-IN")}</span>}
            </button>
            {onCollect && (
              <ChipButton label="Add to collection" onClick={() => onCollect(item)}>
                <IconPlus size={19} />
              </ChipButton>
            )}
            {canDownload && (
              <ChipButton label="Download" onClick={() => onDownload(item)}>
                <IconDownload size={19} />
              </ChipButton>
            )}
            {/* Web Share is a mobile affordance — hide it on desktop. */}
            <ChipButton label="Share" onClick={onShare} className="lg:hidden">
              <IconShare size={19} />
            </ChipButton>
          </div>
        )}
      </div>

      {/* image */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-3 py-4">
        <PhotoStage
          item={{ id: item._id, url: item.url, thumb: item.thumbnail_url || null, width: item.width, height: item.height }}
          rounded
          reducedMotion={reduced}
          waiting={waitingNext}
          renderFull={(p) => <ZoomImage src={p.src} enabled={p.ready} onLoad={p.onLoad} onError={p.onError} imgStyle={p.style} />}
        />
        {(items.length > 1 || canPage) && (
          <>
            <div className="absolute left-4 top-1/2 z-10 -translate-y-1/2">
              <button type="button" onClick={() => step(-1)} aria-label="Previous" className={NAV_BUTTON}>
                <IconChevronLeft size={20} weight="bold" />
              </button>
            </div>
            {/* The wrapper holds the place, so the hint can move the button
                itself without undoing its centring. */}
            <div className="absolute right-4 top-1/2 z-10 -translate-y-1/2">
              <button ref={nextRef} type="button" onClick={() => step(1)} aria-label="Next" className={NAV_BUTTON}>
                <IconChevronRight size={20} weight="bold" />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Curators only: which collection this photo is in, and who put it
          there. One line, bottom-left; a click opens the Save sheet. */}
      {attributionText && (
        <div className="flex px-5 pb-5">
          <button
            type="button"
            onClick={() => onCollect?.(item)}
            className="max-w-[min(560px,70vw)] cursor-pointer truncate rounded-full px-3 py-1.5 text-left text-[12.5px] font-semibold outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/60"
            style={{ color: "rgba(255,253,245,0.82)" }}
          >
            {attributionText}
          </button>
        </div>
      )}
    </div>
  );
}

/** Previous / Next. The pressed state (a 95% scale and a brighter fill) makes
 *  every click visibly register, even while the photo is still loading. The
 *  fill is a class, not an inline style, so `active:` can override it. */
const NAV_BUTTON =
  "flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-white bg-[rgba(20,16,8,0.5)] transition-[transform,background-color] duration-100 hover:bg-[rgba(40,34,24,0.6)] active:scale-95 active:bg-[rgba(70,62,50,0.72)]";

function ChipButton({ label, onClick, children, className = "" }: { label: string; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-white ${className}`}
      style={{ background: "rgba(255,255,255,0.14)" }}
    >
      {children}
    </button>
  );
}

