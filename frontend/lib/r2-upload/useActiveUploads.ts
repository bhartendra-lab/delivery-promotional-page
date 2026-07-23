"use client";

import { useMemo, useSyncExternalStore } from "react";
import {
  activeUploadIdsServerSnapshot,
  activeUploadsServerSnapshot,
  listActiveUploadIds,
  listActiveUploads,
  subscribeActiveUploads,
  type ActiveUpload,
} from "./registry";

/**
 * Every booking currently uploading or paused, with live progress. Updates on
 * every engine tick — use it only where the numbers are actually shown.
 */
export function useActiveUploads(): ActiveUpload[] {
  return useSyncExternalStore(subscribeActiveUploads, listActiveUploads, activeUploadsServerSnapshot);
}

/**
 * Booking ids with a live run — for per-row "this one is uploading" states.
 * Backed by a snapshot that only changes when a run starts or ends, so a list
 * of event cards doesn't re-render along with the progress ring.
 */
export function useUploadingBookingIds(): Set<string> {
  const ids = useSyncExternalStore(
    subscribeActiveUploads,
    listActiveUploadIds,
    activeUploadIdsServerSnapshot,
  );
  return useMemo(() => new Set(ids), [ids]);
}
