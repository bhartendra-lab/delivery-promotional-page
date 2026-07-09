/**
 * Client-side photo actions — download, share, and browser-side ZIP. Single
 * downloads fetch originals directly from the public R2 URL (CORS must allow
 * this origin). The full-gallery / multi-select ZIP is built entirely in the
 * browser (`client-zip`) — no server-side zip. On browsers with the File System
 * Access API (Chrome/Edge desktop) it streams straight to disk (a "Save as"
 * dialog; bounded memory, any size); elsewhere it falls back to an in-memory
 * Blob download.
 */

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

/** Download one photo by fetching from its public R2 URL and saving locally. */
export async function downloadImage(url: string, filename?: string): Promise<void> {
  const name = filename ?? nameFromUrl(url);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  triggerBlobDownload(await res.blob(), name);
}

/** A photo to place in a browser-built ZIP: source URL + the entry name to use. */
export type ZipEntry = { url: string; name: string };

/**
 * How many originals to fetch in parallel while building the ZIP. Kept modest so
 * we don't overwhelm R2 or the browser's connection pool under bursty load.
 */
const ZIP_CONCURRENCY = 8;

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
 * skips it and keeps zipping the rest.
 */
async function fetchImageBlob(url: string): Promise<Blob | null> {
  for (let attempt = 0; attempt < FETCH_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) {
        // `.blob()` reads the FULL body here — a cut stream throws and we retry.
        const blob = await res.blob();
        if (blob.size > 0) return blob;
      } else if (res.status !== 429 && res.status < 500) {
        return null; // a genuine 4xx (missing/forbidden) won't improve on retry
      }
    } catch {
      /* network / HTTP2 stream error — fall through to backoff + retry */
    }
    if (attempt < FETCH_ATTEMPTS - 1) await delay(500 * 2 ** attempt); // 0.5s, 1s, 2s
  }
  return null;
}

/** Result of a browser-built ZIP: entries zipped vs. skipped, or `cancelled`
 *  when the user dismissed the "Save as" dialog. */
export type ZipResult = { zipped: number; failed: number; cancelled?: boolean };

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
function triggerBlobDownload(blob: Blob, filename: string): void {
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
 * `source` may be a ready array OR a function returning one — pass the function
 * form when resolving the list is slow (e.g. paginating a whole gallery), so the
 * save dialog opens on the click gesture BEFORE that work runs.
 *
 * Resolves with counts (and `cancelled` if the save dialog was dismissed);
 * throws only if entries existed but NONE could be fetched.
 */
export async function streamZipToDisk(
  source: ZipEntry[] | (() => Promise<ZipEntry[]>),
  zipName = "gallery.zip",
  onProgress?: (done: number, total: number) => void,
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
        pending.push({ name: e.name, blob: fetchImageBlob(e.url) });
      }
    };
    fill();
    while (pending.length) {
      const item = pending.shift()!;
      fill(); // keep the window full as we drain
      const blob = await item.blob;
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
    throw err;
  }

  if (zipped === 0) throw new Error("Could not download any of the photos.");
  return { zipped, failed };
}

/** Download several photos sequentially (no ZIP — per the build spec). */
export async function downloadMany(
  urls: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  for (let i = 0; i < urls.length; i++) {
    await downloadImage(urls[i]);
    onProgress?.(i + 1, urls.length);
    if (i < urls.length - 1) await delay(600);
  }
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
