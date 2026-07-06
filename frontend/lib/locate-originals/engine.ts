/**
 * "Locate Original Images" runner — the client-side scan → match → copy/zip
 * pipeline shared by both browser paths (File System Access on Chromium; a
 * store-only `client-zip` download everywhere else). No React here.
 *
 * The match target is always the booking's `shortlisted: true` media, with the
 * already-`identified` rows filtered out up front (pre-scan dedup). Matching
 * recomputes each disk file's `media_id` with the *same* `makeFingerprint` /
 * `makeRecordId` the uploader used, so exact matches are an O(1) Set lookup.
 */

import { makeFingerprint, makeRecordId } from "@/lib/r2-upload/state";
import type { ShortlistedMediaItem } from "@/lib/api";
import {
  addToTargets,
  buildTargets,
  matchOne,
  resolveCleanName,
  resolveSize,
  sanitizeFolderName,
  UNCATEGORISED,
  type ManifestEntry,
} from "./match";
import {
  copyFileInto,
  getOutputDir,
  readManifest,
  walkFiles,
  writeManifest,
  type FsDirHandle,
  type SourceFile,
} from "./fsa";

/** A shortlisted media item, enriched with the fields the matcher/router need. */
export type ShortlistTarget = {
  _id: string;
  media_id: string;
  /** Clean original filename (stored, or parsed from media_id). */
  filename: string;
  filesize: number;
  custom_folder_ids: string[];
};

/** One matched target and the disk file(s) that matched it (>1 = conflict). */
export type ScanMatch = {
  target: ShortlistTarget;
  sources: SourceFile[];
  /** "exact" if any file matched by media_id; "fuzzy" = probable (confirm). */
  kind: "exact" | "fuzzy";
};

export type ScanResult = {
  matches: ScanMatch[];
  scannedCount: number;
};

export type CopyProgress = { copied: number; total: number; currentName?: string };

/** Three-count run summary + the ids to mark identified. */
export type RunResult = {
  /** Files written/zipped this run. */
  newlyCopied: number;
  /** Matched but skipped because the dedup manifest already had them. */
  alreadyDelivered: number;
  /** Target items with no (confirmed) match this run. */
  notFound: number;
  /** Media `_id`s of every matched + included target (→ update-media-identified). */
  identifiedIds: string[];
  copiedNames: string[];
};

/** The studio's confirmed pick: one chosen disk file per included target. */
export type IncludedMatch = { target: ShortlistTarget; file: File };

/** Enrich the raw shortlisted rows into match targets (clean name + size). */
export function toTargets(
  items: ShortlistedMediaItem[],
  bookingId: string,
): ShortlistTarget[] {
  return items.map((it) => ({
    _id: it._id,
    media_id: it.media_id,
    filename: resolveCleanName(it, bookingId),
    filesize: resolveSize(it, bookingId),
    custom_folder_ids: it.custom_folder_ids ?? [],
  }));
}

/**
 * Walk a File source (async or sync iterable), recompute each file's media_id and
 * group the matches by target. `onProgress` is called with the running scanned
 * count (throttled to every 25 files + once at the end).
 */
async function scanSource(
  source: AsyncIterable<SourceFile> | Iterable<SourceFile>,
  targets: ShortlistTarget[],
  bookingId: string,
  onProgress: (scanned: number) => void,
): Promise<ScanResult> {
  const index = buildTargets(targets);
  const byId = new Map<
    string,
    { target: ShortlistTarget; sources: SourceFile[]; exact: boolean }
  >();
  let scanned = 0;
  for await (const sf of source as AsyncIterable<SourceFile>) {
    scanned++;
    if (scanned % 25 === 0) onProgress(scanned);
    const mediaId = makeRecordId(bookingId, makeFingerprint(sf.file));
    const res = matchOne(index, mediaId, sf.file.name, sf.file.size);
    if (!res) continue;
    const entry =
      byId.get(res.item._id) ?? { target: res.item, sources: [], exact: false };
    entry.sources.push(sf);
    if (res.kind === "exact") entry.exact = true;
    byId.set(res.item._id, entry);
  }
  onProgress(scanned);
  const matches: ScanMatch[] = [...byId.values()].map((e) => ({
    target: e.target,
    sources: e.sources,
    kind: e.exact ? "exact" : "fuzzy",
  }));
  return { matches, scannedCount: scanned };
}

/** Primary path: recursively scan a picked directory handle. */
export function scanDirectory(
  root: FsDirHandle,
  targets: ShortlistTarget[],
  bookingId: string,
  onProgress: (scanned: number) => void,
): Promise<ScanResult> {
  return scanSource(walkFiles(root), targets, bookingId, onProgress);
}

/** Fallback path: scan a flat `<input webkitdirectory>` File list. */
export function scanFiles(
  files: File[],
  targets: ShortlistTarget[],
  bookingId: string,
  onProgress: (scanned: number) => void,
): Promise<ScanResult> {
  const sources: SourceFile[] = files.map((file) => ({
    file,
    path:
      (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
      file.name,
  }));
  return scanSource(sources, targets, bookingId, onProgress);
}

/** Resolve a target's on-disk subfolder name (first folder id, or Uncategorised). */
function folderNameFor(
  target: ShortlistTarget,
  folderNameById: Map<string, string>,
): string {
  const firstId = target.custom_folder_ids[0];
  return sanitizeFolderName(firstId ? folderNameById.get(firstId) : UNCATEGORISED);
}

/**
 * Primary path copy: stream each included file into
 * `Smartly Selected by Vyavasth AI/<folder>/`, deduped against the on-disk
 * manifest (exact media_id → skip; else filename+size → skip). The manifest is
 * rewritten after every copy so an interrupted run keeps what it already did.
 */
export async function copyToDirectory(
  root: FsDirHandle,
  bookingId: string,
  included: IncludedMatch[],
  folderNameById: Map<string, string>,
  totalTargets: number,
  onProgress: (p: CopyProgress) => void,
): Promise<RunResult> {
  const outDir = await getOutputDir(root);
  const manifest = await readManifest(outDir);
  const manifestIndex = buildTargets(manifest);
  const subdirCache = new Map<string, FsDirHandle>();

  const getSub = async (name: string): Promise<FsDirHandle> => {
    let h = subdirCache.get(name);
    if (!h) {
      h = await outDir.getDirectoryHandle(name, { create: true });
      subdirCache.set(name, h);
    }
    return h;
  };

  let newlyCopied = 0;
  let alreadyDelivered = 0;
  const copiedNames: string[] = [];
  const identifiedIds: string[] = [];
  let done = 0;

  for (const { target, file } of included) {
    // Matched (whether or not we physically copy) → it's been located.
    identifiedIds.push(target._id);
    onProgress({ copied: done, total: included.length, currentName: target.filename });

    const dedup = matchOne(
      manifestIndex,
      makeRecordId(bookingId, makeFingerprint(file)),
      file.name,
      file.size,
    );
    if (dedup) {
      alreadyDelivered++;
      done++;
      continue;
    }

    const sub = await getSub(folderNameFor(target, folderNameById));
    await copyFileInto(sub, target.filename, file);
    newlyCopied++;
    copiedNames.push(target.filename);

    const entry: ManifestEntry = {
      media_id: target.media_id,
      filename: target.filename,
      filesize: target.filesize,
      lastModified: file.lastModified,
      copiedAt: Date.now(),
    };
    manifest.push(entry);
    addToTargets(manifestIndex, entry);
    // Incremental persist — survive an interruption mid-batch.
    await writeManifest(outDir, bookingId, manifest);
    done++;
  }

  onProgress({ copied: done, total: included.length });
  return {
    newlyCopied,
    alreadyDelivered,
    notFound: Math.max(0, totalTargets - included.length),
    identifiedIds,
    copiedNames,
  };
}

/**
 * Fallback path copy: pack every included file into a store-only zip via
 * `client-zip` (streamed, low-memory) and trigger one download, preserving the
 * `<folder>/<clean name>` structure as zip entry paths. No manifest is possible
 * (no write-back) — dedup relies on the DB `identified` flag, which already
 * excluded delivered items from the target set.
 */
export async function zipToDownload(
  included: IncludedMatch[],
  folderNameById: Map<string, string>,
  totalTargets: number,
  archiveName: string,
  onProgress: (p: CopyProgress) => void,
): Promise<RunResult> {
  const { downloadZip } = await import("client-zip");
  onProgress({ copied: 0, total: included.length });

  const entries = included.map(({ target, file }) => ({
    name: `${folderNameFor(target, folderNameById)}/${target.filename}`,
    input: file,
    lastModified: new Date(file.lastModified),
  }));

  const blob = await downloadZip(entries).blob();
  triggerBlobDownload(blob, archiveName);

  onProgress({ copied: included.length, total: included.length });
  return {
    newlyCopied: included.length,
    alreadyDelivered: 0,
    notFound: Math.max(0, totalTargets - included.length),
    identifiedIds: included.map((m) => m.target._id),
    copiedNames: included.map((m) => m.target.filename),
  };
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the download a beat to start before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
