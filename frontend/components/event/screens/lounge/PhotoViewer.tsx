"use client";

import { useEffect, useRef, useState } from "react";
import type { GuestMediaItem } from "@/lib/types";
import { SIGNAL } from "@/lib/client-theme";
import { shareImage } from "@/lib/media-actions";
import { useMediaQuery } from "@/lib/use-media-query";
import { useEventTheme } from "../../EventThemeContext";
import { ZoomImage } from "./ZoomImage";
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

  const step = (d: number) => {
    if (items.length < 2) return;
    if (!moved) {
      // The guest has found the arrows: no more hints this session.
      setMoved(true);
      markHintDone(sessionStore());
    }
    onNav((index + d + items.length) % items.length);
  };

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
  }, [index, items.length]);

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
        <ZoomImage key={item._id} src={item.url} />
        {items.length > 1 && (
          <>
            <button type="button" onClick={() => step(-1)} aria-label="Previous" className="absolute left-4 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-white" style={{ background: "rgba(20,16,8,0.5)" }}>
              <IconChevronLeft size={20} weight="bold" />
            </button>
            {/* The wrapper holds the place, so the hint can move the button
                itself without undoing its centring. */}
            <div className="absolute right-4 top-1/2 z-10 -translate-y-1/2">
              <button ref={nextRef} type="button" onClick={() => step(1)} aria-label="Next" className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-white" style={{ background: "rgba(20,16,8,0.5)" }}>
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

