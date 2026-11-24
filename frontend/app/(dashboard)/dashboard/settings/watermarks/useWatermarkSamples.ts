"use client";

import { useEffect, useState } from "react";
import { getAllBookings, getMedia } from "@/lib/api";
import { pickSampleSet, type SampleStat } from "@/lib/watermark-samples";

/** One photo to judge a watermark on. */
export type SamplePhoto = { src: string; label: string };

/** How many of the newest event's photos are looked at to pick the three. */
const CANDIDATES = 12;
/** How many recent events are tried to find one that has photos. */
const EVENTS_TO_TRY = 6;
/** The bundled fallback photos, used only for a studio with no event photos. */
const BUNDLED = ["/samples/watermark/sample-1.jpg", "/samples/watermark/sample-2.jpg", "/samples/watermark/sample-3.jpg"];

let cache: Promise<SamplePhoto[]> | null = null;

/** Loads an image; with `cors` set it is fit for pixel reading (rejects when the host does not allow it). */
function loadImage(src: string, cors: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (cors) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image failed to load"));
    img.src = src;
  });
}

/** Mean luminance and a busyness score from a 32 by 32 reading of the photo. */
function statOf(img: HTMLImageElement): SampleStat {
  const N = 32;
  const canvas = document.createElement("canvas");
  canvas.width = N;
  canvas.height = N;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no 2d context");
  ctx.drawImage(img, 0, 0, N, N);
  const { data } = ctx.getImageData(0, 0, N, N); // throws when the canvas is tainted
  const luma = new Float32Array(N * N);
  let sum = 0;
  for (let i = 0; i < N * N; i++) {
    luma[i] = 0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2];
    sum += luma[i];
  }
  let diff = 0;
  let pairs = 0;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (x + 1 < N) {
        diff += Math.abs(luma[y * N + x] - luma[y * N + x + 1]);
        pairs++;
      }
      if (y + 1 < N) {
        diff += Math.abs(luma[y * N + x] - luma[(y + 1) * N + x]);
        pairs++;
      }
    }
  }
  return { luma: sum / (N * N), busy: diff / pairs };
}

async function fromStudioPhotos(): Promise<SamplePhoto[]> {
  const { bookings } = await getAllBookings({ page: 1, limit: EVENTS_TO_TRY });
  for (const booking of bookings ?? []) {
    const res = await getMedia(booking._id, { limit: CANDIDATES * 2 });
    const urls = (res.media ?? [])
      .filter((m) => m.type === "image")
      .slice(0, CANDIDATES)
      .map((m) => m.thumbnail_url || m.url);
    if (urls.length === 0) continue;
    // Light, dark and busy, when the host lets us read pixels; the first three otherwise.
    try {
      const stats: SampleStat[] = [];
      for (const url of urls) stats.push(statOf(await loadImage(url, true)));
      return pickSampleSet(stats).map(({ index, label }, n) => ({ src: urls[index], label: label ?? `Photo ${n + 1}` }));
    } catch {
      return urls.slice(0, 3).map((src, n) => ({ src, label: `Photo ${n + 1}` }));
    }
  }
  return [];
}

async function fromBundled(): Promise<SamplePhoto[]> {
  const out: SamplePhoto[] = [];
  const labels = ["Light", "Dark", "Busy"];
  for (let i = 0; i < BUNDLED.length; i++) {
    try {
      await loadImage(BUNDLED[i], false);
      out.push({ src: BUNDLED[i], label: labels[i] });
    } catch {
      /* not supplied yet: see public/samples/watermark/README.md */
    }
  }
  return out;
}

/** Three photos to preview watermarks on: the studio's own, else the bundled set, else none. */
export function loadWatermarkSamples(): Promise<SamplePhoto[]> {
  cache ??= (async () => {
    try {
      const own = await fromStudioPhotos();
      if (own.length > 0) return own;
    } catch {
      /* fall through to the bundled photos */
    }
    return fromBundled();
  })();
  return cache;
}

/** null while loading, then the photos (empty means: use the grey gradient). */
export function useWatermarkSamples(): SamplePhoto[] | null {
  const [samples, setSamples] = useState<SamplePhoto[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadWatermarkSamples().then((s) => {
      if (!cancelled) setSamples(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return samples;
}
