"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClientTheme } from "@/lib/client-theme";
import {
  daySpanLabel,
  favouriteCaption,
  formatClockTime,
  formatEventDay,
  istHour,
  lastPhotoLine,
  partOfDay,
  reelPhotoAlt,
  timeOfDayTint,
  type ValidityReel,
  type ValidityReelFavourite,
  type ValidityReelItem,
} from "@/lib/event-validity";
import { IconChevronLeft, IconChevronRight, IconHeart } from "@/components/ui/icons";
import { eventTitleStyle } from "@/components/event/screens/lounge/eventTitleStyle";
import { useCountUp, useInViewOnce, usePrefersReducedMotion } from "./motion";

/**
 * The "memory" half of the Client's validity page: their own day, given back
 * to them before anything is asked. Four sections, in the event's own gallery
 * theme so it feels like their gallery:
 *
 *   1. ValidityOpening    one photo, coming into focus, with their name on it.
 *   2. ValidityStrip      the day in the order it happened.
 *   3. ValidityNumbers    two or three true numbers about it.
 *   4. ValidityFavourite  the photo everyone liked most.
 *
 * The photos carry it. They are the reel's own small copies (never a gallery
 * URL), shown with the gallery's rounded corners and nothing else: no frames,
 * no borders, no rotation, no filter. Every one reserves its space from the
 * width and height the API sends, so nothing shifts as they load.
 */

/* TYPE. The page is set in the gallery's own sans (the theme's `font`), and
 * the ONE line with a display treatment is the event's name, which uses
 * `eventTitleStyle`: the same Playfair italic the gallery's welcome screen and
 * lounge covers set it in. Imported rather than copied, so the name a Client
 * reads here is the name they see when they open their gallery, and the two
 * cannot drift. Playfair is already loaded by the root layout for the gallery,
 * so this page downloads no font of its own. */

/** Space a photo needs before it has loaded. Falls back to 3:2 when the size
 *  is unknown (a copy from before sizes were recorded). */
const ratioOf = (photo: { width: number | null; height: number | null }) =>
  photo.width && photo.height ? photo.width / photo.height : 3 / 2;

/**
 * A box in a photo's own shape that is never taller than `maxHeight` nor
 * wider than `maxWidth`: the width is whichever of the two limits binds, and
 * the height follows from the ratio. So a portrait and a landscape both show
 * WHOLE (nothing is cropped to fit), and the space is reserved before the
 * photo has loaded.
 */
const fitBox = (ratio: number, maxHeight: string, maxWidth: string) => ({
  width: `min(${maxWidth}, calc(${maxHeight} * ${ratio.toFixed(4)}))`,
  aspectRatio: String(ratio),
});

/** How tall a photo of the strip may be: most of a phone's lower half. */
const STRIP_PHOTO_HEIGHT = "clamp(240px, 46svh, 420px)";

/* ── 1. Opening ─────────────────────────────────────────────────────────── */

export type OpeningPhoto = { url: string; width: number | null; height: number | null } | null;

export function ValidityOpening({
  t,
  photo,
  firstName,
  eventName,
  eventDate,
}: {
  t: ClientTheme;
  /** The favourite, else the first photo of the day, else the studio's cover. Null for none at all. */
  photo: OpeningPhoto;
  firstName: string | null;
  eventName: string;
  eventDate: number | null;
}) {
  const greeting = firstName ? `Hi ${firstName},` : "Hello,";
  const date = eventDate ? formatEventDay(eventDate) : null;

  const words = (onPhoto: boolean) => (
    <div className="validity-greeting">
      <p className="text-[15px] font-semibold lg:text-[17px]" style={{ color: onPhoto ? "rgba(255,255,255,0.92)" : t.muted }}>
        {greeting}
      </p>
      {/* On the photo this is the phone layout, beside it the wide one: the
          same two sizes the gallery's own covers use. */}
      <h1
        className="mt-1.5 text-balance"
        style={{ ...eventTitleStyle(onPhoto ? "mobile" : "desktop"), color: onPhoto ? "#FFFFFF" : t.text }}
      >
        {eventName}
      </h1>
      {date && (
        <p className="mt-3 text-[13.5px] font-medium lg:text-[15px]" style={{ color: onPhoto ? "rgba(255,255,255,0.86)" : t.muted }}>
          {date}
        </p>
      )}
    </div>
  );

  // No photo of any kind: the theme's own cover colours, and the same words.
  const backdrop = photo ? undefined : { backgroundImage: `linear-gradient(150deg, ${t.cover[0]}, ${t.cover[1]})` };

  return (
    <header className="lg:grid lg:min-h-[100svh] lg:grid-cols-12">
      {/* About 62% of the first screen on a phone, so the day's strip peeks in
          below it and says "there is more" without an arrow. On a wide screen
          it is the left seven twelfths, full height. */}
      <div
        className="relative h-[62svh] min-h-[340px] overflow-hidden lg:col-span-7 lg:h-auto lg:min-h-[100svh]"
        style={{ background: t.sunken, ...backdrop }}
      >
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element -- a reel copy, served as it is: never through image resizing
          <img
            src={photo.url}
            alt={`Photo from ${eventName}`}
            width={photo.width ?? undefined}
            height={photo.height ?? undefined}
            fetchPriority="high"
            decoding="async"
            className="validity-focus absolute inset-0 h-full w-full object-cover"
          />
        )}
        {/* Scrim at the foot only, deep enough for white text at AA over any photo. */}
        <div
          aria-hidden
          className="absolute inset-0 lg:hidden"
          style={{ background: "linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.5) 26%, rgba(0,0,0,0) 62%)" }}
        />
        <div className="absolute inset-x-0 bottom-0 px-6 pb-7 lg:hidden">{words(true)}</div>
      </div>

      {/* Wide screens: the words stand beside the photo, on the theme's own page colour. */}
      <div className="hidden lg:col-span-5 lg:flex lg:items-center lg:px-14 xl:px-20" style={{ background: t.bg }}>
        {words(false)}
      </div>
    </header>
  );
}

/* ── 2. The day, in order ───────────────────────────────────────────────── */

const PARTS = ["morning", "afternoon", "golden", "night"] as const;
/** One representative hour per part of the day, for its wash. */
const PART_HOUR: Record<(typeof PARTS)[number], number> = { morning: 8, afternoon: 13, golden: 17, night: 22 };

/** How fast the strip drifts through, in CSS pixels per second. Slow enough to
 *  look at each photo as it passes. */
const DRIFT_PX_PER_SECOND = 46;
/** Anything a person does to the strip. The first one ends the drift for good. */
const DRIFT_STOP_EVENTS = ["pointerdown", "touchstart", "wheel", "keydown"] as const;
/** The strip's side padding: the page gutter on a phone, and on a wide screen
 *  enough to line its first photo up with the 1080px column above it. */
const STRIP_GUTTER = "max(24px, calc((100vw - 1080px) / 2 + 24px))";

export function ValidityStrip({ t, reel, eventName }: { t: ClientTheme; reel: ValidityReel; eventName: string }) {
  const reduced = usePrefersReducedMotion();
  const scroller = useRef<HTMLUListElement | null>(null);
  const [sectionRef, seen] = useInViewOnce<HTMLElement>({ threshold: 0.35 });
  const [centre, setCentre] = useState(0);
  const [edges, setEdges] = useState({ start: true, end: false });
  const drifting = useRef(false);
  const items = reel.items;
  const closing = lastPhotoLine(reel);

  // Which photo sits in the middle, and whether either end has been reached.
  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const middle = el.scrollLeft + el.clientWidth / 2;
    let nearest = 0;
    let best = Infinity;
    el.querySelectorAll<HTMLElement>("[data-reel-index]").forEach((node) => {
      const distance = Math.abs(node.offsetLeft + node.offsetWidth / 2 - middle);
      if (distance < best) {
        best = distance;
        nearest = Number(node.dataset.reelIndex);
      }
    });
    setCentre(nearest);
    setEdges({ start: el.scrollLeft <= 2, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 });
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    measure();
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [measure, items.length]);

  // The one drift: when the strip first comes into view it moves slowly
  // through, once, then stops and stays wherever it is left. Any touch, wheel,
  // key or pointer on it stops it at once and for good. Never under reduced
  // motion. Scroll snapping is off while it moves (it would fight every
  // frame) and back on the moment it stops.
  useEffect(() => {
    const el = scroller.current;
    if (!seen || reduced || !el || drifting.current) return;
    if (el.scrollWidth <= el.clientWidth + 4) return;
    drifting.current = true;
    let frame = 0;
    let last = performance.now();
    let position = el.scrollLeft;
    const snap = el.style.scrollSnapType;
    el.style.scrollSnapType = "none";

    const stop = () => {
      cancelAnimationFrame(frame);
      el.style.scrollSnapType = snap;
      for (const type of DRIFT_STOP_EVENTS) el.removeEventListener(type, stop);
    };
    for (const type of DRIFT_STOP_EVENTS) el.addEventListener(type, stop, { passive: true, once: true });

    const step = (now: number) => {
      position += ((now - last) / 1000) * DRIFT_PX_PER_SECOND;
      last = now;
      el.scrollLeft = position;
      if (position >= el.scrollWidth - el.clientWidth) {
        stop();
        return;
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return stop;
    // `seen` turns true once, so this starts once. `drifting` keeps a re-render
    // or a reduced-motion change from ever starting it a second time.
  }, [seen, reduced]);

  const nudge = (direction: 1 | -1) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: reduced ? "auto" : "smooth" });
  };

  // The wash behind the strip follows the time of day of the photo in the
  // middle. Only for a time read from the camera: a file or upload time would
  // paint an afternoon wedding as midnight.
  const centred = items[centre];
  const activePart =
    centred && centred.time_reliable && typeof centred.captured_at === "number" ? partOfDay(istHour(centred.captured_at)) : null;
  const washes = useMemo(() => PARTS.map((part) => ({ part, colour: timeOfDayTint(PART_HOUR[part], t.bg) })), [t.bg]);

  return (
    <section ref={sectionRef} className="relative isolate py-10 lg:py-16" style={{ background: t.bg }} aria-labelledby="validity-day">
      {washes.map(({ part, colour }) => (
        <div
          key={part}
          aria-hidden
          className={`validity-tint absolute inset-0 -z-10 ${activePart === part ? "is-on" : ""}`}
          style={{ background: colour }}
        />
      ))}

      <div className={`validity-reveal ${seen ? "is-in" : ""}`}>
        <div className="mx-auto flex max-w-[1080px] items-end justify-between gap-4 px-6">
          <h2 id="validity-day" className="text-[13px] font-bold uppercase tracking-[0.14em]" style={{ color: t.muted }}>
            The day, in order
          </h2>
          {/* Previous and next, on a wide screen. A phone swipes. */}
          <div className="hidden gap-2 lg:flex">
            <StripButton t={t} label="Earlier photos" disabled={edges.start} onClick={() => nudge(-1)}>
              <IconChevronLeft size={18} />
            </StripButton>
            <StripButton t={t} label="Later photos" disabled={edges.end} onClick={() => nudge(1)}>
              <IconChevronRight size={18} />
            </StripButton>
          </div>
        </div>

        {/* The one thing on the page that scrolls sideways. A list, with a
            label; focusable, so the arrow keys scroll it. */}
        <ul
          ref={scroller}
          tabIndex={0}
          aria-label={`Photos from ${eventName}, in the order they were taken`}
          className="validity-strip mt-5 flex snap-x snap-mandatory items-start gap-3 overflow-x-auto pb-2 outline-none focus-visible:ring-2 lg:gap-4"
          style={{ paddingInline: STRIP_GUTTER, scrollPaddingInline: STRIP_GUTTER, ["--tw-ring-color" as string]: t.brand }}
        >
          {items.map((item, index) => (
            <StripPhoto key={item.url} t={t} item={item} index={index} eventName={eventName} />
          ))}
          {closing && (
            <li
              className="flex min-h-[160px] w-[min(72vw,300px)] shrink-0 snap-center items-center self-stretch px-2"
              data-reel-index={items.length}
            >
              <p className="text-[17px] font-semibold leading-snug lg:text-[19px]" style={{ color: t.text }}>
                {closing}
              </p>
            </li>
          )}
        </ul>
      </div>
    </section>
  );
}

function StripPhoto({ t, item, index, eventName }: { t: ClientTheme; item: ValidityReelItem; index: number; eventName: string }) {
  const showTime = item.time_reliable && typeof item.captured_at === "number";
  return (
    <li className="shrink-0 snap-center" data-reel-index={index}>
      {/* Each photo keeps its own shape, so a portrait and a landscape sit
          side by side without either being cropped. */}
      <div
        className="validity-photo overflow-hidden"
        style={{ ...fitBox(ratioOf(item), STRIP_PHOTO_HEIGHT, "86vw"), borderRadius: t.rTile, background: t.sunken }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a reel copy, served as it is */}
        <img
          src={item.url}
          alt={reelPhotoAlt(eventName, item)}
          width={item.width ?? undefined}
          height={item.height ?? undefined}
          loading="lazy"
          decoding="async"
          data-reel-thumb={index}
          className="h-full w-full object-cover"
        />
      </div>
      {showTime && (
        <p className="mt-2 text-[12.5px] font-semibold tabular-nums" style={{ color: t.muted }}>
          {formatClockTime(item.captured_at as number)}
        </p>
      )}
    </li>
  );
}

function StripButton({
  t,
  label,
  disabled,
  onClick,
  children,
}: {
  t: ClientTheme;
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-11 w-11 items-center justify-center rounded-full border transition-opacity disabled:opacity-35"
      style={{ borderColor: t.border, background: t.card, color: t.text }}
    >
      {children}
    </button>
  );
}

/* ── 3. A few true numbers ──────────────────────────────────────────────── */

type Figure = { key: string; value: number | null; label: string; spoken: string };

export function ValidityNumbers({ t, reel }: { t: ClientTheme; reel: ValidityReel }) {
  const [ref, seen] = useInViewOnce<HTMLElement>({ threshold: 0.4 });
  const { photos, people, first_at, last_at, times_reliable } = reel.stats;
  const span = times_reliable ? daySpanLabel(first_at, last_at) : null;

  // Up to three, and only the ones that exist and are above zero. Never a
  // "0 people" or a made-up figure to fill a gap.
  const figures: Figure[] = [];
  if (photos > 0) {
    figures.push({ key: "photos", value: photos, label: photos === 1 ? "photo" : "photos", spoken: `${photos.toLocaleString("en-IN")} ${photos === 1 ? "photo" : "photos"}` });
  }
  if (people > 0) {
    const label = people === 1 ? "person opened this gallery" : "people opened this gallery";
    figures.push({ key: "people", value: people, label, spoken: `${people.toLocaleString("en-IN")} ${label}` });
  }
  if (span) {
    // "9 hours, start to finish": the number counts, the rest is its label.
    const [head, ...rest] = span.split(" ");
    figures.push({ key: "span", value: Number(head), label: rest.join(" "), spoken: span });
  }
  if (figures.length === 0) return null;

  // One light line, and only when it is simply true.
  const aside = photos >= 500 ? "Someone was busy." : people >= 50 ? "Quite a crowd." : null;

  return (
    <section ref={ref} className="px-6 py-10 lg:py-16" style={{ background: t.bg }} aria-label="A few numbers from the day">
      <div className={`validity-reveal mx-auto max-w-[1080px] ${seen ? "is-in" : ""}`}>
        <dl className="flex flex-col gap-7 lg:flex-row lg:gap-16">
          {figures.map((figure) => (
            <FigureRow key={figure.key} t={t} figure={figure} play={seen} />
          ))}
        </dl>
        {aside && (
          <p className="mt-7 text-[14px] font-medium" style={{ color: t.muted }}>
            {aside}
          </p>
        )}
      </div>
    </section>
  );
}

function FigureRow({ t, figure, play }: { t: ClientTheme; figure: Figure; play: boolean }) {
  const shown = useCountUp(figure.value ?? 0, play);
  return (
    <div>
      {/* A screen reader gets the finished sentence once; the counting digits
          are for the eye only. */}
      <dt className="sr-only">{figure.spoken}</dt>
      <dd aria-hidden>
        <span
          className="block font-extrabold tabular-nums tracking-tight"
          style={{ fontSize: "clamp(44px, 13vw, 68px)", lineHeight: 1, color: t.text }}
        >
          {shown.toLocaleString("en-IN")}
        </span>
        <span className="mt-1.5 block text-[14px] font-semibold" style={{ color: t.muted }}>
          {figure.label}
        </span>
      </dd>
    </div>
  );
}

/* ── 4. The favourite ───────────────────────────────────────────────────── */

export function ValidityFavourite({ t, favourite, eventName }: { t: ClientTheme; favourite: ValidityReelFavourite; eventName: string }) {
  const [ref, seen] = useInViewOnce<HTMLElement>({ threshold: 0.2 });
  const caption = favouriteCaption(favourite);
  return (
    <section ref={ref} className="px-6 py-10 lg:py-16" style={{ background: t.bg }} aria-label={caption}>
      <figure className={`validity-reveal mx-auto max-w-[760px] ${seen ? "is-in" : ""}`}>
        <div
          className="validity-photo relative overflow-hidden"
          style={{ ...fitBox(ratioOf(favourite), "78svh", "100%"), borderRadius: t.rCard, background: t.sunken }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- a reel copy, served as it is */}
          <img
            src={favourite.url}
            alt={`${caption}: a photo from ${eventName}`}
            width={favourite.width ?? undefined}
            height={favourite.height ?? undefined}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
          {favourite.hearts > 0 && (
            <span
              className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-bold tabular-nums"
              style={{ background: "rgba(23,17,10,0.72)", color: "#FFFFFF" }}
            >
              <IconHeart size={14} filled style={{ color: t.liked }} />
              <span className="sr-only">Hearts: </span>
              {favourite.hearts.toLocaleString("en-IN")}
            </span>
          )}
        </div>
        <figcaption className="mt-3 text-[15px] font-semibold" style={{ color: t.text }}>
          {caption}
        </figcaption>
      </figure>
    </section>
  );
}
