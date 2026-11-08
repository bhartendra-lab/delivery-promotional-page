"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { coldFallback } from "./media-actions";
import { WINDOW_AHEAD, WINDOW_BEHIND } from "./viewer-window";

/**
 * Preloads a photo viewer's sliding window (see viewer-window.ts) so Next and
 * Previous land on a photo already in the browser cache.
 *
 * SHARED BY ALL THREE VIEWERS: the gallery's desktop PhotoViewer, its phone
 * ReelViewer and the studio dashboard's Lightbox. Only one viewer is ever open,
 * so the loader is a single module-level instance: the window a viewer sets
 * replaces the previous one, and closing the viewer cancels what is in flight.
 *
 * `new Image()` ONLY, NEVER `fetch()`. The viewers' `<img>` tags send no
 * `Origin` header. A preload made with `Image()` is the very same request, so
 * it lands in the same HTTP cache entry and the `<img>` that follows is a
 * guaranteed cache hit (CDN objects are immutable). A `fetch()` preload would
 * be a CORS-mode request for the same URL, and mixing the two modes on one URL
 * is exactly what broke Android downloads (see `cacheKeyed` in media-actions):
 * a download's `fetch` must stay the first CORS request for that URL.
 *
 * DECODE ONLY ±1. Every entry is downloaded, but `img.decode()` (which holds a
 * full bitmap in memory) runs only for the current photo and its immediate
 * neighbours. Nine decoded 2560px photos come to roughly 150 MB, which is
 * enough to get a phone browser tab killed; a downloaded-but-undecoded photo
 * costs only disk cache.
 *
 * PRIORITY. The current photo starts at once with `fetchPriority = "high"`,
 * whatever else is loading. The rest load at `"low"`, at most
 * `MAX_LOW_IN_FLIGHT` at a time, in window order (which is the priority order
 * windowIndices returns). When the window moves, loads that fell out of it are
 * stopped (`img.src = ""`) so a burst of Next taps never queues work for photos
 * the guest has already passed.
 *
 * STATUS CACHE. A module-level map of URL → loading | ready | error, kept LRU
 * at ~60 entries, so going back to a photo seen moments ago is instant: the
 * viewer sees "ready" and shows the full photo with no placeholder or fade.
 */

export type ImageStatus = "loading" | "ready" | "error";

export type WindowEntry = {
  /** The full-size (2560px) photo. Null for videos: their element already
   *  loads what it needs (`preload="metadata"` for neighbours). */
  full: string | null;
  /** The grid thumbnail, almost always already cached from the grid. Warmed
   *  for every entry (videos included: it is their poster). */
  thumb: string | null;
};

const MAX_LOW_IN_FLIGHT = 3;
const STATUS_CAP = 60;

type Entry = { status: ImageStatus; src: string; triedCold: boolean };

/** URL (as the item lists it) → status, and the src that actually loaded
 *  (the cold-host copy, after a fallback). Map order is the LRU order. */
const statuses = new Map<string, Entry>();
const listeners = new Set<() => void>();
let version = 0;

const inflight = new Map<string, HTMLImageElement>();
let desired: { url: string; decode: boolean; high: boolean }[] = [];
const warmedThumbs = new Set<string>();

function emit() {
  version++;
  for (const l of listeners) l();
}

function touch(url: string, e: Entry) {
  statuses.delete(url);
  statuses.set(url, e);
  if (statuses.size <= STATUS_CAP) return;
  // Oldest first; never evict what is loading right now, or it would restart.
  for (const k of statuses.keys()) {
    if (statuses.size <= STATUS_CAP) break;
    if (!inflight.has(k)) statuses.delete(k);
  }
}

function start(url: string, decode: boolean, high: boolean) {
  const prev = statuses.get(url);
  const triedCold = prev?.triedCold ?? false;
  const src = prev?.src ?? url;
  const img = new Image();
  img.decoding = "async";
  // fetchPriority is a hint; older browsers ignore the property.
  (img as HTMLImageElement & { fetchPriority?: string }).fetchPriority = high ? "high" : "low";
  inflight.set(url, img);
  touch(url, { status: "loading", src, triedCold });
  emit();

  const finish = (status: ImageStatus) => {
    if (inflight.get(url) !== img) return;
    inflight.delete(url);
    touch(url, { status, src: statuses.get(url)?.src ?? src, triedCold: statuses.get(url)?.triedCold ?? triedCold });
    emit();
    pump();
  };
  img.onload = () => {
    if (!decode || typeof img.decode !== "function") return finish("ready");
    img.decode().then(
      () => finish("ready"),
      // A decode can fail for reasons unrelated to the photo (memory pressure,
      // a detached image). The bytes are in the cache, so it is still ready.
      () => finish("ready"),
    );
  };
  img.onerror = () => {
    if (inflight.get(url) !== img) return;
    const cold = coldFallback(url);
    const cur = statuses.get(url);
    if (!cur?.triedCold && cold !== url) {
      // One retry on the cold host, the same rule every media path follows.
      touch(url, { status: "loading", src: cold, triedCold: true });
      img.src = cold;
      return;
    }
    finish("error");
  };
  img.src = src;
}

function pump() {
  const want = new Set(desired.map((d) => d.url));
  // Stop what fell out of the window.
  for (const [url, img] of inflight) {
    if (want.has(url)) continue;
    img.onload = null;
    img.onerror = null;
    img.src = "";
    inflight.delete(url);
    const s = statuses.get(url);
    if (s?.status === "loading") statuses.delete(url);
  }
  let low = 0;
  for (const [url] of inflight) if (!desired.find((d) => d.url === url)?.high) low++;
  for (const d of desired) {
    const s = statuses.get(d.url);
    if (s && s.status !== "loading") {
      // Refresh its LRU position: it is still in the window.
      touch(d.url, s);
      continue;
    }
    if (inflight.has(d.url)) continue;
    if (d.high) start(d.url, d.decode, true);
    else if (low < MAX_LOW_IN_FLIGHT) {
      low++;
      start(d.url, d.decode, false);
    }
  }
}

function setWindow(entries: WindowEntry[]) {
  desired = [];
  const seen = new Set<string>();
  entries.forEach((e, i) => {
    if (e.full && !seen.has(e.full)) {
      seen.add(e.full);
      // Window order is [current, +1, -1, …]: the first three are current ±1
      // (fewer at the ends of a list without wrap, which only decodes less).
      desired.push({ url: e.full, decode: i < 3, high: i === 0 });
    }
    if (e.thumb && !warmedThumbs.has(e.thumb)) {
      warmedThumbs.add(e.thumb);
      if (warmedThumbs.size > 400) warmedThumbs.clear();
      const t = new Image();
      t.decoding = "async";
      t.src = e.thumb;
    }
  });
  pump();
}

/** The status a viewer should render for a full-size URL. */
export function imageStatus(url: string | null | undefined): ImageStatus | undefined {
  return url ? statuses.get(url)?.status : undefined;
}

/** The URL the viewer's `<img>` should use: the cold-host copy when the
 *  preload had to fall back to it, so the element reuses that cache entry. */
export function imageSrc(url: string): string {
  return statuses.get(url)?.src ?? url;
}

/** Mark a URL as loaded by the viewer's own element (its `onLoad`). */
export function markImageReady(url: string) {
  const s = statuses.get(url);
  if (s?.status === "ready") return;
  touch(url, { status: "ready", src: s?.src ?? url, triedCold: s?.triedCold ?? false });
  emit();
}

/** Mark a URL as failed by the viewer's own element (its `onError`). */
export function markImageError(url: string) {
  const s = statuses.get(url);
  touch(url, { status: "error", src: s?.src ?? url, triedCold: true });
  emit();
}

/** Forget a URL's status and load it again (the "Retry" link). */
export function retryImage(url: string) {
  const img = inflight.get(url);
  if (img) {
    img.onload = null;
    img.onerror = null;
    img.src = "";
    inflight.delete(url);
  }
  statuses.delete(url);
  emit();
  if (desired.some((d) => d.url === url)) pump();
}

/** Call `cb` once the URL is ready (at once if it already is). Returns an unsubscribe. */
export function onImageReady(url: string, cb: () => void): () => void {
  if (statuses.get(url)?.status === "ready") {
    cb();
    return () => {};
  }
  const l = () => {
    if (statuses.get(url)?.status === "ready") {
      listeners.delete(l);
      cb();
    }
  };
  listeners.add(l);
  return () => listeners.delete(l);
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Re-renders when any status changes; read `imageStatus(url)` during render. */
export function useImageStatus(url: string | null | undefined): ImageStatus | undefined {
  useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  );
  return imageStatus(url);
}

/** 5 ahead and 3 behind, or 2 and 1 when the browser asks to save data. */
export function useWindowSize(): { ahead: number; behind: number } {
  const saveData = useSyncExternalStore(
    () => () => {},
    () => !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData,
    () => false,
  );
  return saveData ? { ahead: 2, behind: 1 } : { ahead: WINDOW_AHEAD, behind: WINDOW_BEHIND };
}

/**
 * Keep `entries` (in windowIndices order, current first) preloaded while the
 * viewer is open. Cancels everything still in flight when the viewer closes.
 */
export function useImageWindow(entries: WindowEntry[]): {
  status: typeof imageStatus;
  onReady: typeof onImageReady;
} {
  const key = entries.map((e) => `${e.full ?? ""}|${e.thumb ?? ""}`).join("\n");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stable = useMemo(() => entries, [key]);
  useEffect(() => {
    setWindow(stable);
  }, [stable]);
  useEffect(
    () => () => {
      setWindow([]);
    },
    [],
  );
  return { status: imageStatus, onReady: onImageReady };
}
