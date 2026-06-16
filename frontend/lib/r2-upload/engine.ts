/**
 * Upload engine — producer/consumer pipeline:
 *
 *   inputs ─▶ compressor pool ─▶ compressed queue ─▶ presign batcher ─▶ uploader pool ─▶ IDB ─▶ incremental metadata save
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
 * - As R2 PUTs succeed, metadata is saved incrementally in chunks of
 *   METADATA_CHUNK_SIZE via `create-media` (photos appear in the DB during
 *   upload). A final drain flushes any remainder; each chunk is retried (5
 *   attempts) and on terminal failure the state stays in IDB so the user can
 *   retry from the UI.
 *
 * The Express backend is involved only in (a) issuing signed URLs and
 * (b) incremental metadata saves. Image bytes go straight browser → R2.
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
import { USER_FACING_UPLOAD_ERROR } from "./errors";
import {
  clearBooking,
  clearSavedByBooking,
  listByBooking,
  makeFingerprint,
  makeRecordId,
  putRecords,
  safeListByBooking,
  updateRecord,
  updateRecords,
} from "./state";
import type {
  EngineProgress,
  FolderProgress,
  UploadInput,
  UploadRecord,
} from "./types";

/** How many compressed items to gather before asking the backend for a
 *  batch of presigned URLs. Bigger batch = fewer backend round-trips. */
const PRESIGN_BATCH_SIZE = 50;
/** Concurrent presign HTTP requests (each batch is independent). */
const PRESIGN_CONCURRENCY = 3;
/** Don't hold more than N compressed-but-not-uploaded blobs in memory. */
const COMPRESSED_QUEUE_HIGH_WATER = 32;
/** Flush create-media once this many uploads have completed (also max per request). */
const METADATA_CHUNK_SIZE = 200;
/** Coalesce per-file IDB writes during the hot path. */
const IDB_FLUSH_MS = 500;
/** Throttle progress UI updates (in-memory state stays live). */
const PROGRESS_EMIT_MS = 200;
const METADATA_SAVE_ATTEMPTS = 5;
/** How often the dispatch loops re-check the pause flag. */
const PAUSE_POLL_MS = 120;

type ChangeListener = (p: EngineProgress) => void;
type UrlListener = (publicUrl: string, customFolderId: string) => void;
type MetadataSavedListener = (count: number) => void;

export class UploadEngineCore {
  private readonly bookingId: string;
  private readonly compressorPool: CompressorPool;
  private readonly aimd = new AimdController();
  private abort = new AbortController();
  /** Real pause flag — gates dispatch of new compress/presign/upload work. */
  private paused = false;
  /**
   * When true, create-media chunks are tagged `media_out_of_sync` so the
   * backend marks the booking as needing a republish (new media added to an
   * already-published gallery). Set by the workspace from the booking's
   * publish status; applies to all flushes incl. resume/cancel drains.
   */
  private outOfSync = false;
  private listeners = new Set<ChangeListener>();
  private urlListeners = new Set<UrlListener>();
  private metadataSavedListeners = new Set<MetadataSavedListener>();

  /** Uploaded record ids waiting for create-media (incremental flush). */
  private metadataPendingIds: string[] = [];
  private metadataSaveChain: Promise<void> = Promise.resolve();

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
  private runningPresigns = 0;

  /** Batched IDB persistence — in-memory mirror is always immediate. */
  private idbPending = new Map<string, Partial<UploadRecord>>();
  private idbFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private idbFlushChain: Promise<void> = Promise.resolve();

  /** Debounced progress notifications to React subscribers. */
  private emitTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingEmitPatch: Partial<EngineProgress> = {};

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

  /** Fires after a create-media chunk succeeds (count = items in that chunk). */
  onMetadataSaved(fn: MetadataSavedListener): () => void {
    this.metadataSavedListeners.add(fn);
    return () => this.metadataSavedListeners.delete(fn);
  }

  /** Begin (or resume) processing the given inputs. */
  async run(inputs: UploadInput[]): Promise<void> {
    if (this.state.isUploading) return;
    this.abort = new AbortController();
    this.paused = false;
    this.inputs = inputs;
    this.inputCursor = 0;
    this.startedAt = Date.now();
    this.bytesUploaded = 0;
    this.runningCompressors = 0;
    this.runningUploaders = 0;
    this.compressionFinished = false;
    this.presignFinished = false;
    this.metadataPendingIds = [];
    this.metadataSaveChain = Promise.resolve();

    // Fresh run: drop the in-memory mirror from any previous successful run
    // so progress counters start at zero. (We deliberately do NOT clear after
    // a successful save — that would zero `photosDone` at the same instant
    // `isUploading` flips false, defeating downstream reload triggers.)
    this.records.clear();

    // Seed in-memory mirror from any existing IDB records (resume support).
    await this.hydrateRecords();
    await this.upsertPendingRecords(inputs);
    this.seedMetadataQueue();
    this.scheduleEmit({ isUploading: true, paused: false, metadataSaveError: null }, true);

    try {
      // Start the parallel loops (metadata flusher runs alongside upload).
      const compressLoop = this.runCompressionLoop();
      const presignLoop = this.runPresignBatcher();
      const uploadLoop = this.runUploadLoop();
      const metadataLoop = this.runMetadataFlushLoop();

      // Wait for compression to finish, then for the queues to drain.
      await compressLoop;
      this.compressionFinished = true;
      await presignLoop;
      this.presignFinished = true;
      await uploadLoop;
      await metadataLoop;
    } finally {
      // Always persist uploaded bytes to the DB — including partial final batches
      // (< METADATA_CHUNK_SIZE) and work completed before an interrupt/cancel.
      await this.flushIdb();
      await this.drainAllMetadata();
      await this.flushIdb();
      this.paused = false;
      this.scheduleEmit({ isUploading: false, paused: false }, true);
    }
  }

  /**
   * Cancel an in-progress run. Stops new work, then flushes create-media for
   * anything already on R2 before leaving the active state.
   */
  async cancel(): Promise<void> {
    this.paused = false;
    this.abort.abort();
    await this.flushIdb();
    await this.drainAllMetadata();
    await this.flushIdb();
    this.scheduleEmit({ isUploading: false, paused: false }, true);
  }

  /**
   * Pause an in-progress run. New compression/presign/upload work stops being
   * dispatched; chunks already in flight are left to settle and their state is
   * persisted to IndexedDB. The run stays `isUploading` so the page still shows
   * the upload card — the workspace is unlocked via the `paused` flag instead.
   */
  pause(): void {
    if (this.paused || !this.state.isUploading) return;
    this.paused = true;
    this.scheduleEmit({ paused: true }, true);
  }

  /**
   * Resume a paused run. The pipeline loops are already spinning (they were
   * gated on `this.paused`), so flipping the flag lets them pick up exactly
   * where they left off — completed files are skipped, never re-uploaded.
   */
  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.scheduleEmit({ paused: false }, true);
  }

  /** True while a run exists and is paused (used by the registry/UI). */
  isPaused(): boolean {
    return this.paused;
  }

  /**
   * Mark whether media saved from now on is "out of sync" with a published
   * gallery. Tagging every create-media chunk (incl. resume/cancel drains)
   * keeps the booking's republish flag robust even if a run is interrupted.
   */
  setOutOfSync(value: boolean): void {
    this.outOfSync = value;
  }

  /**
   * Persist metadata for uploaded-but-unsaved rows (resume after interrupt,
   * tab close, or a failed chunk). Safe to call repeatedly — saved rows are
   * skipped.
   */
  async resumePendingMetadata(): Promise<void> {
    await this.hydrateRecords();
    this.seedMetadataQueue();
    await this.drainAllMetadata();
    this.scheduleEmit({}, true);
  }

  /** Retry the metadata save (if it errored), without re-uploading. */
  async retryMetadataSave(): Promise<void> {
    await this.resumePendingMetadata();
  }

  /** Retry a single failed file (re-compress + re-upload from scratch). */
  async retryFailed(recordId: string, file: File): Promise<void> {
    const rec = this.records.get(recordId);
    if (!rec) return;
    this.queueIdbUpdate(recordId, {
      status: "pending",
      attempts: 0,
      lastError: undefined,
    });
    await this.flushIdb();
    this.records.set(recordId, {
      ...rec,
      status: "pending",
      attempts: 0,
      lastError: undefined,
      updatedAt: Date.now(),
    });
    // Single-file re-run.
    await this.processOneInput({ file, customFolderId: rec.customFolderId, folderName: rec.folderName });
    await this.flushIdb();
    this.seedMetadataQueue();
    await this.drainAllMetadata();
  }

  /**
   * One-off cover-image upload. Reuses the same engine pipeline primitives
   * (compress → presign → R2 PUT) but deliberately does NOT call create-media,
   * so the cover lands in R2 and we get a public URL without it appearing as a
   * gallery media item. The caller persists the URL via update-booking's
   * `background_image`. `keyFolderId` only seeds the R2 key path.
   */
  async uploadCover(file: File, keyFolderId: string): Promise<string> {
    const blob = await this.compressorPool.run(file);
    const res = await presignUploads(this.bookingId, [
      { filename: file.name, content_type: "image/jpeg", custom_folder_id: keyFolderId },
    ]);
    const up = res.uploads[0];
    if (!up) throw new Error("Could not get an upload URL for the cover image");
    await putBlobToPresignedUrl(up.presigned_url, blob, up.content_type);
    return up.public_url;
  }

  /** Wipe persisted state for this booking (call after manual abandon). */
  async resetPersisted(): Promise<void> {
    await clearBooking(this.bookingId);
    this.records.clear();
    this.compressedBlobs.clear();
    this.compressedQueue = [];
    this.presignedQueue = [];
    this.scheduleEmit({}, true);
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

      // Pause: stop pulling new files into the compressor while held.
      await this.waitWhilePaused();
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
    this.scheduleEmit();
    try {
      const blob = await this.compressorPool.run(input.file);
      if (this.abort.signal.aborted) return;
      this.queueIdbUpdate(recordId, { status: "compressed" });
      const rec = this.records.get(recordId);
      if (rec) this.records.set(recordId, { ...rec, status: "compressed" });
      this.compressedBlobs.set(recordId, blob);
      this.compressedQueue.push(recordId);
    } catch (err) {
      const reason = err instanceof Error ? err.message : "compression failed";
      console.error("[upload] compression failed", input.file.name, err);
      this.queueIdbUpdate(recordId, {
        status: "failed",
        lastError: `compression: ${reason}`,
      });
      const rec = this.records.get(recordId);
      if (rec) this.records.set(recordId, { ...rec, status: "failed", lastError: `compression: ${reason}` });
    } finally {
      this.runningCompressors--;
      this.scheduleEmit();
    }
  }

  /**
   * Pulls from compressedQueue, batches into presign requests (up to
   * PRESIGN_BATCH_SIZE at a time), pushes results onto presignedQueue.
   * Up to PRESIGN_CONCURRENCY batches run in parallel.
   *
   * Resolves once compression is done AND the queue is empty.
   */
  private async runPresignBatcher(): Promise<void> {
    const inFlight = new Set<Promise<void>>();

    const track = (p: Promise<void>): void => {
      inFlight.add(p);
      void p.finally(() => inFlight.delete(p));
    };

    while (true) {
      if (this.abort.signal.aborted) {
        await Promise.allSettled([...inFlight]);
        return;
      }

      const drained = this.compressedQueue.length === 0 && this.compressionFinished;
      if (drained && inFlight.size === 0) return;

      // Start new presign batches while under the concurrency cap. Paused
      // runs hold here — already-issued batches finish and settle.
      while (
        !this.abort.signal.aborted &&
        !this.paused &&
        this.runningPresigns < PRESIGN_CONCURRENCY &&
        this.compressedQueue.length > 0 &&
        (this.compressedQueue.length >= PRESIGN_BATCH_SIZE || this.compressionFinished)
      ) {
        const batchIds = this.compressedQueue.splice(0, PRESIGN_BATCH_SIZE);
        this.runningPresigns++;
        track(
          this.processPresignBatch(batchIds).finally(() => {
            this.runningPresigns--;
            this.scheduleEmit();
          }),
        );
      }

      if (this.abort.signal.aborted) continue;

      // Wait for more compressed items or in-flight presigns to finish.
      if (this.compressedQueue.length === 0 && !this.compressionFinished) {
        await sleep(60);
      } else if (inFlight.size > 0) {
        await Promise.race([...inFlight, sleep(50)]);
      } else if (
        this.compressedQueue.length > 0 &&
        this.compressedQueue.length < PRESIGN_BATCH_SIZE &&
        !this.compressionFinished
      ) {
        await sleep(60);
      } else {
        await this.waitMicro();
      }
    }
  }

  private async processPresignBatch(batchIds: string[]): Promise<void> {
    try {
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
      const reason = err instanceof Error ? err.message : "presign failed";
      console.error("[upload] presign batch terminally failed", err);
      for (const id of batchIds) {
        this.queueIdbUpdate(id, { status: "failed", lastError: `presign: ${reason}` });
        const rec = this.records.get(id);
        if (rec) this.records.set(id, { ...rec, status: "failed", lastError: `presign: ${reason}` });
        this.compressedBlobs.delete(id);
      }
      this.scheduleEmit();
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
    const idbPatches: Array<{ id: string; patch: Partial<UploadRecord> }> = [];
    for (let i = 0; i < recs.length; i++) {
      const rec = recs[i];
      const up = res.uploads[i];
      const blob = this.compressedBlobs.get(rec.id);
      if (!up || !blob) continue;
      idbPatches.push({ id: rec.id, patch: { key: up.key, publicUrl: up.public_url } });
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
    if (idbPatches.length > 0) {
      await updateRecords(idbPatches);
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

      // Start as many uploaders as AIMD allows right now. Paused runs hold
      // here — in-flight PUTs settle and persist, none are re-issued on resume.
      while (!this.paused && this.aimd.canStart() && this.presignedQueue.length > 0) {
        const item = this.presignedQueue.shift();
        if (!item) break;
        this.aimd.start();
        this.runningUploaders++;
        this.scheduleEmit();
        void this.uploadOne(item).finally(() => {
          this.runningUploaders--;
          this.scheduleEmit();
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
      this.queueIdbUpdate(item.recordId, {
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
      this.queueIdbUpdate(item.recordId, { status: "uploaded" });
      const rec = this.records.get(item.recordId);
      if (rec) this.records.set(item.recordId, { ...rec, status: "uploaded" });
      this.metadataPendingIds.push(item.recordId);
      this.scheduleMetadataFlushIfReady();
      for (const fn of this.urlListeners) fn(item.publicUrl, item.customFolderId);
    }
  }

  /* ── incremental metadata save ──────────────────────────────── */

  /**
   * Background loop: flush create-media chunks while uploads are in flight.
   * Partial remainders (< METADATA_CHUNK_SIZE) are flushed by `drainAllMetadata`
   * when the pipeline finishes or is interrupted.
   */
  private async runMetadataFlushLoop(): Promise<void> {
    while (true) {
      this.seedMetadataQueue();

      if (this.metadataPendingIds.length >= METADATA_CHUNK_SIZE) {
        await this.enqueueMetadataFlush();
        if (this.state.metadataSaveError) return;
        continue;
      }

      const uploadsDone =
        this.compressionFinished &&
        this.presignFinished &&
        this.presignedQueue.length === 0 &&
        this.runningUploaders === 0;
      if (uploadsDone || this.abort.signal.aborted) return;

      await sleep(250);
    }
  }

  /** Pull any `uploaded` records (e.g. resumed from IDB) into the flush queue. */
  private seedMetadataQueue(): void {
    const queued = new Set(this.metadataPendingIds);
    for (const r of this.records.values()) {
      if (r.status === "uploaded" && !queued.has(r.id)) {
        this.metadataPendingIds.push(r.id);
        queued.add(r.id);
      }
    }
  }

  private scheduleMetadataFlushIfReady(): void {
    if (this.metadataPendingIds.length < METADATA_CHUNK_SIZE) return;
    void this.enqueueMetadataFlush();
  }

  private enqueueMetadataFlush(): Promise<void> {
    this.metadataSaveChain = this.metadataSaveChain
      .then(() => this.flushOneMetadataChunk())
      .catch(() => {
        /* errors handled inside flushOneMetadataChunk */
      });
    return this.metadataSaveChain;
  }

  private async flushOneMetadataChunk(): Promise<void> {
    if (this.metadataPendingIds.length === 0) return;

    const ids = this.metadataPendingIds.splice(0, METADATA_CHUNK_SIZE);
    const recs = ids
      .map((id) => this.records.get(id))
      .filter((r): r is UploadRecord => !!r && r.status === "uploaded" && !!r.publicUrl);
    if (recs.length === 0) return;

    this.scheduleEmit({ isSavingMetadata: true, metadataSaveError: null });

    const payload: MediaMetadataItem[] = recs.map((r) => ({
      url: r.publicUrl as string,
      type: "image" as const,
      custom_folder_id: r.customFolderId,
      media_id: r.id,
    }));

    try {
      // Metadata saves are never tied to the upload abort signal — cancelling
      // or interrupting must still persist bytes already on R2.
      await withRetry(
        async () => {
          await createMediaBatch(
            this.bookingId,
            payload,
            this.outOfSync
              ? { media_out_of_sync: true, unsynced_media_count: payload.length }
              : undefined,
          );
        },
        {
          maxAttempts: METADATA_SAVE_ATTEMPTS,
          classify: classifyError,
          onAttemptError: (err, attempt, willRetry) => {
            console.warn(
              `[upload] metadata save failed (chunk, attempt ${attempt + 1}/${METADATA_SAVE_ATTEMPTS}, willRetry=${willRetry})`,
              err,
            );
          },
        },
      );

      const savedPatches = recs.map((r) => ({ id: r.id, patch: { status: "saved" as const } }));
      await updateRecords(savedPatches);
      for (const r of recs) {
        this.records.set(r.id, { ...r, status: "saved" });
      }
      this.scheduleEmit({ isSavingMetadata: false, metadataSaveError: null });
      for (const fn of this.metadataSavedListeners) fn(recs.length);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "metadata save failed";
      console.error("[upload] metadata save terminal failure", err);
      // Re-queue ids that are still awaiting metadata persistence.
      for (const id of ids) {
        if (this.records.get(id)?.status === "uploaded") {
          this.metadataPendingIds.unshift(id);
        }
      }
      this.scheduleEmit(
        { isSavingMetadata: false, metadataSaveError: USER_FACING_UPLOAD_ERROR },
        true,
      );
    }
  }

  /**
   * Flush every uploaded row to create-media, including the final partial batch
   * (1..METADATA_CHUNK_SIZE-1 items). Serialized via `metadataSaveChain`.
   */
  private async drainAllMetadata(): Promise<void> {
    this.seedMetadataQueue();

    while (this.metadataPendingIds.length > 0) {
      await this.enqueueMetadataFlush();
      if (this.state.metadataSaveError) return;
      this.seedMetadataQueue();
    }

    const hasUnsaved = Array.from(this.records.values()).some((r) => r.status === "uploaded");
    if (!hasUnsaved) {
      // Drop only saved rows — failed/uploaded records stay for the retry UI.
      await clearSavedByBooking(this.bookingId);
      for (const r of this.records.values()) {
        if (r.status === "saved") this.records.delete(r.id);
      }
      this.scheduleEmit({ isSavingMetadata: false, metadataSaveError: null }, true);
    }
  }

  /* ── state mirroring ────────────────────────────────────────── */

  private async hydrateRecords(): Promise<void> {
    const persisted = await safeListByBooking(this.bookingId);
    for (const r of persisted) this.records.set(r.id, r);
  }

  private async upsertPendingRecords(inputs: UploadInput[]): Promise<void> {
    const toWrite: UploadRecord[] = [];
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
      const next: UploadRecord = {
        ...record,
        status: "pending",
        attempts: 0,
        lastError: undefined,
        updatedAt: Date.now(),
      };
      toWrite.push(next);
      this.records.set(id, next);
    }
    await putRecords(toWrite);
  }

  /* ── batched IDB + debounced progress ───────────────────────── */

  private queueIdbUpdate(id: string, patch: Partial<UploadRecord>): void {
    const existing = this.idbPending.get(id) ?? {};
    this.idbPending.set(id, { ...existing, ...patch });
    this.scheduleIdbFlush();
  }

  private scheduleIdbFlush(): void {
    if (this.idbFlushTimer) return;
    this.idbFlushTimer = setTimeout(() => {
      this.idbFlushTimer = null;
      void this.flushIdb();
    }, IDB_FLUSH_MS);
  }

  private async flushIdb(): Promise<void> {
    this.idbFlushChain = this.idbFlushChain.then(async () => {
      if (this.idbFlushTimer) {
        clearTimeout(this.idbFlushTimer);
        this.idbFlushTimer = null;
      }
      if (this.idbPending.size === 0) return;
      const batch = Array.from(this.idbPending.entries()).map(([id, patch]) => ({ id, patch }));
      this.idbPending.clear();
      await updateRecords(batch);
    });
    await this.idbFlushChain;
  }

  private scheduleEmit(patch: Partial<EngineProgress> = {}, immediate = false): void {
    Object.assign(this.pendingEmitPatch, patch);
    if (immediate) {
      this.flushEmit();
      return;
    }
    if (this.emitTimer) return;
    this.emitTimer = setTimeout(() => this.flushEmit(), PROGRESS_EMIT_MS);
  }

  private flushEmit(): void {
    if (this.emitTimer) {
      clearTimeout(this.emitTimer);
      this.emitTimer = null;
    }
    const patch = this.pendingEmitPatch;
    this.pendingEmitPatch = {};
    this.recomputeAndEmit(patch);
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
      paused: this.paused,
      ...patch,
    };
    for (const fn of this.listeners) fn(this.state);
  }

  private async waitMicro(): Promise<void> {
    // Yield to other microtasks so other loops can progress.
    await new Promise<void>((r) => setTimeout(r, 0));
  }

  /** Block while the run is paused (polls every PAUSE_POLL_MS). */
  private async waitWhilePaused(): Promise<void> {
    while (this.paused && !this.abort.signal.aborted) {
      await sleep(PAUSE_POLL_MS);
    }
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
    paused: false,
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
  const missing = folderNames.filter((name) => !out.has(name));
  if (missing.length === 0) return out;

  const created = await Promise.all(
    missing.map(async (name) => {
      const res = await apiCreateCustomFolder(bookingId, name);
      return { name, id: res.custom_folder_id };
    }),
  );
  for (const { name, id } of created) out.set(name, id);
  return out;
}

/** Resumable: list IDB records that still need work for a given booking. */
export async function listResumableRecords(bookingId: string): Promise<UploadRecord[]> {
  const all = await listByBooking(bookingId);
  return all.filter((r) => r.status === "pending" || r.status === "compressed" || r.status === "uploaded" || r.status === "failed");
}
