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
  /** Set after a successful R2 PUT. This is what we persist to the backend. */
  publicUrl?: string;
  /** R2 object key (layout owned by the backend's presign endpoint). */
  key?: string;
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
  speedLabel: string;
  etaLabel: string;
  folders: FolderProgress[];
  /** Set when the final create-media batch save errored; user can retry. */
  metadataSaveError: string | null;
  /** Set true while the engine is actively running (compress + upload). */
  isUploading: boolean;
  /** Set true if there are uploaded-but-unsaved records that need finalising. */
  needsMetadataSave: boolean;
  /** Set true while the final create-media batch call is in flight. */
  isSavingMetadata: boolean;
};
