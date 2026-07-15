/**
 * Thin, self-typed wrapper over the File System Access API (Chromium only). We
 * declare the minimal subset we use rather than depend on `lib.dom` shipping the
 * (still non-standard) `showDirectoryPicker` + handle types, so this compiles on
 * any TS lib set. Non-Chromium browsers get a dedicated "use Chrome" screen
 * instead (see LocateOriginals.tsx) — there is no fallback scan/copy path here.
 */

import { OUTPUT_DIR, isJunkFile } from "./match";

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
  removeEntry(name: string, opts?: { recursive?: boolean }): Promise<void>;
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

/** Look up a subdirectory without creating it; null when it doesn't exist. */
export async function getExistingDirectory(
  root: FsDirHandle,
  name: string,
): Promise<FsDirHandle | null> {
  try {
    return await root.getDirectoryHandle(name, { create: false });
  } catch {
    return null;
  }
}

/** Find a free sibling name for a folder that already exists: `name (1)`,
 *  `name (2)`, … — whichever doesn't already exist under `root`. */
export async function findFreeDirName(root: FsDirHandle, name: string): Promise<string> {
  let n = 1;
  let candidate = `${name} (${n})`;
  while (await getExistingDirectory(root, candidate)) {
    n++;
    candidate = `${name} (${n})`;
  }
  return candidate;
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

/** One file found while listing an existing output folder — carries its parent
 *  handle + name so the Replace-mode diff can delete it directly. */
export type ExistingFile = { path: string; parent: FsDirHandle; name: string };

/** Recursively list every file already inside `dir` (e.g. a previous run's
 *  output folder) — no exclusions, since we're already inside it. */
export async function* listExistingFiles(
  dir: FsDirHandle,
  prefix = "",
): AsyncGenerator<ExistingFile> {
  for await (const [name, handle] of dir.entries()) {
    if (isJunkFile(name)) continue;
    const path = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === "file") {
      yield { path, parent: dir, name };
    } else if (handle.kind === "directory") {
      yield* listExistingFiles(handle, path);
    }
  }
}
