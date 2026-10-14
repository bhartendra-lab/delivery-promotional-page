/**
 * Client-side photo actions — single-photo download, share, and the shared
 * primitives the bulk download engines build on.
 *
 * Single downloads fetch directly from the public R2 URL (CORS must allow this
 * origin) and work on every browser, including iOS, at any tier the viewer is
 * entitled to. BULK downloads live in `lib/download` — `planDownload` decides
 * the method and `lib/download/engines.ts` executes it. `fetchImageBlob` and
 * `triggerBlobDownload` are exported for those engines; everything else here is
 * for the single-photo and grid paths.
 */

import { describeError } from "./download/failure.ts";

export function nameFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    const last = path.split("/").pop() || "photo.jpg";
    return /\.[a-z0-9]+$/i.test(last) ? last : `${last}.jpg`;
  } catch {
    return "photo.jpg";
  }
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const HOT = "media.vyavasth.in";
/**
 * The cold-storage (Backblaze B2) public host.
 *
 * This was hardcoded as "cold.media.vyavasth.in", which is NXDOMAIN — there has
 * never been such a record on the zone. The live host is `cold-media`, with a
 * hyphen (the backend's own COLD_MEDIA_PUBLIC_URL: cold-media.vyavasth.in in
 * production, cold-media-dev.vyavasth.in on dev). Every cold-tier retry in the
 * gallery grid and single-photo download was therefore failing at DNS rather
 * than falling back.
 *
 * Driven by the env var so a dev build points at the dev bucket instead of
 * production's, with the production host as the fallback for a build that
 * doesn't set it.
 */
const COLD = hostFrom(process.env.NEXT_PUBLIC_COLD_MEDIA_URL) ?? "cold-media.vyavasth.in";

/** Hostname out of a full URL (or a bare host), or null if there isn't one. */
function hostFrom(value: string | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  try {
    return new URL(raw.includes("://") ? raw : `https://${raw}`).hostname || null;
  } catch {
    return null;
  }
}

/**
 * Rewrite a stale hot-host media URL to the cold-storage host. A URL can
 * outlive the migration grace window — a bookmark, a long-lived client
 * cache, an emailed link — so every original-fetching path retries once
 * against the cold host before giving up. A URL that isn't on the hot host
 * (already cold, or unrelated) is returned unchanged.
 */
export const coldFallback = (url: string): string => url.replace(`//${HOT}/`, `//${COLD}/`);

/**
 * Pure. The same photo under a URL the page's own `<img>` tags never use.
 *
 * On many Android phones the first `fetch` of a photo the gallery has already
 * shown is refused ("Failed to fetch") even with `no-store`, while the same
 * photo under this URL goes through: Cloudflare's logs for the 13–14 Oct
 * failures show exactly that pairing, guest after guest. The likeliest cause
 * is the `<img>` copy — fetched WITHOUT an `Origin` header, so stored without
 * CORS headers, and `immutable` for a year — being handed to the download
 * anyway. The query string is ignored by storage and gives the download a
 * cache entry no `<img>` can have got to first. Per host, because the CORS
 * answer names the origin it was given to.
 *
 * A URL that already has a query is left alone: it may be signed, and a signed
 * URL with an extra parameter is a broken one.
 */
export function cacheKeyed(url: string, host: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.search || !host) return url;
    parsed.searchParams.set("o", host);
    return parsed.toString();
  } catch {
    return url;
  }
}

const isAbort = (err: unknown) => err instanceof DOMException && err.name === "AbortError";

/** `cacheKeyed` for this page, or the URL unchanged outside a browser. */
export const keyedForThisPage = (url: string): string =>
  typeof location === "undefined" ? url : cacheKeyed(url, location.host);

/** The photo URL a thrown error belongs to, when `fetchPhotoBlob` threw it. */
export function failedPhotoUrl(err: unknown): string | undefined {
  const url = (err as { photoUrl?: unknown } | null)?.photoUrl;
  return typeof url === "string" ? url : undefined;
}

/** One complete read of a photo: headers AND body, cold host on an HTTP error. */
async function readPhoto(url: string, signal?: AbortSignal): Promise<Blob> {
  let res = await fetch(url, { cache: "no-store", signal });
  if (!res.ok) {
    const fallback = coldFallback(url);
    if (fallback !== url) res = await fetch(fallback, { cache: "no-store", signal });
  }
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  // The body is part of the attempt, not an afterthought: some Android
  // browsers (OPPO's HeyTap among them) accept the response and then fail
  // while reading it, with the same "Failed to fetch" a refused request gives.
  const blob = await res.blob();
  if (blob.size === 0) throw new Error("Download failed: empty response");
  return blob;
}

/**
 * Fetch a photo all the way into memory, for saving. One read normally; when
 * it fails for any reason other than a cancel, one more under `cacheKeyed`.
 * The error that finally escapes carries the URL, so a failure report can say
 * which photo and probe why.
 */
export async function fetchPhotoBlob(url: string, signal?: AbortSignal): Promise<Blob> {
  try {
    return await readPhoto(url, signal);
  } catch (err) {
    if (signal?.aborted || isAbort(err)) throw err;
    const alternate = keyedForThisPage(url);
    if (alternate !== url) {
      try {
        return await readPhoto(alternate, signal);
      } catch {
        /* the first error is the one worth reporting */
      }
    }
    if (err && typeof err === "object") Object.assign(err, { photoUrl: url });
    throw err;
  }
}

/** Grid source for a media item: the 480px thumbnail when one exists, else the
 *  2560px delivery copy. Legacy media, videos, and uploads whose thumbnail step
 *  failed all have no thumbnail and fall back transparently. */
export const gridSrc = (m: { url: string; thumbnail_url?: string | null }) =>
  m.thumbnail_url || m.url;

/**
 * Ordered list of sources a grid tile may fall through, most-preferred first.
 * `gridSrc` is always element 0. Consecutive duplicates are dropped (an already
 * cold URL's `coldFallback` is itself), so a tile never retries the exact same
 * URL it just failed on.
 */
function gridSrcChain(m: { url: string; thumbnail_url?: string | null }): string[] {
  const thumb = m.thumbnail_url || null;
  const chain = thumb
    ? // A thumbnail can be missing on either host while the delivery copy is
      // fine — e.g. mid-migration, or a photo the backfill hasn't reached — so
      // degrade to the 2560px copy (guaranteed to exist) before giving up.
      [thumb, coldFallback(thumb), m.url, coldFallback(m.url)]
    : [m.url, coldFallback(m.url)];
  return chain.filter((url, i) => url && url !== chain[i - 1]);
}

/**
 * `onError` handler for a grid tile: advance the image to the next source in
 * its chain. Tracks position in a `dataset` counter rather than a boolean flag
 * so the tile can degrade through every step instead of only once.
 */
export function degradeGridSrc(
  el: HTMLImageElement,
  m: { url: string; thumbnail_url?: string | null },
): void {
  const chain = gridSrcChain(m);
  const next = Number(el.dataset.srcStep ?? "0") + 1;
  if (next >= chain.length) return;
  el.dataset.srcStep = String(next);
  el.src = chain[next];
}

/** Download one photo by fetching from its public URL and saving locally.
 *  Retries as `fetchPhotoBlob` does (cold host, then a cache-keyed URL). */
export async function downloadImage(url: string, filename?: string): Promise<void> {
  triggerBlobDownload(await fetchPhotoBlob(url), filename ?? nameFromUrl(url));
}

/** A photo to place in a browser-built ZIP: source URL + the entry name to use. */
export type ZipEntry = { url: string; name: string };

/**
 * How many originals to fetch in parallel while building the ZIP. Kept modest so
 * we don't overwhelm R2 or the browser's connection pool under bursty load.
 */
const ZIP_CONCURRENCY = 8;

/** Sentinel thrown to unwind the ZIP pipeline when the user stops a download.
 *  A DOMException so it reads the same as a fetch abort at every catch site. */
const ABORTED = new DOMException("Download cancelled", "AbortError");

/** Attempts per image before skipping it. Transient failures (429, 5xx, and
 *  mid-stream HTTP/2 resets) usually recover on a later try. */
const FETCH_ATTEMPTS = 4;

/**
 * Fetch one original fully into a Blob, retrying transient failures. Buffering
 * the whole object BEFORE it enters the ZIP is deliberate: it makes each image
 * an atomic, retryable unit, so a network hiccup retries just that image
 * instead of aborting the entire archive — which is what happens when
 * `client-zip` is fed a live network stream that dies mid-read.
 *
 * Returns null when the image can't be fetched after every attempt; the caller
 * skips it and keeps zipping the rest. `onFailure` is told why, once, for a
 * photo that is given up on — never for a cancelled download.
 */
export async function fetchImageBlob(
  url: string,
  signal?: AbortSignal,
  onFailure?: (reason: string) => void,
): Promise<Blob | null> {
  let reason = "no response";
  // First attempt on the URL the gallery shows; every retry on the cache-keyed
  // one (see `cacheKeyed`), which is the attempt that tends to get through.
  const alternate = keyedForThisPage(url);
  for (let attempt = 0; attempt < FETCH_ATTEMPTS; attempt++) {
    if (signal?.aborted) return null;
    try {
      const res = await fetch(attempt === 0 ? url : alternate, { cache: "no-store", signal });
      if (res.ok) {
        // `.blob()` reads the FULL body here — a cut stream throws and we retry.
        const blob = await res.blob();
        if (blob.size > 0) return blob;
        reason = "empty response body";
      } else {
        reason = `HTTP ${res.status}`;
        if (res.status !== 429 && res.status < 500) {
          break; // a genuine 4xx (missing/forbidden) won't improve on retry — but
          // it's also exactly what a migrated-and-purged original looks like, so
          // fall through to the one cold-host attempt below instead of bailing.
        }
      }
    } catch (err) {
      /* network / HTTP2 stream error — fall through to backoff + retry */
      reason = describeError(err);
    }
    if (attempt < FETCH_ATTEMPTS - 1) await delay(500 * 2 ** attempt); // 0.5s, 1s, 2s
  }
  if (signal?.aborted) return null;

  // Every attempt against the original host failed. Try once against the
  // cold-storage host (see coldFallback) before skipping the photo — this is a
  // single extra attempt, not a loop, so a genuinely missing object still fails
  // fast.
  const fallback = coldFallback(url);
  if (fallback !== url) {
    try {
      const res = await fetch(fallback, { cache: "no-store", signal });
      if (res.ok) {
        const blob = await res.blob();
        if (blob.size > 0) return blob;
      }
    } catch {
      /* fall through to null — the first host's reason is the one worth keeping */
    }
  }
  if (!signal?.aborted) onFailure?.(reason);
  return null;
}

/**
 * Result of a browser-built ZIP: entries zipped vs. skipped, plus two distinct
 * ways of not finishing — `cancelled` when the user dismissed the "Save as"
 * dialog (nothing had started yet), `aborted` when they stopped a download
 * already in flight. The caller words those differently.
 */
export type ZipResult = { zipped: number; failed: number; cancelled?: boolean; aborted?: boolean };

/** The File System Access "Save as" picker (not in the default TS lib). */
type FsWritable = WritableStream<Uint8Array> & {
  close(): Promise<void>;
  abort(reason?: unknown): Promise<void>;
};
type SaveFilePicker = (opts: {
  suggestedName?: string;
  types?: { description?: string; accept: Record<string, string[]> }[];
}) => Promise<{ createWritable: () => Promise<FsWritable> }>;

/**
 * Open a save target for the ZIP. Where the File System Access API exists
 * (Chrome/Edge desktop) this shows a "Save as" dialog and returns a stream
 * straight to disk — TRUE streaming, so a multi-GB gallery never sits in RAM.
 * MUST be called from within the click gesture (before any long await) or the
 * picker throws. Returns null where the API is missing (→ Blob fallback), and
 * re-throws the AbortError if the user cancels the dialog.
 */
async function openZipTarget(name: string): Promise<FsWritable | null> {
  const picker = (window as unknown as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
  if (typeof picker !== "function") return null;
  const handle = await picker({
    suggestedName: name,
    types: [{ description: "ZIP archive", accept: { "application/zip": [".zip"] } }],
  });
  return handle.createWritable();
}

/** Fallback save: trigger a normal download of an already-built Blob (used where
 *  the File System Access API isn't available). */
export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Ensure every ZIP entry has a unique path — two folders can hold the same
 *  filename. Appends " (1)", " (2)", … before the extension (mirrors the old
 *  server-side `dedupe_arcname`). */
function dedupeNames(entries: ZipEntry[]): ZipEntry[] {
  const seen = new Map<string, number>();
  return entries.map(({ url, name }) => {
    const key = name.toLowerCase();
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    if (n === 0) return { url, name };
    const dot = name.lastIndexOf(".");
    const base = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : "";
    return { url, name: `${base} (${n})${ext}` };
  });
}

/**
 * Build a ZIP of the given photos entirely in the browser — no server-side zip.
 * Each original is fetched (with retry) directly from its public R2 URL and
 * buffered fully before it enters the archive, so a flaky network can't abort
 * the whole download; `client-zip` writes STORED (no re-compression) entries.
 * On browsers with the File System Access API the archive streams straight to
 * disk (bounded memory, any size); otherwise it's built into a Blob and
 * downloaded.
 *
 * NOT the gallery download path any more. Bulk gallery downloads — guest and
 * studio alike — go through `planDownload` + `lib/download/engines.ts`, which
 * add the pre-flight, the folder-picker method, quality tiers and batching.
 * This remains for "Locate original images", whose not-found bundle is a small,
 * always-web-tier ZIP with its own toast-driven UX and no notion of a plan.
 *
 * `source` may be a ready array OR a function returning one — pass the function
 * form when resolving the list is slow (e.g. paginating a whole gallery), so the
 * save dialog opens on the click gesture BEFORE that work runs.
 *
 * Resolves with counts (and `cancelled` if the save dialog was dismissed, or
 * `aborted` if `signal` fired mid-flight); throws only if entries existed but
 * NONE could be fetched.
 */
export async function streamZipToDisk(
  source: ZipEntry[] | (() => Promise<ZipEntry[]>),
  zipName = "gallery.zip",
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<ZipResult> {
  const base = zipName.replace(/\.zip$/i, "").replace(/[\\/:*?"<>|\r\n]+/g, " ").trim() || "gallery";
  const name = `${base}.zip`;

  // Open the save target FIRST, while the click gesture is still live (the File
  // System Access picker needs it); only THEN resolve the (possibly paginated)
  // entry list, so building a huge list can't expire the gesture.
  let target: FsWritable | null;
  try {
    target = await openZipTarget(name);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { zipped: 0, failed: 0, cancelled: true }; // user dismissed the dialog
    }
    throw err;
  }

  const list = typeof source === "function" ? await source() : source;
  // The entry walk can be slow (a whole-gallery pagination); a cancel landing
  // during it should not then start downloading thousands of photos.
  if (signal?.aborted) {
    if (target) await target.abort(ABORTED).catch(() => {});
    return { zipped: 0, failed: 0, aborted: true };
  }
  const entries = dedupeNames(list);
  const total = entries.length;
  if (total === 0) {
    if (target) await target.close().catch(() => {});
    return { zipped: 0, failed: 0 };
  }

  const { makeZip } = await import("client-zip");

  let done = 0;
  let zipped = 0;
  let failed = 0;
  async function* members(): AsyncGenerator<{ name: string; input: Blob }> {
    // Sliding window of in-flight downloads — each resolves to a fully-buffered
    // Blob (or null), so what we hand `client-zip` is always complete.
    const pending: { name: string; blob: Promise<Blob | null> }[] = [];
    let next = 0;
    const fill = () => {
      while (pending.length < ZIP_CONCURRENCY && next < entries.length) {
        const e = entries[next++];
        pending.push({ name: e.name, blob: fetchImageBlob(e.url, signal) });
      }
    };
    fill();
    while (pending.length) {
      // Checked before each member rather than only between pages, so a cancel
      // lands within one photo instead of at the end of the archive.
      if (signal?.aborted) throw ABORTED;
      const item = pending.shift()!;
      fill(); // keep the window full as we drain
      const blob = await item.blob;
      if (signal?.aborted) throw ABORTED;
      onProgress?.(++done, total);
      if (blob) {
        zipped++;
        yield { name: item.name, input: blob };
      } else {
        failed++;
      }
    }
  }

  const zipStream = makeZip(members());
  try {
    if (target) {
      await zipStream.pipeTo(target); // true streaming to disk (bounded memory)
    } else {
      const blob = await new Response(zipStream).blob(); // buffer, then download
      triggerBlobDownload(blob, name);
    }
  } catch (err) {
    if (target) await target.abort(err).catch(() => {});
    // A user-initiated stop is an outcome, not a failure — the partially
    // written file is discarded by the abort above.
    if (err === ABORTED || (err instanceof DOMException && err.name === "AbortError")) {
      return { zipped, failed, aborted: true };
    }
    throw err;
  }

  if (zipped === 0) throw new Error("Could not download any of the photos.");
  return { zipped, failed };
}

export type ShareResult = "shared" | "copied" | "cancelled" | "failed";

/**
 * Share a photo via the Web Share API — prefers sharing the file (native sheet
 * with the image, fetched from R2), then the URL, finally copying the link to
 * the clipboard.
 */
export async function shareImage(url: string, title?: string): Promise<ShareResult> {
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  const name = nameFromUrl(url);
  try {
    if (nav?.canShare) {
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) {
        const blob = await res.blob();
        const file = new File([blob], name, { type: blob.type || "image/jpeg" });
        if (nav.canShare({ files: [file] })) {
          await nav.share({ files: [file], title });
          return "shared";
        }
      }
    }
    if (nav?.share) {
      await nav.share({ url, title });
      return "shared";
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
    // fall through to clipboard
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}
