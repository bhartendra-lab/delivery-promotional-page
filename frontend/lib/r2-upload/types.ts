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
   *  `status: "compressed"`); absent if the browser couldn't decode them.
   *  ALWAYS the delivery view's dimensions, in every variant — the archive
   *  copy's are never recorded, so nothing in the grid's reserved-height maths
   *  changes when a run switches tier. */
  width?: number;
  height?: number;
  /** When the photo was TAKEN, epoch ms (set alongside `status: "compressed"`,
   *  same as `width`/`height`). EXIF `DateTimeOriginal`/`DateTimeDigitized`
   *  where the source JPEG had one, otherwise the file's own `lastModified`.
   *  Absent only on records written before capture time was recorded.
   *
   *  PERSISTED, not held in memory, because create-media can be flushed on a
   *  LATER MOUNT (resumePendingMetadata) when the record is the only thing
   *  left of the upload — the File, its EXIF and the compressed blob are all
   *  long gone by then. */
  capturedAt?: number;
  /** Where `capturedAt` came from, so the backend can tell a real capture time
   *  from a file timestamp without re-deriving it. */
  capturedAtSource?: "exif" | "file_time";
  /* ── Archive copy (the "4096" and "original" quality tiers) ──────────────
   * All absent on a "2560" run, and cleared again whenever an archive upload
   * fails — the photo still delivers, and create-media simply omits them. */
  /** Public URL of the archive object on B2, set after its upload succeeds. */
  /** Which tier produced the archive object. Persisted ALONGSIDE archiveUrl —
   *  not read off the engine's current run — because a metadata flush can
   *  happen on a later mount (resumePendingMetadata) when the engine has no
   *  run and its variant has reset to the "2560" default. */
  archiveVariant?: "4096" | "original";
  archiveUrl?: string;
  /** Bytes of the archive object. For "original" this is `fileSize`. */
  archiveSize?: number;
  /** SHA-256 of the archive bytes, computed in the browser by streaming the
   *  file in slices. Client-asserted: nothing verifies it end to end, because
   *  doing so would mean reading the bytes back through our own server. */
  archiveChecksum?: string;
  /* ── Multipart progress ("original" only) ────────────────────────────────
   * These are what make a resumed run pick up MID-FILE instead of restarting a
   * 75 MB upload from byte zero, so they are persisted as each part lands. */
  uploadId?: string;
  partSize?: number;
  completedParts?: Array<{ n: number; etag: string }>;
  /** The archive object's key on B2, derived server-side from `key` at
   *  multipart-create time. Persisted so a resumed run can carry on with — and
   *  a cancelled one can abort — an upload it did not itself start. */
  archiveKey?: string;
  /** Whether the run that wrote this record stamps the studio's watermark: the
   *  "Allow watermark" choice on the upload dialog's second step.
   *
   *  PERSISTED so the choice outlives a reload. The engine's own copy lives in
   *  memory and is gone with the tab, and the File is gone too, so resuming
   *  means re-selecting the folder and opening the dialog again, which would
   *  otherwise start from "on" and mark the rest of a gallery that was begun
   *  without a mark. Records are wiped when the session ends (all saved, or
   *  cancelled), so the choice goes with them. Absent on records written before
   *  this existed, which every reader treats as "no choice recorded". */
  watermark?: boolean;
  /** SES-01: the upload session this photo's create-media row carries (one
   *  session per run on the web). Stamped when the photo is compressed, or at
   *  the latest just before its first create-media attempt, and PERSISTED so
   *  every retry, and a flush on a later mount, sends the same id. Absent on
   *  records written before SES-01. */
  uploadSessionId?: string;
  /** SES-01: the camera that took the photo, from the source's EXIF (Make,
   *  Model, BodySerialNumber), set alongside `capturedAt` and persisted for
   *  the same reason. Absent when the source had no camera EXIF. */
  cameraMake?: string;
  cameraModel?: string;
  cameraSerial?: string;
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

// Progress types live in progress-types.ts (no DOM types; synced by the
// studio app). Re-exported so every existing import keeps working.
export type { EngineProgress, FolderProgress, PhotoCapStatus } from "./progress-types.ts";
