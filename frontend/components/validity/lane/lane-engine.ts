// The motion of the Client's memory lane page, in two small engines.
//
//   startLaneHero  the first screen. The Client's photos float as prints
//                  around the headline; as the page scrolls they travel into a
//                  phone and settle into its gallery grid. Ported from the
//                  marketing site's hero (Vyavasth-landing-page,
//                  components/home/hero-engine.ts): the same scatter-to-gather
//                  idea, the same easing and stagger, with only photos in it
//                  and a slow idle drift added, since here the photos are the
//                  point.
//   startLaneWalk  the line of the day. A row of prints hangs on a string and
//                  slides sideways as the page scrolls down, so scrolling IS
//                  the walk.
//
// Both are plain DOM and one requestAnimationFrame loop each: the components
// render once, hand their elements here, and call the returned function on
// unmount. Only `transform` and `opacity` are written per frame, plus one
// custom property (`--g`, how gathered a print is) that the stylesheet turns
// into the print's border melting away.
//
// Every number that decides WHERE things go lives in lib/memory-lane.ts, where
// it is tested. This file only moves things between those places.
//
// Reduced motion: nothing moves by itself (no intro, no drift). What follows
// the reader's own scrolling still does, because it is their scrolling.

import {
  isMobileStage,
  phoneBox,
  pinProgress,
  scatterPoints,
  walkIndex,
  walkTravel,
  type PhoneBox,
  type ScatterPoint,
} from "@/lib/memory-lane";

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const sstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/* ── The first screen ─────────────────────────────────────────────────────── */

export type LaneHeroEls = {
  /** The tall section whose height is the scroll distance. */
  hero: HTMLElement;
  /** The screen-tall box that stays put while it scrolls. */
  stage: HTMLElement;
  /** Holds the prints: each `[data-tile]` with one child, its paper. */
  objs: HTMLElement;
  /** The headline block of the first screen. */
  copy: HTMLElement;
  /** The words and the two choices that arrive once the photos have gathered. */
  copy2: HTMLElement;
  /** The "scroll" hint at the foot of the first screen, if there is one. */
  cue: HTMLElement | null;
  /** The phone, with one `[data-slot]` per photo that lands in its grid. */
  phone: HTMLElement;
  halo: HTMLElement;
};

export type LaneHeroHandle = {
  /** The welcome screen has been tapped away: let the prints arrive. */
  enter: () => void;
  dispose: () => void;
};

type Gather = { x: number; y: number; r: number; s: number; o: number };
type Tile = { el: HTMLElement; paper: HTMLElement; lastG: number; hidden: boolean | null };

/** Seconds after entering before the first print fades up. */
const INTRO_AT = 0.45;

export function startLaneHero(els: LaneHeroEls, opts: { reduced: boolean }): LaneHeroHandle {
  const { hero, stage, copy, copy2, cue, phone, halo } = els;
  const REDUCED = opts.reduced;

  const nodes = Array.from(els.objs.querySelectorAll<HTMLElement>("[data-tile]"));
  const tiles: Tile[] = nodes.map((el, i) => {
    // The first print is the favourite: where prints overlap, it is on top.
    el.style.zIndex = String(10 + nodes.length - i);
    return { el, paper: el.firstElementChild as HTMLElement, lastG: -1, hidden: null };
  });

  let disposed = false;
  let raf = 0;
  let W = 0;
  let H = 0;
  let MOB = false;
  let S: ScatterPoint[] = [];
  let G: Gather[] = [];
  let PHN: PhoneBox = { cx: 0, cy: 0, pw: 0, ph: 0 };

  /** A slot's box relative to the phone, ignoring every transform. */
  function relRect(el: HTMLElement) {
    let x = 0;
    let y = 0;
    let node: HTMLElement | null = el;
    while (node && node !== phone) {
      x += node.offsetLeft;
      y += node.offsetTop;
      node = node.offsetParent as HTMLElement | null;
    }
    return { x, y, w: el.offsetWidth, h: el.offsetHeight };
  }

  function layout() {
    W = stage.clientWidth;
    H = stage.clientHeight;
    MOB = isMobileStage(W, H);
    S = scatterPoints(tiles.length, W, H, MOB);
    PHN = phoneBox(W, H, MOB);
    // The phone is sized first: everything inside it is in em of its height,
    // so the slots are only where they will be once these are set.
    phone.style.setProperty("--pw", `${PHN.pw}px`);
    phone.style.setProperty("--ph", `${PHN.ph}px`);
    const slots = Array.from(phone.querySelectorAll<HTMLElement>("[data-slot]"));
    G = tiles.map((tile, i) => {
      const base = tile.paper.offsetWidth || 1;
      const slot = slots[i];
      // No place in the grid: it flies into the phone and is gone, as if it
      // had landed further down the gallery than the screen shows.
      if (!slot) return { x: PHN.cx, y: PHN.cy + PHN.ph * 0.16, r: 0, s: (PHN.pw * 0.22) / base, o: 0 };
      const r = relRect(slot);
      return {
        x: PHN.cx - PHN.pw / 2 + r.x + r.w / 2,
        y: PHN.cy - PHN.ph / 2 + r.y + r.h / 2,
        r: 0,
        s: r.w / base,
        o: 1,
      };
    });
    for (const tile of tiles) tile.lastG = -1;
  }

  const st = { p: 0, t0: performance.now(), last: performance.now(), enteredAt: -1 };

  function frame(now: number) {
    if (disposed) return;
    const rdt = Math.min(1, (now - st.last) / 1000);
    st.last = now;
    const time = (now - st.t0) / 1000;
    const since = st.enteredAt < 0 ? -1 : (now - st.enteredAt) / 1000;

    const r = hero.getBoundingClientRect();
    const pRaw = pinProgress(r.top, hero.offsetHeight, H);
    st.p += (pRaw - st.p) * (1 - Math.pow(0.0009, rdt));
    const p = Math.abs(pRaw - st.p) < 0.0004 ? pRaw : st.p;

    if (r.bottom > 0) {
      // The headline lifts away as the photos start to move.
      const co = 1 - sstep(0.05, 0.3, p);
      copy.style.opacity = String(co);
      copy.style.transform = `translate3d(0,${(-p * H * 0.3).toFixed(1)}px,0)`;
      copy.style.visibility = co < 0.01 ? "hidden" : "visible";
      if (cue) cue.style.opacity = String(1 - sstep(0.02, 0.12, p));

      // The phone rises into place under them.
      const po = sstep(0.24, 0.52, p);
      phone.style.opacity = String(po);
      phone.style.transform = `translate(-50%,-50%) translate3d(${PHN.cx}px,${(PHN.cy + (1 - po) * 110).toFixed(1)}px,0) scale(${(0.86 + 0.14 * po).toFixed(4)})`;
      halo.style.opacity = String(po);
      halo.style.transform = `translate(-50%,-50%) translate3d(${PHN.cx}px,${PHN.cy}px,0) scale(${(0.7 + 0.3 * po).toFixed(4)})`;

      // Then the words and the two choices.
      const c2 = sstep(0.56, 0.78, p);
      const live = c2 > 0.6;
      copy2.style.opacity = String(c2);
      copy2.style.transform = `translate3d(0,${((1 - c2) * 44).toFixed(1)}px,0)`;
      copy2.style.pointerEvents = live ? "auto" : "none";
      copy2.style.visibility = c2 < 0.01 ? "hidden" : "visible";

      for (let n = 0; n < tiles.length; n++) {
        const tile = tiles[n];
        const a = S[n];
        const g = G[n];
        if (!a || !g) continue;
        const stag = (n % 7) * 0.016;
        const t = easeInOutCubic(clamp((p - (0.13 + stag)) / 0.52));
        // The arrival: nothing before the welcome screen is tapped away, then
        // each print fades up a beat after the one before.
        const it = since < 0 ? 0 : REDUCED ? 1 : clamp((since - INTRO_AT - n * 0.07) / 1.0);
        const ie = easeOutCubic(it);
        // The idle drift: slow, a few pixels, nearer prints moving more. It
        // dies away as a print leaves for the phone.
        const still = REDUCED ? 0 : 1 - t;
        const fx = Math.sin(time * 0.35 + n * 1.7) * 6 * a.z * still;
        const fy = Math.cos(time * 0.28 + n * 2.3) * 9 * a.z * still;
        const fr = Math.sin(time * 0.22 + n) * 1.4 * still;

        const arc = Math.sin(t * Math.PI);
        let x = lerp(a.x, g.x, t) + fx;
        let y = lerp(a.y + (1 - ie) * 26, g.y, t) + fy;
        x += arc * ((n % 2 ? 1 : -1) * 22) * (MOB ? 0.4 : 1);
        y -= arc * (28 + (n % 5) * 12);
        y -= p * 170 * a.z * (1 - t); // drift by depth as the page starts to scroll
        const rot = lerp(a.r, g.r, t) + arc * (n % 2 ? 9 : -9) + fr;
        const sc = lerp(a.s, g.s, t) * (0.94 + 0.06 * ie);
        const op = lerp(a.o, g.o, sstep(0.15, 0.7, t)) * ie;

        tile.el.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) rotate(${rot.toFixed(2)}deg) scale(${sc.toFixed(4)})`;
        tile.el.style.opacity = op.toFixed(3);
        const hidden = op < 0.04;
        if (hidden !== tile.hidden) {
          tile.hidden = hidden;
          tile.el.style.visibility = hidden ? "hidden" : "visible";
        }
        if (Math.abs(t - tile.lastG) > 0.004) {
          tile.lastG = t;
          tile.el.style.setProperty("--g", t.toFixed(3));
        }
      }
    }
    raf = requestAnimationFrame(frame);
  }

  let rz = 0;
  const onResize = () => {
    window.clearTimeout(rz);
    rz = window.setTimeout(layout, 80);
  };

  const boot = () => {
    if (disposed) return;
    layout();
    st.t0 = st.last = performance.now();
    window.addEventListener("resize", onResize);
    raf = requestAnimationFrame(frame);
  };
  // Measured once the fonts are in: the phone's header sets where its grid starts.
  (document.fonts?.ready ?? Promise.resolve()).then(boot, boot);

  return {
    enter: () => {
      if (st.enteredAt < 0) st.enteredAt = performance.now();
    },
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(rz);
      window.removeEventListener("resize", onResize);
    },
  };
}

/* ── The line of the day ──────────────────────────────────────────────────── */

export type LaneWalkEls = {
  /** The section whose height is set here, to the distance the line travels. */
  section: HTMLElement;
  /** The screen-tall box that stays put. */
  stage: HTMLElement;
  /** The row of prints: this is what slides. */
  track: HTMLElement;
  /** The thin line that fills as the day goes by. */
  bar: HTMLElement | null;
};

export function startLaneWalk(els: LaneWalkEls, opts: { count: number; onIndex: (index: number) => void }): () => void {
  const { section, stage, track, bar } = els;
  let disposed = false;
  let raf = 0;
  let H = 0;
  let travel = 0;
  let shown = -1;
  const st = { p: 0, last: performance.now() };

  function layout() {
    H = stage.clientHeight;
    travel = walkTravel(track.scrollWidth, stage.clientWidth);
    // One pixel down the page for one pixel along the line.
    section.style.height = `${H + travel}px`;
  }

  function frame(now: number) {
    if (disposed) return;
    const rdt = Math.min(1, (now - st.last) / 1000);
    st.last = now;
    const r = section.getBoundingClientRect();
    if (r.bottom > 0 && r.top < H) {
      const pRaw = pinProgress(r.top, section.offsetHeight, H);
      st.p += (pRaw - st.p) * (1 - Math.pow(0.0009, rdt));
      const p = Math.abs(pRaw - st.p) < 0.0004 ? pRaw : st.p;
      track.style.transform = `translate3d(${(-p * travel).toFixed(1)}px,0,0)`;
      if (bar) bar.style.transform = `scaleX(${p.toFixed(4)})`;
      const index = walkIndex(p, opts.count);
      if (index !== shown) {
        shown = index;
        opts.onIndex(index);
      }
    }
    raf = requestAnimationFrame(frame);
  }

  let rz = 0;
  const onResize = () => {
    window.clearTimeout(rz);
    rz = window.setTimeout(layout, 80);
  };

  const boot = () => {
    if (disposed) return;
    layout();
    window.addEventListener("resize", onResize);
    raf = requestAnimationFrame(frame);
  };
  (document.fonts?.ready ?? Promise.resolve()).then(boot, boot);

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    window.clearTimeout(rz);
    window.removeEventListener("resize", onResize);
    section.style.height = "";
    track.style.transform = "";
  };
}
