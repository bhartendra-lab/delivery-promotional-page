// lib/r2-upload/session-watermark.ts — PURE. No React, no IndexedDB, no fetch.
//
// The "Allow watermark" choice of an unfinished upload session, read back from
// the records it left in IndexedDB.
//
// A session is the set of records an event still holds: they are wiped when
// every photo has been saved or the run is cancelled (see the engine's
// `drainAllMetadata` and `cancel`), so whatever is left IS an interrupted
// session. Each record carries the choice of the run that wrote it, which is
// what lets a studio who reloads halfway and re-selects the folder find the
// toggle where they left it.

import type { UploadRecord } from "./types.ts";

type Choice = Pick<UploadRecord, "watermark" | "updatedAt">;

/**
 * The choice to offer when an upload dialog opens on an event with unfinished
 * records: the one the newest record that has a choice was written under.
 * Null when there is no session to continue, or none of its records say (they
 * predate the field), and the dialog then starts from its own default.
 *
 * Newest rather than any: a studio can start a second run over the leftovers of
 * the first, rewriting only the records it re-queues, and the most recent
 * decision is the one they last saw.
 */
export function sessionWatermarkOf(records: readonly Choice[]): boolean | null {
  let latest: Choice | null = null;
  for (const r of records) {
    if (typeof r.watermark !== "boolean") continue;
    if (!latest || r.updatedAt > latest.updatedAt) latest = r;
  }
  return latest ? (latest.watermark as boolean) : null;
}
