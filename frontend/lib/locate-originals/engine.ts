/**
 * "Locate Original Images" runner — the client-side scan → match → copy
 * pipeline (Chromium's File System Access API only; see fsa.ts). No React here.
 *
 * The match target is always the booking's current `shortlisted: true` media —
 * every run checks the whole shortlist, with no memory of a previous run.
 * Matching recomputes each disk file's `media_id` with the *same*
 * `makeFingerprint` / `makeRecordId` the uploader used, so exact matches are an
 * O(1) Set lookup.
 */

import { makeFingerprint, makeRecordId } from "@/lib/r2-upload/state";
import type { ShortlistedMediaItem } from "@/lib/api";
import {
  buildTargets,
  isRawFile,
  matchOne,
  rawSiblingKey,
  resolveCleanName,
  resolveSize,
  sanitizeFolderName,
  stripExtension,
  extensionOf,
  isManagedFile,
  UNCATEGORISED,
} from "./match";
import {
  copyFileInto,
  listExistingFiles,
  walkFiles,
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
  /** "exact" = found; "fuzzy" = found, but the modified date changed (confirm). */
  kind: "exact" | "fuzzy";
};

export type ScanResult = {
  matches: ScanMatch[];
  scannedCount: number;
  /** `.CR2` (etc.) files seen while scanning, keyed by {@link rawSiblingKey} —
   *  looked up during copy to bring along a matched photo's raw sibling. */
  rawIndex: Map<string, SourceFile>;
};

export type CopyProgress = { copied: number; total: number; currentName?: string };

/** Whether to write into a brand-new/untouched folder, or reconcile an existing
 *  one down to exactly this run's selection. */
export type CopyMode = "create" | "replace";

/** This run's outcome. */
export type RunResult = {
  /** Files newly written this run. */
  copied: number;
  /** Matches whose file was already correctly in place (Replace mode only —
   *  a fresh/new-copy folder never has any). */
  alreadyThere: number;
  /** Shortlisted targets with no confirmed match this run. */
  notFound: number;
  copiedNames: string[];
};

/** The studio's confirmed pick: one chosen disk file per included target. */
export type IncludedMatch = { target: ShortlistTarget; source: SourceFile };

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

function dirOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i >= 0 ? path.slice(0, i) : "";
}

/**
 * Recursively scan a picked directory: match every file against the shortlist
 * targets, and separately index every raw-format file by directory + base name
 * (for the CR2-sibling copy step). `onProgress` is called with the running
 * scanned count (throttled to every 25 files + once at the end).
 */
export async function scanDirectory(
  root: FsDirHandle,
  targets: ShortlistTarget[],
  bookingId: string,
  onProgress: (scanned: number) => void,
): Promise<ScanResult> {
  const index = buildTargets(targets);
  const byId = new Map<
    string,
    { target: ShortlistTarget; sources: SourceFile[]; exact: boolean }
  >();
  const rawIndex = new Map<string, SourceFile>();
  let scanned = 0;
  for await (const sf of walkFiles(root)) {
    scanned++;
    if (scanned % 25 === 0) onProgress(scanned);

    if (isRawFile(sf.file.name)) {
      rawIndex.set(rawSiblingKey(dirOf(sf.path), sf.file.name), sf);
      continue;
    }

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
  return { matches, scannedCount: scanned, rawIndex };
}

/** Resolve a target's on-disk subfolder name (first folder id, or Uncategorised). */
function folderNameFor(
  target: ShortlistTarget,
  folderNameById: Map<string, string>,
): string {
  const firstId = target.custom_folder_ids[0];
  return sanitizeFolderName(firstId ? folderNameById.get(firstId) : UNCATEGORISED);
}

/** One file this run wants at a specific relative path inside the output folder. */
type DesiredEntry = { relPath: string; file: File };

/** The full desired contents of the output folder for this run: each included
 *  match's photo, plus its CR2 sibling when one was found while scanning. */
function desiredEntries(
  included: IncludedMatch[],
  rawIndex: Map<string, SourceFile>,
  folderNameById: Map<string, string>,
): DesiredEntry[] {
  const out: DesiredEntry[] = [];
  for (const { target, source } of included) {
    const folder = folderNameFor(target, folderNameById);
    out.push({ relPath: `${folder}/${target.filename}`, file: source.file });

    const raw = rawIndex.get(rawSiblingKey(dirOf(source.path), source.file.name));
    if (raw) {
      const rawName = `${stripExtension(target.filename)}${extensionOf(raw.file.name)}`;
      out.push({ relPath: `${folder}/${rawName}`, file: raw.file });
    }
  }
  return out;
}

function splitRelPath(relPath: string): { folder: string; filename: string } {
  const i = relPath.lastIndexOf("/");
  return i >= 0 ? { folder: relPath.slice(0, i), filename: relPath.slice(i + 1) } : { folder: "", filename: relPath };
}

/**
 * Reconcile an existing output folder down to exactly `desiredPaths`: delete
 * any file it isn't in (scoped to the file types this feature itself ever
 * writes, so a stray file the studio dropped in there is never touched), and
 * return the subset of `desiredPaths` already correctly present (skip-copy).
 */
async function pruneToDesired(
  outDir: FsDirHandle,
  desiredPaths: Set<string>,
): Promise<Set<string>> {
  const alreadyThere = new Set<string>();
  for await (const ef of listExistingFiles(outDir)) {
    if (desiredPaths.has(ef.path)) {
      alreadyThere.add(ef.path);
    } else if (isManagedFile(ef.name)) {
      await ef.parent.removeEntry(ef.name);
    }
  }
  return alreadyThere;
}

/**
 * Copy every included match (+ CR2 siblings) into `outDir`, sorted into
 * per-folder subfolders. In "replace" mode, `outDir`'s existing contents are
 * first reconciled down to exactly this run's desired set (extra files
 * removed, already-correct files left alone) before writing what's missing.
 */
export async function copyToDirectory(
  outDir: FsDirHandle,
  included: IncludedMatch[],
  rawIndex: Map<string, SourceFile>,
  folderNameById: Map<string, string>,
  totalTargets: number,
  mode: CopyMode,
  onProgress: (p: CopyProgress) => void,
): Promise<RunResult> {
  const desired = desiredEntries(included, rawIndex, folderNameById);
  const desiredPaths = new Set(desired.map((d) => d.relPath));

  const alreadyThere =
    mode === "replace" ? await pruneToDesired(outDir, desiredPaths) : new Set<string>();

  const subdirCache = new Map<string, FsDirHandle>();
  const getSub = async (name: string): Promise<FsDirHandle> => {
    let h = subdirCache.get(name);
    if (!h) {
      h = await outDir.getDirectoryHandle(name, { create: true });
      subdirCache.set(name, h);
    }
    return h;
  };

  let copied = 0;
  const copiedNames: string[] = [];
  let done = 0;
  for (const entry of desired) {
    onProgress({ copied: done, total: desired.length, currentName: entry.file.name });
    if (alreadyThere.has(entry.relPath)) {
      done++;
      continue;
    }
    const { folder, filename } = splitRelPath(entry.relPath);
    const sub = await getSub(folder);
    await copyFileInto(sub, filename, entry.file);
    copied++;
    copiedNames.push(filename);
    done++;
  }
  onProgress({ copied: done, total: desired.length });

  return {
    copied,
    alreadyThere: alreadyThere.size,
    notFound: Math.max(0, totalTargets - included.length),
    copiedNames,
  };
}
