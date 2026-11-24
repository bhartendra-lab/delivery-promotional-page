"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ClientTheme } from "@/lib/client-theme";
import {
  SKIP_HINT,
  TARGET_WAIT_MS,
  TOURS,
  TOUR_CHROME,
  TOUR_ORDER,
  chainedTour,
  nextTourToStart,
  stepCopy,
  stepInteractive,
  stepTargets,
  tourSeenKey,
  type TourAction,
  type TourId,
  type TourLang,
  type TourStep,
  type TourTarget,
} from "@/lib/client-tour";

/**
 * The Client's guided tour, drawn over the lounge (lib/client-tour.ts has the
 * script and why). One spotlight follows the step's target — found by
 * `data-tour="…"` anywhere on the page, sheets included — and everything
 * outside it is locked: a click there only nudges the card. The highlighted
 * control itself works as normal, which is how "tap" steps move on.
 *
 * "Seen" is kept per event in this browser. Skipping marks every part seen and
 * points at the profile, where "Watch the tour" (`replaySeq`) starts again.
 */

type Run = { tour: TourId; index: number } | { hint: true };
type Rect = { top: number; left: number; width: number; height: number };

const PAD = 6;

function readSeen(uid: string): Partial<Record<TourId, boolean>> {
  const seen: Partial<Record<TourId, boolean>> = {};
  for (const id of TOUR_ORDER) {
    try {
      seen[id] = window.localStorage.getItem(tourSeenKey(uid, id)) === "1";
    } catch {
      // Storage blocked (private mode): the tour may show again next visit.
    }
  }
  return seen;
}
function writeSeen(uid: string, ids: readonly TourId[], on: boolean) {
  for (const id of ids) {
    try {
      if (on) window.localStorage.setItem(tourSeenKey(uid, id), "1");
      else window.localStorage.removeItem(tourSeenKey(uid, id));
    } catch {
      // see readSeen
    }
  }
}

/** The tour's own layer, which hit tests must look through. */
const LAYER_ATTR = "data-tour-layer";

/** Taller than this share of the screen, a target is "tall" (the People
 *  list): it is enough that its top is in view, and it is scrolled to by its
 *  top rather than its middle. */
const TALL = 0.5;
const isTall = (r: DOMRect) => r.height > window.innerHeight * TALL;

/**
 * Can the Client actually see and press this element right now? Its box must
 * be (nearly) all on screen — a tall one such as the People list only needs its
 * top in the upper part of the screen — and the thing on top at the centre of
 * what shows must be the element itself, not a sticky header or a card that
 * happens to sit over it. Without that check the spotlight once lit up a "⋯"
 * scrolled under the gallery's sticky filter row, so the Client saw the filter
 * menu inside the ring and was told to tap "⋯".
 */
function usable(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return false;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const top = Math.max(0, r.top);
  const bottom = Math.min(vh, r.bottom);
  const left = Math.max(0, r.left);
  const right = Math.min(vw, r.right);
  if (bottom <= top || right <= left) return false;
  if (isTall(r)) {
    if (r.top < -2 || r.top > vh * 0.6) return false;
  } else if ((bottom - top) * (right - left) < r.width * r.height * 0.85) return false;
  const x = (left + right) / 2;
  const y = (top + bottom) / 2;
  const hit = document.elementsFromPoint(x, y).find((n) => !n.closest(`[${LAYER_ATTR}]`));
  return !!hit && (el === hit || el.contains(hit));
}

/** The element for a target nearest the middle of the screen: one the Client
 *  can use now if there is any (a grid has a "⋯" per photo), else one laid
 *  out at all, to scroll to. */
function findTarget(target: TourTarget): { el: HTMLElement; visible: boolean } | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`));
  let best: { el: HTMLElement; visible: boolean; dist: number } | null = null;
  for (const el of all) {
    if (el.closest("[inert],[aria-hidden='true']")) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    const visible = usable(el);
    if (best?.visible && !visible) continue;
    const dist = Math.hypot(r.left + r.width / 2 - window.innerWidth / 2, r.top + r.height / 2 - window.innerHeight / 2);
    if (!best || (visible && !best.visible) || dist < best.dist) best = { el, visible, dist };
  }
  return best && { el: best.el, visible: best.visible };
}

function onScreen(target: TourTarget) {
  return findTarget(target)?.visible === true;
}

/** Is any of the step's targets still on the page at all (covered or not)? */
function present(step: TourStep) {
  return stepTargets(step).some((target) => findTarget(target) != null);
}

/** The box around every visible target of a step, padded and kept on screen. */
function measure(step: TourStep): { rect: Rect | null; offscreen: HTMLElement | null } {
  let top = Infinity, left = Infinity, right = -Infinity, bottom = -Infinity;
  let offscreen: HTMLElement | null = null;
  for (const target of stepTargets(step)) {
    const found = findTarget(target);
    if (!found) continue;
    if (!found.visible) {
      offscreen ??= found.el;
      continue;
    }
    const r = found.el.getBoundingClientRect();
    top = Math.min(top, r.top);
    left = Math.min(left, r.left);
    right = Math.max(right, r.right);
    bottom = Math.max(bottom, r.bottom);
  }
  if (top === Infinity) return { rect: null, offscreen };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const t = Math.max(4, top - PAD);
  const l = Math.max(4, left - PAD);
  return { rect: { top: t, left: l, width: Math.min(vw - 4, right + PAD) - l, height: Math.min(vh - 4, bottom + PAD) - t }, offscreen: null };
}

const sameRect = (a: Rect | null, b: Rect | null) =>
  a === b || (!!a && !!b && Math.abs(a.top - b.top) < 0.5 && Math.abs(a.left - b.left) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5);

export function ClientTour({
  t,
  uid,
  lang,
  studio,
  eligible,
  idle,
  replaySeq,
  onAction,
  onRunningChange,
}: {
  t: ClientTheme;
  /** The event's slug: "seen" is remembered per event. */
  uid: string;
  lang: TourLang;
  /** The studio as curator copy names it. */
  studio: string;
  /** A Client with collections on. */
  eligible: boolean;
  /** Nothing else is up (intake, passcode, a viewer…): only gates a START. */
  idle: boolean;
  /** Bumped by the profile's "Watch the tour". */
  replaySeq: number;
  onAction: (action: TourAction) => void;
  /** The tour started or ended: the page holds back its own pop-ups (the
   *  review nudge) meanwhile. */
  onRunningChange?: (running: boolean) => void;
}) {
  const [runState, setRun] = useState<Run | null>(null);
  // A Client who stops being one mid-tour (the studio changed it) loses it.
  const run = eligible ? runState : null;
  const seenRef = useRef<Partial<Record<TourId, boolean>>>({});
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    let live = true;
    // Deferred: storage is only there in the browser, and setState must not
    // run in the effect body itself.
    void Promise.resolve().then(() => {
      if (!live) return;
      seenRef.current = readSeen(uid);
      setMounted(true);
    });
    return () => {
      live = false;
    };
  }, [uid]);

  /* ── starting ── */
  const faceMissingSince = useRef<number | null>(null);
  useEffect(() => {
    if (!mounted || run || !eligible || !idle) return;
    const id = window.setInterval(() => {
      const photos = onScreen("photo-menu");
      const faces = onScreen("face-bar");
      if (photos && !faces) faceMissingSince.current ??= Date.now();
      else faceMissingSince.current = null;
      const next = nextTourToStart({
        seen: seenRef.current,
        onScreen,
        faceBarMissingMs: faceMissingSince.current == null ? 0 : Date.now() - faceMissingSince.current,
      });
      if (next) setRun({ tour: next, index: 0 });
    }, 700);
    return () => window.clearInterval(id);
  }, [mounted, run, eligible, idle]);

  // Replay from the profile: forget every part and start again.
  const lastReplay = useRef(replaySeq);
  useEffect(() => {
    if (replaySeq === lastReplay.current) return;
    lastReplay.current = replaySeq;
    writeSeen(uid, TOUR_ORDER, false);
    seenRef.current = {};
    setRun({ tour: "guest-control", index: 0 });
  }, [replaySeq, uid]);

  /* ── moving through ── */
  const markSeen = useCallback(
    (ids: readonly TourId[]) => {
      writeSeen(uid, ids, true);
      for (const id of ids) seenRef.current[id] = true;
    },
    [uid],
  );

  const advance = useCallback(() => {
    setRun((r) => {
      if (!r || "hint" in r) return null;
      const steps = TOURS[r.tour];
      if (r.index + 1 < steps.length) return { tour: r.tour, index: r.index + 1 };
      markSeen([r.tour]);
      const chained = chainedTour(r.tour);
      return chained && !seenRef.current[chained] ? { tour: chained, index: 0 } : null;
    });
  }, [markSeen]);

  const skip = useCallback(() => {
    markSeen(TOUR_ORDER);
    setRun({ hint: true });
  }, [markSeen]);

  const running = !!run;
  const runningRef = useRef(onRunningChange);
  useEffect(() => {
    runningRef.current = onRunningChange;
  }, [onRunningChange]);
  useEffect(() => {
    runningRef.current?.(running);
  }, [running]);

  const step: TourStep | null = !run ? null : "hint" in run ? SKIP_HINT : TOURS[run.tour][run.index];
  const stepId = !run ? "" : "hint" in run ? "hint" : `${run.tour}:${run.index}`;
  const position = run && !("hint" in run) ? { n: run.index + 1, total: TOURS[run.tour].length } : null;

  // The step's own action, once, as it opens.
  const actionRef = useRef(onAction);
  useEffect(() => {
    actionRef.current = onAction;
  }, [onAction]);
  useEffect(() => {
    if (step?.action) actionRef.current(step.action);
  }, [stepId, step?.action]);

  /* ── following the target ── */
  /** The spotlight's box, and whether the target has had its chance to
   *  appear — both for one step, so a new step starts from nothing. */
  const [track, setTrack] = useState<{ id: string; rect: Rect | null; settled: boolean }>({ id: "", rect: null, settled: false });
  const rect = track.id === stepId ? track.rect : null;
  const settled = !!step && (stepTargets(step).length === 0 || (track.id === stepId && track.settled));
  useLayoutEffect(() => {
    if (!step || stepTargets(step).length === 0) return;
    const id = stepId;
    const setRect = (r: Rect | null) => setTrack((s) => ({ id, rect: r, settled: s.id === id && s.settled }));
    const setSettled = () => setTrack((s) => (s.id === id && s.settled ? s : { id, rect: s.id === id ? s.rect : null, settled: true }));
    const startedAt = Date.now();
    let seenOnce = false;
    let goneAt: number | null = null;
    let scrolled = false;
    let frame = 0;
    let last: Rect | null = null;
    const tick = () => {
      const { rect: r, offscreen } = measure(step);
      if (offscreen && !scrolled) {
        scrolled = true;
        offscreen.scrollIntoView({ block: isTall(offscreen.getBoundingClientRect()) ? "start" : "center", behavior: "smooth" });
      }
      if (r) {
        seenOnce = true;
        goneAt = null;
        setSettled();
      } else if (seenOnce && step.advance === "gone") {
        // Gone means closed, not merely covered (a dialog over the sheet).
        if (present(step)) goneAt = null;
        else {
          goneAt ??= Date.now();
          if (Date.now() - goneAt > 350) {
            advance();
            return;
          }
        }
      } else if (!seenOnce && Date.now() - startedAt > TARGET_WAIT_MS) {
        if (step.optional) {
          advance();
          return;
        }
        setSettled(); // shown as a centred card
      }
      // Once seen, a vanishing target keeps its last box: no flash of a
      // centred card while the step moves on.
      if (!sameRect(r, last) && (r || !seenOnce)) {
        last = r;
        setRect(r);
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepId]);

  // "tap" steps: the Client pressed the highlighted control.
  useEffect(() => {
    if (!step || step.advance !== "tap") return;
    const targets = stepTargets(step);
    const onClick = (e: MouseEvent) => {
      const el = e.target as Element | null;
      if (targets.some((id) => el?.closest?.(`[data-tour="${id}"]`))) window.setTimeout(advance, 60);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [stepId, step, advance]);

  // Escape skips (sheets underneath close on it too).
  useEffect(() => {
    if (!step) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if ("hint" in (run ?? {})) setRun(null);
      else skip();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, run, skip]);

  /* ── a click on the locked area nudges the card ── */
  const [nudgeState, setNudge] = useState({ id: "", n: 0 });
  const nudge = nudgeState.id === stepId ? nudgeState.n : 0;
  const blocked = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setNudge((s) => ({ id: stepId, n: s.id === stepId ? s.n + 1 : 1 }));
  };

  if (!mounted || !step) return null;
  // Waiting for the step's target (a sheet still opening): locked, nothing drawn.
  if (!settled) return createPortal(<div data-tour-layer="" className="fixed inset-0 z-[2000]" onClick={blocked} />, document.body);

  const copy = stepCopy(step, lang, studio);
  const chrome = TOUR_CHROME[lang];
  const interactive = stepInteractive(step) && !!rect;
  // The Client has to press the spot: make it unmissable.
  const tap = step.advance === "tap" && !!rect;
  const finish = () => {
    if ("hint" in (run ?? {})) setRun(null);
    else advance();
  };

  return createPortal(
    <div data-tour-layer="" className="pointer-events-none fixed inset-0 z-[2000] [&>*]:pointer-events-auto" style={{ fontFamily: t.font }} role="dialog" aria-modal="true" aria-labelledby="client-tour-title">
      {rect ? (
        <>
          <div
            className="tour-spot fixed"
            style={{
              pointerEvents: "none",
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
              borderRadius: Math.min(18, rect.height / 2),
              boxShadow: "0 0 0 200vmax rgba(14,10,6,0.72)",
            }}
          >
            {/* Always there: a thick brand ring with a white edge and a glow,
                so the spot reads as "this one" even on a busy photo. */}
            <div
              className={`${tap ? "tour-glow" : ""} absolute inset-0`}
              style={{
                borderRadius: "inherit",
                border: `3px solid ${t.brand}`,
                boxShadow: `0 0 0 2px rgba(255,255,255,0.9), 0 0 24px 6px color-mix(in srgb, ${t.brand} 60%, transparent)`,
              }}
            />
            {/* A tap step also sends ripples out of it, like a press. */}
            {tap && (
              <>
                <div className="tour-ripple absolute inset-0" style={{ borderRadius: "inherit", border: `3px solid ${t.brand}` }} />
                <div className="tour-ripple absolute inset-0" style={{ borderRadius: "inherit", border: `3px solid ${t.brand}`, animationDelay: "0.8s" }} />
              </>
            )}
          </div>
          {/* The lock: four panes around the spotlight, plus one over it when
              the step is only to be read. */}
          <div className="fixed inset-x-0 top-0" style={{ height: rect.top }} onClick={blocked} />
          <div className="fixed inset-x-0 bottom-0" style={{ top: rect.top + rect.height }} onClick={blocked} />
          <div className="fixed left-0" style={{ top: rect.top, height: rect.height, width: rect.left }} onClick={blocked} />
          <div className="fixed right-0" style={{ top: rect.top, height: rect.height, left: rect.left + rect.width }} onClick={blocked} />
          {!interactive && <div className="fixed" style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }} onClick={blocked} />}
        </>
      ) : (
        <div className="dash-fade fixed inset-0" style={{ background: "rgba(18,14,8,0.62)" }} onClick={blocked} />
      )}

      <TourCard
        key={stepId}
        t={t}
        rect={rect}
        nudge={nudge}
        title={copy.title}
        body={copy.body}
        cta={step.advance !== "next" && rect ? null : copy.cta}
        tapHint={chrome.tapHint}
        tapHere={tap ? chrome.tapHere : null}
        position={position}
        // Nothing left to skip on the closing card.
        skipLabel={"hint" in (run ?? {}) || step.key === "replay-hint" ? null : chrome.skip}
        onCta={finish}
        onSkip={skip}
      />
    </div>,
    document.body,
  );
}

/** The "Tap here" tag's height, and its gap to the spotlight. */
const TAG_H = 34;
const TAG_GAP = 10;

function TourCard({
  t,
  rect,
  nudge,
  title,
  body,
  cta,
  tapHint,
  tapHere,
  position,
  skipLabel,
  onCta,
  onSkip,
}: {
  t: ClientTheme;
  rect: Rect | null;
  nudge: number;
  title: string;
  body: string;
  /** Null when the highlighted thing itself is the way on. */
  cta: string | null;
  /** Under the words on a "tap" step: what to do, in so many words. */
  tapHint: string;
  /** A "tap" step: the tag that hangs off the spotlight, pointing at it. */
  tapHere: string | null;
  position: { n: number; total: number } | null;
  skipLabel: string | null;
  onCta: () => void;
  onSkip: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(180);
  useLayoutEffect(() => {
    if (ref.current) setH(ref.current.offsetHeight);
  }, [title, body]);

  // Shake once per locked click (re-keyed so the animation restarts).
  const shake = nudge;

  const ctaRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ctaRef.current?.focus({ preventScroll: true });
  }, []);

  /* Where: under the spotlight when it fits, else over it, else pinned to the
     foot of the screen (a tall sheet). On a tap step the "Tap here" tag sits
     between the two, so the card keeps clear of it. Phones get the full width
     less 16px each side; wider screens a 360px card by the target. */
  const vw = typeof window === "undefined" ? 400 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const phone = vw < 640;
  const width = phone ? Math.min(vw - 32, 440) : 360;
  const GAP = tapHere ? TAG_GAP + TAG_H + 12 : 14;
  let top: number;
  let side: "below" | "above" | "pinned" = "pinned";
  if (!rect) top = (vh - h) / 2;
  else if (vh - (rect.top + rect.height) >= h + GAP + 16) {
    top = rect.top + rect.height + GAP;
    side = "below";
  } else if (rect.top >= h + GAP + 16) {
    top = rect.top - h - GAP;
    side = "above";
  } else top = vh - h - 16 - (phone ? 0 : 8);
  const left = phone || !rect ? (vw - width) / 2 : Math.min(Math.max(16, rect.left + rect.width / 2 - width / 2), vw - width - 16);

  /* The tag: on the card's side of the spotlight, so the eye runs card → tag →
     button. With the card pinned over the foot of the screen, on whichever
     side of the spotlight has room. */
  let tag: React.ReactNode = null;
  if (tapHere && rect) {
    const roomAbove = rect.top >= TAG_H + TAG_GAP + 8;
    const tagBelow = side === "below" || (side === "pinned" && !roomAbove);
    const tagTop = tagBelow ? rect.top + rect.height + TAG_GAP : rect.top - TAG_GAP - TAG_H;
    tag = <TapTag t={t} label={tapHere} top={tagTop} centre={rect.left + rect.width / 2} below={tagBelow} vw={vw} />;
  }

  return (
    <>
      {tag}
      <div
        ref={ref}
        className="tour-card-in fixed"
        style={{ top: Math.max(12, top), left, width }}
        aria-live="polite"
      >
        <div
          key={shake}
          className={`${shake ? "tour-nudge" : ""} rounded-3xl p-5`}
          style={{ background: t.card, color: t.text, boxShadow: "0 18px 50px rgba(0,0,0,0.28)", border: `1px solid ${t.border}` }}
        >
          {position && (
            <div className="mb-3 flex items-center gap-1.5" aria-label={`${position.n} / ${position.total}`}>
              {Array.from({ length: position.total }, (_, i) => (
                <span
                  key={i}
                  className="h-1.5 rounded-full transition-all duration-500"
                  style={{ width: i + 1 === position.n ? 18 : 6, background: i < position.n ? t.brand : t.border }}
                />
              ))}
            </div>
          )}
          <h2 id="client-tour-title" className="text-[17px] font-extrabold leading-snug">
            {title}
          </h2>
          <p className="mt-1.5 text-[14px] font-semibold leading-relaxed" style={{ color: t.muted }}>
            {body}
          </p>
          <div className="mt-4 flex items-center justify-between gap-3">
            {skipLabel ? (
              <button type="button" onClick={onSkip} className="cursor-pointer py-2 pr-2 text-[13px] font-bold" style={{ color: t.muted }}>
                {skipLabel}
              </button>
            ) : (
              <span />
            )}
            {cta ? (
              <button
                ref={ctaRef}
                type="button"
                onClick={onCta}
                className="cta-shine cursor-pointer rounded-full px-5 py-2.5 text-[14px] font-extrabold outline-none transition-transform focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-[0.97]"
                style={{ background: t.brand, color: t.onBrand, ["--tw-ring-color" as string]: t.brand }}
              >
                {cta}
              </button>
            ) : tapHere ? (
              <span className="flex items-center gap-2 text-[12.5px] font-extrabold" style={{ color: t.brand }}>
                <span className="tour-tap inline-block h-2.5 w-2.5 rounded-full" style={{ background: t.brand }} />
                {tapHint}
              </span>
            ) : (
              <span />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/** "Tap here", hung off the spotlight: kept on screen, its point still aimed
 *  at the middle of the button (a profile picture in the corner). */
function TapTag({ t, label, top, centre, below, vw }: { t: ClientTheme; label: string; top: number; centre: number; below: boolean; vw: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(110);
  useLayoutEffect(() => {
    if (ref.current) setW(ref.current.offsetWidth);
  }, [label]);
  const left = Math.min(Math.max(8, centre - w / 2), vw - w - 8);
  const point = Math.min(Math.max(16, centre - left), w - 16);
  return (
    <div className="pointer-events-none fixed" style={{ top, left, zIndex: 1 }} aria-hidden>
      <div className={below ? "tour-bob-up" : "tour-bob-down"}>
        <div
          ref={ref}
          className="relative flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13px] font-extrabold"
          style={{ height: TAG_H, background: t.brand, color: t.onBrand, boxShadow: "0 6px 18px rgba(0,0,0,0.35)" }}
        >
          <IconPointer up={below} />
          {label}
          {/* The point: a small diamond on the edge that faces the button. */}
          <span
            className="absolute h-3 w-3"
            style={{ left: point, background: t.brand, transform: "translateX(-50%) rotate(45deg)", ...(below ? { top: -5 } : { bottom: -5 }) }}
          />
        </div>
      </div>
    </div>
  );
}

/** A pointing hand, up or down. */
function IconPointer({ up }: { up: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: up ? undefined : "rotate(180deg)" }} aria-hidden>
      <path d="M9 11V5a2 2 0 0 1 4 0v6" />
      <path d="M13 9.5a2 2 0 0 1 4 0V12" />
      <path d="M17 11a2 2 0 0 1 4 0v3a7 7 0 0 1-7 7h-1.5a7 7 0 0 1-5.6-2.8L4.3 15.6a2 2 0 0 1 3.2-2.4L9 15" />
    </svg>
  );
}
