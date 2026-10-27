"use client";

/**
 * The face filter bar: narrow a grid to photos with SPECIFIC people.
 *
 * Presentational only. The caller owns the applied selection and what it does
 * (faces/useFaceFilter.ts asks the server for the selection's photos). Faces
 * only: there are no names on screen, so each face carries the label a screen
 * reader announces.
 *
 * TWO SHAPES, ONE OBJECT. A one-line bar (the filter icon, then the faces at
 * 36px, scrolling sideways) that expands into a box of bigger faces overlaying
 * the top of the grid. It must read as the bar changing shape, not as a modal
 * appearing, so:
 *   - the box is drawn at exactly the bar's rect and its width, height,
 *     corner radius and shadow are transitioned to the box's in measured
 *     pixels (CSS transitions cannot animate to `auto`);
 *   - the faces in view on the bar are FLIP'd: each one's rect in the bar is
 *     measured, the box is laid out at its final size, the new rect measured,
 *     and the face animated from the old to the new with `element.animate()`
 *     (translate + scale); collapsing runs the same in reverse;
 *   - under `prefers-reduced-motion: reduce` there is no FLIP, only a 120ms
 *     crossfade.
 * No animation library: CSS transitions and the Web Animations API only.
 *
 * MOTION STAYS SHORT WHATEVER THE NUMBER OF FACES. Only faces visible in the
 * bar's strip fly between the shapes, staggered 12ms apart for the first
 * STAGGER_CAP of them and together after that; faces hidden in the strip's
 * overflow have no place on the bar to fly from, so they fade in and out where
 * they are. Staggering every face made a gallery with a hundred people take
 * over a second to open, and on closing the faces in view moved LAST, so the
 * bar sat empty for a second or two before they arrived.
 *
 * TWO WAYS TO PICK.
 *   - On the bar, a tap filters straight away (the hook settles rapid taps).
 *   - In the box, taps only PICK. The box holds its own draft and nothing loads
 *     until its button ("Show photos"). Filtering on every tap reloaded the
 *     grid under the box each time, and on a laptop the page moving under it
 *     collapsed it mid-choice. Closing it any other way (a tap on the scrim or
 *     anywhere outside, Escape, the filter button) drops the draft and leaves
 *     the filter as it was, the way closing a filter sheet does.
 *
 * WHY THE BOX IS PORTALLED AND `position: fixed`. It overlays the grid, which
 * lives in a scroll container with transformed tiles and sticky headers, and a
 * box positioned inside that would fight every one of them. So it is drawn on
 * `document.body` at the bar's measured rect. When the page moves under it by
 * itself (a banner appearing above, the window resizing) the box FOLLOWS the
 * bar: that is not the guest scrolling, and collapsing on it is what closed
 * the box mid-choice. A scroll gesture outside it (a wheel, a drag on the
 * scrim) does collapse it, as scrolling away would, but never over picks still
 * waiting for the button. It sits at z-[53], with its scrim at z-[52]: the
 * bar lives inside the pinned header on both shells now (the phone's control
 * row, the laptop's sticky control row at z-40), so the box opens over that
 * header, and over the top bars (z-40 phone, z-50 laptop). Below the review
 * nudge (z-[55]), the sheets and the viewer. A click on the scrim, anywhere
 * outside the box, collapses it.
 */

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ClientTheme } from "@/lib/client-theme";
import { IconFunnel } from "@/components/ui/icons";
import { draftAction, FACE_FILTER_MAX_SELECTED, toggleSelection, type DraftAction } from "@/lib/face-filter/query";

/** One face on the bar. `thumb_url` is a square crop (the backend's 256px
 *  WebP); null or a failed load shows a plain disc instead. */
export type FaceFilterFace = { id: string; thumb_url: string | null; label: string };

const DURATION_MS = 280;
const EASING = "cubic-bezier(0.2, 0.8, 0.2, 1)";
const STAGGER_MS = 12;
/** Faces past this many move together, so the stagger never adds more than
 *  about 100ms however long the bar is. */
const STAGGER_CAP = 8;
/** Faces with nowhere to fly from or to, and the box's own text, fade this fast. */
const FADE_MS = 160;
const REDUCED_MS = 120;
const BAR_HEIGHT = 52;
const BAR_FACE = 36;
/** The box's width cap on a laptop; on a phone it is the bar's own width. */
const BOX_MAX_WIDTH_DESKTOP = 560;
/** The box's height cap for a bar whose top is at `top`: `min(60vh, 440px)`
 *  in pixels (a few rows of faces above the box's button), and never past
 *  the bottom of the screen, where the button would be out of reach. */
const boxMaxHeight = (top: number) =>
  Math.max(BOX_MIN_HEIGHT, Math.min(window.innerHeight * 0.6, 440, window.innerHeight - top - 16));
/** One row of faces between the header and the button: the floor, for a page
 *  too short to bring the bar any higher. */
const BOX_MIN_HEIGHT = 220;
/** With less room than this under the bar's top (a laptop with the bar just
 *  under the cover, say), the bar is brought to mid-screen before opening. */
const MIN_ROOM = 300;

const ACTION_LABEL: Record<DraftAction, string> = {
  done: "Done",
  show: "Show photos",
  "show-all": "Show all photos",
};

function pickedLabel(n: number): string {
  if (n === 0) return "Tap the people you want to see";
  if (n >= FACE_FILTER_MAX_SELECTED) return `${n} people picked, the most at once`;
  return n === 1 ? "1 person picked" : `${n} people picked`;
}

type Phase = "closed" | "opening" | "open" | "closing";

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/** Rects of every face currently mounted in one of the two shapes. */
function measure(refs: Map<string, HTMLElement>): Map<string, DOMRect> {
  const out = new Map<string, DOMRect>();
  for (const [id, el] of refs) out.set(id, el.getBoundingClientRect());
  return out;
}

/** Is a face on the bar inside the strip's visible part (not scrolled off
 *  either end)? Only those fly between the shapes. */
function inStrip(r: DOMRect, strip: DOMRect): boolean {
  return r.width > 0 && r.right > strip.left + 1 && r.left < strip.right - 1;
}

/**
 * One face, as an image. Taken from friends/Avatar.tsx rather than imported, so
 * the gallery does not pull in the friends chunk: fixed size so the bar
 * reserves its box before the image lands, lazy so a long bar does not fetch
 * every crop at once, and a ring in the accent colour when selected. The dim
 * for "not picked" lives here rather than on the button, so the button's own
 * opacity is free for the fade animations.
 */
function FaceThumb({ t, url, size, ringed, dimmed }: { t: ClientTheme; url: string | null; size: number; ringed: boolean; dimmed: boolean }) {
  const [failed, setFailed] = useState(false);
  const showImage = !!url && !failed;
  return (
    <span
      aria-hidden
      className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-full transition-opacity duration-150"
      style={{
        width: size,
        height: size,
        background: t.sunken,
        boxShadow: ringed ? `0 0 0 2px ${t.brand}` : undefined,
        opacity: dimmed ? 0.45 : 1,
      }}
    >
      {showImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      )}
    </span>
  );
}

export function FaceFilterBar({
  t,
  faces,
  selected,
  onToggle,
  onApply,
  onClear,
  desktop,
}: {
  t: ClientTheme;
  /** In chip order. Only faces that can narrow the grid: each one is in at
   *  least one photo the viewer can open. */
  faces: FaceFilterFace[];
  /** The applied selection: what the grid is filtered by. */
  selected: ReadonlySet<string>;
  /** A tap on the bar: filters straight away. */
  onToggle: (id: string) => void;
  /** The open box's button: every pick made in it, at once. */
  onApply: (ids: string[]) => void;
  /** The bar's Clear: unfilters straight away. */
  onClear: () => void;
  desktop: boolean;
}) {
  const reduced = usePrefersReducedMotion();
  const [phase, setPhase] = useState<Phase>("closed");
  const [anchor, setAnchor] = useState<{ top: number; left: number; width: number; height: number; maxHeight: number } | null>(null);
  /** The box's picks. Seeded from the applied selection each time it opens,
   *  and applied only by its button. */
  const [draft, setDraft] = useState<string[]>([]);
  const barRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLSpanElement>(null);
  const footRef = useRef<HTMLDivElement>(null);
  const barFunnelRef = useRef<HTMLButtonElement>(null);
  const boxFunnelRef = useRef<HTMLButtonElement>(null);
  const barFaces = useRef(new Map<string, HTMLElement>());
  const boxFaces = useRef(new Map<string, HTMLElement>());
  /** Face rects in the bar, and the strip's visible rect, captured the instant
   *  before the box mounts. */
  const firstRects = useRef<Map<string, DOMRect>>(new Map());
  const firstStrip = useRef<DOMRect | null>(null);
  const closeTimer = useRef<number | null>(null);
  const boxId = useId();

  const anySelected = selected.size > 0;
  const draftSet = useMemo(() => new Set(draft), [draft]);
  const expanded = phase === "opening" || phase === "open";
  const action = draftAction(draft, [...selected]);
  /** Picks are waiting for the button: a stray scroll must not throw them away. */
  const dirty = action !== "done";
  const boxWidth = anchor ? (desktop ? Math.min(anchor.width, BOX_MAX_WIDTH_DESKTOP) : anchor.width) : 0;

  const open = useCallback(() => {
    const bar = barRef.current;
    if (!bar || phase !== "closed") return;
    let rect = bar.getBoundingClientRect();
    if (window.innerHeight - rect.top < MIN_ROOM) {
      bar.scrollIntoView({ block: "center", behavior: "instant" });
      rect = bar.getBoundingClientRect();
    }
    firstRects.current = measure(barFaces.current);
    firstStrip.current = stripRef.current?.getBoundingClientRect() ?? rect;
    setDraft([...selected]);
    setAnchor({ top: rect.top, left: rect.left, width: rect.width, height: rect.height, maxHeight: boxMaxHeight(rect.top) });
    setPhase("opening");
  }, [phase, selected]);

  const finishClose = useCallback(() => {
    const hadFocus = !!boxRef.current?.contains(document.activeElement);
    setPhase("closed");
    setAnchor(null);
    // Hand focus back to the bar's own filter button, so a keyboard user is
    // not dropped onto <body> when the box goes.
    if (hadFocus) window.setTimeout(() => barFunnelRef.current?.focus(), 0);
  }, []);

  /** The box back into the bar. Callers check the phase. */
  const collapse = useCallback(() => {
    const box = boxRef.current;
    const bar = barRef.current;
    setPhase("closing");
    if (!box || !bar || reduced) {
      box?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: REDUCED_MS, fill: "forwards" });
      scrimRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: REDUCED_MS, fill: "forwards" });
      closeTimer.current = window.setTimeout(finishClose, REDUCED_MS);
      return;
    }
    // The reverse FLIP: from where each face is in the box to where it sits in
    // the bar (still laid out underneath, just hidden), and the box back to
    // the bar's current rect. In chip order, so the first face on the bar
    // lands first.
    const target = bar.getBoundingClientRect();
    const strip = stripRef.current?.getBoundingClientRect() ?? target;
    const barRects = measure(barFaces.current);
    let flown = 0;
    for (const [id, el] of boxFaces.current) {
      const from = el.getBoundingClientRect();
      const to = barRects.get(id);
      if (!from.width) continue;
      if (to && inStrip(to, strip)) {
        el.animate(
          [
            { transform: "translate(0px, 0px) scale(1)" },
            { transform: `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${to.width / from.width})` },
          ],
          { duration: DURATION_MS, easing: EASING, delay: Math.min(flown, STAGGER_CAP) * STAGGER_MS, fill: "forwards" },
        );
        flown += 1;
      } else {
        el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, easing: EASING, fill: "forwards" });
      }
    }
    // The box's own text goes first, so the faces landing on the bar's line
    // do not cross it.
    for (const el of [headRef.current, footRef.current]) {
      el?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, easing: EASING, fill: "forwards" });
    }
    box.style.top = `${target.top}px`;
    box.style.left = `${target.left}px`;
    box.style.width = `${target.width}px`;
    box.style.height = `${target.height}px`;
    box.style.borderRadius = `${BAR_HEIGHT / 2}px`;
    box.style.boxShadow = "none";
    scrimRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DURATION_MS, easing: EASING, fill: "forwards" });
    closeTimer.current = window.setTimeout(finishClose, DURATION_MS + Math.min(flown, STAGGER_CAP) * STAGGER_MS);
  }, [reduced, finishClose]);

  /** Close without applying: the draft goes, the filter stays as it was. The
   *  draft is reset first so the faces fly back showing the bar's state. */
  const dismiss = useCallback(() => {
    if (phase !== "open") return;
    setDraft([...selected]);
    collapse();
  }, [phase, selected, collapse]);

  /** The box's button: apply the picks (if they changed anything), then close.
   *  The grid's reload starts behind the collapse, not under the open box. */
  const confirm = useCallback(() => {
    if (phase !== "open") return;
    if (draftAction(draft, [...selected]) !== "done") onApply(draft);
    collapse();
  }, [phase, draft, selected, onApply, collapse]);

  useEffect(
    () => () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
    },
    [],
  );

  // The forward animation, once the box is in the DOM at the bar's rect.
  useLayoutEffect(() => {
    if (phase !== "opening" || !anchor) return;
    const box = boxRef.current;
    const inner = innerRef.current;
    if (!box || !inner) return;
    const targetHeight = Math.min(inner.scrollHeight, anchor.maxHeight);
    if (reduced) {
      box.style.width = `${boxWidth}px`;
      box.style.height = `${targetHeight}px`;
      box.style.borderRadius = "24px";
      box.style.boxShadow = t.shadow;
      box.animate([{ opacity: 0 }, { opacity: 1 }], { duration: REDUCED_MS });
      scrimRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: REDUCED_MS, fill: "forwards" });
    } else {
      // Commit the starting size before switching to the target one, so the
      // browser has two computed styles to transition between.
      void box.getBoundingClientRect();
      box.style.transition = ["width", "height", "border-radius", "box-shadow", "top", "left"]
        .map((prop) => `${prop} ${DURATION_MS}ms ${EASING}`)
        .join(", ");
      box.style.width = `${boxWidth}px`;
      box.style.height = `${targetHeight}px`;
      box.style.borderRadius = "24px";
      box.style.boxShadow = t.shadow;
      // FLIP: faces are already laid out at their final place inside the box
      // (the inner layer has the box's final width from the start), so the
      // "last" rect is just where they are now.
      const strip = firstStrip.current;
      let flown = 0;
      for (const [id, el] of boxFaces.current) {
        const first = firstRects.current.get(id);
        const last = el.getBoundingClientRect();
        if (!last.width) continue;
        if (first && strip && inStrip(first, strip)) {
          el.animate(
            [
              { transform: `translate(${first.left - last.left}px, ${first.top - last.top}px) scale(${first.width / last.width})` },
              { transform: "translate(0px, 0px) scale(1)" },
            ],
            { duration: DURATION_MS, easing: EASING, delay: Math.min(flown, STAGGER_CAP) * STAGGER_MS, fill: "backwards" },
          );
          flown += 1;
        } else {
          el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DURATION_MS, easing: EASING, delay: FADE_MS / 2, fill: "backwards" });
        }
      }
      for (const el of [headRef.current, footRef.current]) {
        el?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: EASING, delay: DURATION_MS / 2, fill: "backwards" });
      }
      scrimRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DURATION_MS, easing: EASING, fill: "forwards" });
    }
    boxFunnelRef.current?.focus({ preventScroll: true });
    setPhase("open");
    // `boxWidth` and `t.shadow` are read at the moment of opening; a change to
    // either mid-animation has nothing to animate to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, anchor, reduced]);

  // While open: follow the bar when the page moves by itself; collapse on a
  // click outside, Escape, or a scroll gesture outside (unless picks wait).
  useEffect(() => {
    if (phase !== "open") return;
    const outside = (e: Event) => !boxRef.current?.contains(e.target as Node);
    let frame = 0;
    const follow = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const bar = barRef.current;
        const box = boxRef.current;
        const inner = innerRef.current;
        if (!bar || !box || !inner) return;
        const r = bar.getBoundingClientRect();
        const width = desktop ? Math.min(r.width, BOX_MAX_WIDTH_DESKTOP) : r.width;
        const maxHeight = boxMaxHeight(r.top);
        box.style.top = `${r.top}px`;
        box.style.left = `${r.left}px`;
        box.style.width = `${width}px`;
        inner.style.width = `${width}px`;
        inner.style.maxHeight = `${maxHeight}px`;
        box.style.height = `${Math.min(inner.scrollHeight, maxHeight)}px`;
      });
    };
    const onScroll = (e: Event) => {
      if (outside(e)) follow();
    };
    const onGesture = (e: Event) => {
      if (outside(e) && !dirty) dismiss();
    };
    const onClick = (e: MouseEvent) => {
      if (outside(e)) dismiss();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      dismiss();
    };
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", follow);
    document.addEventListener("wheel", onGesture, { capture: true, passive: true });
    document.addEventListener("touchmove", onGesture, { capture: true, passive: true });
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", follow);
      document.removeEventListener("wheel", onGesture, true);
      document.removeEventListener("touchmove", onGesture, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [phase, dirty, dismiss, desktop]);

  const face = (person: FaceFilterFace, size: number, shape: "bar" | "box") => {
    const picks = shape === "bar" ? selected : draftSet;
    const on = picks.has(person.id);
    return (
      <button
        key={person.id}
        type="button"
        // Registers the face under its shape for the FLIP measurements. The
        // map is read here, in the ref callback, never during render.
        ref={(el) => {
          const refs = shape === "bar" ? barFaces.current : boxFaces.current;
          if (el) refs.set(person.id, el);
          else refs.delete(person.id);
        }}
        onClick={() => (shape === "bar" ? onToggle(person.id) : setDraft((d) => toggleSelection(d, person.id)))}
        // Nothing is written on screen, but a screen reader needs a label.
        aria-label={person.label}
        aria-pressed={on}
        className="shrink-0 cursor-pointer rounded-full"
        style={{ width: size, height: size, scrollSnapAlign: "start", transformOrigin: "top left" }}
      >
        <FaceThumb t={t} url={person.thumb_url} size={size} ringed={on} dimmed={picks.size > 0 && !on} />
      </button>
    );
  };

  const funnel = (ref: React.Ref<HTMLButtonElement>) => (
    <button
      ref={ref}
      type="button"
      onClick={expanded ? dismiss : open}
      aria-label="Filter by people"
      aria-expanded={expanded}
      aria-controls={boxId}
      className="flex shrink-0 cursor-pointer items-center justify-center rounded-full"
      style={{ width: BAR_FACE, height: BAR_FACE, background: anySelected ? t.accentWash : t.sunken, color: t.brand }}
    >
      <IconFunnel size={17} weight={anySelected ? "fill" : "regular"} />
    </button>
  );

  return (
    <>
      <div
        ref={barRef}
        className="flex items-center gap-2 rounded-full pl-2 pr-1"
        style={{
          height: BAR_HEIGHT,
          background: t.card,
          border: `1px solid ${t.border}`,
          // Kept in the layout while the box is up, so the grid does not jump
          // and the reverse animation has somewhere to land.
          visibility: phase === "closed" ? "visible" : "hidden",
        }}
      >
        {funnel(barFunnelRef)}
        <div
          ref={stripRef}
          className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto py-1 [&::-webkit-scrollbar]:hidden"
          style={{
            scrollbarWidth: "none",
            scrollSnapType: "x proximity",
            // A soft fade at the right edge says "there is more this way"
            // without a scrollbar.
            maskImage: "linear-gradient(to right, #000 calc(100% - 24px), transparent)",
            WebkitMaskImage: "linear-gradient(to right, #000 calc(100% - 24px), transparent)",
          }}
        >
          {faces.map((person) => face(person, BAR_FACE, "bar"))}
        </div>
        {anySelected && (
          <button
            type="button"
            onClick={onClear}
            className="shrink-0 cursor-pointer px-2 text-[12.5px] font-extrabold"
            style={{ color: t.brand }}
          >
            Clear
          </button>
        )}
      </div>

      {phase !== "closed" &&
        anchor &&
        createPortal(
          <>
            {/* The rest of the grid stays visible, under a light scrim. A tap
                on it (or anywhere outside the box) closes the box; that is the
                document listener above, not a handler here. */}
            <div
              ref={scrimRef}
              aria-hidden
              className="fixed inset-0 z-[52]"
              style={{ background: "rgba(31,26,14,0.18)", opacity: 0 }}
            />
            <div
              ref={boxRef}
              id={boxId}
              role="region"
              aria-label="Filter by people"
              className="fixed z-[53] overflow-hidden"
              style={{
                top: anchor.top,
                left: anchor.left,
                width: anchor.width,
                height: anchor.height,
                borderRadius: BAR_HEIGHT / 2,
                background: t.card,
                border: `1px solid ${t.border}`,
                fontFamily: t.font,
                // Mid-collapse the faces are flying home; a tap then would pick
                // into a draft that is already gone.
                pointerEvents: phase === "closing" ? "none" : undefined,
              }}
            >
              {/* Laid out at the box's FINAL width from the first frame, so the
                  faces' final rects exist before the box has grown into them.
                  The box clips it while the size animates. The faces scroll
                  under a fixed footer; the header scrolls with them, so the
                  bar's line is inside the scroller and the FLIP is never
                  clipped on its way in or out. */}
              <div
                ref={innerRef}
                className="absolute left-0 top-0 flex flex-col"
                style={{ width: boxWidth, maxHeight: anchor.maxHeight }}
              >
                <div className="min-h-0 flex-1 overflow-y-auto pb-3 pl-2 pr-2 pt-[7px]" style={{ scrollbarWidth: "thin" }}>
                  <div className="flex items-center gap-2.5">
                    {funnel(boxFunnelRef)}
                    <span ref={headRef} aria-live="polite" className="min-w-0 truncate text-[13px] font-bold" style={{ color: t.muted }}>
                      {pickedLabel(draft.length)}
                    </span>
                  </div>
                  <div
                    className="mt-3 grid gap-3 px-1"
                    style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${desktop ? 72 : 64}px, 1fr))`, justifyItems: "center" }}
                  >
                    {faces.map((person) => face(person, desktop ? 72 : 64, "box"))}
                  </div>
                </div>
                <div
                  ref={footRef}
                  className="flex shrink-0 items-center justify-between gap-2 px-3 py-2.5"
                  style={{ borderTop: `1px solid ${t.border}` }}
                >
                  {draft.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setDraft([])}
                      className="cursor-pointer px-2 py-2 text-[13px] font-extrabold"
                      style={{ color: t.brand }}
                    >
                      Clear
                    </button>
                  ) : (
                    <span />
                  )}
                  <button
                    type="button"
                    onClick={confirm}
                    className="cursor-pointer rounded-full px-5 py-2.5 text-[13px] font-extrabold"
                    style={{ background: t.brand, color: t.onBrand }}
                  >
                    {ACTION_LABEL[action]}
                  </button>
                </div>
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
