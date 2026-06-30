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
};

const EMPTY: ActiveUpload[] = [];
/**
 * Cached snapshot — recomputed only when the active set changes, so it stays
 * referentially stable between notifications (required by useSyncExternalStore).
 */
let activeSnapshot: ActiveUpload[] = EMPTY;

function recomputeSnapshot(): void {
  const out: ActiveUpload[] = [];
  for (const [bookingId, engine] of engines) {
    const progress = engine.getState();
    if (progress.isUploading || progress.isSavingMetadata) {
      out.push({ bookingId, name: bookingNames.get(bookingId) ?? "Event", paused: progress.paused });
    }
  }
  activeSnapshot = out.length === 0 ? EMPTY : out;
}

/** Every booking whose engine is currently uploading or paused (stable ref). */
export function listActiveUploads(): ActiveUpload[] {
  return activeSnapshot;
}

/** Stable server snapshot for useSyncExternalStore (no uploads during SSR). */
export function activeUploadsServerSnapshot(): ActiveUpload[] {
  return EMPTY;
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
