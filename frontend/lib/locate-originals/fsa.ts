/**
 * Thin, self-typed wrapper over the File System Access API (Chromium only). We
 * declare the minimal subset we use rather than depend on `lib.dom` shipping the
 * (still non-standard) `showDirectoryPicker` + handle types, so this compiles on
 * any TS lib set. Non-Chromium browsers fall back to the zip path (see engine).
 */

import {
  MANIFEST_FILE,
  OUTPUT_DIR,
  isJunkFile,
  type ManifestEntry,
} from "./match";

export interface WritableFileStream {
  write(data: Blob | ArrayBuffer | string): Promise<void>;
  close(): Promise<void>;
}
export interface FsFileHandle {
  kind: "file";
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<WritableFileStream>;
}
export interface FsDirHandle {
  kind: "directory";
  name: string;
  entries(): AsyncIterableIterator<[string, FsDirHandle | FsFileHandle]>;
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<FsDirHandle>;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FsFileHandle>;
  queryPermission?(opts: { mode: "read" | "readwrite" }): Promise<PermissionState>;
  requestPermission?(opts: { mode: "read" | "readwrite" }): Promise<PermissionState>;
}

/** True on browsers with the directory picker (Chrome/Edge). */
export function supportsFsa(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

/**
 * Prompt for a directory (read-write). Returns null when the user cancels the
 * picker; rethrows anything else so the caller can surface a real error.
 */
export async function pickDirectory(): Promise<FsDirHandle | null> {
  const picker = (
    window as unknown as {
      showDirectoryPicker?: (o?: { mode?: "read" | "readwrite" }) => Promise<FsDirHandle>;
    }
  ).showDirectoryPicker;
  if (!picker) return null;
  try {
    return await picker({ mode: "readwrite" });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return null;
    throw err;
  }
}

/**
 * (Re)acquire read-write permission for a persisted handle — used when reusing a
 * directory picked on a previous visit instead of forcing a fresh pick.
 */
export async function ensureReadwrite(handle: FsDirHandle): Promise<boolean> {
  try {
    const q = await handle.queryPermission?.({ mode: "readwrite" });
    if (q === "granted") return true;
    const r = await handle.requestPermission?.({ mode: "readwrite" });
    return r === "granted";
  } catch {
    return false;
  }
}

/** A scanned file plus its path relative to the picked directory. */
export type SourceFile = { file: File; path: string };

/**
 * Recursively yield every readable file under `dir` (with its relative path),
 * skipping junk/dotfiles and our own {@link OUTPUT_DIR} (so re-runs never
 * re-scan already-copied files). Only file metadata is touched here; bytes are
 * read lazily on copy.
 */
export async function* walkFiles(
  dir: FsDirHandle,
  prefix = "",
): AsyncGenerator<SourceFile> {
  for await (const [name, handle] of dir.entries()) {
    if (isJunkFile(name)) continue;
    const path = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === "file") {
      try {
        yield { file: await handle.getFile(), path };
      } catch {
        // Unreadable entry (permissions, deleted mid-scan) — skip it.
      }
    } else if (handle.kind === "directory" && name !== OUTPUT_DIR) {
      yield* walkFiles(handle, path);
    }
  }
}

/** Get (creating if needed) the `OUTPUT_DIR` folder inside the picked directory. */
export function getOutputDir(root: FsDirHandle): Promise<FsDirHandle> {
  return root.getDirectoryHandle(OUTPUT_DIR, { create: true });
}

/** Stream a file into `dir` under `filename` (Blob write streams internally). */
export async function copyFileInto(
  dir: FsDirHandle,
  filename: string,
  file: File,
): Promise<void> {
  const fh = await dir.getFileHandle(filename, { create: true });
  const w = await fh.createWritable();
  await w.write(file);
  await w.close();
}

/** Read the dedup manifest at the root of the output dir; missing = first run. */
export async function readManifest(outDir: FsDirHandle): Promise<ManifestEntry[]> {
  try {
    const fh = await outDir.getFileHandle(MANIFEST_FILE);
    const file = await fh.getFile();
    const data = JSON.parse(await file.text());
    return Array.isArray(data?.entries) ? (data.entries as ManifestEntry[]) : [];
  } catch {
    return [];
  }
}

/** Persist the dedup manifest at the root of the output dir. */
export async function writeManifest(
  outDir: FsDirHandle,
  bookingId: string,
  entries: ManifestEntry[],
): Promise<void> {
  const fh = await outDir.getFileHandle(MANIFEST_FILE, { create: true });
  const w = await fh.createWritable();
  await w.write(JSON.stringify({ version: 1, bookingId, entries }, null, 2));
  await w.close();
}
