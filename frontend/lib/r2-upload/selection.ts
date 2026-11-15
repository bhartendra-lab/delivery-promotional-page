/**
 * Selection rules: which picked files are uploadable, how a folder selection is
 * grouped into gallery folders, and how a group name is matched to an existing
 * folder.
 *
 * Moved out of UploadModal.tsx (and the pure half of engine.ts `ensureFolders`)
 * so the Vyavasth Studio app groups a phone folder exactly as the web groups a
 * picked one. Works on a plain shape instead of `File`; the modal adapts
 * (`webkitRelativePath` -> `relativePath`). Pure: no browser globals, no
 * imports outside lib/r2-upload.
 */

import { UPLOAD_SPEC } from "./spec.ts";

/** What the rules need of a picked file. `relativePath` is the path within the
 *  picked folder, including the folder itself ("Wedding/Candids/IMG_1.jpg"),
 *  or "" for a file picked on its own. `type` is the MIME type when known. */
export type SelectedFile = {
  name: string;
  size: number;
  lastModified: number;
  relativePath: string;
  type?: string;
};

/** How a selection is grouped, and what is left without a group. */
export type Analysis<T extends SelectedFile = SelectedFile> = {
  kind: "direct" | "grouped" | "mixed";
  /** Parent folder name when exactly one folder is selected; "" otherwise. */
  folderName: string;
  /** Resolved, named groups (flat folders by their own name + subfolders by name). */
  subGroups: Array<{ name: string; files: T[] }>;
  /** Images that genuinely have no home: loose-at-root of a subfoldered folder, or
   *  stray individual files mixed in with folder selections (§5c). */
  looseFiles: T[];
};

/** Camera RAW formats can't be displayed in the browser and are huge — blocked. */
export const RAW_EXTENSIONS = new RegExp(UPLOAD_SPEC.files.rawExtensionPattern, "i");

const ACCEPTED_EXTENSIONS = new RegExp(UPLOAD_SPEC.files.acceptedExtensionPattern, "i");

/** macOS AppleDouble sidecar files (`._foo.jpg`) and other dotfiles aren't real
 *  images — they carry an image extension but no decodable pixel data. */
export function isJunkFile(name: string): boolean {
  const base = name.split("/").pop() ?? name;
  const { basePrefixes, baseNames } = UPLOAD_SPEC.files.junk;
  return (
    basePrefixes.some((p) => base.startsWith(p)) ||
    (baseNames as readonly string[]).includes(base)
  );
}

/**
 * Keep only what we can actually publish, and report how much was dropped —
 * silently discarding files is what made photos appear to "go missing" between
 * the picker and the gallery.
 */
export function filterImages<T extends SelectedFile>(files: T[]): { kept: T[]; skipped: number } {
  const kept = files.filter((f) => {
    if (isJunkFile(f.name)) return false; // macOS AppleDouble / dotfiles
    if (RAW_EXTENSIONS.test(f.name)) return false; // block RAW
    return (
      (f.type ?? "").startsWith(UPLOAD_SPEC.files.acceptedMimePrefix) ||
      ACCEPTED_EXTENSIONS.test(f.name)
    );
  });
  return { kept, skipped: files.length - kept.length };
}

/** The name offered for a folder of individually picked photos:
 *  "Photos – 10 Nov 2026" (en dash; month as en-GB's short month). */
export function defaultFolderName(now: Date = new Date()): string {
  const mon = now.toLocaleDateString("en-GB", { month: "short" });
  return `Photos – ${now.getDate()} ${mon} ${now.getFullYear()}`;
}

/** Path segments of a file's relative path, empty segments dropped. */
export function relParts(f: Pick<SelectedFile, "relativePath">): string[] {
  return (f.relativePath ?? "").split("/").filter(Boolean);
}

function mergeFiles<T>(map: Map<string, T[]>, key: string, files: T[]): void {
  const arr = map.get(key) ?? [];
  arr.push(...files);
  map.set(key, arr);
}

/**
 * Group a selection.
 *
 * - No folder structure at all -> "direct": every file is loose.
 * - Files are bucketed by their top-level folder. Only `firstRoot` (the FIRST
 *   folder picked this session) gets first-level subfolder grouping: if it has
 *   subfolders, every nested descendant rolls up into its first-level
 *   subfolder, and files at its root are loose. A flat first folder, and every
 *   folder added afterwards, is one group under its own name.
 * - Any loose file makes the result "mixed"; otherwise "grouped".
 *
 * Group order is first-seen order, files keep selection order.
 */
export function analyze<T extends SelectedFile>(files: T[], firstRoot: string | null): Analysis<T> {
  if (files.length === 0) {
    return { kind: "grouped", folderName: "", subGroups: [], looseFiles: [] };
  }

  // No folder structure at all → individual image selection (§5d).
  if (files.every((f) => relParts(f).length <= 1)) {
    return { kind: "direct", folderName: "", subGroups: [], looseFiles: files };
  }

  // Bucket files by their top-level parent folder (parts[0]) and classify each
  // parent independently. This is what keeps a previously-picked flat folder
  // (e.g. "abc") intact when a later selection introduces subfolders — its
  // photos stay under "abc" instead of being reclassified as uncategorised.
  const byParent = new Map<string, T[]>();
  const loose: T[] = [];
  for (const f of files) {
    const parts = relParts(f);
    if (parts.length <= 1) {
      loose.push(f); // stray individual file mixed in with folder picks
      continue;
    }
    mergeFiles(byParent, parts[0], [f]);
  }

  const groups = new Map<string, T[]>();
  for (const [parent, pfiles] of byParent) {
    // Only the FIRST folder picked this session gets first-level subfolder
    // grouping. Folders added afterwards are flattened under their own name.
    if (parent !== firstRoot) {
      mergeFiles(groups, parent, pfiles);
      continue;
    }
    const hasSub = pfiles.some((f) => relParts(f).length >= 3);
    if (!hasSub) {
      // Flat folder → the folder itself is one group (§5b).
      mergeFiles(groups, parent, pfiles);
    } else {
      // Roll every nested descendant up into its first-level subfolder (parts[1]).
      for (const f of pfiles) {
        const parts = relParts(f);
        if (parts.length >= 3) mergeFiles(groups, parts[1], [f]);
        else loose.push(f); // loose-at-root within a subfoldered folder → §5c
      }
    }
  }

  const subGroups = Array.from(groups.entries()).map(([name, files]) => ({ name, files }));
  const parents = Array.from(byParent.keys());
  const folderName = parents.length === 1 ? parents[0] : "";

  if (loose.length > 0) {
    return { kind: "mixed", folderName, subGroups, looseFiles: loose };
  }
  return { kind: "grouped", folderName, subGroups, looseFiles: [] };
}

/* ── folder reuse (the pure half of engine.ts ensureFolders) ─────────── */

/** Trim + lowercase so "Candids", " candids ", and "CANDIDS" are one folder. */
export function normalizeFolderName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Which requested folder names already have a folder, and which must be
 * created.
 *
 * Lookup is by normalized name, so a folder created moments ago (stale caller
 * state) or typed with different casing/whitespace is reused instead of
 * duplicated. `resolved` starts as a copy of `existing` and stays keyed by the
 * EXACT requested name, so callers can `.get(name)` with what they passed in.
 * `toCreate` holds exactly one name per distinct normalized name not found
 * (two groups named "Candids"/"candids" in one upload share one folder and one
 * create call), in request order, spelled as first requested.
 */
export function planFolderReuse(
  folderNames: string[],
  existing: Map<string, string>,
): { resolved: Map<string, string>; toCreate: string[] } {
  const byNormalized = new Map<string, string>();
  for (const [name, id] of existing) byNormalized.set(normalizeFolderName(name), id);

  const resolved = new Map(existing);
  const toCreate: string[] = [];
  for (const name of folderNames) {
    const norm = normalizeFolderName(name);
    if (byNormalized.has(norm)) {
      resolved.set(name, byNormalized.get(norm) as string);
    } else if (!toCreate.some((n) => normalizeFolderName(n) === norm)) {
      // Not seen yet in this batch either — queue exactly one create per
      // distinct normalized name.
      toCreate.push(name);
    }
  }
  return { resolved, toCreate };
}

/**
 * Fold freshly created folders into `resolved` (from `planFolderReuse`): every
 * requested name that has no id yet gets the id of the folder whose normalized
 * name matches, existing or created. Returns a new map.
 */
export function applyCreatedFolders(
  folderNames: string[],
  existing: Map<string, string>,
  resolved: Map<string, string>,
  created: Array<{ name: string; id: string }>,
): Map<string, string> {
  const byNormalized = new Map<string, string>();
  for (const [name, id] of existing) byNormalized.set(normalizeFolderName(name), id);
  for (const { name, id } of created) byNormalized.set(normalizeFolderName(name), id);
  const out = new Map(resolved);
  for (const name of folderNames) {
    if (!out.has(name)) {
      const id = byNormalized.get(normalizeFolderName(name));
      if (id) out.set(name, id);
    }
  }
  return out;
}
