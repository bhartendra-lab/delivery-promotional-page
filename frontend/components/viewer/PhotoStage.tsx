"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { coldFallback } from "@/lib/media-actions";
import { imageSrc, imageStatus, markImageError, markImageReady, retryImage, useImageStatus } from "@/lib/use-image-window";

/**
 * The photo stage shared by the gallery's PhotoViewer and ReelViewer and the
 * studio dashboard's Lightbox: what the guest sees between tapping Next and the
 * sharp photo arriving.
 *
 *   1. The 480px grid thumbnail at once (it is almost always in the cache from
 *      the grid), at the photo's final size and aspect, blurred 8px and scaled
 *      1.02 so its soft edge never shows a gap. Never a black frame.
 *   2. The full photo on top at opacity 0, fading to 1 over 180 ms once the
 *      element has loaded; then the thumbnail is hidden. A photo the window
 *      preloader already has "ready" appears at once with no fade, so ordinary
 *      paging feels like flipping pages.
 *   3. A small ring only if the full photo is still not there after 300 ms, so
 *      a fast load never flashes a spinner.
 *   4. On failure the thumbnail stays, with "Couldn’t load full quality · Retry".
 *
 * LAYERS ARE KEYED BY PHOTO, NOT THE STAGE. When the photo changes the old
 * layer stays underneath only until the new thumbnail has painted (a few
 * milliseconds from cache), then goes. That is what removes the black frame
 * without ever leaving the previous photo under a new counter.
 *
 * Zoom and pan belong to the caller (`renderFull`), which receives `ready` and
 * must ignore gestures until it is true: nobody zooms into a blurry thumbnail.
 */

export type StageItem = {
  id: string;
  /** The full-size photo. */
  url: string;
  /** The grid thumbnail; null when the item has none (legacy media). */
  thumb: string | null;
  width?: number;
  height?: number;
};

export type FullProps = {
  src: string;
  onLoad: () => void;
  onError: () => void;
  style: CSSProperties;
  /** The full photo has loaded: zoom and pan may start. */
  ready: boolean;
};

const FADE_MS = 180;
const SPINNER_DELAY_MS = 300;

export function PhotoStage({
  item,
  renderFull,
  rounded = false,
  reducedMotion = false,
  active = true,
  onReadyChange,
  waiting = false,
}: {
  item: StageItem;
  renderFull: (p: FullProps) => ReactNode;
  /** Rounded corners (the framed desktop viewer). */
  rounded?: boolean;
  /** No blur-to-sharp fade: swap straight to the full photo. The spinner stays. */
  reducedMotion?: boolean;
  /** The photo on screen. Off-screen reel slides never show a spinner. */
  active?: boolean;
  /** Told when the current photo's full copy has loaded (or is no longer). */
  onReadyChange?: (ready: boolean) => void;
  /** The viewer is waiting on the next page (Next on the last loaded photo):
   *  show the ring over the current photo. */
  waiting?: boolean;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The layer stack: at most the previous photo (until the new thumbnail
  // paints) and the current one. Adjusted during render, React's pattern for
  // state derived from a changing prop.
  const [layers, setLayers] = useState<StageItem[]>([item]);
  const top = layers[layers.length - 1];
  if (top.id !== item.id || top.url !== item.url) {
    // No thumbnail to wait for: the old layer must not linger under this one.
    setLayers(thumbOf(item) ? [top, item] : [item]);
  }
  const dropBelow = (id: string) =>
    setLayers((ls) => {
      const i = ls.findIndex((l) => l.id === id);
      return i > 0 ? ls.slice(i) : ls;
    });

  return (
    <div ref={boxRef} className="relative h-full w-full">
      {size &&
        layers.map((l, i) => (
          <StageLayer
            key={l.id}
            item={l}
            stage={size}
            isTop={i === layers.length - 1}
            rounded={rounded}
            reducedMotion={reducedMotion}
            active={active}
            renderFull={renderFull}
            onPainted={() => dropBelow(l.id)}
            onReadyChange={i === layers.length - 1 ? onReadyChange : undefined}
          />
        ))}
      {waiting && <Ring />}
    </div>
  );
}

function thumbOf(item: StageItem): string | null {
  return item.thumb && item.thumb !== item.url ? item.thumb : null;
}

/** The photo's box inside the stage: `object-contain` in pixels, so the
 *  thumbnail and the full photo occupy exactly the same rectangle. */
function fit(stage: { w: number; h: number }, w?: number, h?: number): { w: number; h: number } | null {
  if (!w || !h || stage.w <= 0 || stage.h <= 0) return null;
  const k = Math.min(stage.w / w, stage.h / h);
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

function StageLayer({
  item,
  stage,
  isTop,
  rounded,
  reducedMotion,
  active,
  renderFull,
  onPainted,
  onReadyChange,
}: {
  item: StageItem;
  stage: { w: number; h: number };
  isTop: boolean;
  rounded: boolean;
  reducedMotion: boolean;
  active: boolean;
  renderFull: (p: FullProps) => ReactNode;
  onPainted: () => void;
  onReadyChange?: (ready: boolean) => void;
}) {
  const status = useImageStatus(item.url);
  // Ready in the window cache when this layer appeared: no fade at all.
  const [instant] = useState(() => imageStatus(item.url) === "ready");
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [src, setSrc] = useState(() => imageSrc(item.url));
  const [slow, setSlow] = useState(false);

  // Dropping the layers below is idempotent, so this may run more than once.
  const paint = onPainted;
  const thumb = thumbOf(item);

  useEffect(() => {
    if (loaded) return;
    const id = setTimeout(() => setSlow(true), SPINNER_DELAY_MS);
    return () => clearTimeout(id);
  }, [loaded, attempt]);

  const readyCb = useRef(onReadyChange);
  useEffect(() => {
    readyCb.current = onReadyChange;
  }, [onReadyChange]);
  useEffect(() => {
    readyCb.current?.(loaded);
  }, [loaded]);

  const onLoad = () => {
    setLoaded(true);
    setFailed(false);
    markImageReady(item.url);
    paint();
  };
  const onError = () => {
    const cold = coldFallback(src);
    if (cold !== src) {
      setSrc(cold);
      return;
    }
    markImageError(item.url);
    setFailed(true);
  };
  const retry = () => {
    retryImage(item.url);
    setFailed(false);
    setLoaded(false);
    setSlow(false);
    setSrc(item.url);
    setAttempt((a) => a + 1);
  };

  const box = fit(stage, item.width, item.height);
  const showError = !loaded && (failed || status === "error");
  const fade = !instant && !reducedMotion;
  const fullStyle: CSSProperties = {
    opacity: loaded || instant ? 1 : 0,
    transition: fade ? `opacity ${FADE_MS}ms ease-out` : "none",
  };

  return (
    <div className="absolute inset-0 flex items-center justify-center" style={isTop ? undefined : { pointerEvents: "none" }}>
      <div className="relative" style={box ? { width: box.w, height: box.h } : { width: "100%", height: "100%" }}>
        {thumb && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            aria-hidden
            src={thumb}
            alt=""
            draggable={false}
            ref={(el) => {
              if (el?.complete && el.naturalWidth > 0) paint();
            }}
            onLoad={paint}
            onError={paint}
            className={`pointer-events-none absolute inset-0 h-full w-full select-none ${box ? "object-cover" : "object-contain"} ${rounded && box ? "rounded-xl" : ""}`}
            style={{
              filter: "blur(8px)",
              transform: "scale(1.02)",
              // Hidden once the sharp photo has faded in over it.
              visibility: loaded ? "hidden" : "visible",
              transition: loaded && fade ? `visibility 0s linear ${FADE_MS}ms` : "none",
            }}
          />
        )}
        <div key={attempt} className="absolute inset-0 flex items-center justify-center">
          {renderFull({ src, onLoad, onError, style: fullStyle, ready: loaded })}
        </div>
        {isTop && active && showError && (
          <div className="absolute inset-x-0 bottom-4 flex justify-center">
            <span
              className="rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold text-white"
              style={{ background: "rgba(20,16,8,0.62)" }}
            >
              Couldn’t load full quality ·{" "}
              <button type="button" data-reel-control onClick={retry} className="cursor-pointer font-extrabold underline underline-offset-2">
                Retry
              </button>
            </span>
          </div>
        )}
        {isTop && active && slow && !loaded && !showError && <Ring />}
      </div>
    </div>
  );
}

/** White at 70% on a translucent dark disc, bottom-centre of the stage. */
function Ring() {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center" role="status" aria-label="Loading full quality">
      <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: "rgba(20,16,8,0.55)" }}>
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: "rgba(255,255,255,0.7)", borderTopColor: "transparent" }} />
      </span>
    </div>
  );
}
