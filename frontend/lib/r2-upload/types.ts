/** Status a single file can be in during the upload lifecycle. */
export type UploadStatus =
  /** queued, raw File still in memory only */
  | "pending"
  /** compressed blob in memory, ready to be uploaded */
  | "compressed"
  /** PUT to R2 succeeded; public URL known but metadata not yet saved */
  | "uploaded"
  /** terminal failure after retries — needs manual retry */
  | "failed"
  /** create-media batch save succeeded; safe to forget */
  | "saved";

/**
 * Persisted upload record. Lives in IndexedDB so crashes / closed tabs / refreshes
 * don't lose progress. The `File` object itself is NOT persisted (browsers can't
 * round-trip File objects reliably) — on resume the user re-selects the folder
 * and we match by fingerprint to skip already-uploaded entries.
 */
export type UploadRecord = {
  /** `${bookingId}__${fingerprint}` */
  id: string;
  bookingId: string;
  /** `${filename}-${size}-${lastModified}` (no extension forced — we look it up). */
  fingerprint: string;
  customFolderId: string;
  /** Original subfolder name (display only; folder id is the source of truth). */
  folderName: string;
  filename: string;
  fileSize: number;
  fileLastModified: number;
  status: UploadStatus;
  /**
   * Why this record went straight to `saved` without uploading anything: the
   * backend already had it. `"exact"` = same fingerprint (byte-for-byte
   * certainty); `"fuzzy"` = same filename + filesize but a different file
   * timestamp, so it's a *probable* duplicate the engine chose to trust (see
   * `dedup.ts`). Absent on every record that actually uploaded — which is what
   * lets the run surface a "skipped as probable duplicates" count instead of
   * folding unconfirmed matches into the same silence as confirmed ones.
   *
   * Deliberately a field and not an `UploadStatus`: a new status would fall
   * outside every `"uploaded" | "saved"` check in the engine (progress
   * counters, the compression-loop resume skip, the `fullyComplete` wipe), so
   * a fuzzy skip would stall the ring and re-upload on the next selection.
   */
  dedupeMatch?: "exact" | "fuzzy";
  /** Set after a successful R2 PUT. This is what we persist to the backend. */
  publicUrl?: string;
  /** R2 object key (layout owned by the backend's presign endpoint). */
  key?: string;
  /** Public URL of the 480px gallery-grid derivative, set after a successful
   *  thumbnail PUT. Cleared when that PUT fails, so create-media omits it and
   *  the grid transparently falls back to `publicUrl`. */
  thumbnailUrl?: string;
  /** Decoded pixel dimensions of the compressed photo (set alongside
   *  `status: "compressed"`); absent if the browser couldn't decode them. */
  width?: number;
  height?: number;
  attempts: number;
  lastError?: string;
  updatedAt: number;
};

/** A single file the engine accepts. */
export type UploadInput = {
  file: File;
  customFolderId: string;
  folderName: string;
};

/** Per-folder aggregate progress for the UI. */
export type FolderProgress = {
  name: string;
  count: number;
  done: number;
  failed: number;
};

/** Overall progress snapshot for the UI. */
export type EngineProgress = {
  percent: number;
  photosDone: number;
  photosTotal: number;
  photosFailed: number;
  /**
   * How many of `photosDone` were never uploaded in the first place: the
   * backend already had a photo with the same filename + filesize, but a
   * different file timestamp (see `UploadRecord.dedupeMatch`). Unlike a
   * fingerprint match this is a judgement call with no confirmation step, so
   * the number is shown while the run is on screen — a studio that expected
   * every photo to upload gets one place to notice it didn't.
   */
  probableDuplicatesSkipped: number;
  speedLabel: string;
  etaLabel: string;
  folders: FolderProgress[];
  /** Set when a create-media chunk failed; user can retry. */
  metadataSaveError: string | null;
  /**
   * Set when the run is uploading WITHOUT the studio's watermark even though it
   * should have carried one — the preset lookup failed, the mark couldn't be
   * fetched/decoded, or presets exist but none is marked default. Null both
   * when the watermark is being applied and when the studio has no presets at
   * all (that case is the reminder dialog's job, not an error). Watermarking is
   * baked in at upload time and can't be applied retroactively, so this has to
   * be visible while the run is still on screen.
   */
  watermarkWarning: string | null;
  /**
   * Set when the run auto-paused because the studio's storage plan filled up
   * mid-upload. Distinct from a manual pause: `paused` is true either way, but
   * this carries the reason and tells the UI that Resume alone won't help
   * until space is freed or the plan upgraded. Null on count-based plans and
   * whenever the plan still has headroom.
   *
   * Photos already uploaded are saved and counted — pausing drains pending
   * metadata — so nothing is lost and Resume picks up exactly where it stopped.
   */
  storageFullWarning: string | null;
  /**
   * Last known GB remaining on a storage plan, refreshed from every
   * create-media response and projected downward from bytes uploaded since.
   * Null on count-based plans and before the first figure lands.
   */
  storageRemainingGB: number | null;
  /** Set true while the engine is actively running (compress + upload). */
  isUploading: boolean;
  /** Set true if there are uploaded-but-unsaved records that need finalising. */
  needsMetadataSave: boolean;
  /** Set true while a create-media chunk call is in flight. */
  isSavingMetadata: boolean;
  /**
   * Set true while the run is paused. The run stays "uploading" (`isUploading`
   * remains true) but no new compress/presign/upload work is dispatched; the
   * workspace unlocks so the Member can keep working. Resume picks up where it
   * left off without re-compressing or re-uploading completed files.
   */
  paused: boolean;
};
