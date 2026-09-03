/**
 * The four download engines. DUMB EXECUTORS — not one of them contains a
 * conditional about platform, tier or capability. They receive a plan (and,
 * where behaviour must vary, an explicit argument computed by `planDownload`)
 * and carry it out.
 *
 * Everything policy-shaped lives in `plan.ts`. If you find yourself reaching for
 * `isIOS()` or `tier === "original"` in this file, the decision belongs there.
 *
 *   directory   — write each file into a chosen folder, streamed, no ZIP
 *   streamZip   — one ZIP streamed to disk
 *   memoryZip   — one ZIP built in RAM
 *   batchedZip  — memoryZip, once per part, each part user-initiated
 */

import { coldFallback, fetchImageBlob, triggerBlobDownload } from "../media-actions";
import { dedupeName, sanitiseFilename, type PlanItem } from "./plan.ts";

/* ── File System Access types ────────────────────────────────────────────────
 *
 * Declared locally rather than imported from `lib/locate-originals/fsa.ts`: the
 * guest gallery bundle should not pull in a dashboard-only feature, and this
 * needs a writable that is a real `WritableStream` (so a response body can be
 * `pipeTo`'d straight into it) plus `abort`, which that wrapper does not model.
 */

export type FsWritable = WritableStream<Uint8Array> & {
  write(data: Blob | Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort(reason?: unknown): Promise<void>;
};

export type FsFileHandle = {
  kind: "file";
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<FsWritable>;
};

export type FsDirHandle = {
  kind: "directory";
  name: string;
  entries(): AsyncIterableIterator<[string, FsDirHandle | FsFileHandle]>;
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<FsDirHandle>;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FsFileHandle>;
  removeEntry(name: string, opts?: { recursive?: boolean }): Promise<void>;
  queryPermission?(opts: { mode: "read" | "readwrite" }): Promise<PermissionState>;
  requestPermission?(opts: { mode: "read" | "readwrite" }): Promise<PermissionState>;
};

type DirectoryPicker = (opts?: {
  mode?: "read" | "readwrite";
  id?: string;
}) => Promise<FsDirHandle>;

type SaveFilePicker = (opts: {
  suggestedName?: string;
  types?: { description?: string; accept: Record<string, string[]> }[];
}) => Promise<{ createWritable: () => Promise<FsWritable> }>;

/* ── Shared shapes ───────────────────────────────────────────────────────── */

/** Sentinel thrown to unwind a pipeline when the user stops a download. A
 *  DOMException so it reads the same as a fetch abort at every catch site. */
const ABORTED = new DOMException("Download cancelled", "AbortError");

export type DownloadProgress = {
  done: number;
  total: number;
  bytesDone: number;
  totalBytes: number;
  /** Bytes/second, null until enough has moved to mean anything. */
  throughput: number | null;
  /** Seconds remaining, null until throughput is measurable. */
  etaSeconds: number | null;
};

export type EngineResult = {
  saved: number;
  /** Already present in the target folder at the right size (directory only). */
  skipped: number;
  failed: number;
  /** The picker was dismissed before anything started. */
  cancelled?: boolean;
  /** Stopped mid-flight. */
  aborted?: boolean;
  /** Name of the folder written into (directory only). */
  folderName?: string;
};

/**
 * Mints real URLs for the items whose `needsArchiveUrl` is set. Injected rather
 * than called directly so the engines stay free of any notion of "tier": for a
 * web-tier download the caller passes nothing and every item already carries
 * its URL.
 *
 * Returning no entry for an item is not an error — it means the server declined
 * or has no archive object for it, and the item downloads its web copy instead
 * (the run-time twin of `planDownload`'s `degraded`).
 */
export type ArchiveUrlResolver = (
  items: PlanItem[],
  signal: AbortSignal,
) => Promise<Map<string, { url: string; name?: string }>>;

type RunOptions = {
  items: PlanItem[];
  /** Parallel fetches. Computed from the tier by the caller — see
   *  `concurrencyForTier`. The engine does not know why it is 3 or 8. */
  concurrency: number;
  resolveArchiveUrls?: ArchiveUrlResolver;
  onProgress?: (progress: DownloadProgress) => void;
  signal: AbortSignal;
};

/** Live counters + the throughput/ETA estimate, shared by every engine. */
function progressTracker(items: PlanItem[], onProgress?: (p: DownloadProgress) => void) {
  const total = items.length;
  const totalBytes = items.reduce((n, i) => n + i.bytes, 0);
  const startedAt = Date.now();
  let done = 0;
  let bytesDone = 0;
  // Bytes actually pulled over the network. Kept apart from `bytesDone` so a
  // resumed run — where most items are skipped instantly — doesn't report a
  // throughput of several GB/s and an ETA of zero.
  let fetchedBytes = 0;
  return {
    advance(bytes: number, fetched = true) {
      done += 1;
      bytesDone += bytes;
      if (fetched) fetchedBytes += bytes;
      const elapsed = (Date.now() - startedAt) / 1000;
      // No estimate until there is something to estimate FROM. An upfront or
      // near-instant guess is worse than no number: a wrong ETA erodes trust
      // more than an absent one, which is also why nothing is shown before the
      // download starts.
      const measurable = elapsed >= 3 && fetchedBytes > 0;
      const throughput = measurable ? fetchedBytes / elapsed : null;
      onProgress?.({
        done,
        total,
        bytesDone,
        totalBytes,
        throughput,
        etaSeconds:
          throughput && totalBytes > bytesDone
            ? Math.round((totalBytes - bytesDone) / throughput)
            : null,
      });
    },
  };
}

/** Resolve archive URLs for the items that need them, and fold the answers back
 *  in. Items the resolver omits keep their web URL and are reported degraded. */
async function withResolvedUrls(
  items: PlanItem[],
  signal: AbortSignal,
  resolve?: ArchiveUrlResolver,
): Promise<PlanItem[]> {
  const pending = items.filter((i) => i.needsArchiveUrl);
  if (!resolve || pending.length === 0) return items;
  const resolved = await resolve(pending, signal);
  // Names are re-derived for the whole list, not patched item by item: an
  // archive object can legitimately have a different name from its delivery
  // copy (the original may be a RAW or HEIC file where the 2560px copy is a
  // JPEG), and changing one name can create a collision with another item's.
  // Rebuilding the whole per-folder namespace is the only way to keep the
  // uniqueness `planDownload` established.
  const taken = new Map<string, Set<string>>();
  return items.map((item) => {
    const hit = item.needsArchiveUrl ? resolved.get(item.mediaId) : undefined;
    let seen = taken.get(item.folderName);
    if (!seen) {
      seen = new Set<string>();
      taken.set(item.folderName, seen);
    }
    const name = dedupeName(seen, hit?.name ? sanitiseFilename(hit.name, item.mediaId) : item.name);
    // An item the server declined or has no archive object for keeps its web
    // URL — the run-time twin of `planDownload`'s plan-time `degraded`.
    if (item.needsArchiveUrl && !hit) {
      return { ...item, name, needsArchiveUrl: false, degraded: true };
    }
    return { ...item, name, url: hit ? hit.url : item.url, needsArchiveUrl: false };
  });
}

/* ── 1. directory — the good path ────────────────────────────────────────── */

/**
 * Open the folder picker. MUST be called inside the click gesture, before any
 * `await` that could expire the user activation — resolve the plan first, then
 * call this on the confirm click.
 *
 * The `id` gives the picker a remembered starting location per origin, which is
 * a real quality-of-life win on repeat downloads.
 *
 * The two ways of getting no handle are reported separately and must stay that
 * way. `cancelled` is the user dismissing the dialog — an `AbortError`, which is
 * an outcome and not a failure, and must never raise an error toast. Everything
 * else means the API is unusable here: the probe can answer `"directory"` and
 * the call still throw inside a cross-origin iframe or a non-secure context, and
 * the caller re-plans against a ZIP method rather than dead-ending.
 */
export async function openDirectoryTarget(): Promise<{
  dir: FsDirHandle | null;
  cancelled?: boolean;
}> {
  const picker = (window as unknown as { showDirectoryPicker?: DirectoryPicker })
    .showDirectoryPicker;
  if (typeof picker !== "function") return { dir: null };
  try {
    return { dir: await picker({ mode: "readwrite", id: "vyavasth-gallery" }) };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { dir: null, cancelled: true };
    }
    // SecurityError / NotAllowedError / anything else: not a dead end.
    console.warn("[download] directory picker unavailable", err);
    return { dir: null };
  }
}

/** (Re)acquire read-write permission on a handle persisted from a past run. */
export async function ensureReadwrite(handle: FsDirHandle): Promise<boolean> {
  try {
    if ((await handle.queryPermission?.({ mode: "readwrite" })) === "granted") return true;
    return (await handle.requestPermission?.({ mode: "readwrite" })) === "granted";
  } catch {
    return false;
  }
}

/** Files already in a target directory, keyed by name, valued by byte size. */
async function existingFiles(dir: FsDirHandle): Promise<Map<string, number>> {
  const found = new Map<string, number>();
  try {
    for await (const [name, handle] of dir.entries()) {
      if (handle.kind !== "file") continue;
      try {
        found.set(name.toLowerCase(), (await handle.getFile()).size);
      } catch {
        // Unreadable entry — treat as absent and re-fetch.
      }
    }
  } catch {
    // A directory we cannot enumerate simply has no resume information.
  }
  return found;
}

/**
 * Everything already on disk in the folders this plan will write into, as
 * `"folder/name" -> size`. Enumerated BEFORE the first fetch so the modal can
 * tell the guest what will be skipped, and scoped to the folders we actually
 * need rather than walking the user's whole Downloads tree.
 */
export async function scanExisting(
  dir: FsDirHandle,
  items: PlanItem[],
): Promise<Map<string, number>> {
  const byFolder = new Map<string, Map<string, number>>();
  const folders = new Set(items.map((i) => i.folderName));
  for (const folder of folders) {
    if (!folder) {
      byFolder.set("", await existingFiles(dir));
      continue;
    }
    try {
      byFolder.set(folder, await existingFiles(await dir.getDirectoryHandle(folder)));
    } catch {
      byFolder.set(folder, new Map()); // doesn't exist yet — nothing to skip
    }
  }
  const flat = new Map<string, number>();
  for (const [folder, files] of byFolder) {
    for (const [name, size] of files) flat.set(`${folder}/${name}`, size);
  }
  return flat;
}

/**
 * How many of `items` `scanExisting` says are already saved. A file counts only
 * when the name AND the byte size match: size-matching is what makes a
 * truncated file from an interrupted run self-heal instead of being skipped
 * forever. An item whose expected size is unknown (media predating `size`) is
 * never skipped — better a redundant fetch than a silently missing photo.
 */
export function countSkippable(items: PlanItem[], existing: Map<string, number>): number {
  return items.reduce((n, item) => (isAlreadySaved(item, existing) ? n + 1 : n), 0);
}

function isAlreadySaved(item: PlanItem, existing: Map<string, number>): boolean {
  if (item.bytes <= 0) return false;
  const found = existing.get(`${item.folderName}/${item.name.toLowerCase()}`);
  return found === item.bytes;
}

const DIRECTORY_CONCURRENCY = 4;

/**
 * Write every item straight into the chosen folder, streamed.
 *
 * Never `await res.blob()` here: at archive tier a buffered read would hold
 * ~50 MB per in-flight item for no reason, and streaming is the entire point of
 * this path — peak memory is one file's worth of chunks whatever the selection
 * size.
 *
 * Subdirectories mirror `folderName`. Without that, two photos named
 * DSC_4821.jpg from different folders silently overwrite each other — the
 * upload keys carry a nonce for exactly this reason, and the download has to
 * reintroduce the separation.
 */
export async function runDirectoryDownload({
  dir,
  items,
  concurrency = DIRECTORY_CONCURRENCY,
  resolveArchiveUrls,
  onProgress,
  signal,
  existing,
}: Omit<RunOptions, "concurrency"> & {
  dir: FsDirHandle;
  concurrency?: number;
  /** From `scanExisting`, so the skip decision matches what the modal promised. */
  existing?: Map<string, number>;
}): Promise<EngineResult> {
  const resolved = await withResolvedUrls(items, signal, resolveArchiveUrls);
  if (signal.aborted) return { saved: 0, skipped: 0, failed: 0, aborted: true };

  const known = existing ?? new Map<string, number>();
  const progress = progressTracker(resolved, onProgress);
  // Cache of created subdirectory handles — `getDirectoryHandle(create: true)`
  // per photo would be thousands of redundant SAF round-trips on Android.
  const dirs = new Map<string, Promise<FsDirHandle>>();
  const targetDir = (folder: string) => {
    if (!folder) return Promise.resolve(dir);
    let handle = dirs.get(folder);
    if (!handle) {
      handle = dir.getDirectoryHandle(folder, { create: true });
      dirs.set(folder, handle);
    }
    return handle;
  };

  let saved = 0;
  let skipped = 0;
  let failed = 0;

  async function writeOne(item: PlanItem): Promise<void> {
    if (signal.aborted) throw ABORTED;
    if (isAlreadySaved(item, known)) {
      skipped += 1;
      progress.advance(item.bytes, false);
      return;
    }
    const into = await targetDir(item.folderName);
    let writable: FsWritable | null = null;
    try {
      let res = await fetch(item.url, { cache: "no-store", signal });
      if (!res.ok || !res.body) {
        // A migrated booking serves its web copies from the cold host, and an
        // archive object lives there too — the same single retry the ZIP path
        // has always made.
        const fallback = coldFallback(item.url);
        if (fallback !== item.url) res = await fetch(fallback, { cache: "no-store", signal });
      }
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const handle = await into.getFileHandle(item.name, { create: true });
      writable = await handle.createWritable();
      await res.body.pipeTo(writable);
      writable = null; // pipeTo closes it on success
      saved += 1;
      progress.advance(item.bytes);
    } catch (err) {
      // A truncated file left behind looks complete to the guest, so abort the
      // writable and remove the entry. The size-matching resume check is the
      // backstop if removal fails.
      if (writable) await writable.abort(err).catch(() => {});
      await into.removeEntry(item.name).catch(() => {});
      if (signal.aborted || (err instanceof DOMException && err.name === "AbortError")) {
        throw ABORTED;
      }
      failed += 1;
      progress.advance(0, false);
    }
  }

  // Fixed-size worker pool. Higher than 4 does not help a single link and
  // multiplies Storage Access Framework pressure on Android.
  let next = 0;
  const worker = async () => {
    for (;;) {
      const index = next++;
      if (index >= resolved.length) return;
      await writeOne(resolved[index]);
    }
  };
  try {
    await Promise.all(
      Array.from({ length: Math.min(concurrency, resolved.length) }, () => worker()),
    );
  } catch (err) {
    if (err === ABORTED || (err instanceof DOMException && err.name === "AbortError")) {
      return { saved, skipped, failed, aborted: true, folderName: dir.name };
    }
    throw err;
  }
  return { saved, skipped, failed, folderName: dir.name };
}

/* ── 2. streamZip / memoryZip ────────────────────────────────────────────── */

/**
 * Open a "Save as" target for a ZIP. Same gesture discipline as
 * `openDirectoryTarget`. Returns null where the API is missing (→ the Blob
 * path) and `{ cancelled: true }` when the user dismisses the dialog.
 */
export async function openZipTarget(
  name: string,
): Promise<{ target: FsWritable | null; cancelled?: boolean }> {
  const picker = (window as unknown as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
  if (typeof picker !== "function") return { target: null };
  try {
    const handle = await picker({
      suggestedName: name,
      types: [{ description: "ZIP archive", accept: { "application/zip": [".zip"] } }],
    });
    return { target: await handle.createWritable() };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { target: null, cancelled: true };
    }
    console.warn("[download] save picker unavailable", err);
    return { target: null };
  }
}

/** Full path of a ZIP entry: folders are mirrored inside the archive too, and
 *  names are made unique within each folder as they are added. */
function zipPaths(items: PlanItem[]): string[] {
  const taken = new Map<string, Set<string>>();
  return items.map((item) => {
    let seen = taken.get(item.folderName);
    if (!seen) {
      seen = new Set<string>();
      taken.set(item.folderName, seen);
    }
    const name = dedupeName(seen, item.name);
    return item.folderName ? `${item.folderName}/${name}` : name;
  });
}

/**
 * Build one ZIP. `target` non-null streams it to disk (bounded memory, any
 * size); null buffers it into a Blob and triggers a normal download.
 *
 * Each image is fetched fully into a Blob BEFORE it enters the archive — that
 * is what makes it an atomic, retryable unit, so a network hiccup retries one
 * photo instead of aborting the whole file, which is what happens when
 * `client-zip` is fed a live network stream that dies mid-read.
 */
export async function runZipDownload({
  target,
  zipName,
  items,
  concurrency,
  resolveArchiveUrls,
  onProgress,
  signal,
}: RunOptions & { target: FsWritable | null; zipName: string }): Promise<EngineResult> {
  const resolved = await withResolvedUrls(items, signal, resolveArchiveUrls);
  if (signal.aborted) {
    if (target) await target.abort(ABORTED).catch(() => {});
    return { saved: 0, skipped: 0, failed: 0, aborted: true };
  }
  if (resolved.length === 0) {
    if (target) await target.close().catch(() => {});
    return { saved: 0, skipped: 0, failed: 0 };
  }

  const paths = zipPaths(resolved);
  const { makeZip } = await import("client-zip");
  const progress = progressTracker(resolved, onProgress);

  let saved = 0;
  let failed = 0;
  async function* members(): AsyncGenerator<{ name: string; input: Blob }> {
    // Sliding window of in-flight downloads — each resolves to a fully-buffered
    // Blob (or null), so what `client-zip` is handed is always complete.
    const pending: { name: string; bytes: number; blob: Promise<Blob | null> }[] = [];
    let next = 0;
    const fill = () => {
      while (pending.length < concurrency && next < resolved.length) {
        const item = resolved[next];
        pending.push({
          name: paths[next],
          bytes: item.bytes,
          blob: fetchImageBlob(item.url, signal),
        });
        next++;
      }
    };
    fill();
    while (pending.length) {
      // Checked before each member, so a cancel lands within one photo rather
      // than at the end of the archive.
      if (signal.aborted) throw ABORTED;
      const entry = pending.shift()!;
      fill();
      const blob = await entry.blob;
      if (signal.aborted) throw ABORTED;
      progress.advance(blob?.size ?? 0);
      if (blob) {
        saved += 1;
        yield { name: entry.name, input: blob };
      } else {
        failed += 1;
      }
    }
  }

  const zipStream = makeZip(members());
  try {
    if (target) {
      await zipStream.pipeTo(target); // true streaming to disk
    } else {
      const blob = await new Response(zipStream).blob(); // buffer, then download
      triggerBlobDownload(blob, zipName);
    }
  } catch (err) {
    if (target) await target.abort(err).catch(() => {});
    if (err === ABORTED || (err instanceof DOMException && err.name === "AbortError")) {
      return { saved, skipped: 0, failed, aborted: true };
    }
    throw err;
  }
  return { saved, skipped: 0, failed };
}

/* ── 3. batchedZip ───────────────────────────────────────────────────────── */

/**
 * One part of a batched download. Runs `memoryZip` over that part alone.
 *
 * Every part is user-initiated from the modal and never triggered automatically
 * in sequence: browsers block repeated automatic downloads, and a guest who did
 * not click loses track of what actually saved.
 */
export function runBatchPart(
  options: Omit<RunOptions, "items"> & { items: PlanItem[]; zipName: string },
): Promise<EngineResult> {
  return runZipDownload({ ...options, target: null });
}

/** `"{event} - part {i} of {n}.zip"`. */
export function batchPartName(base: string, index: number, count: number): string {
  return `${base} - part ${index + 1} of ${count}.zip`;
}

/* ── 4. Shared: wake lock ────────────────────────────────────────────────── */

type WakeLockSentinel = { released: boolean; release(): Promise<void> };

/**
 * Hold a screen wake lock for the duration of a bulk download, re-acquiring it
 * when the tab comes back to the foreground (the browser drops it on hide).
 * Same pattern as the upload side. Returns a release function; failure to
 * acquire is never surfaced — a download that works without a wake lock is
 * still a download that works.
 */
export function holdWakeLock(): () => void {
  if (typeof navigator === "undefined") return () => {};
  const api = (
    navigator as Navigator & {
      wakeLock?: { request(type: "screen"): Promise<WakeLockSentinel> };
    }
  ).wakeLock;
  if (!api) return () => {};

  let sentinel: WakeLockSentinel | null = null;
  let released = false;
  const acquire = () => {
    if (released || document.visibilityState !== "visible") return;
    api
      .request("screen")
      .then((s) => {
        if (released) void s.release().catch(() => {});
        else sentinel = s;
      })
      .catch(() => {});
  };
  const onVisibility = () => {
    if (document.visibilityState === "visible" && (!sentinel || sentinel.released)) acquire();
  };
  acquire();
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    released = true;
    document.removeEventListener("visibilitychange", onVisibility);
    void sentinel?.release().catch(() => {});
    sentinel = null;
  };
}
