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
  getUploadedMediaIds,
  getWatermarkPresets,
  presignUploads,
  putBlobToPresignedUrl,
  R2PutError,
} from "@/lib/api";
import type { MediaMetadataItem } from "@/lib/api";
import type { WatermarkPreset } from "@/lib/types";

import { CompressorPool } from "./compressor";
import { WatermarkRenderer } from "./watermark";
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
/**
 * End-to-end backpressure cap. `compressedBlobs` holds every compressed blob
 * not yet uploaded (queued to presign, presigned, or in-flight); gating new
 * compressions on this (plus the ones currently compressing) bounds peak memory
 * to roughly this many blobs and — critically — keeps presigned URLs from being
 * minted far ahead of upload (they expire in 15 min). Compression is throttled
 * to roughly the upload rate, which is what makes 7k-image events safe.
 */
const MAX_OUTSTANDING_BLOBS = 128;
/** Poll interval while the compressor is held back by the cap above. */
const BACKPRESSURE_POLL_MS = 60;
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
  /**
   * Completion barrier for the active run. `cancel()` awaits this so the run's
   * `finally` (which flushes IDB + saves create-media for bytes already on R2)
   * fully settles before we wipe persisted state — otherwise a cancel could
   * orphan just-uploaded objects by clearing their records mid-drain.
   */
  private runDone: Promise<void> = Promise.resolve();
  private resolveRunDone: (() => void) | null = null;
  /** Real pause flag — gates dispatch of new compress/presign/upload work. */
  private paused = false;
  /**
   * True for the entire duration of `cancel()`, including the `wipeAll()` tail
   * that runs after the run's own `finally` has settled. `run()` checks this
   * (in addition to `isUploading`) so a new run can never start while a cancel
   * is still clearing IDB/in-memory state out from under it.
   */
  private cancelling = false;
  /**
   * When true, create-media chunks are tagged `media_out_of_sync` so the
   * backend marks the booking as needing a republish (new media added to an
   * already-published gallery). Set by the workspace from the booking's
   * publish status; applies to all flushes incl. resume/cancel drains.
   */
  private outOfSync = false;
  /**
   * The studio's default watermark preset, re-resolved from the API at the
   * start of every run (see `prepareWatermark`) rather than snapshotted once —
   * this engine outlives the React tree (see registry.ts), so a preset created
   * or re-defaulted after the event page mounted must still reach this run.
   * Null = no watermark.
   */
  private watermarkRenderer: WatermarkRenderer | null = null;
  /** Identity (preset id + geometry) the cached renderer was built for. */
  private watermarkRendererKey: string | null = null;
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
    if (this.state.isUploading || this.cancelling) return;
    // Arm the completion barrier before any `await` so a concurrent `cancel()`
    // waits for this run's `finally` rather than racing it.
    this.runDone = new Promise<void>((resolve) => {
      this.resolveRunDone = resolve;
    });
    this.abort = new AbortController();
    this.paused = false;
    this.inputs = inputs;
    this.inputCursor = 0;
    this.startedAt = Date.now();
    this.bytesUploaded = 0;
    this.runningCompressors = 0;
    this.runningUploaders = 0;
    this.runningPresigns = 0;
    this.compressionFinished = false;
    this.presignFinished = false;
    this.metadataPendingIds = [];
    this.metadataSaveChain = Promise.resolve();
    // The engine (and its AIMD controller) is reused per booking; clear any
    // in-flight slot count and stale pipeline queues a prior (e.g. cancelled)
    // run may have left behind, so this run starts from a clean slate and can
    // actually dispatch uploads.
    this.aimd.resetActive();
    this.compressedQueue = [];
    this.presignedQueue = [];
    this.compressedBlobs.clear();

    // Fresh run: drop the in-memory mirror from any previous successful run
    // so progress counters start at zero. (We deliberately do NOT clear after
    // a successful save — that would zero `photosDone` at the same instant
    // `isUploading` flips false, defeating downstream reload triggers.)
    this.records.clear();

    // Seed in-memory mirror from any existing IDB records (resume support).
    await this.hydrateRecords();
    // Ask the backend which media_ids are already saved for this booking, so a
    // folder re-selected after a cancelled/interrupted run skips what's already
    // in the gallery — the durable source of truth, since cancel wipes IDB.
    const alreadyUploaded = await this.fetchUploadedMediaIds();
    await this.upsertPendingRecords(inputs, alreadyUploaded);
    this.seedMetadataQueue();
    this.scheduleEmit(
      { isUploading: true, paused: false, metadataSaveError: null, watermarkWarning: null },
      true,
    );

    // Fetch + decode the studio's default watermark once for the whole run.
    await this.prepareWatermark();

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
      // While a `cancel()` is in flight, let it own the `isUploading: false`
      // transition (it flips it only after `wipeAll()` fully settles). Emitting
      // it here too would let the UI briefly believe the upload is idle and
      // safe to restart while wipeAll() is still clearing state underneath it.
      if (!this.cancelling) {
        this.scheduleEmit({ isUploading: false, paused: false }, true);
      }
      // Release any `cancel()` waiting on this run — metadata is now persisted.
      this.resolveRunDone?.();
      this.resolveRunDone = null;
    }
  }

  /**
   * Cancel an in-progress run. Stops new work and lets the run settle (its
   * `finally` flushes create-media for anything already on R2), then wipes all
   * persisted + in-memory state. Unlike `pause`, a cancelled run leaves nothing
   * behind — re-selecting the folder starts clean and re-checks the backend for
   * what's already uploaded, skipping those silently.
   *
   * Resolves with `savedCount`: how many photos are genuinely in the gallery at
   * the moment of cancellation. Only records that reached `saved` (create-media
   * confirmed) are counted — a photo whose bytes are on R2 but whose metadata
   * batch failed on the way out is deliberately NOT counted as delivered.
   */
  async cancel(): Promise<{ savedCount: number }> {
    if (this.cancelling) return { savedCount: 0 }; // already cancelling — avoid a second concurrent wipe
    const wasRunning = this.state.isUploading;
    this.cancelling = true;
    this.paused = false;
    this.abort.abort();
    try {
      // Wait for the active run's `finally` to persist metadata for bytes already
      // on R2 before wiping — otherwise we'd orphan those objects.
      if (wasRunning) await this.runDone;
      // Counted after the drain (so late saves are included) and before the
      // wipe (which clears `records` outright).
      const savedCount = Array.from(this.records.values()).filter((r) => r.status === "saved").length;
      await this.wipeAll();
      return { savedCount };
    } finally {
      this.cancelling = false;
      this.scheduleEmit({ isUploading: false, paused: false }, true);
    }
  }

  /**
   * Pause an in-progress run. New compression/presign/upload work stops being
   * dispatched; PUTs already in flight are left to settle. Once they have, the
   * metadata flush loop persists a partial create-media batch for everything
   * already on R2 (see `runMetadataFlushLoop`), so the DB reflects the pause
   * point without waiting for a full 200-chunk. The run stays `isUploading` so
   * the page still shows the upload card — the workspace is unlocked via the
   * `paused` flag instead.
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
    // Single-file re-run — ensure the watermark is ready (run() isn't involved).
    await this.prepareWatermark();
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
    const { blob } = await this.compressorPool.run(file);
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
    await this.wipeAll();
    this.scheduleEmit({}, true);
  }

  /**
   * Clear this booking's IndexedDB records and reset all in-memory pipeline
   * state. Shared by `cancel()` and `resetPersisted()`. Does not emit — callers
   * emit the state transition they want afterwards.
   */
  private async wipeAll(): Promise<void> {
    await clearBooking(this.bookingId);
    this.records.clear();
    this.compressedBlobs.clear();
    this.compressedQueue = [];
    this.presignedQueue = [];
    this.metadataPendingIds = [];
  }

  /* ── watermark ──────────────────────────────────────────────── */

  /**
   * Resolve the studio's default preset and build the renderer for it, once per
   * run, before compression starts.
   *
   * The preset is re-fetched here rather than pushed in from a mount-time
   * effect: this engine is module-level and outlives the event page, so a
   * snapshot taken when the page mounted goes stale the moment the studio adds
   * a preset or changes which one is default (in this tab or another), and the
   * run would silently bake in the old mark — or none at all. The decoded
   * bitmap is still cached by preset id + geometry, so back-to-back runs,
   * resumes and single-file retries reuse it and only re-fetch the small JSON.
   *
   * Nothing here can fail the upload — photos ship unmarked instead — but a
   * failure that *should* have produced a watermark is surfaced on the progress
   * card via `watermarkWarning`, because the mark is baked in at upload time
   * and cannot be added afterwards.
   */
  private async prepareWatermark(): Promise<void> {
    // A preset with no `image_url` has nothing to stamp — treat it as absent.
    let preset: (WatermarkPreset & { image_url: string }) | null = null;
    try {
      const { presets } = await getWatermarkPresets();
      preset =
        presets.find(
          (p): p is WatermarkPreset & { image_url: string } => !!p.is_default && !!p.image_url,
        ) ?? null;
      if (!preset) {
        this.disposeWatermark();
        // No presets at all is the expected state for a studio that hasn't set
        // one up (the reminder dialog covers that) — say nothing. Presets that
        // exist but none of them default is a misconfiguration the studio can
        // only notice here, since we never guess which one they meant.
        this.setWatermarkWarning(
          presets.length > 0
            ? "None of your watermark presets is set as default, so these photos are uploading without a watermark. Set one as default in Settings → Watermark Presets."
            : null,
        );
        return;
      }
    } catch (err) {
      console.error("[upload:watermark] could not load presets; uploading without watermark", err);
      this.disposeWatermark();
      this.setWatermarkWarning(
        "We couldn't check your watermark settings, so these photos are uploading without a watermark.",
      );
      return;
    }

    const key = `${preset._id}:${preset.image_url}:${preset.position}:${preset.size}:${preset.opacity}`;
    if (this.watermarkRenderer && this.watermarkRendererKey === key) {
      this.setWatermarkWarning(null);
      return;
    }

    this.disposeWatermark();
    try {
      this.watermarkRenderer = await WatermarkRenderer.create(
        { position: preset.position, opacity: preset.opacity, size: preset.size },
        preset.image_url,
      );
      this.watermarkRendererKey = key;
      this.setWatermarkWarning(null);
    } catch (err) {
      console.error(
        "[upload:watermark] could not load default preset; uploading without watermark",
        err,
      );
      this.watermarkRenderer = null;
      this.watermarkRendererKey = null;
      this.setWatermarkWarning(
        `Your watermark "${preset.name || "preset"}" couldn't be loaded, so these photos are uploading without it.`,
      );
    }
  }

  /** Emit (or clear) the "uploading without your watermark" notice. */
  private setWatermarkWarning(message: string | null): void {
    if (this.state.watermarkWarning === message) return;
    this.scheduleEmit({ watermarkWarning: message }, true);
  }

  private disposeWatermark(): void {
    this.watermarkRenderer?.dispose();
    this.watermarkRenderer = null;
    this.watermarkRendererKey = null;
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

      // Backpressure: throttle compression to the upload rate. `compressedBlobs`
      // is every blob not yet uploaded; `runningCompressors` are compressions
      // about to add one. Gating on their sum bounds peak memory and keeps
      // presign just behind upload (so signed URLs don't expire while queued).
      while (this.compressedBlobs.size + this.runningCompressors >= MAX_OUTSTANDING_BLOBS) {
        if (this.abort.signal.aborted) break;
        await sleep(BACKPRESSURE_POLL_MS);
      }
      if (this.abort.signal.aborted) break;

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
    console.log("[upload:compress] start", {
      file: input.file.name,
      sizeMB: (input.file.size / 1024 / 1024).toFixed(2),
      type: input.file.type || "(no type)",
      folder: input.folderName,
    });
    this.runningCompressors++;
    this.scheduleEmit();
    try {
      const { blob, width, height } = await this.compressorPool.run(input.file, this.watermarkRenderer);
      if (this.abort.signal.aborted) return;
      console.log("[upload:compress] done", input.file.name, `→ ${(blob.size / 1024 / 1024).toFixed(2)} MB`);
      const dims = width != null && height != null ? { width, height } : {};
      this.queueIdbUpdate(recordId, { status: "compressed", ...dims });
      const rec = this.records.get(recordId);
      if (rec) this.records.set(recordId, { ...rec, status: "compressed", ...dims });
      this.compressedBlobs.set(recordId, blob);
      this.compressedQueue.push(recordId);
    } catch (err) {
      const reason = err instanceof Error ? err.message : "compression failed";
      console.error("[upload:compress] failed", {
        file: input.file.name,
        sizeMB: (input.file.size / 1024 / 1024).toFixed(2),
        type: input.file.type || "(no type)",
        reason,
      }, err);
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
      //
      // Fire a batch as soon as there's anything to presign AND a presign slot
      // is free — do NOT wait for a full 50 to compress. Waiting for 50 was the
      // "sticks every 50 files" stall on slow machines: the first ~50 files
      // compressed with no upload in flight, and thereafter the uploaders
      // drained each 50-batch and then idled until the next 50 finished
      // compressing (a sawtooth). We still prefer full 50-batches while they're
      // readily available — the `>= PRESIGN_BATCH_SIZE` clause keeps batching
      // efficient when compression is outrunning presign — but when nothing is
      // currently being presigned (`runningPresigns === 0`) we fire a partial
      // batch immediately so a signed URL (and the upload behind it) is never
      // blocked waiting for a batch to fill. Presign still only ever runs on
      // already-compressed items, so URLs are minted just behind the upload
      // frontier (never far ahead → no 15-min expiry risk) and this needs no
      // assumption about whether the backend binds content-length into the
      // signature — the bytes already exist by the time we presign.
      while (
        !this.abort.signal.aborted &&
        !this.paused &&
        this.runningPresigns < PRESIGN_CONCURRENCY &&
        this.compressedQueue.length > 0 &&
        (this.compressedQueue.length >= PRESIGN_BATCH_SIZE ||
          this.runningPresigns === 0 ||
          this.compressionFinished)
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
      // Aborted by cancel — not a real failure. Drop the blobs and bail quietly
      // (no error log, no `failed` status); cancel wipes all state anyway.
      if (this.abort.signal.aborted || isAbortError(err)) {
        for (const id of batchIds) this.compressedBlobs.delete(id);
        return;
      }
      const reason = err instanceof Error ? err.message : "presign failed";
      const filenames = batchIds.map((id) => this.records.get(id)?.filename ?? id);
      console.error("[upload:presign] terminal failure", { files: filenames, reason }, err);
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
    const fileLabel = this.records.get(item.recordId)?.filename ?? item.recordId;
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
              `[upload:put] failed (file=${fileLabel}, attempt ${attempt + 1}/${MAX_ATTEMPTS}, willRetry=${willRetry})`,
              err instanceof R2PutError ? { status: err.status, message: err.message } : err,
            );
          },
        },
      );
      succeeded = true;
    } catch (err) {
      // A cancelled run aborts in-flight PUTs — that's not a real failure. Bail
      // quietly (no error log, no `failed` status); cancel wipes state anyway.
      // Release the AIMD slot so the reused engine's concurrency accounting
      // doesn't leak into the next run.
      if (this.abort.signal.aborted || isAbortError(err)) {
        this.aimd.noteAborted();
        this.compressedBlobs.delete(item.recordId);
        return;
      }
      const msg = err instanceof Error ? err.message : "upload failed";
      console.error("[upload:put] terminal failure", {
        file: fileLabel,
        blobSizeMB: (item.blob.size / 1024 / 1024).toFixed(2),
        status: err instanceof R2PutError ? err.status : undefined,
        error: msg,
      }, err);
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
   * when the pipeline finishes or is interrupted — or, while paused, by the
   * pause-drain branch below.
   */
  private async runMetadataFlushLoop(): Promise<void> {
    while (true) {
      this.seedMetadataQueue();

      if (this.metadataPendingIds.length >= METADATA_CHUNK_SIZE) {
        await this.enqueueMetadataFlush();
        if (this.state.metadataSaveError) return;
        continue;
      }

      // Paused: once the in-flight PUTs have settled (`runningUploaders === 0`),
      // persist the partial batch of whatever already reached R2 so the DB
      // reflects the pause point. Each flushed record is marked `saved` and
      // spliced out of the pending queue, so `seedMetadataQueue` never re-queues
      // it — the next post-resume 200-chunk excludes these automatically (no
      // double-save).
      if (
        this.paused &&
        this.runningUploaders === 0 &&
        this.metadataPendingIds.length > 0 &&
        !this.abort.signal.aborted
      ) {
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
      filename: r.filename,
      ...(r.width != null ? { width: r.width } : {}),
      ...(r.height != null ? { height: r.height } : {}),
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
      console.error("[upload:metadata] terminal failure", {
        files: recs.map((r) => r.filename),
        count: recs.length,
        error: msg,
      }, err);
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

    const all = Array.from(this.records.values());

    // Metadata still owes the backend for some uploaded rows (chunk failed or
    // pending) — keep all state and let a later run / mount auto-resume finish it.
    if (all.some((r) => r.status === "uploaded")) return;

    // Only wipe the slate when the *entire* batch made it to the gallery. If
    // anything is still pending/failed (cancelled, paused, or a transient error),
    // we retain ALL records — including the saved ones — so re-selecting the same
    // folder resumes only the unfinished files (saved ones are skipped by
    // fingerprint in the compression loop) and never re-uploads what's already in.
    const fullyComplete = all.length > 0 && all.every((r) => r.status === "saved");
    if (fullyComplete) {
      await clearBooking(this.bookingId);
      this.records.clear();
    }
    this.scheduleEmit({ isSavingMetadata: false, metadataSaveError: null }, true);
  }

  /* ── state mirroring ────────────────────────────────────────── */

  private async hydrateRecords(): Promise<void> {
    const persisted = await safeListByBooking(this.bookingId);
    for (const r of persisted) this.records.set(r.id, r);
  }

  /**
   * Build the IndexedDB record set for the batch about to upload. Each input's
   * record id (`${bookingId}__${fingerprint}`) is the same media_id the backend
   * stores, so any input whose id is in `alreadyUploaded` is recorded as `saved`
   * — counted as done in the progress bar and skipped silently by the pipeline,
   * never re-compressed or re-uploaded.
   */
  private async upsertPendingRecords(
    inputs: UploadInput[],
    alreadyUploaded: Set<string>,
  ): Promise<void> {
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
        status: alreadyUploaded.has(id) ? "saved" : "pending",
        attempts: 0,
        lastError: undefined,
        updatedAt: Date.now(),
      };
      toWrite.push(next);
      this.records.set(id, next);
    }
    await putRecords(toWrite);
  }

  /**
   * Fetch the set of media_ids already saved for this booking. Best-effort: a
   * failure just disables backend-side skipping for this run (files re-upload
   * rather than blocking the whole upload on a transient error).
   */
  private async fetchUploadedMediaIds(): Promise<Set<string>> {
    try {
      const ids = await getUploadedMediaIds(this.bookingId);
      return new Set(ids);
    } catch (err) {
      console.warn(
        "[upload:dedup] could not fetch existing media ids; uploading without backend skip",
        err,
      );
      return new Set<string>();
    }
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
    // Failed files count toward "resolved" for the ring so it completes cleanly —
    // failures are no longer surfaced; they're retried silently on re-selection.
    const resolved = uploaded + failed;
    const percent = photosTotal === 0 ? 0 : Math.min(100, Math.round((resolved / photosTotal) * 100));
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
      watermarkWarning: this.state.watermarkWarning,
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

/** True for the DOMException a fetch/PUT throws when its abort signal fires. */
function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
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
    watermarkWarning: null,
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
/** Trim + lowercase so "Candids", " candids ", and "CANDIDS" are one folder. */
function normalizeFolderName(name: string): string {
  return name.trim().toLowerCase();
}

export async function ensureFolders(
  bookingId: string,
  folderNames: string[],
  existingMap: Map<string, string>,
): Promise<Map<string, string>> {
  // Look up by normalized name so a folder created moments ago (stale caller
  // state) or typed with different casing/whitespace is reused instead of
  // duplicated. `out` stays keyed by the exact requested name so callers can
  // still `.get(name)` with what they passed in.
  const byNormalized = new Map<string, string>();
  for (const [name, id] of existingMap) byNormalized.set(normalizeFolderName(name), id);

  const out = new Map(existingMap);
  const toCreate: string[] = [];
  for (const name of folderNames) {
    const norm = normalizeFolderName(name);
    if (byNormalized.has(norm)) {
      out.set(name, byNormalized.get(norm) as string);
    } else if (!toCreate.some((n) => normalizeFolderName(n) === norm)) {
      // Not seen yet in this batch either — queue exactly one create per
      // distinct normalized name (two groups named "Candids"/"candids" in the
      // same upload share one folder + one create call).
      toCreate.push(name);
    }
  }
  if (toCreate.length === 0) return out;

  const created = await Promise.all(
    toCreate.map(async (name) => {
      try {
        const res = await apiCreateCustomFolder(bookingId, name);
        console.log("[upload:folder] created", { name, id: res.custom_folder_id });
        return { name, id: res.custom_folder_id };
      } catch (err) {
        console.error("[upload:folder] failed to create folder", {
          name,
          error: err instanceof Error ? err.message : err,
        }, err);
        throw err;
      }
    }),
  );
  for (const { name, id } of created) byNormalized.set(normalizeFolderName(name), id);
  for (const name of folderNames) {
    if (!out.has(name)) {
      const id = byNormalized.get(normalizeFolderName(name));
      if (id) out.set(name, id);
    }
  }
  return out;
}

/** Resumable: list IDB records that still need work for a given booking. */
export async function listResumableRecords(bookingId: string): Promise<UploadRecord[]> {
  const all = await listByBooking(bookingId);
  return all.filter((r) => r.status === "pending" || r.status === "compressed" || r.status === "uploaded" || r.status === "failed");
}
