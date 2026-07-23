/**
 * Module-level registry of upload engines, keyed by `bookingId`.
 *
 * The engine instances live here — outside the React component tree — so an
 * upload that starts on booking A keeps running (or stays paused) after the
 * Member navigates to booking B and back. A remounting event page re-attaches
 * to the existing instance via `getUploadEngine(bookingId)` and immediately
 * sees its live progress; it never spins up a second engine for the same
 * booking.
 *
 * IndexedDB (per-booking, see `state.ts`) is the durable backstop across full
 * reloads/crashes; this in-memory registry is what keeps an *active or paused*
 * run alive across client-side route changes within a single page load.
 */

import { UploadEngineCore } from "./engine";

const engines = new Map<string, UploadEngineCore>();

/** Booking display names, so a cross-booking indicator can label the run. */
const bookingNames = new Map<string, string>();

type ActiveListener = () => void;
const activeListeners = new Set<ActiveListener>();

/** Get (creating once) the engine for a booking. Survives route changes. */
export function getUploadEngine(bookingId: string): UploadEngineCore {
  let engine = engines.get(bookingId);
  if (!engine) {
    engine = new UploadEngineCore(bookingId);
    engines.set(bookingId, engine);
    // Keep the cross-booking active set in sync with this engine's lifecycle.
    engine.subscribe(() => notifyActive());
  }
  return engine;
}

/** Peek without creating — returns undefined if no engine exists yet. */
export function peekUploadEngine(bookingId: string): UploadEngineCore | undefined {
  return engines.get(bookingId);
}

/** Record a friendly name for a booking (for the global upload indicator). */
export function setBookingName(bookingId: string, name: string): void {
  if (name && bookingNames.get(bookingId) !== name) {
    bookingNames.set(bookingId, name);
    notifyActive();
  }
}

export type ActiveUpload = {
  bookingId: string;
  name: string;
  paused: boolean;
  /** Ring percentage (0–100) for the floating indicator. */
  percent: number;
  photosDone: number;
  photosTotal: number;
};

const EMPTY: ActiveUpload[] = [];
const EMPTY_IDS: string[] = [];
/**
 * Cached snapshot — recomputed only when the active set changes, so it stays
 * referentially stable between notifications (required by useSyncExternalStore).
 */
let activeSnapshot: ActiveUpload[] = EMPTY;
/**
 * Just the booking ids, held separately and only replaced when the *set*
 * changes. Progress ticks several times a second; consumers that merely ask
 * "is this event uploading?" (event cards, the account menu) subscribe to this
 * instead and re-render once per upload, not once per tick.
 */
let activeIdsSnapshot: string[] = EMPTY_IDS;

function recomputeSnapshot(): void {
  const out: ActiveUpload[] = [];
  for (const [bookingId, engine] of engines) {
    const progress = engine.getState();
    if (progress.isUploading || progress.isSavingMetadata) {
      out.push({
        bookingId,
        name: bookingNames.get(bookingId) ?? "Event",
        paused: progress.paused,
        percent: progress.percent,
        photosDone: progress.photosDone,
        photosTotal: progress.photosTotal,
      });
    }
  }
  activeSnapshot = out.length === 0 ? EMPTY : out;

  const ids = out.map((u) => u.bookingId);
  const sameSet =
    ids.length === activeIdsSnapshot.length && ids.every((id, i) => activeIdsSnapshot[i] === id);
  if (!sameSet) activeIdsSnapshot = ids.length === 0 ? EMPTY_IDS : ids;
}

/** Every booking whose engine is currently uploading or paused (stable ref). */
export function listActiveUploads(): ActiveUpload[] {
  return activeSnapshot;
}

/** Stable server snapshot for useSyncExternalStore (no uploads during SSR). */
export function activeUploadsServerSnapshot(): ActiveUpload[] {
  return EMPTY;
}

/** Booking ids with a live run — reference-stable until the set itself changes. */
export function listActiveUploadIds(): string[] {
  return activeIdsSnapshot;
}

export function activeUploadIdsServerSnapshot(): string[] {
  return EMPTY_IDS;
}

/** Subscribe to changes in the active-uploads set (returns an unsubscribe). */
export function subscribeActiveUploads(fn: ActiveListener): () => void {
  activeListeners.add(fn);
  return () => activeListeners.delete(fn);
}

function notifyActive(): void {
  recomputeSnapshot();
  for (const fn of activeListeners) fn();
}

/* ── remote controls (the floating cross-booking indicator) ─────── */

/**
 * Pause / resume / cancel a run from outside its own event page. These are
 * thin pass-throughs to the registered engine — a booking with no engine (or
 * no live run) is a no-op, so the indicator never needs to guard first.
 */
export function pauseUploadFor(bookingId: string): void {
  peekUploadEngine(bookingId)?.pause();
}

export function resumeUploadFor(bookingId: string): void {
  peekUploadEngine(bookingId)?.resume();
}

/** Cancel a run; resolves with how many photos actually made it to the gallery. */
export function cancelUploadFor(bookingId: string): Promise<{ savedCount: number }> {
  const engine = peekUploadEngine(bookingId);
  return engine ? engine.cancel() : Promise.resolve({ savedCount: 0 });
}
