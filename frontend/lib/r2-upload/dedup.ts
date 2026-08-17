/**
 * The upload pipeline's dedup decision: for each selected file, does the
 * backend already have it?
 *
 * Two ways a file is recognised, in the shared order `matchOne` defines:
 *
 *  - **exact** — its fingerprint (`${name}-${size}-${lastModified}`) is already
 *    a saved `media_id` for this booking. Byte-for-byte certainty.
 *  - **fuzzy** — same filename + filesize as a saved media_id, different mtime.
 *    This is the studio case the exact match keeps missing: re-copying,
 *    unzipping or cloud-syncing the same photos into a new local folder resets
 *    `File.lastModified`, so the whole event fingerprints differently and
 *    uploads a second time even though every photo is already in the gallery.
 *
 * A fuzzy hit is a *probable* match. Locate Originals can afford to act on the
 * first candidate it finds because the studio confirms the scan results before
 * anything is copied; here there is no review step — a skip is silent, final,
 * and indistinguishable from a successful upload in the progress bar. So this
 * module only claims a file is already uploaded when the claim is unambiguous:
 *
 *  1. Exactly one saved media_id carries that filename+filesize. Several means
 *     we cannot tell which one this file is (or whether it is a third photo
 *     that merely collides), so it uploads.
 *  2. No other file in the same batch has already claimed that media_id. One
 *     saved photo can only be the twin of one selected file; letting two files
 *     claim it would drop a photo.
 *  3. No file in the batch matches that media_id *exactly*. If a byte-identical
 *     file is present, the media_id is spoken for, and a same-name/size file
 *     with a different mtime is a weaker claim on it than that. Collected up
 *     front so the outcome doesn't depend on the order files were selected in.
 *
 * Every rejected claim errs the same way: upload the file. The worst case there
 * is a visible duplicate in the gallery, which the studio can delete; the worst
 * case in the other direction is a photo that never uploads and says nothing.
 *
 * Relative imports below carry their `.ts` extension so this module and its
 * test load under `node --test` (Node's type stripping does no extension
 * resolution); `allowImportingTsExtensions` keeps TS and the bundler happy.
 */

import {
  buildTargets,
  fuzzyKey,
  matchOne,
  parseMediaId,
  type Matchable,
} from "../locate-originals/match.ts";
import { makeFingerprint, makeRecordId, type FingerprintableFile } from "./state.ts";

/** How a selected file was recognised among the booking's saved media. */
export type DedupMatch = "exact" | "fuzzy";

/** What to do with one selected file, in the same order as the input list. */
export type DedupDecision = {
  /** `${bookingId}__${fingerprint}` — the record id / media_id for this file. */
  id: string;
  fingerprint: string;
  /** null = not recognised; upload it. */
  match: DedupMatch | null;
  /**
   * True when a filename+filesize candidate did exist but failed one of the
   * rules above, so the file uploads anyway. Purely for logging — the caller
   * treats it exactly like `match: null`.
   */
  ambiguous: boolean;
};

/**
 * Resolve every selected file against the media_ids the backend already has
 * for this booking. Pure: no IDB, no network, no `File` reads beyond the three
 * fields the fingerprint is made of.
 */
export function resolveDedup(
  bookingId: string,
  files: readonly FingerprintableFile[],
  alreadyUploaded: ReadonlySet<string>,
): DedupDecision[] {
  const fingerprints = files.map((f) => makeFingerprint(f));
  const ids = fingerprints.map((fp) => makeRecordId(bookingId, fp));

  // Rule 3 — every media_id some file in this batch reproduces byte-for-byte.
  const exactHits = new Set<string>();
  for (const id of ids) {
    if (alreadyUploaded.has(id)) exactHits.add(id);
  }

  // Fuzzy candidates: everything still unspoken-for, indexed by filename+size.
  // media_ids that don't decode (legacy rows, media created outside this
  // uploader) simply can't be fuzzy-matched — they're dropped, not guessed at.
  const targets = buildTargets(
    [...alreadyUploaded].flatMap<Matchable>((mediaId) => {
      if (exactHits.has(mediaId)) return [];
      const parsed = parseMediaId(mediaId, bookingId);
      return parsed
        ? [{ media_id: mediaId, filename: parsed.filename, filesize: parsed.filesize }]
        : [];
    }),
  );

  /** Candidate media_id → the record id that already claimed it (rule 2). */
  const claims = new Map<string, string>();

  return files.map((file, i) => {
    const id = ids[i];
    const fingerprint = fingerprints[i];
    if (exactHits.has(id)) return { id, fingerprint, match: "exact" as const, ambiguous: false };

    // `targets` excludes every id in `alreadyUploaded` that this batch matched
    // exactly, and this file wasn't one of them — so `matchOne`'s exact leg
    // can't fire here and a hit is always the fuzzy one.
    const hit = matchOne(targets, id, file.name, file.size);
    if (!hit) return { id, fingerprint, match: null, ambiguous: false };

    const candidates = targets.fuzzy.get(fuzzyKey(file.name, file.size)) ?? [];
    const claimedBy = claims.get(hit.item.media_id);
    // Re-claiming by the same record id is the same file listed twice in one
    // selection, not a second claimant — it stays skipped.
    if (candidates.length !== 1 || (claimedBy !== undefined && claimedBy !== id)) {
      return { id, fingerprint, match: null, ambiguous: true };
    }
    claims.set(hit.item.media_id, id);
    return { id, fingerprint, match: "fuzzy" as const, ambiguous: false };
  });
}
