/**
 * IndexedDB-backed upload state store. Raw IDB (no library) — the surface area
 * is small enough that adding a 30KB dependency isn't worth it.
 *
 * Schema:
 *   DB  : "vyavasth_uploads"           v1
 *   OS  : "files"                       keyPath="id"
 *   IDX : "by_booking"                  bookingId
 *   IDX : "by_booking_status"           [bookingId, status]
 */

import type { UploadRecord, UploadStatus } from "./types";

const DB_NAME = "vyavasth_uploads";
const DB_VERSION = 1;
const STORE = "files";

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
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("by_booking", "bookingId", { unique: false });
        store.createIndex("by_booking_status", ["bookingId", "status"], { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Failed to open IDB"));
  });
  return dbPromise;
}

function txn<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => Promise<T> | T): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const store = tx.objectStore(STORE);
        let result: T;
        Promise.resolve(fn(store))
          .then((r) => {
            result = r;
          })
          .catch((err) => {
            tx.abort();
            reject(err);
          });
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error ?? new Error("IDB transaction failed"));
        tx.onabort = () => reject(tx.error ?? new Error("IDB transaction aborted"));
      }),
  );
}

function reqAsPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IDB request failed"));
  });
}

/** Compose the deterministic id for a (booking, file) pair. */
export function makeFingerprint(file: File): string {
  return `${file.name}-${file.size}-${file.lastModified}`;
}
export function makeRecordId(bookingId: string, fingerprint: string): string {
  return `${bookingId}__${fingerprint}`;
}

export async function putRecord(record: UploadRecord): Promise<void> {
  await txn("readwrite", (store) => reqAsPromise(store.put(record)));
}

export async function getRecord(id: string): Promise<UploadRecord | undefined> {
  return txn("readonly", (store) => reqAsPromise(store.get(id) as IDBRequest<UploadRecord | undefined>));
}

export async function updateRecord(
  id: string,
  patch: Partial<UploadRecord>,
): Promise<UploadRecord | null> {
  return txn("readwrite", async (store) => {
    const existing = (await reqAsPromise(store.get(id) as IDBRequest<UploadRecord | undefined>)) ?? null;
    if (!existing) return null;
    const next: UploadRecord = { ...existing, ...patch, updatedAt: Date.now() };
    await reqAsPromise(store.put(next));
    return next;
  });
}

export async function listByBooking(bookingId: string): Promise<UploadRecord[]> {
  return txn("readonly", (store) => {
    const idx = store.index("by_booking");
    return reqAsPromise(idx.getAll(bookingId) as IDBRequest<UploadRecord[]>);
  });
}

export async function listByBookingAndStatus(
  bookingId: string,
  status: UploadStatus,
): Promise<UploadRecord[]> {
  return txn("readonly", (store) => {
    const idx = store.index("by_booking_status");
    return reqAsPromise(idx.getAll([bookingId, status]) as IDBRequest<UploadRecord[]>);
  });
}

export async function clearBooking(bookingId: string): Promise<void> {
  await txn("readwrite", async (store) => {
    const idx = store.index("by_booking");
    const keys = await reqAsPromise(idx.getAllKeys(bookingId) as IDBRequest<IDBValidKey[]>);
    await Promise.all(keys.map((k) => reqAsPromise(store.delete(k))));
  });
}

/** Best-effort: if IDB is unavailable (private mode, Safari quirks), fall back. */
export async function safeListByBooking(bookingId: string): Promise<UploadRecord[]> {
  try {
    return await listByBooking(bookingId);
  } catch {
    return [];
  }
}
