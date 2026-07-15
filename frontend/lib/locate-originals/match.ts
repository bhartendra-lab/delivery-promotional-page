/**
 * Pure matching logic for "Locate Original Images" (Smart Selects). No DOM, no
 * File System Access — just the fingerprint parsing, filename cleaning and the
 * shared exact→fuzzy matcher used against the shortlisted set.
 *
 * The stored `media_id` is `makeRecordId(bookingId, makeFingerprint(file))` =
 * `` `${bookingId}__${file.name}-${file.size}-${file.lastModified}` `` (see
 * `lib/r2-upload/state.ts`). Recomputing it over a disk file reproduces it
 * byte-for-byte, which is what makes the O(1) exact match possible.
 */

/** Output folder created inside the studio's picked directory. */
export const OUTPUT_DIR = "Smartly Selected";
/** Subfolder for media with no custom folder (mirrors the uploader convention). */
export const UNCATEGORISED = "Uncategorised";

/** Raw-format extensions checked for a same-named sibling next to a matched
 *  photo (case-insensitive). A list, not a single hardcoded extension, so
 *  supporting another raw format later is a one-line change. */
const RAW_EXTENSIONS = ["CR2"];

/** Anything the matcher/copier should ignore while scanning a directory. */
export function isJunkFile(name: string): boolean {
  const base = name.split("/").pop() ?? name;
  return base.startsWith("._") || base === ".DS_Store" || base.startsWith(".");
}

/** Filename without its extension (or the whole name when there isn't one). */
export function stripExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(0, dot) : filename;
}

/** The filename's extension, including the leading dot (or "" when there isn't one). */
export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(dot) : "";
}

/** True when `filename` has one of the known raw-photo extensions. */
export function isRawFile(filename: string): boolean {
  const ext = extensionOf(filename).slice(1).toUpperCase();
  return RAW_EXTENSIONS.includes(ext);
}

/** Key a raw sibling is indexed/looked-up by: source directory + lowercased base name. */
export function rawSiblingKey(dirPath: string, filename: string): string {
  return `${dirPath}::${stripExtension(filename).toLowerCase()}`;
}

/** Extensions this feature itself ever writes to the output folder — Replace
 *  mode scopes its deletions to these so a stray file the studio placed there
 *  by hand is never touched. */
const MANAGED_EXTENSIONS = ["JPG", "JPEG", "PNG", "WEBP", ...RAW_EXTENSIONS];

/** True when `filename`'s extension is one this feature manages on disk. */
export function isManagedFile(filename: string): boolean {
  const ext = extensionOf(filename).slice(1).toUpperCase();
  return ext !== "" && MANAGED_EXTENSIONS.includes(ext);
}

/**
 * Pull the original filename / size / mtime back out of a `media_id`. The
 * filename itself may contain `-` and digits, so we anchor on the trailing
 * `-{filesize}-{lastModified}` (`-\d+-\d+$`) and take everything before it as
 * the name (greedy, so only the last two numeric groups are consumed).
 */
export function parseMediaId(
  mediaId: string,
  bookingId: string,
): { filename: string; filesize: number; lastModified: number } | null {
  const prefix = `${bookingId}__`;
  const fp = mediaId.startsWith(prefix) ? mediaId.slice(prefix.length) : mediaId;
  const m = fp.match(/^(.*)-(\d+)-(\d+)$/);
  if (!m) return null;
  return { filename: m[1], filesize: Number(m[2]), lastModified: Number(m[3]) };
}

/**
 * The clean original filename to show / export / use on disk. Prefers the stored
 * `filename` field; falls back to parsing it out of `media_id` for legacy docs;
 * finally the raw id (should never happen). Never the raw `media_id`.
 */
export function resolveCleanName(
  item: { filename: string | null; media_id: string },
  bookingId: string,
): string {
  if (item.filename && item.filename.trim()) return item.filename.trim();
  const parsed = parseMediaId(item.media_id, bookingId);
  return parsed?.filename || item.media_id;
}

/** Original filesize (bytes) parsed from the media_id, or 0 when unparseable. */
export function resolveSize(
  item: { media_id: string },
  bookingId: string,
): number {
  return parseMediaId(item.media_id, bookingId)?.filesize ?? 0;
}

/**
 * Strip filesystem-hostile characters (`\ / : * ? " < > |`) from a folder name
 * and trim; empty results fall back to {@link UNCATEGORISED} so we never call
 * getDirectoryHandle("").
 */
export function sanitizeFolderName(name: string | undefined | null): string {
  const clean = (name ?? "")
    .replace(/[\\/:*?"<>|\r\n]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return clean || UNCATEGORISED;
}

/** Fuzzy comparison key: lowercased filename + size (ignores mtime drift). */
export function fuzzyKey(filename: string, filesize: number): string {
  return `${filename.toLowerCase()}|${filesize}`;
}

/** Minimum shape the shared matcher needs on both sides. */
export interface Matchable {
  media_id: string;
  /** Clean original filename (any case — the fuzzy key lowercases it). */
  filename: string;
  filesize: number;
}

export type MatchTargets<T extends Matchable> = {
  exact: Map<string, T>;
  fuzzy: Map<string, T[]>;
};

/** Index a target set for O(1) exact + fuzzy lookup. */
export function buildTargets<T extends Matchable>(items: T[]): MatchTargets<T> {
  const exact = new Map<string, T>();
  const fuzzy = new Map<string, T[]>();
  for (const it of items) {
    exact.set(it.media_id, it);
    const key = fuzzyKey(it.filename, it.filesize);
    const arr = fuzzy.get(key);
    if (arr) arr.push(it);
    else fuzzy.set(key, [it]);
  }
  return { exact, fuzzy };
}

/**
 * The shared match order: (1) exact `media_id`; (2) else fuzzy `filename +
 * filesize`. A fuzzy hit is a *probable* match (mtime drifted) that the caller
 * must confirm.
 */
export function matchOne<T extends Matchable>(
  targets: MatchTargets<T>,
  mediaId: string,
  filename: string,
  filesize: number,
): { item: T; kind: "exact" | "fuzzy" } | null {
  const exact = targets.exact.get(mediaId);
  if (exact) return { item: exact, kind: "exact" };
  const arr = targets.fuzzy.get(fuzzyKey(filename, filesize));
  if (arr && arr.length > 0) return { item: arr[0], kind: "fuzzy" };
  return null;
}
