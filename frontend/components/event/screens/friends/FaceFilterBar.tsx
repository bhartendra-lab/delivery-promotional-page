"use client";

/**
 * My People's face filter: narrow the feed to photos with SPECIFIC people.
 *
 * Purely local. It never changes who is in the group and never calls the
 * backend: the directory payload the guest already holds sends every person's
 * `shared` photos, and filtering is that same data run back through
 * `buildGroupFeed` with fewer people. Zero requests per tap, and nothing it
 * can show that the guest could not already see. Selection lives in
 * FriendsSurface (which builds the feed); this component only renders it.
 *
 * TWO SHAPES, ONE OBJECT. A one-line bar (the filter icon, then the faces at
 * 36px, scrolling sideways) that expands into a box of bigger faces overlaying
 * the top of the grid. It must read as the bar changing shape, not as a modal
 * appearing, so:
 *   - the box is drawn at exactly the bar's rect and its width, height,
 *     corner radius and shadow are transitioned to the box's in measured
 *     pixels (CSS transitions cannot animate to `auto`);
 *   - each face is FLIP'd: its rect in the bar is measured, the box is laid
 *     out at its final size, the new rect measured, and the face animated from
 *     the old to the new with `element.animate()` (translate + scale),
 *     staggered by 12ms; collapsing runs the same in reverse;
 *   - under `prefers-reduced-motion: reduce` there is no FLIP, only a 120ms
 *     crossfade.
 * No animation library — CSS transitions and the Web Animations API only.
 *
 * WHY THE BOX IS PORTALLED AND `position: fixed`. It overlays the grid, which
 * lives in a scroll container with transformed tiles and sticky headers, and a
 * box positioned inside that would fight every one of them. So it is drawn on
 * `document.body` at the bar's measured rect, and ANY scroll outside it
 * collapses it — which is also one of the collapse gestures asked for — so a
 * fixed box can never drift away from the bar it came from. It sits at
 * z-[35]: over the grid and the phone's control row (z-30), under the laptop's
 * sticky control row (z-40), which stays usable.
 */

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ClientTheme } from "@/lib/client-theme";
import type { FriendPerson } from "@/lib/friend-finder/types";
import { IconFunnel } from "@/components/ui/icons";
import { Avatar } from "./Avatar";

const DURATION_MS = 280;
const EASING = "cubic-bezier(0.2, 0.8, 0.2, 1)";
const STAGGER_MS = 12;
const REDUCED_MS = 120;
const BAR_HEIGHT = 52;
const BAR_FACE = 36;
/** The box's width cap on a laptop; on a phone it is the bar's own width. */
const BOX_MAX_WIDTH_DESKTOP = 560;
/** `min(50vh, 380px)`, resolved at open time in pixels. */
const boxMaxHeight = () => Math.min(window.innerHeight * 0.5, 380);

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

export function FaceFilterBar({
  t,
  members,
  selected,
  onToggle,
  onClear,
  desktop,
}: {
  t: ClientTheme;
  /** Connected (`in_group`) members only: a requested person has no shared
   *  photos, so selecting them could only empty the grid. */
  members: FriendPerson[];
  selected: ReadonlySet<string>;
  onToggle: (guestId: string) => void;
  onClear: () => void;
  desktop: boolean;
}) {
  const reduced = usePrefersReducedMotion();
  const [phase, setPhase] = useState<Phase>("closed");
  const [anchor, setAnchor] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const barFunnelRef = useRef<HTMLButtonElement>(null);
  const boxFunnelRef = useRef<HTMLButtonElement>(null);
  const barFaces = useRef(new Map<string, HTMLElement>());
  const boxFaces = useRef(new Map<string, HTMLElement>());
  /** Face rects in the bar, captured the instant before the box mounts. */
  const firstRects = useRef<Map<string, DOMRect>>(new Map());
  const closeTimer = useRef<number | null>(null);
  const boxId = useId();

  const anySelected = selected.size > 0;
  const expanded = phase === "opening" || phase === "open";
  const boxWidth = anchor ? (desktop ? Math.min(anchor.width, BOX_MAX_WIDTH_DESKTOP) : anchor.width) : 0;

  const open = useCallback(() => {
    const bar = barRef.current;
    if (!bar || phase !== "closed") return;
    const rect = bar.getBoundingClientRect();
    firstRects.current = measure(barFaces.current);
    setAnchor({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
    setPhase("opening");
  }, [phase]);

  const finishClose = useCallback(() => {
    const hadFocus = !!boxRef.current?.contains(document.activeElement);
    setPhase("closed");
    setAnchor(null);
    // Hand focus back to the bar's own filter button, so a keyboard user is
    // not dropped onto <body> when the box goes.
    if (hadFocus) window.setTimeout(() => barFunnelRef.current?.focus(), 0);
  }, []);

  const close = useCallback(() => {
    if (phase !== "open" && phase !== "opening") return;
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
    // the bar's current rect.
    const target = bar.getBoundingClientRect();
    const barRects = measure(barFaces.current);
    const faces = [...boxFaces.current.entries()];
    faces.forEach(([id, el], i) => {
      const from = el.getBoundingClientRect();
      const to = barRects.get(id);
      if (!to || !from.width) return;
      el.animate(
        [
          { transform: "translate(0px, 0px) scale(1)" },
          { transform: `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${to.width / from.width})` },
        ],
        { duration: DURATION_MS, easing: EASING, delay: (faces.length - 1 - i) * STAGGER_MS, fill: "forwards" },
      );
    });
    box.style.top = `${target.top}px`;
    box.style.left = `${target.left}px`;
    box.style.width = `${target.width}px`;
    box.style.height = `${target.height}px`;
    box.style.borderRadius = `${BAR_HEIGHT / 2}px`;
    box.style.boxShadow = "none";
    scrimRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DURATION_MS, easing: EASING, fill: "forwards" });
    closeTimer.current = window.setTimeout(finishClose, DURATION_MS + faces.length * STAGGER_MS);
  }, [phase, reduced, finishClose]);

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
    const targetHeight = Math.min(inner.scrollHeight, boxMaxHeight());
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
      [...boxFaces.current.entries()].forEach(([id, el], i) => {
        const first = firstRects.current.get(id);
        const last = el.getBoundingClientRect();
        if (!first || !last.width) return;
        el.animate(
          [
            { transform: `translate(${first.left - last.left}px, ${first.top - last.top}px) scale(${first.width / last.width})` },
            { transform: "translate(0px, 0px) scale(1)" },
          ],
          { duration: DURATION_MS, easing: EASING, delay: i * STAGGER_MS, fill: "backwards" },
        );
      });
      scrimRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DURATION_MS, easing: EASING, fill: "forwards" });
    }
    boxFunnelRef.current?.focus({ preventScroll: true });
    setPhase("open");
    // `boxWidth` and `t.shadow` are read at the moment of opening; a change to
    // either mid-animation has nothing to animate to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, anchor, reduced]);

  // Collapse gestures: Escape, and scrolling anything that is not the box
  // itself (capture phase catches every scroll container at once). Resizing
  // the window moves the bar, so it collapses too.
  useEffect(() => {
    if (phase !== "open") return;
    const onScroll = (e: Event) => {
      if (boxRef.current?.contains(e.target as Node)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      close();
    };
    document.addEventListener("scroll", onScroll, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", close);
    };
  }, [phase, close]);

  const face = (person: FriendPerson, size: number, shape: "bar" | "box") => {
    const on = selected.has(person.guest_id);
    return (
      <button
        key={person.guest_id}
        type="button"
        // Registers the face under its shape for the FLIP measurements. The
        // map is read here, in the ref callback, never during render.
        ref={(el) => {
          const refs = shape === "bar" ? barFaces.current : boxFaces.current;
          if (el) refs.set(person.guest_id, el);
          else refs.delete(person.guest_id);
        }}
        onClick={() => onToggle(person.guest_id)}
        // Names are not on screen, but a screen reader needs them.
        aria-label={person.name}
        aria-pressed={on}
        className="shrink-0 cursor-pointer rounded-full transition-opacity duration-150"
        style={{
          width: size,
          height: size,
          opacity: anySelected && !on ? 0.45 : 1,
          scrollSnapAlign: "start",
          transformOrigin: "top left",
        }}
      >
        <Avatar t={t} guestId={person.guest_id} name={person.name} url={person.avatar_url} size={size} ringed={on} />
      </button>
    );
  };

  const funnel = (ref: React.Ref<HTMLButtonElement>) => (
    <button
      ref={ref}
      type="button"
      onClick={expanded ? close : open}
      aria-label="Filter by people"
      aria-expanded={expanded}
      aria-controls={boxId}
      className="flex shrink-0 cursor-pointer items-center justify-center rounded-full"
      style={{ width: BAR_FACE, height: BAR_FACE, background: anySelected ? t.accentWash : t.sunken, color: t.brand }}
    >
      <IconFunnel size={17} weight={anySelected ? "fill" : "regular"} />
    </button>
  );

  const clear = anySelected && (
    <button
      type="button"
      onClick={onClear}
      className="shrink-0 cursor-pointer px-2 text-[12.5px] font-extrabold"
      style={{ color: t.brand }}
    >
      Clear
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
          {members.map((person) => face(person, BAR_FACE, "bar"))}
        </div>
        {clear}
      </div>

      {phase !== "closed" &&
        anchor &&
        createPortal(
          <>
            {/* The rest of the grid stays visible, under a light scrim that is
                also the tap-to-collapse target. */}
            <div
              ref={scrimRef}
              onClick={close}
              aria-hidden
              className="fixed inset-0 z-[34]"
              style={{ background: "rgba(31,26,14,0.18)", opacity: 0 }}
            />
            <div
              ref={boxRef}
              id={boxId}
              role="region"
              aria-label="Filter by people"
              className="fixed z-[35] overflow-hidden"
              style={{
                top: anchor.top,
                left: anchor.left,
                width: anchor.width,
                height: anchor.height,
                borderRadius: BAR_HEIGHT / 2,
                background: t.card,
                border: `1px solid ${t.border}`,
                fontFamily: t.font,
              }}
            >
              {/* Laid out at the box's FINAL width from the first frame, so the
                  faces' final rects exist before the box has grown into them.
                  The box clips it while the size animates. */}
              <div
                ref={innerRef}
                className="absolute left-0 top-0 overflow-y-auto pb-3 pl-2 pr-2 pt-[7px]"
                style={{ width: boxWidth, maxHeight: boxMaxHeight(), scrollbarWidth: "thin" }}
              >
                <div className="flex items-center justify-between gap-2">
                  {funnel(boxFunnelRef)}
                  {clear}
                </div>
                <div
                  className="mt-3 grid gap-3 px-1"
                  style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${desktop ? 72 : 64}px, 1fr))`, justifyItems: "center" }}
                >
                  {members.map((person) => face(person, desktop ? 72 : 64, "box"))}
                </div>
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
