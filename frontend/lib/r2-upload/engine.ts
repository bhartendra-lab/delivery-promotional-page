/**
 * Upload engine — producer/consumer pipeline:
 *
 *   inputs ─▶ compressor pool ─▶ compressed queue ─▶ presign batcher ─▶ uploader pool ─▶ IDB ─▶ batch metadata save
 *
 * - Compressor pool runs `N = navigator.hardwareConcurrency - 1` concurrent
 *   compressions; each produces a JPEG blob with EXIF preserved.
 * - Presign batcher pulls up to PRESIGN_BATCH_SIZE compressed items and asks
 *   the backend for one batch of presigned PUT URLs. One small JSON request
 *   per batch — bytes still go direct browser → R2.
 * - Uploader pool runs adaptive (AIMD) concurrent PUTs to R2 using those
 *   signed URLs. Failures are retried with exponential backoff + jitter
 *   (5 attempts).
 * - Per-file state is persisted to IndexedDB so a closed tab or crash can
 *   resume without re-compressing or re-uploading completed files.
 * - After all uploads end, one batch `create-media` call saves metadata to
 *   the Express backend; that call is retried (5 attempts) and on terminal
 *   failure the state stays in IDB so the user can retry from the UI.
 *
 * The Express backend is involved only in (a) issuing signed URLs and
 * (b) the final metadata save. Image bytes go straight browser → R2.
 *
 * The engine is framework-agnostic — it only emits "change" events. The
 * React hook subscribes and re-renders.
 */

import {
  createCustomFolder as apiCreateCustomFolder,
  createMediaBatch,
  presignUploads,
  putBlobToPresignedUrl,
  R2PutError,
} from "@/lib/api";
import type { MediaMetadataItem } from "@/lib/api";

import { CompressorPool } from "./compressor";
import { AimdController } from "./concurrency";
import {
  classifyError,
  classifyHttp,
  MAX_ATTEMPTS,
  withRetry,
} from "./retry";
import {
  clearBooking,
  listByBooking,
  makeFingerprint,
  makeRecordId,
  putRecord,
  safeListByBooking,
  updateRecord,
} from "./state";
import type {
  EngineProgress,
  FolderProgress,
  UploadInput,
  UploadRecord,
} from "./types";

/** How many compressed items to gather before asking the backend for a
 *  batch of presigned URLs. Bigger batch = fewer backend round-trips, but
 *  more memory held. 20 is small enough to keep uploaders fed quickly. */
const PRESIGN_BATCH_SIZE = 20;
/** Don't hold more than N compressed-but-not-uploaded blobs in memory.
 *  Loose bound — small enough to cap memory, big enough to keep the
 *  presigner fed without thrashing. */
const COMPRESSED_QUEUE_HIGH_WATER = 8;
const METADATA_SAVE_ATTEMPTS = 5;

type ChangeListener = (p: EngineProgress) => void;
type UrlListener = (publicUrl: string, customFolderId: string) => void;

export class UploadEngineCore {
  private readonly bookingId: string;
  private readonly compressorPool: CompressorPool;
  private readonly aimd = new AimdController();
  private abort = new AbortController();
  private listeners = new Set<ChangeListener>();
  private urlListeners = new Set<UrlListener>();

  /** In-flight pipeline state. */
  private inputs: UploadInput[] = [];
  private inputCursor = 0; // next input index for the compressor producer to pick
  private records = new Map<string, UploadRecord>(); // recordId → current state (mirror of IDB)
  private compressedBlobs = new Map<string, Blob>(); // recordId → compressed blob (cleared after upload)
  private compressedQueue: string[] = []; // recordIds waiting to be presigned
  private presignedQueue: PresignedItem[] = []; // ready to be PUT
  private startedAt = 0;
  private bytesUploaded = 0;
  private runningCompressors = 0;
  private runningUploaders = 0;
  private compressionFinished = false;
  private presignFinished = false;

  /** Public observable state (re-derived on every emit). */
  private state: EngineProgress = makeIdleProgress();

  constructor(bookingId: string) {
    this.bookingId = bookingId;
    this.compressorPool = new CompressorPool();
  }

  /* ── public API ─────────────────────────────────────────────── */

  getState(): EngineProgress {
    return this.state;
  }

  subscribe(fn: ChangeListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onUploaded(fn: UrlListener): () => void {
    this.urlListeners.add(fn);
    return () => this.urlListeners.delete(fn);
  }

  /** Begin (or resume) processing the given inputs. */
  async run(inputs: UploadInput[]): Promise<void> {
    if (this.state.isUploading) return;
    this.abort = new AbortController();
    this.inputs = inputs;
    this.inputCursor = 0;
    this.startedAt = Date.now();
    this.bytesUploaded = 0;
    this.runningCompressors = 0;
    this.runningUploaders = 0;
    this.compressionFinished = false;
    this.presignFinished = false;

    // Fresh run: drop the in-memory mirror from any previous successful run
    // so progress counters start at zero. (We deliberately do NOT clear after
    // a successful save — that would zero `photosDone` at the same instant
    // `isUploading` flips false, defeating downstream reload triggers.)
    this.records.clear();

    // Seed in-memory mirror from any existing IDB records (resume support).
    await this.hydrateRecords();
    await this.upsertPendingRecords(inputs);
    this.recomputeAndEmit({ isUploading: true });

    // Start the parallel loops.
    const compressLoop = this.runCompressionLoop();
    const presignLoop = this.runPresignBatcher();
    const uploadLoop = this.runUploadLoop();

    // Wait for compression to finish, then for the queues to drain.
    await compressLoop;
    this.compressionFinished = true;
    await presignLoop;
    this.presignFinished = true;
    await uploadLoop;

    // Final batch metadata save.
    await this.saveMetadataWithRetry();

    this.recomputeAndEmit({ isUploading: false });
  }

  /** Cancel an in-progress run. Already-uploaded files remain in IDB. */
  cancel(): void {
    this.abort.abort();
    this.recomputeAndEmit({ isUploading: false });
  }

  /** Retry the metadata save (if it errored), without re-uploading. */
  async retryMetadataSave(): Promise<void> {
    await this.hydrateRecords();
    await this.saveMetadataWithRetry();
    this.recomputeAndEmit({});
  }

  /** Retry a single failed file (re-compress + re-upload from scratch). */
  async retryFailed(recordId: string, file: File): Promise<void> {
    const rec = this.records.get(recordId);
    if (!rec) return;
    await updateRecord(recordId, {
      status: "pending",
      attempts: 0,
      lastError: undefined,
    });
    this.records.set(recordId, {
      ...rec,
      status: "pending",
      attempts: 0,
      lastError: undefined,
      updatedAt: Date.now(),
    });
    // Single-file re-run.
    await this.processOneInput({ file, customFolderId: rec.customFolderId, folderName: rec.folderName });
    await this.saveMetadataWithRetry();
  }

  /** Wipe persisted state for this booking (call after manual abandon). */
  async resetPersisted(): Promise<void> {
    await clearBooking(this.bookingId);
    this.records.clear();
    this.compressedBlobs.clear();
    this.compressedQueue = [];
    this.presignedQueue = [];
    this.recomputeAndEmit({});
  }

  /* ── pipeline loops ─────────────────────────────────────────── */

  /**
   * Producer: schedule compressions, respecting both the worker-pool slot
   * limit and the bounded compressedQueue (backpressure).
   *
   * Resolves when every input has been compressed (or skipped).
   */
  private async runCompressionLoop(): Promise<void> {
    const tasks: Promise<void>[] = [];
    while (this.inputCursor < this.inputs.length) {
      if (this.abort.signal.aborted) break;

      // Backpressure: don't compress if downstream is saturated.
      while (this.compressedQueue.length >= COMPRESSED_QUEUE_HIGH_WATER) {
        await this.waitMicro();
        if (this.abort.signal.aborted) break;
      }

      const input = this.inputs[this.inputCursor++];
      const recordId = makeRecordId(this.bookingId, makeFingerprint(input.file));
      const existing = this.records.get(recordId);
      if (existing && (existing.status === "uploaded" || existing.status === "saved")) {
        // Resume: skip already-completed work.
        continue;
      }
      // Schedule this file.
      tasks.push(this.processOneInput(input));
    }
    await Promise.allSettled(tasks);
  }

  private async processOneInput(input: UploadInput): Promise<void> {
    if (this.abort.signal.aborted) return;
    const recordId = makeRecordId(this.bookingId, makeFingerprint(input.file));
    this.runningCompressors++;
    this.recomputeAndEmit({});
    try {
      const blob = await this.compressorPool.run(input.file);
      if (this.abort.signal.aborted) return;
      await updateRecord(recordId, { status: "compressed" });
      const rec = this.records.get(recordId);
      if (rec) this.records.set(recordId, { ...rec, status: "compressed" });
      this.compressedBlobs.set(recordId, blob);
      this.compressedQueue.push(recordId);
    } catch (err) {
      const reason = err instanceof Error ? err.message : "compression failed";
      console.error("[upload] compression failed", input.file.name, err);
      await updateRecord(recordId, {
        status: "failed",
        lastError: `compression: ${reason}`,
      });
      const rec = this.records.get(recordId);
      if (rec) this.records.set(recordId, { ...rec, status: "failed", lastError: `compression: ${reason}` });
    } finally {
      this.runningCompressors--;
      this.recomputeAndEmit({});
    }
  }

  /**
   * Pulls from compressedQueue, batches into presign requests (up to
   * PRESIGN_BATCH_SIZE at a time), pushes results onto presignedQueue.
   *
   * Resolves once compression is done AND the queue is empty.
   */
  private async runPresignBatcher(): Promise<void> {
    while (true) {
      if (this.abort.signal.aborted) return;
      if (this.compressedQueue.length === 0 && this.compressionFinished) return;

      if (this.compressedQueue.length === 0) {
        await this.waitMicro();
        continue;
      }

      // Wait until we either have a full batch or compression is done, so
      // we don't waste signing round-trips on tiny batches.
      if (this.compressedQueue.length < PRESIGN_BATCH_SIZE && !this.compressionFinished) {
        await this.waitMicro();
        if (this.compressedQueue.length < PRESIGN_BATCH_SIZE && !this.compressionFinished) {
          await sleep(60);
          continue;
        }
      }

      const batchIds = this.compressedQueue.splice(0, PRESIGN_BATCH_SIZE);
      try {
        // withRetry: network/timeout/5xx retry; 4xx (bad payload, auth)
        // terminates so we don't loop forever.
        await withRetry(() => this.requestPresignBatch(batchIds), {
          maxAttempts: MAX_ATTEMPTS,
          signal: this.abort.signal,
          classify: classifyError,
          onAttemptError: (err, attempt, willRetry) => {
            console.warn(
              `[upload] presign batch failed (attempt ${attempt + 1}/${MAX_ATTEMPTS}, willRetry=${willRetry})`,
              err,
            );
          },
        });
      } catch (err) {
        // Terminal: mark every file in this batch as failed so the user can
        // re-pick + retry from the UI, then keep processing the next batch.
        const reason = err instanceof Error ? err.message : "presign failed";
        console.error("[upload] presign batch terminally failed", err);
        for (const id of batchIds) {
          await updateRecord(id, { status: "failed", lastError: `presign: ${reason}` });
          const rec = this.records.get(id);
          if (rec) this.records.set(id, { ...rec, status: "failed", lastError: `presign: ${reason}` });
          this.compressedBlobs.delete(id);
        }
        this.recomputeAndEmit({});
      }
    }
  }

  private async requestPresignBatch(recordIds: string[]): Promise<void> {
    const recs = recordIds
      .map((id) => this.records.get(id))
      .filter((r): r is UploadRecord => !!r);
    if (recs.length === 0) return;

    const res = await presignUploads(
      this.bookingId,
      recs.map((r) => ({
        filename: r.filename,
        content_type: "image/jpeg",
        custom_folder_id: r.customFolderId,
      })),
    );

    // Backend returns uploads in the same order it received them.
    for (let i = 0; i < recs.length; i++) {
      const rec = recs[i];
      const up = res.uploads[i];
      const blob = this.compressedBlobs.get(rec.id);
      if (!up || !blob) continue;
      await updateRecord(rec.id, { key: up.key, publicUrl: up.public_url });
      this.records.set(rec.id, { ...rec, key: up.key, publicUrl: up.public_url });
      this.presignedQueue.push({
        recordId: rec.id,
        blob,
        presignedUrl: up.presigned_url,
        publicUrl: up.public_url,
        contentType: up.content_type,
        customFolderId: rec.customFolderId,
      });
    }
  }

  /**
   * Drains presignedQueue with AIMD-controlled concurrency. Resolves once
   * presigning is done, queue is empty, and no uploads are in flight.
   */
  private async runUploadLoop(): Promise<void> {
    while (true) {
      if (this.abort.signal.aborted) return;
      const done =
        this.presignFinished &&
        this.presignedQueue.length === 0 &&
        this.runningUploaders === 0;
      if (done) return;

      // Start as many uploaders as AIMD allows right now.
      while (this.aimd.canStart() && this.presignedQueue.length > 0) {
        const item = this.presignedQueue.shift();
        if (!item) break;
        this.aimd.start();
        this.runningUploaders++;
        this.recomputeAndEmit({});
        void this.uploadOne(item).finally(() => {
          this.runningUploaders--;
          this.recomputeAndEmit({});
        });
      }

      await this.waitMicro();
    }
  }

  private async uploadOne(item: PresignedItem): Promise<void> {
    let succeeded = false;
    try {
      await withRetry(
        async () => {
          await putBlobToPresignedUrl(
            item.presignedUrl,
            item.blob,
            item.contentType,
            this.abort.signal,
          );
        },
        {
          maxAttempts: MAX_ATTEMPTS,
          signal: this.abort.signal,
          classify: (err) =>
            err instanceof R2PutError ? classifyHttp(err.status) : classifyError(err),
          onAttemptError: (err, attempt, willRetry) => {
            console.warn(
              `[upload] R2 PUT failed (attempt ${attempt + 1}/${MAX_ATTEMPTS}, willRetry=${willRetry})`,
              err,
            );
          },
        },
      );
      succeeded = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "upload failed";
      await updateRecord(item.recordId, {
        status: "failed",
        lastError: msg,
        attempts: MAX_ATTEMPTS,
      });
      const rec = this.records.get(item.recordId);
      if (rec) {
        this.records.set(item.recordId, {
          ...rec,
          status: "failed",
          lastError: msg,
          attempts: MAX_ATTEMPTS,
        });
      }
      this.aimd.noteFailure();
      this.compressedBlobs.delete(item.recordId);
      return;
    }

    if (succeeded) {
      this.bytesUploaded += item.blob.size;
      this.aimd.noteSuccess();
      this.compressedBlobs.delete(item.recordId);
      await updateRecord(item.recordId, { status: "uploaded" });
      const rec = this.records.get(item.recordId);
      if (rec) this.records.set(item.recordId, { ...rec, status: "uploaded" });
      for (const fn of this.urlListeners) fn(item.publicUrl, item.customFolderId);
    }
  }

  /* ── metadata save ──────────────────────────────────────────── */

  private async saveMetadataWithRetry(): Promise<void> {
    const all = Array.from(this.records.values()).filter((r) => r.status === "uploaded");
    if (all.length === 0) {
      this.recomputeAndEmit({});
      return;
    }
    this.recomputeAndEmit({ isSavingMetadata: true, metadataSaveError: null });

    const payload: MediaMetadataItem[] = all
      .filter((r) => r.publicUrl)
      .map((r) => ({
        url: r.publicUrl as string,
        type: "image",
        custom_folder_id: r.customFolderId,
        media_id: r.id,
      }));

    try {
      await withRetry(
        async () => {
          await createMediaBatch(this.bookingId, payload);
        },
        {
          maxAttempts: METADATA_SAVE_ATTEMPTS,
          signal: this.abort.signal,
          classify: classifyError,
          onAttemptError: (err, attempt, willRetry) => {
            console.warn(
              `[upload] metadata save failed (attempt ${attempt + 1}/${METADATA_SAVE_ATTEMPTS}, willRetry=${willRetry})`,
              err,
            );
          },
        },
      );
      // Mark all as saved, then clear IDB for this booking. The in-memory
      // mirror (`this.records`) is intentionally NOT cleared here — that
      // would zero `photosDone` at the same instant `isUploading` flips
      // false, which downstream effects key off. It gets cleared at the
      // start of the next `run()` instead. Memory cost is negligible
      // (records are tiny structs) and IDB persistence is fully released.
      for (const r of all) {
        await updateRecord(r.id, { status: "saved" });
        this.records.set(r.id, { ...r, status: "saved" });
      }
      await clearBooking(this.bookingId);
      this.recomputeAndEmit({ isSavingMetadata: false, metadataSaveError: null });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "metadata save failed";
      console.error("[upload] metadata save terminal failure", err);
      this.recomputeAndEmit({ isSavingMetadata: false, metadataSaveError: msg });
    }
  }

  /* ── state mirroring ────────────────────────────────────────── */

  private async hydrateRecords(): Promise<void> {
    const persisted = await safeListByBooking(this.bookingId);
    for (const r of persisted) this.records.set(r.id, r);
  }

  private async upsertPendingRecords(inputs: UploadInput[]): Promise<void> {
    for (const inp of inputs) {
      const fingerprint = makeFingerprint(inp.file);
      const id = makeRecordId(this.bookingId, fingerprint);
      const existing = this.records.get(id);
      if (existing && (existing.status === "uploaded" || existing.status === "saved")) continue;
      const record: UploadRecord = existing ?? {
        id,
        bookingId: this.bookingId,
        fingerprint,
        customFolderId: inp.customFolderId,
        folderName: inp.folderName,
        filename: inp.file.name,
        fileSize: inp.file.size,
        fileLastModified: inp.file.lastModified,
        status: "pending",
        attempts: 0,
        updatedAt: Date.now(),
      };
      const next: UploadRecord = { ...record, status: "pending", attempts: 0, lastError: undefined, updatedAt: Date.now() };
      await putRecord(next);
      this.records.set(id, next);
    }
  }

  /* ── progress derivation ────────────────────────────────────── */

  private recomputeAndEmit(patch: Partial<EngineProgress>): void {
    const all = Array.from(this.records.values());
    const photosTotal = all.length;
    const uploaded = all.filter((r) => r.status === "uploaded" || r.status === "saved").length;
    const failed = all.filter((r) => r.status === "failed").length;
    const photosDone = uploaded;
    const percent = photosTotal === 0 ? 0 : Math.min(100, Math.round((photosDone / photosTotal) * 100));
    const elapsed = Math.max(0.001, (Date.now() - this.startedAt) / 1000);
    const speedBps = this.startedAt > 0 ? this.bytesUploaded / elapsed : 0;
    const speedLabel = speedBps > 0 ? `${(speedBps / 1024 / 1024).toFixed(1)} MB/s` : "";
    const remainingPhotos = Math.max(0, photosTotal - photosDone - failed);
    const perPhoto = photosDone > 0 ? elapsed / photosDone : 0.5;
    const etaSec = remainingPhotos * perPhoto;
    const etaLabel = formatEta(etaSec, photosDone, photosTotal);

    const folderMap = new Map<string, FolderProgress>();
    for (const r of all) {
      const key = r.customFolderId || r.folderName;
      const f = folderMap.get(key) ?? { name: r.folderName, count: 0, done: 0, failed: 0 };
      f.count++;
      if (r.status === "uploaded" || r.status === "saved") f.done++;
      if (r.status === "failed") f.failed++;
      folderMap.set(key, f);
    }
    const folders = Array.from(folderMap.values());

    const needsMetadataSave = all.some((r) => r.status === "uploaded");

    this.state = {
      percent,
      photosDone,
      photosTotal,
      photosFailed: failed,
      speedLabel,
      etaLabel,
      folders,
      metadataSaveError: this.state.metadataSaveError,
      isUploading: this.state.isUploading,
      needsMetadataSave,
      isSavingMetadata: this.state.isSavingMetadata,
      ...patch,
    };
    for (const fn of this.listeners) fn(this.state);
  }

  private async waitMicro(): Promise<void> {
    // Yield to other microtasks so other loops can progress.
    await new Promise<void>((r) => setTimeout(r, 0));
  }
}

/* ── helpers ────────────────────────────────────────────────────── */

type PresignedItem = {
  recordId: string;
  blob: Blob;
  presignedUrl: string;
  publicUrl: string;
  contentType: string;
  customFolderId: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function makeIdleProgress(): EngineProgress {
  return {
    percent: 0,
    photosDone: 0,
    photosTotal: 0,
    photosFailed: 0,
    speedLabel: "",
    etaLabel: "",
    folders: [],
    metadataSaveError: null,
    isUploading: false,
    needsMetadataSave: false,
    isSavingMetadata: false,
  };
}

function formatEta(seconds: number, done: number, total: number): string {
  if (total === 0) return "";
  if (done === 0) return "calculating…";
  if (!isFinite(seconds) || seconds <= 0) return "almost done";
  if (seconds < 60) return `About ${Math.ceil(seconds)} sec remaining`;
  return `About ${Math.ceil(seconds / 60)} min remaining`;
}

/**
 * Helper for the React layer: create folders for a list of folder names that
 * don't already have ids on the server. Returns a map name→customFolderId.
 *
 * Called before kicking off the engine, since the engine needs the
 * customFolderId on each input.
 */
export async function ensureFolders(
  bookingId: string,
  folderNames: string[],
  existingMap: Map<string, string>,
): Promise<Map<string, string>> {
  const out = new Map(existingMap);
  for (const name of folderNames) {
    if (out.has(name)) continue;
    const res = await apiCreateCustomFolder(bookingId, name);
    out.set(name, res.custom_folder_id);
  }
  return out;
}

/** Resumable: list IDB records that still need work for a given booking. */
export async function listResumableRecords(bookingId: string): Promise<UploadRecord[]> {
  const all = await listByBooking(bookingId);
  return all.filter((r) => r.status === "pending" || r.status === "compressed" || r.status === "uploaded" || r.status === "failed");
}
