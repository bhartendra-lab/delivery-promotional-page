/**
 * Remembering the folder a gallery was downloaded into.
 *
 * A `FileSystemDirectoryHandle` is structured-cloneable, so IndexedDB can store
 * the handle itself — not a path, which the API never exposes. On a later
 * download of the same booking we offer "save to the same folder" and
 * re-request permission, instead of making the guest find it again. Permission
 * is NOT persisted with the handle: the browser re-prompts, which is the point.
 *
 * Raw IDB, no library — same call as `lib/r2-upload/state.ts`, and a separate
 * database because this is per-origin download preference, not upload state.
 * Every function here is best-effort: a browser with no IndexedDB, a private
 * window, or a rejected permission all just mean "pick a folder again".
 */

import { ensureReadwrite, type FsDirHandle } from "./engines.ts";

const DB_NAME = "vyavasth_downloads";
const DB_VERSION = 1;
const STORE = "folders";

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB not available in this environment"));
  }
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Failed to open IDB"));
  });
}

/** Remember the folder chosen for this booking. Never throws. */
export async function rememberDownloadFolder(
  bookingId: string,
  handle: FsDirHandle,
): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(handle, bookingId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch {
    // A remembered folder is a convenience; losing it costs one extra click.
  }
}

/**
 * The folder remembered for this booking, or null.
 *
 * Read-only: it does NOT request permission, because doing that outside a user
 * gesture either silently fails or prompts at a moment the guest cannot explain.
 * Call `reuseDownloadFolder` from the confirm click instead.
 */
export async function recallDownloadFolder(bookingId: string): Promise<FsDirHandle | null> {
  try {
    const db = await openDb();
    return await new Promise<FsDirHandle | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(bookingId);
      req.onsuccess = () => resolve((req.result as FsDirHandle) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

/** Forget the folder for this booking (a stale handle the guest declined). */
export async function forgetDownloadFolder(bookingId: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(bookingId);
  } catch {
    /* nothing to clean up */
  }
}

/**
 * Re-acquire the remembered folder inside a click gesture. Returns null when
 * there is none, or when permission was refused — in which case the handle is
 * forgotten, so the guest is not asked about the same folder on every attempt.
 */
export async function reuseDownloadFolder(bookingId: string): Promise<FsDirHandle | null> {
  const handle = await recallDownloadFolder(bookingId);
  if (!handle) return null;
  if (await ensureReadwrite(handle)) return handle;
  await forgetDownloadFolder(bookingId);
  return null;
}
