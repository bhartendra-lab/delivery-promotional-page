/**
 * Persist the studio's picked output directory handle per booking, so a return
 * visit (or "Try Again") can re-request permission on the same folder instead of
 * forcing a fresh pick. Mirrors the raw-IDB style of `lib/r2-upload/state.ts`,
 * but in its own database so it never has to version-bump the uploads store.
 *
 * `FileSystemDirectoryHandle` is structured-cloneable, so IDB stores it directly.
 */

import type { FsDirHandle } from "./fsa";

const DB_NAME = "vyavasth_locate";
const DB_VERSION = 1;
const STORE = "dir_handles"; // keyPath = bookingId

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB not available in this environment"));
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "bookingId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Failed to open IDB"));
  });
  return dbPromise;
}

function reqAsPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IDB request failed"));
  });
}

type Row = { bookingId: string; handle: FsDirHandle };

/** Best-effort save; failures (private mode, Safari) are swallowed. */
export async function saveDirHandle(bookingId: string, handle: FsDirHandle): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ bookingId, handle } satisfies Row);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch {
    /* ignore */
  }
}

/** Best-effort load; returns null when absent or IDB is unavailable. */
export async function loadDirHandle(bookingId: string): Promise<FsDirHandle | null> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readonly");
    const row = await reqAsPromise(
      tx.objectStore(STORE).get(bookingId) as IDBRequest<Row | undefined>,
    );
    return row?.handle ?? null;
  } catch {
    return null;
  }
}

export async function clearDirHandle(bookingId: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(bookingId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch {
    /* ignore */
  }
}
