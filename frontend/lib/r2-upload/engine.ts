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
 *   a tier-aware batch size via `create-media` (photos appear in the DB during
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
  abortArchiveMultipart,
  completeArchiveMultipart,
  createArchiveMultipart,
  createCustomFolder as apiCreateCustomFolder,
  createMediaBatch,
  getUploadedMediaIds,
  getWatermarkPresets,
  presignUploads,
  putArchiveBlob,
  putArchivePart,
  putBlobToPresignedUrl,
  R2PutError,
  signArchiveParts,
} from "@/lib/api";
import type { MediaMetadataItem, StorageMeter } from "@/lib/api";
import type { WatermarkPreset } from "@/lib/types";

import { CompressorPool } from "./compressor";
import type { UploadVariant } from "./compressor";
import { WatermarkRenderer } from "./watermark";
import { AimdController } from "./concurrency";
import { resolveDedup } from "./dedup.ts";
import {
  archiveMetadataFor,
  shouldDeferEmbedding,
  computeArchiveChecksum,
  planArchivePartQueue,
} from "./archive.ts";
import {
  classifyError,
  classifyHttp,
  isExpiredPresignError,
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
 * Server-side presign lifetime for the delivery pair (900 s), and the margin
 * below it at which a queued item is re-signed before its PUT.
 *
 * The batcher signs "just behind upload", which holds while a tab is in the
 * foreground. It does NOT hold when the tab is backgrounded: browsers throttle
 * background timers to roughly one tick a minute, the dispatch loops crawl, and
 * items already sitting in `presignedQueue` age past 900 s. Every one of them
 * then answers 403 `ExpiredRequest`, which `classifyHttp` calls terminal — so
 * before this existed, a run left in a background tab failed every queued photo
 * and could not recover, which is exactly what "nothing has moved for a while"
 * was reporting.
 */
const PRESIGN_TTL_MS = 900_000;
const PRESIGN_REFRESH_MS = 240_000;
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
/**
 * When create-media is flushed, per quality tier: a batch SIZE and a maximum
 * AGE, whichever comes first.
 *
 * Two costs pull against each other, and the tier decides the balance because
 * the tier decides how fast photos complete.
 *
 * Batching too little is a load problem. Every call is an insertMany plus a
 * booking update, a pump nudge and a storage $inc; a server carrying several
 * studios at once wants those amortised over as many photos as possible.
 *
 * Batching too much is a data-loss problem. An object is on R2/B2 the instant
 * its PUT returns, but nothing in the product knows it exists until
 * create-media records it. A tab closed before the next flush strands
 * everything since the last one: the objects are orphaned (recoverable only by
 * reclaim-orphaned-media.js) and the studio has to re-upload those photos.
 *
 * So the SIZE falls as the tier gets heavier — losing 25 originals means
 * re-sending ~500 MB over a link that manages a photo every half-minute, while
 * losing 200 web-tier photos is a couple of minutes of re-work. The AGE rises
 * for the same reason: slow tiers need a longer window to fill a batch at all,
 * and without that the timer fires on every single photo, which is exactly the
 * one-call-per-photo behaviour a purely time-based flush produced.
 */
const METADATA_FLUSH_POLICY: Record<UploadVariant, { size: number; maxAgeMs: number }> = {
  // Two small objects per photo; a batch fills in seconds.
  "2560": { size: 200, maxAgeMs: 60_000 },
  // Adds an ~8 MB archive, so roughly an order of magnitude slower.
  "4096": { size: 100, maxAgeMs: 120_000 },
  // Adds the whole camera file. On a slow link this is a photo every ~30 s, so
  // the age bound is what actually fires — 3 minutes gathers several photos per
  // call instead of one.
  original: { size: 25, maxAgeMs: 180_000 },
};

/**
 * Fraction of a run that must be uploaded before its rows are allowed to boot
 * the GPU embedding pump. Per tier, because the tier decides how far apart
 * create-media chunks land.
 *
 * On a "2560" run chunks arrive seconds apart, so the pump stays warm on its
 * own and there is nothing to gain by waiting — hence 0, no deferral at all.
 *
 * On an archive-tier run the archive is 10-20x the delivery copy, so chunks
 * arrive minutes apart: further apart than the pump's idle-exit. Left alone the
 * pump boots (~4 min), embeds a handful of photos (~9 s), idles out, and boots
 * again for the next chunk — an instance that spends nearly all its life
 * starting up. Waiting lets ONE pump drain the whole backlog continuously.
 *
 * The thresholds are chosen so the pump finishes at about the same moment the
 * upload does: embedding runs at roughly 0.45 s/photo, so the remaining upload
 * time at the threshold has to cover it. At these values that holds for any
 * uplink below ~4.7 MB/s (original) and ~6.3 MB/s (4096) — comfortably above
 * what a venue connection delivers. Tunable without a rebuild, because the
 * right number depends on a studio's link.
 */
const EMBED_DEFER_THRESHOLD: Record<UploadVariant, number> = {
  "2560": 0,
  "4096": Number(process.env.NEXT_PUBLIC_EMBED_DEFER_PCT_4096 ?? 80) / 100,
  original: Number(process.env.NEXT_PUBLIC_EMBED_DEFER_PCT_ORIGINAL ?? 90) / 100,
};

/** Hard cap on rows per create-media request, independent of tier. */
const METADATA_CHUNK_SIZE = 200;

/** Coalesce per-file IDB writes during the hot path. */
const IDB_FLUSH_MS = 500;
/** Throttle progress UI updates (in-memory state stays live). */
const PROGRESS_EMIT_MS = 200;
const METADATA_SAVE_ATTEMPTS = 5;
/** How often the dispatch loops re-check the pause flag. */
const PAUSE_POLL_MS = 120;
/**
 * How long cancel() lets in-flight records finish before it stops waiting and
 * aborts them.
 *
 * Long enough for an archive object on a slow link (a 16 MB original is two
 * 8 MiB parts, tens of seconds each), short enough that Stop still feels like
 * a button. It used to be far longer, on the reasoning that timing out would
 * reintroduce the very inconsistency the grace phase prevents — that is no
 * longer true: a record whose archive does not complete is now marked `failed`
 * rather than delivered (see uploadOne), so an expired grace period costs the
 * photo, not the gallery's integrity.
 */
const CANCEL_GRACE_MS = 3 * 60_000;
const BYTES_PER_GB = 1024 ** 3;
/**
 * Parts of ONE original in flight at once. Measured, not guessed: B2 is
 * single-region (eu-central-003, Amsterdam) and a serial part stream gets
 * nowhere near the link's capacity from India, while several parts in flight
 * roughly quadruples it. This multiplies with the AIMD uploader concurrency,
 * so it is deliberately modest.
 */
const ARCHIVE_PART_CONCURRENCY = 4;
/**
 * How many part URLs to sign at a time. Signatures last ARCHIVE_URL_TTL_MS and
 * an archive-tier run lasts hours, so parts are signed just ahead of where the
 * upload actually is — never the whole file up front, which would hand a
 * 10,000-part file a set of URLs that expired before part 100.
 */
const ARCHIVE_SIGN_WINDOW = 16;
/** Server-side presign lifetime (900 s). Kept in sync with the backend default. */
const ARCHIVE_URL_TTL_MS = 900_000;
/**
 * Re-sign a part whose URL is within this of expiring. A part can wait behind
 * three others on a slow link, so the margin has to cover a whole part upload.
 */
const ARCHIVE_URL_REFRESH_MS = 180_000;

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
   * Set by cancel() for its GRACE PHASE: stop dispatching new work, but let
   * everything already in flight finish completely.
   *
   * Distinct from `paused` (which a run resumes from) and from aborting (which
   * kills in-flight requests). It exists because a photo's three objects are
   * uploaded in parallel, so aborting mid-record can leave the 2560px view and
   * its thumbnail on R2 with the archive half-written — a photo that is in the
   * gallery at the Original tier with no original behind it. That inconsistency
   * is worse than not having the photo at all, and nothing downstream would
   * ever notice it.
   */
  private stopping = false;
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

  /**
   * True while the terminal drain runs — the run has stopped producing chunks
   * (finished, cancelled, or a leftover being drained on a later mount). No
   * later chunk can cross the deferral threshold and release the rows held back
   * earlier, so the drain releases them itself rather than leaving them to wait
   * out the backend's deadline.
   */
  private finalMetadataDrain = false;
  /** Uploaded record ids waiting for create-media (incremental flush). */
  private metadataPendingIds: string[] = [];
  private metadataSaveChain: Promise<void> = Promise.resolve();

  /** In-flight pipeline state. */
  private inputs: UploadInput[] = [];
  private inputCursor = 0; // next input index for the compressor producer to pick
  private records = new Map<string, UploadRecord>(); // recordId → current state (mirror of IDB)
  private compressedBlobs = new Map<string, Blob>(); // recordId → compressed blob (cleared after upload)
  // recordId → the 480px gallery-grid derivative, when the compressor produced
  // one. Freed alongside compressedBlobs. Absent whenever the thumbnail step
  // failed — every downstream step treats that as "no thumbnail", never an error.
  // ~40 KB per outstanding record against the ~800 KB already held, so
  // MAX_OUTSTANDING_BLOBS (which counts records, not blobs) needs no change.
  private thumbBlobs = new Map<string, Blob>();
  // recordId → compressed blob size in bytes. Unlike compressedBlobs this is NOT
  // cleared on upload success — create-media (flushOneMetadataChunk) needs it
  // after the blob itself has already been freed.
  private compressedSizes = new Map<string, number>();
  // recordId → thumbnail blob size in bytes. Kept after the blob is freed for
  // the same reason as compressedSizes.
  private thumbSizes = new Map<string, number>();
  /**
   * The run's quality tier, fixed for its whole duration (the modal disables
   * the selector once a run starts). Threaded into compression, presign and
   * upload rather than read from anywhere global, so a resumed or retried file
   * uses the tier its run was started with.
   */
  private variant: UploadVariant = "2560";
  /**
   * recordId → the source File, held ONLY for an "original" run, where the
   * archive object IS the source bytes and the uploader needs the handle long
   * after compression finished.
   *
   * This costs approximately nothing: a File is a lazy reference to bytes on
   * disk, not a buffer. Every read below goes through file.slice(), which
   * returns an equally lazy Blob that fetch streams from the backing store — so
   * an originals run of 7,000 camera files adds no meaningful heap. NOTHING in
   * this class may call .arrayBuffer()/.blob()/.text() on one of these or on a
   * slice of one.
   */
  private sourceFiles = new Map<string, File>();
  // recordId → the 4096 archive blob, mirroring compressedBlobs. Freed as soon
  // as its PUT settles. Never populated for "2560" (there is no archive) or
  // "original" (the archive is the source File, streamed from disk).
  private archiveBlobs = new Map<string, Blob>();
  // recordId → archive bytes. Like compressedSizes, this OUTLIVES the blob:
  // create-media needs the figure after the bytes have been released.
  private archiveSizes = new Map<string, number>();
  // recordId → SHA-256 of the archive bytes ("original" only), computed by
  // streaming the file in slices.
  private archiveChecksums = new Map<string, string>();
  /**
   * recordId → the in-flight multipart upload for an original, so cancel() can
   * abort it. An abandoned multipart upload is billed by B2 as stored bytes
   * indefinitely and nothing in the product would ever surface it, so this map
   * is the difference between a cancelled run costing nothing and costing the
   * studio for garbage forever.
   */
  private activeMultiparts = new Map<string, { key: string; uploadId: string }>();
  private compressedQueue: string[] = []; // recordIds waiting to be presigned
  private presignedQueue: PresignedItem[] = []; // ready to be PUT
  private startedAt = 0;
  private bytesUploaded = 0;
  /**
   * Live storage metering for storage-based plans. `storageRemainingGB` is the
   * authoritative GB-remaining figure from the most recent create-media
   * response; `storageMarkBytes` is the cumulative `savedBytes` total that
   * figure corresponds to. Projecting `remaining − (bytesUploaded −
   * storageMarkBytes)` therefore subtracts exactly the bytes that are on R2 but
   * not yet counted by the server, with no request of its own.
   *
   * Null on count-based plans and until the first create-media chunk returns.
   * Before that the upload modal's pre-flight estimate is the gate.
   */
  private storageRemainingGB: number | null = null;
  private storageMarkBytes = 0;
  /** Cumulative bytes (delivery copy + thumbnail) the backend has recorded. */
  private savedBytes = 0;
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

  /**
   * Begin (or resume) processing the given inputs at a given quality tier.
   *
   * `variant` is fixed for the whole run — the modal disables the selector once
   * a run has started. A run that mixed tiers would produce a gallery whose
   * archive coverage nobody could reason about, and there is no way to express
   * "some of these have originals" in the UI.
   */
  async run(inputs: UploadInput[], variant: UploadVariant = "2560"): Promise<void> {
    if (this.state.isUploading || this.cancelling) return;
    // Arm the completion barrier before any `await` so a concurrent `cancel()`
    // waits for this run's `finally` rather than racing it.
    this.runDone = new Promise<void>((resolve) => {
      this.resolveRunDone = resolve;
    });
    this.abort = new AbortController();
    this.paused = false;
    this.stopping = false;
    this.variant = variant;
    this.inputs = inputs;
    this.inputCursor = 0;
    this.startedAt = Date.now();
    this.bytesUploaded = 0;
    this.storageRemainingGB = null;
    this.storageMarkBytes = 0;
    this.savedBytes = 0;
    this.runningCompressors = 0;
    this.runningUploaders = 0;
    this.finalMetadataDrain = false;
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
    this.thumbBlobs.clear();
    this.compressedSizes.clear();
    this.thumbSizes.clear();
    this.sourceFiles.clear();
    this.archiveBlobs.clear();
    this.archiveSizes.clear();
    this.archiveChecksums.clear();
    this.activeMultiparts.clear();

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
      {
        isUploading: true,
        paused: false,
        metadataSaveError: null,
        watermarkWarning: null,
        storageFullWarning: null,
        storageRemainingGB: null,
      },
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
      // (smaller than a full batch) and work completed before an interrupt/cancel.
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
    try {
      if (wasRunning) {
        // GRACE PHASE — deliberately do NOT abort yet.
        //
        // A record's three objects (2560px view, thumbnail, archive) upload in
        // parallel. Aborting here would routinely land the view and thumbnail
        // while cutting the archive off mid-multipart, leaving a photo in the
        // gallery at the Original tier with no original behind it. Nothing
        // downstream would ever detect that, so the only place to prevent it is
        // here: stop feeding the pipeline, and let the records already in flight
        // finish everything they started.
        //
        // Records still queued are dropped, not finished — they have written
        // nothing to any bucket yet and so cannot be left inconsistent.
        this.stopping = true;
        this.scheduleEmit({ finishingInFlight: this.runningUploaders }, true);
        if (this.runningUploaders > 0) {
          console.log(
            `[upload] cancel: finishing ${this.runningUploaders} in-flight photo(s) before stopping`,
          );
        }
        // The run's own loops wind down and its `finally` persists metadata for
        // everything that completed. The race is a guard against a connection
        // that neither returns nor errors, not a routine limit — if it fires we
        // are back to the inconsistency above, so it says so loudly.
        const settled = await Promise.race([
          this.runDone.then(() => true),
          sleep(CANCEL_GRACE_MS).then(() => false),
        ]);
        if (!settled) {
          console.error(
            `[upload] cancel: in-flight uploads did not finish within ${CANCEL_GRACE_MS / 60000} min — aborting them. ` +
              "Any photo cut off mid-archive will have no archive object; its record is discarded by the wipe below.",
          );
        }
      }
      // Now stop anything still outstanding, and release queued work.
      this.abort.abort();
      // Wait for the active run's `finally` to persist metadata for bytes already
      // on R2 before wiping — otherwise we'd orphan those objects.
      if (wasRunning) await this.runDone;
      // Counted after the drain (so late saves are included) and before the
      // wipe (which clears `records` outright).
      const savedCount = Array.from(this.records.values()).filter((r) => r.status === "saved").length;
      // Before wiping the records that name them — after this, nothing knows
      // these uploads exist.
      await this.abortActiveMultiparts();
      await this.wipeAll();
      return { savedCount };
    } finally {
      this.cancelling = false;
      this.stopping = false;
      this.scheduleEmit({ isUploading: false, paused: false, finishingInFlight: 0 }, true);
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
    // Drop the storage figure that caused an auto-pause along with the warning.
    // Keeping it would let the stale projection re-pause on the very next
    // uploaded photo, before any new create-media response could reflect space
    // the studio just freed — Resume would look broken. Cleared, the run gets
    // at least one more chunk and then re-pauses on a fresh, authoritative
    // number if the plan is still full.
    this.storageRemainingGB = null;
    this.storageMarkBytes = this.savedBytes;
    this.scheduleEmit({ paused: false, storageFullWarning: null, storageRemainingGB: null }, true);
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
    this.thumbBlobs.clear();
    this.compressedSizes.clear();
    this.thumbSizes.clear();
    this.sourceFiles.clear();
    this.archiveBlobs.clear();
    this.archiveSizes.clear();
    this.archiveChecksums.clear();
    this.compressedQueue = [];
    this.presignedQueue = [];
    this.metadataPendingIds = [];
  }

  /**
   * Abort every multipart upload this run still has open on B2.
   *
   * Called from cancel(), and it is not optional bookkeeping: B2 bills the
   * parts of an abandoned multipart upload as stored bytes indefinitely. A
   * studio who cancels a 75 GB originals run halfway would otherwise leave
   * ~35 GB of paid-for garbage that nothing in the product can ever see again,
   * and the first anyone would know of it is an invoice.
   *
   * Best-effort per upload: one failure must not stop the others, and the
   * backend already treats "no such upload" as success.
   */
  private async abortActiveMultiparts(): Promise<void> {
    const open = Array.from(this.activeMultiparts.entries());
    this.activeMultiparts.clear();
    if (open.length === 0) return;
    console.log(`[upload:archive] aborting ${open.length} incomplete multipart upload(s)`);
    await Promise.allSettled(
      open.map(async ([recordId, { key, uploadId }]) => {
        try {
          await abortArchiveMultipart(this.bookingId, { key, upload_id: uploadId });
        } catch (err) {
          console.error("[upload:archive] abort failed — this upload may be billed until the bucket lifecycle rule expires it", {
            recordId,
            key,
            error: err instanceof Error ? err.message : err,
          });
        }
      }),
    );
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
      // `stopping` ends the producer outright: a file that has not begun
      // compressing has nothing on any bucket, so there is nothing to finish.
      if (this.abort.signal.aborted || this.stopping) break;

      // Pause: stop pulling new files into the compressor while held.
      await this.waitWhilePaused();
      if (this.abort.signal.aborted || this.stopping) break;

      // Backpressure: throttle compression to the upload rate. `compressedBlobs`
      // is every blob not yet uploaded; `runningCompressors` are compressions
      // about to add one. Gating on their sum bounds peak memory and keeps
      // presign just behind upload (so signed URLs don't expire while queued).
      //
      // BOTH waits above and below must re-check `stopping`, not just `abort`.
      // A cancel arrives while this loop is parked at the cap; the in-flight
      // uploads it is waiting for then finish, free their blobs, drop the count
      // below the cap — and without this check the loop would sail past the
      // top-of-iteration guard it already cleared and compress another file,
      // minutes after the studio pressed Stop.
      while (this.compressedBlobs.size + this.runningCompressors >= MAX_OUTSTANDING_BLOBS) {
        if (this.abort.signal.aborted || this.stopping) break;
        await sleep(BACKPRESSURE_POLL_MS);
      }
      if (this.abort.signal.aborted || this.stopping) break;

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
      const { blob, thumbBlob, archiveBlob, width, height } = await this.compressorPool.run(
        input.file,
        this.watermarkRenderer,
        this.variant,
      );
      if (this.abort.signal.aborted) return;
      console.log("[upload:compress] done", input.file.name, `→ ${(blob.size / 1024 / 1024).toFixed(2)} MB`);
      const dims = width != null && height != null ? { width, height } : {};
      this.queueIdbUpdate(recordId, { status: "compressed", ...dims });
      const rec = this.records.get(recordId);
      if (rec) this.records.set(recordId, { ...rec, status: "compressed", ...dims });
      this.compressedBlobs.set(recordId, blob);
      this.compressedSizes.set(recordId, blob.size);
      if (thumbBlob) {
        this.thumbBlobs.set(recordId, thumbBlob);
        this.thumbSizes.set(recordId, thumbBlob.size);
      }
      // The 4096 archive: a real blob, uploaded by a single presigned PUT
      // alongside the delivery pair.
      if (archiveBlob) {
        this.archiveBlobs.set(recordId, archiveBlob);
        this.archiveSizes.set(recordId, archiveBlob.size);
      }
      // The "original" archive: the source File itself. Kept as a handle, never
      // read here — the multipart uploader slices it straight to the network.
      // Its size is known exactly and needs no measuring.
      if (this.variant === "original") {
        this.sourceFiles.set(recordId, input.file);
        this.archiveSizes.set(recordId, input.file.size);
      }
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

      const drained =
        (this.compressedQueue.length === 0 && this.compressionFinished) || this.stopping;
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
        !this.stopping &&
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
        // Only ask for a thumbnail PUT when we actually have bytes to put
        // there — a file whose thumbnail step failed signs one URL, not two.
        with_thumbnail: this.thumbBlobs.has(r.id),
        // Sent on every archive-tier run, including "original" (which gets no
        // archive URL back). It is what makes the plan gate fire HERE, at the
        // first batch, rather than at the first multipart create — a
        // sub-500 GB studio finds out before any bytes move.
        variant: this.variant,
      })),
    );

    // Backend returns uploads in the same order it received them — one entry
    // per file, both URLs on the same entry, so this index pairing holds.
    const idbPatches: Array<{ id: string; patch: Partial<UploadRecord> }> = [];
    for (let i = 0; i < recs.length; i++) {
      const rec = recs[i];
      const up = res.uploads[i];
      const blob = this.compressedBlobs.get(rec.id);
      if (!up || !blob) continue;
      const thumbBlob = this.thumbBlobs.get(rec.id);
      // Only claim a thumbnail once the backend actually signed one for it.
      const thumbnailUrl = thumbBlob && up.thumb_presigned_url ? up.thumb_public_url : undefined;
      const archiveBlob = this.archiveBlobs.get(rec.id);
      // Same discipline as the thumbnail: only claim an archive once the
      // backend actually signed a URL for it AND we hold bytes to send.
      const hasArchivePut = !!(archiveBlob && up.archive_presigned_url && up.archive_headers);
      const patch: Partial<UploadRecord> = {
        key: up.key,
        publicUrl: up.public_url,
        ...(thumbnailUrl ? { thumbnailUrl } : {}),
      };
      idbPatches.push({ id: rec.id, patch });
      this.records.set(rec.id, { ...rec, ...patch });
      this.presignedQueue.push({
        signedAt: Date.now(),
        recordId: rec.id,
        blob,
        presignedUrl: up.presigned_url,
        publicUrl: up.public_url,
        contentType: up.content_type,
        customFolderId: rec.customFolderId,
        ...(thumbnailUrl && thumbBlob
          ? { thumbBlob, thumbPresignedUrl: up.thumb_presigned_url, thumbPublicUrl: thumbnailUrl }
          : {}),
        ...(hasArchivePut
          ? {
              archiveBlob,
              archivePresignedUrl: up.archive_presigned_url,
              archivePublicUrl: up.archive_public_url,
              archiveHeaders: up.archive_headers,
            }
          : {}),
        // "original" carries no signed archive URL — the multipart endpoints
        // handle it per file, from the delivery key.
        deliveryKey: up.key,
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
      // Cancel's grace phase: dispatch nothing further, but stay here until the
      // records already uploading have finished all THREE of their objects.
      // Items still sitting in presignedQueue are dropped rather than started —
      // they have written nothing yet, so they cannot be inconsistent.
      if (this.stopping && this.runningUploaders === 0) {
        // Draining the queue here is NOT tidiness — it is what lets the run
        // actually end. runMetadataFlushLoop's exit condition includes
        // `presignedQueue.length === 0`, so leaving these parked keeps that loop
        // spinning after this one has returned: the in-flight photos finish,
        // the count on screen falls to zero, and cancel still hangs until its
        // grace window times out three minutes later. Their blobs go with them,
        // since nothing will upload them now.
        for (const queued of this.presignedQueue) {
          this.compressedBlobs.delete(queued.recordId);
          this.thumbBlobs.delete(queued.recordId);
          this.archiveBlobs.delete(queued.recordId);
        }
        this.presignedQueue = [];
        return;
      }

      // Start as many uploaders as AIMD allows right now. Paused runs hold
      // here — in-flight PUTs settle and persist, none are re-issued on resume.
      while (!this.paused && !this.stopping && this.aimd.canStart() && this.presignedQueue.length > 0) {
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

  /**
   * Re-sign one queued item whose URLs have aged, and point the record at the
   * new objects.
   *
   * Done BEFORE any of the record's PUTs run, which is what makes it safe: the
   * backend mints a fresh nonce on every presign, so the refreshed URLs address
   * a different key — and because nothing has been written for this record yet,
   * the old key is simply never used. Refreshing after a partial upload would
   * instead strand whatever had already landed at the previous key.
   *
   * Best-effort. If the presign call itself fails, the old URLs are kept and the
   * PUT is attempted anyway: it may still be inside its window, and a doomed
   * attempt is no worse than the certain failure of not trying.
   */
  private async refreshPresign(item: PresignedItem): Promise<void> {
    const rec = this.records.get(item.recordId);
    if (!rec) return;
    const staleForSec = Math.round((Date.now() - item.signedAt) / 1000);
    try {
      const res = await presignUploads(this.bookingId, [
        {
          filename: rec.filename,
          content_type: "image/jpeg",
          custom_folder_id: rec.customFolderId,
          with_thumbnail: !!item.thumbBlob,
          variant: this.variant,
        },
      ]);
      const up = res.uploads[0];
      if (!up) return;

      item.signedAt = Date.now();
      item.presignedUrl = up.presigned_url;
      item.publicUrl = up.public_url;
      item.contentType = up.content_type;
      item.deliveryKey = up.key;
      const thumbnailUrl =
        item.thumbBlob && up.thumb_presigned_url ? up.thumb_public_url : undefined;
      item.thumbPresignedUrl = up.thumb_presigned_url;
      item.thumbPublicUrl = thumbnailUrl;
      if (item.archiveBlob && up.archive_presigned_url && up.archive_headers) {
        item.archivePresignedUrl = up.archive_presigned_url;
        item.archivePublicUrl = up.archive_public_url;
        item.archiveHeaders = up.archive_headers;
      }

      const patch: Partial<UploadRecord> = {
        key: up.key,
        publicUrl: up.public_url,
        thumbnailUrl,
      };
      this.queueIdbUpdate(item.recordId, patch);
      this.records.set(item.recordId, { ...rec, ...patch });
      console.log("[upload:presign] re-signed a stale URL before upload", {
        file: rec.filename,
        staleForSec,
      });
    } catch (err) {
      console.warn(
        "[upload:presign] could not re-sign a stale URL; attempting the upload with the old one",
        { file: rec.filename, err },
      );
    }
  }

  private async uploadOne(item: PresignedItem): Promise<void> {
    // A backgrounded tab throttles these loops to a crawl, so an item can sit
    // here long enough for its 900 s signature to lapse. Re-sign before any
    // bytes move rather than discovering it as a 403 the retry policy treats as
    // terminal.
    if (Date.now() - item.signedAt > PRESIGN_TTL_MS - PRESIGN_REFRESH_MS) {
      await this.refreshPresign(item);
    }
    const fileLabel = this.records.get(item.recordId)?.filename ?? item.recordId;
    const putOpts = (label: string) => ({
      maxAttempts: MAX_ATTEMPTS,
      signal: this.abort.signal,
      classify: (err: unknown) =>
        err instanceof R2PutError ? classifyHttp(err.status) : classifyError(err),
      onAttemptError: (err: unknown, attempt: number, willRetry: boolean) => {
        console.warn(
          `[upload:put] ${label} failed (file=${fileLabel}, attempt ${attempt + 1}/${MAX_ATTEMPTS}, willRetry=${willRetry})`,
          err instanceof R2PutError ? { status: err.status, message: err.message } : err,
        );
      },
    });

    const hasThumb = !!(item.thumbBlob && item.thumbPresignedUrl);
    const hasArchivePut = !!(item.archiveBlob && item.archivePresignedUrl && item.archiveHeaders);
    const hasArchiveMultipart = this.variant === "original" && this.sourceFiles.has(item.recordId);

    // All of a record's objects go up in parallel — independent PUTs to
    // different keys (and, for the archive, a different provider), so
    // serialising them would just add each one's latency to the record's wall
    // time. Only the MAIN PUT decides the record's fate and drives AIMD; the
    // thumbnail and the archive are best-effort, exactly like the watermark.
    //
    // "The delivery pair is never skipped" is enforced right here: the view PUT
    // is unconditional in every variant, and an archive failure below cannot
    // stop the record reaching `uploaded`.
    const [mainResult, thumbResult, archiveResult] = await Promise.allSettled([
      withRetry(
        async () => {
          await putBlobToPresignedUrl(
            item.presignedUrl,
            item.blob,
            item.contentType,
            this.abort.signal,
          );
        },
        putOpts("main"),
      ),
      hasThumb
        ? withRetry(
            async () => {
              await putBlobToPresignedUrl(
                item.thumbPresignedUrl as string,
                item.thumbBlob as Blob,
                "image/jpeg",
                this.abort.signal,
              );
            },
            putOpts("thumbnail"),
          )
        : Promise.resolve(),
      hasArchivePut
        ? withRetry(
            async () => {
              await putArchiveBlob(
                item.archivePresignedUrl as string,
                item.archiveBlob as Blob,
                item.archiveHeaders as Record<string, string>,
                this.abort.signal,
              );
            },
            putOpts("archive"),
          )
        : hasArchiveMultipart
          ? this.uploadArchiveMultipartGuarded(item)
          : Promise.resolve(),
    ]);

    const freeBlobs = () => {
      this.compressedBlobs.delete(item.recordId);
      this.thumbBlobs.delete(item.recordId);
      // The archive BLOB is released here like the others; archiveSizes and
      // archiveChecksums deliberately are not — create-media reads them later.
      this.archiveBlobs.delete(item.recordId);
    };

    if (mainResult.status === "rejected") {
      const err = mainResult.reason;
      // A cancelled run aborts in-flight PUTs — that's not a real failure. Bail
      // quietly (no error log, no `failed` status); cancel wipes state anyway.
      // Release the AIMD slot so the reused engine's concurrency accounting
      // doesn't leak into the next run.
      if (this.abort.signal.aborted || isAbortError(err)) {
        this.aimd.noteAborted();
        freeBlobs();
        return;
      }
      // The signature lapsed while this PUT was in flight — a backgrounded tab
      // can stall a single request past its whole 900 s window. Re-sign and put
      // the WHOLE record back on the queue rather than failing the photo.
      //
      // The whole record, not just the failed PUT: a refresh mints a new nonce,
      // so the delivery copy and its thumbnail must be written together under
      // the new key. (A thumbnail that happened to land under the old key on
      // this attempt is left behind as a small orphan — the alternative is a
      // stored thumbnail_url pointing at an object the refresh moved away from,
      // which would show as broken tiles in the grid.)
      const requeues = item.expiryRequeues ?? 0;
      if (isExpiredPresignError(err) && requeues < 2 && !this.abort.signal.aborted) {
        console.warn("[upload:put] presigned URL expired mid-upload; re-signing and retrying", {
          file: fileLabel,
          attempt: requeues + 1,
        });
        item.expiryRequeues = requeues + 1;
        await this.refreshPresign(item);
        // Blobs are deliberately NOT freed — the requeued item re-uploads them.
        this.aimd.noteAborted(); // an expiry is not congestion; don't halve the limit
        this.presignedQueue.push(item);
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
      // If the archive completed while the delivery PUT was failing, we are
      // about to strand it: the record fails, create-media never runs, and a
      // full-size original sits on B2 that no Media document will ever point
      // at — invisible to every delete path, billed indefinitely. Retrying the
      // photo mints a NEW nonce, so it will not be reclaimed by a later run
      // either. Log the key loudly; it is the only trace that will exist.
      if (archiveResult.status === "fulfilled" && typeof archiveResult.value === "string") {
        console.error(
          "[upload:archive] ORPHANED — the archive object uploaded but its photo's delivery PUT failed, so nothing will reference it",
          { file: fileLabel, archiveUrl: archiveResult.value },
        );
      }
      this.aimd.noteFailure();
      freeBlobs();
      return;
    }

    // The main object is on R2, so the photo is delivered whatever happened to
    // its thumbnail. A thumbnail rejection is logged and otherwise ignored —
    // drop its URL and size so create-media omits thumbnail_url entirely and
    // every reader falls back to the delivery copy.
    let thumbUploaded = hasThumb;
    if (hasThumb && thumbResult.status === "rejected") {
      thumbUploaded = false;
      const err = thumbResult.reason;
      if (!(this.abort.signal.aborted || isAbortError(err))) {
        console.error("[upload:put] thumbnail failed; photo uploaded without one", {
          file: fileLabel,
          status: err instanceof R2PutError ? err.status : undefined,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      this.thumbSizes.delete(item.recordId);
      this.queueIdbUpdate(item.recordId, { thumbnailUrl: undefined });
      const rec = this.records.get(item.recordId);
      if (rec) this.records.set(item.recordId, { ...rec, thumbnailUrl: undefined });
    }

    // The archive object is the studio's own copy, so a failure here is exactly
    // as non-fatal as a failed watermark: log it, clear the record's archive
    // fields so create-media omits them entirely, and deliver the photo. A
    // half-recorded archive — a URL for an object that isn't there — would be
    // far worse than none, because nothing would ever re-check it.
    let archiveUrl: string | undefined;
    if (hasArchivePut || hasArchiveMultipart) {
      if (archiveResult.status === "fulfilled") {
        // The single PUT resolves to nothing and its URL is already known; the
        // multipart path resolves to the URL the backend returned on complete.
        archiveUrl =
          (typeof archiveResult.value === "string" ? archiveResult.value : undefined) ??
          item.archivePublicUrl;
      }
      if (!archiveUrl) {
        const err = archiveResult.status === "rejected" ? archiveResult.reason : undefined;
        const aborted = this.abort.signal.aborted || isAbortError(err);
        this.archiveSizes.delete(item.recordId);
        this.archiveChecksums.delete(item.recordId);
        const cleared = {
          archiveUrl: undefined,
          archiveVariant: undefined,
          archiveSize: undefined,
          archiveChecksum: undefined,
        };
        this.queueIdbUpdate(item.recordId, cleared);
        const r0 = this.records.get(item.recordId);
        if (r0) this.records.set(item.recordId, { ...r0, ...cleared });

        // FAIL THE RECORD. On an archive-tier run the archive is the point of
        // the run: recording this photo now would put it in the gallery labelled
        // Original with no original behind it, and nothing downstream would ever
        // notice — not the grid, not the delete path, not the storage meter.
        //
        // Failing instead means create-media never sees it, so it is retried the
        // next time the folder is selected. The delivery pair it already wrote
        // to R2 is orphaned by that choice; reclaim-orphaned-media.js is what
        // collects it, and a little wasted storage is a far cheaper mistake than
        // a studio believing they have originals they do not have.
        //
        // A cancel is NOT a failure of this kind — cancel wipes every record
        // anyway, so marking it failed would only add noise to the log.
        if (!aborted) {
          const msg = err instanceof Error ? err.message : "archive upload failed";
          console.error(
            "[upload:archive] failed; the photo is NOT being delivered, because an archive-tier photo without its archive is worse than a missing photo",
            {
              file: fileLabel,
              variant: this.variant,
              status: err instanceof R2PutError ? err.status : undefined,
              error: msg,
            },
          );
          this.queueIdbUpdate(item.recordId, {
            status: "failed",
            lastError: `archive: ${msg}`,
            attempts: MAX_ATTEMPTS,
          });
          const r = this.records.get(item.recordId);
          if (r) {
            this.records.set(item.recordId, {
              ...r,
              status: "failed",
              lastError: `archive: ${msg}`,
              attempts: MAX_ATTEMPTS,
            });
          }
          this.aimd.noteFailure();
        } else {
          this.aimd.noteAborted();
        }
        freeBlobs();
        return;
      }

      {
        // Persist the WHOLE archive fact on the record, not just the URL.
        // create-media may be flushed on a LATER MOUNT (resumePendingMetadata
        // runs on mount for uploaded-but-unsaved rows), by which point this
        // engine has no run: `this.variant` has reset to "2560" and the
        // archiveSizes/archiveChecksums maps are empty. Reading any of those at
        // flush time silently dropped every archive that had already landed —
        // the object was on B2, paid for, and no Media document ever pointed at
        // it. The record is the only thing that survives that boundary.
        const landed = {
          archiveUrl,
          archiveVariant: this.variant as "4096" | "original",
          archiveSize: this.archiveSizes.get(item.recordId),
          archiveChecksum: this.archiveChecksums.get(item.recordId),
        };
        this.queueIdbUpdate(item.recordId, landed);
        const r = this.records.get(item.recordId);
        if (r) this.records.set(item.recordId, { ...r, ...landed });
      }
    }

    // Count the thumbnail's and the archive's bytes too, so the speed and ETA
    // labels stay honest — on an originals run the archive IS the upload, and
    // an ETA computed from the 800 KB delivery copy alone would be off by ~30x.
    this.bytesUploaded +=
      item.blob.size +
      (thumbUploaded ? (item.thumbBlob as Blob).size : 0) +
      (archiveUrl
        ? (this.archiveSizes.get(item.recordId) ??
           this.records.get(item.recordId)?.archiveSize ??
           0)
        : 0);
    this.aimd.noteSuccess();
    freeBlobs();
    this.queueIdbUpdate(item.recordId, { status: "uploaded" });
    const rec = this.records.get(item.recordId);
    if (rec) this.records.set(item.recordId, { ...rec, status: "uploaded" });
    this.metadataPendingIds.push(item.recordId);
    this.scheduleMetadataFlushIfReady();
    // Bytes just moved, so the storage projection did too. Pure arithmetic —
    // no request, nothing that can slow the upload loop down.
    this.maybePauseForStorage();
    for (const fn of this.urlListeners) fn(item.publicUrl, item.customFolderId);
  }

  /* ── archive multipart upload (the "original" variant) ──────── */

  /**
   * Upload one original to B2 as a resumable multipart upload, and return the
   * archive URL the backend hands back on completion.
   *
   * THE SOURCE FILE IS NEVER BUFFERED. `file.slice(from, to)` returns a lazy
   * Blob over bytes still on disk and `fetch` streams it from there, so a 75 MB
   * original costs ~0 heap. Nothing in this method may call .arrayBuffer(),
   * .blob() or .text() on the file or any slice of it — that single mistake
   * would turn a 7,000-photo originals run into an out-of-memory crash, and it
   * would look fine on a ten-file test.
   *
   * Resume is the reason this is worth the complexity: each part's number and
   * ETag is persisted to IndexedDB as it lands, so a run interrupted 60 MB into
   * a 75 MB file picks up at the next missing part rather than starting that
   * file again.
   */
  /**
   * uploadArchiveMultipart, plus the cleanup its failure path owes B2.
   *
   * A multipart upload that fails terminally has already put parts on B2, and
   * B2 bills those parts as stored bytes indefinitely whether or not the upload
   * is ever completed. cancel() aborts the uploads it knows about, but a file
   * that simply ran out of retries never reaches cancel — without this it would
   * leave paid-for parts behind on an otherwise entirely successful run, which
   * is the version of this bug nobody would ever notice.
   */
  private async uploadArchiveMultipartGuarded(item: PresignedItem): Promise<string | undefined> {
    try {
      return await this.uploadArchiveMultipart(item);
    } catch (err) {
      const open = this.activeMultiparts.get(item.recordId);
      // Not on a cancel — cancel() aborts every open upload itself, and racing
      // it here would just produce a second NoSuchUpload.
      if (open && !this.abort.signal.aborted && !isAbortError(err)) {
        this.activeMultiparts.delete(item.recordId);
        try {
          await abortArchiveMultipart(this.bookingId, {
            key: open.key,
            upload_id: open.uploadId,
          });
        } catch (abortErr) {
          console.error("[upload:archive] abort after failure did not succeed — the bucket lifecycle rule will expire it in 3 days", {
            key: open.key,
            error: abortErr instanceof Error ? abortErr.message : abortErr,
          });
        }
      }
      throw err;
    }
  }

  private async uploadArchiveMultipart(item: PresignedItem): Promise<string | undefined> {
    const recordId = item.recordId;
    const file = this.sourceFiles.get(recordId);
    if (!file) return undefined;
    const rec = this.records.get(recordId);
    const fileLabel = rec?.filename ?? recordId;

    // ── 1. Create, or pick up an upload this record already started ────────
    let key = rec?.uploadId ? rec.archiveKey : undefined;
    let uploadId = rec?.uploadId;
    let partSize = rec?.partSize;
    // Parts already on B2 from an earlier, interrupted attempt at this file.
    const done = new Map<number, string>(
      (rec?.completedParts ?? []).map((p) => [p.n, p.etag]),
    );

    if (!uploadId || !key || !partSize) {
      // Retried like every other backend call on this path: a blip on a small
      // JSON request must not cost the file its archive copy.
      const created = await withRetry(
        () =>
          createArchiveMultipart(this.bookingId, {
            key: item.deliveryKey,
            filename: rec?.filename ?? file.name,
            size: file.size,
            ...(file.type ? { content_type: file.type } : {}),
          }),
        { maxAttempts: MAX_ATTEMPTS, signal: this.abort.signal, classify: classifyError },
      );
      key = created.key;
      uploadId = created.upload_id;
      partSize = created.part_size;
      done.clear(); // a fresh upload id shares nothing with a previous attempt
      this.queueIdbUpdate(recordId, {
        uploadId,
        partSize,
        archiveKey: key,
        completedParts: [],
      });
      const r0 = this.records.get(recordId);
      if (r0) {
        this.records.set(recordId, {
          ...r0,
          uploadId,
          partSize,
          archiveKey: key,
          completedParts: [],
        });
      }
      // Flush immediately: between here and the first part landing, a crash
      // would otherwise leave an upload id only B2 knows about — unresumable
      // AND un-abortable, i.e. billed forever.
      await this.flushIdb();
    }
    this.activeMultiparts.set(recordId, { key, uploadId });

    const { partCount, pending } = planArchivePartQueue({
      fileSize: file.size,
      partSize,
      completedParts: [...done.keys()],
    });

    // ── 2. Checksum, streamed. Runs alongside the parts, not before them. ──
    const checksumPromise = computeArchiveChecksum(file).catch((err) => {
      console.warn("[upload:archive] checksum failed; storing none", { file: fileLabel, err });
      return undefined;
    });

    // ── 3. Signed-URL window. A run lasts hours and a signature lasts 900 s,
    //      so URLs are minted just ahead of the upload frontier and re-minted
    //      for any part still queued when its own is close to expiring. ──────
    const signed = new Map<number, { url: string; at: number }>();
    let signing: Promise<void> | null = null;
    const ensureSigned = async (from: number): Promise<void> => {
      // Wait behind a signing request already in flight, so the common case is
      // one call per window rather than one per worker. Two workers can still
      // race past this and both sign — harmless, since re-signing a part is
      // idempotent and the map takes the fresher URL.
      while (signing) await signing;
      const fresh = (n: number) => {
        const e = signed.get(n);
        return e && Date.now() - e.at < ARCHIVE_URL_TTL_MS - ARCHIVE_URL_REFRESH_MS;
      };
      if (fresh(from)) return;
      const want: number[] = [];
      for (let n = from; n < from + ARCHIVE_SIGN_WINDOW && n <= partCount; n++) {
        if (!done.has(n) && !fresh(n)) want.push(n);
      }
      if (want.length === 0) return;
      signing = (async () => {
        const res = await signArchiveParts(this.bookingId, {
          key: key as string,
          upload_id: uploadId as string,
          part_numbers: want,
        });
        const at = Date.now();
        for (const p of res.parts) signed.set(p.part_number, { url: p.url, at });
      })();
      try {
        await signing;
      } finally {
        signing = null;
      }
    };

    // ── 4. Upload the missing parts, several in flight. ────────────────────
    let cursor = 0;
    const uploadPart = async (n: number): Promise<void> => {
      await ensureSigned(n);
      const entry = signed.get(n);
      if (!entry) throw new Error(`no signed URL for part ${n}`);
      const from = (n - 1) * (partSize as number);
      // Lazy view over bytes on disk — NOT a copy. See this method's docstring.
      const slice = file.slice(from, Math.min(from + (partSize as number), file.size));
      const etag = await putArchivePart(entry.url, slice, this.abort.signal);
      done.set(n, etag);
      // Persist as each part lands — this is what makes resume mid-file work.
      const parts = [...done.entries()]
        .map(([num, tag]) => ({ n: num, etag: tag }))
        .sort((a, b) => a.n - b.n);
      this.queueIdbUpdate(recordId, { completedParts: parts });
      const r = this.records.get(recordId);
      if (r) this.records.set(recordId, { ...r, completedParts: parts });
    };

    // Deliberately does NOT check `this.paused`: a paused run lets in-flight
    // work settle, and for an original that means finishing the file it is on.
    // Stopping mid-file would mean skipping `complete`, leaving an open
    // multipart upload accruing storage cost for as long as the pause lasts.
    // The parts are persisted as they land either way, so nothing is lost.
    const worker = async (): Promise<void> => {
      while (true) {
        if (this.abort.signal.aborted) return;
        const n = pending[cursor++];
        if (n === undefined) return;
        await withRetry(() => uploadPart(n), {
          maxAttempts: MAX_ATTEMPTS,
          signal: this.abort.signal,
          classify: (err: unknown) =>
            err instanceof R2PutError ? classifyHttp(err.status) : classifyError(err),
          onAttemptError: (err, attempt, willRetry) => {
            // A dropped connection partway through a multi-hour run is
            // expected, not exceptional. Retrying ONE 8 MiB part rather than a
            // whole 75 MB file is the entire point of multipart here.
            console.warn(
              `[upload:archive] part ${n} failed (file=${fileLabel}, attempt ${attempt + 1}/${MAX_ATTEMPTS}, willRetry=${willRetry})`,
              err instanceof R2PutError ? { status: err.status } : err,
            );
          },
        });
      }
    };

    if (done.size > 0) {
      console.log(
        `[upload:archive] resuming ${fileLabel} at part ${pending[0]}/${partCount} — ${done.size} part(s) already on B2, ${pending.length} to go`,
      );
    }
    await Promise.all(
      Array.from({ length: Math.min(ARCHIVE_PART_CONCURRENCY, pending.length) }, worker),
    );
    if (this.abort.signal.aborted) return undefined;

    // ── 5. Complete. The backend HeadObjects the assembled object and refuses
    //      the completion if its ContentLength doesn't match, so a truncated
    //      upload fails here instead of being recorded as a good archive. ────
    const parts = [...done.entries()]
      .map(([n, etag]) => ({ PartNumber: n, ETag: etag }))
      .sort((a, b) => a.PartNumber - b.PartNumber);
    const res = await withRetry(
      () =>
        completeArchiveMultipart(this.bookingId, {
          key: key as string,
          upload_id: uploadId as string,
          size: file.size,
          parts,
        }),
      { maxAttempts: MAX_ATTEMPTS, signal: this.abort.signal, classify: classifyError },
    );
    // Completed — there is nothing left for cancel() to abort, and nothing left
    // to resume. Clearing the bookkeeping matters: if the tab dies between here
    // and the record reaching `uploaded`, a resumed run would otherwise find a
    // full parts list against a finished upload id and try to complete it a
    // second time, which B2 answers with NoSuchUpload. Cleared, the resumed run
    // simply re-uploads the archive, which succeeds.
    this.activeMultiparts.delete(recordId);
    this.queueIdbUpdate(recordId, {
      uploadId: undefined,
      completedParts: undefined,
      archiveKey: undefined,
    });
    const rDone = this.records.get(recordId);
    if (rDone) {
      this.records.set(recordId, {
        ...rDone,
        uploadId: undefined,
        completedParts: undefined,
        archiveKey: undefined,
      });
    }

    const checksum = await checksumPromise;
    if (checksum) {
      this.archiveChecksums.set(recordId, checksum);
      this.queueIdbUpdate(recordId, { archiveChecksum: checksum });
    }
    return res.archive_public_url;
  }

  /* ── live storage metering ──────────────────────────────────── */

  /**
   * GB left on the plan right now: the server's last figure, minus the bytes
   * uploaded since it was taken. Null when there's no figure yet (count-based
   * plan, or before the first create-media chunk returns).
   *
   * Pure arithmetic over numbers already in hand — no request, no I/O, nothing
   * on the upload path.
   */
  private projectedStorageRemainingGB(): number | null {
    if (this.storageRemainingGB === null) return null;
    const unsavedBytes = Math.max(0, this.bytesUploaded - this.storageMarkBytes);
    return this.storageRemainingGB - unsavedBytes / BYTES_PER_GB;
  }

  /**
   * Pause the run if the plan has filled up. Called after every successful
   * upload (projection moves) and after every create-media response (the
   * figure is re-baselined), so the stop lands within one photo of the plan
   * actually running out.
   *
   * Photos already uploaded stay saved: `pause()` drains pending metadata, so
   * nothing that reached R2 is stranded unrecorded.
   */
  private maybePauseForStorage(): void {
    const projected = this.projectedStorageRemainingGB();
    if (projected === null) return;
    this.scheduleEmit({ storageRemainingGB: projected });
    if (projected > 0) return;
    if (this.state.storageFullWarning) return; // already paused for this reason
    const remainingPhotos = Math.max(
      0,
      this.state.photosTotal - this.state.photosDone - this.state.photosFailed,
    );
    this.scheduleEmit(
      {
        storageFullWarning:
          `Your storage plan is full — the upload paused with ${remainingPhotos.toLocaleString("en-IN")} photo` +
          `${remainingPhotos === 1 ? "" : "s"} left. Free up space or upgrade your plan, then Resume.`,
      },
      true,
    );
    this.pause();
  }

  /* ── incremental metadata save ──────────────────────────────── */

  /**
   * Background loop: flush create-media chunks while uploads are in flight.
   * Partial remainders (smaller than a full batch) are flushed by `drainAllMetadata`
   * when the pipeline finishes or is interrupted — or, while paused, by the
   * pause-drain branch below.
   */
  private async runMetadataFlushLoop(): Promise<void> {
    let lastFlushAt = Date.now();
    while (true) {
      this.seedMetadataQueue();

      const policy = this.metadataFlushPolicy();

      if (this.metadataPendingIds.length >= policy.size) {
        await this.enqueueMetadataFlush();
        lastFlushAt = Date.now();
        if (this.state.metadataSaveError) return;
        continue;
      }

      // Age-based flush: the backstop that bounds how long an object can sit on
      // R2/B2 with no Media document naming it. Tier-aware, so a slow run gets
      // long enough to actually gather a batch (see METADATA_FLUSH_POLICY)
      // rather than firing on every photo.
      if (
        this.metadataPendingIds.length > 0 &&
        Date.now() - lastFlushAt >= policy.maxAgeMs &&
        !this.abort.signal.aborted
      ) {
        await this.enqueueMetadataFlush();
        lastFlushAt = Date.now();
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
        lastFlushAt = Date.now();
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

  /** Batch size + max age for the run's tier. */
  private metadataFlushPolicy(): { size: number; maxAgeMs: number } {
    return METADATA_FLUSH_POLICY[this.variant] ?? METADATA_FLUSH_POLICY["2560"];
  }

  /**
   * Should this chunk ask the backend to hold its rows back from booting a GPU
   * pump? Counted off the RECORDS rather than a counter, so it survives a
   * resume: re-selecting the same folder re-derives the same fraction from what
   * is already saved, instead of restarting from zero and deferring a run that
   * is actually nearly done.
   */
  private deferEmbeddingForThisChunk(): boolean {
    const all = Array.from(this.records.values());
    return shouldDeferEmbedding({
      threshold: EMBED_DEFER_THRESHOLD[this.variant] ?? 0,
      resolved: all.filter(
        (r) => r.status === "uploaded" || r.status === "saved" || r.status === "failed",
      ).length,
      total: all.length,
      final: this.finalMetadataDrain,
    });
  }

  private scheduleMetadataFlushIfReady(): void {
    if (this.metadataPendingIds.length < this.metadataFlushPolicy().size) return;
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
      ...((): { size?: number } => {
        const size = this.compressedSizes.get(r.id);
        return size != null ? { size } : {};
      })(),
      // The 480px grid derivative. Omitted wholesale when its PUT failed —
      // uploadOne clears the record's thumbnailUrl and its size in that case,
      // so the backend records no thumbnail and readers fall back to `url`.
      ...(r.thumbnailUrl ? { thumbnail_url: r.thumbnailUrl } : {}),
      ...((): { thumbnail_size?: number } => {
        const s = this.thumbSizes.get(r.id);
        return r.thumbnailUrl && s != null ? { thumbnail_size: s } : {};
      })(),
      // The archive copy. Omitted WHOLESALE unless its upload succeeded —
      // uploadOne clears archiveUrl and the size/checksum on failure, so the
      // backend records no archive rather than a URL for an object that isn't
      // there. `archive_variant` rides with the URL because the two are only
      // ever meaningful together.
      // Every field read off the RECORD, never off `this` — a flush can happen
      // on a mount with no active run (see the persistence note in uploadOne).
      ...archiveMetadataFor({
        variant: r.archiveVariant,
        archiveUrl: r.archiveUrl,
        archiveSize: r.archiveSize,
        archiveChecksum: r.archiveChecksum,
      }),
    }));

    // Decided once for this chunk, outside withRetry: a retry must not flip the
    // answer halfway through and release a deferral the first attempt asked for.
    const deferEmbedding = this.deferEmbeddingForThisChunk();

    let storage: StorageMeter | undefined;
    try {
      // Metadata saves are never tied to the upload abort signal — cancelling
      // or interrupting must still persist bytes already on R2.
      await withRetry(
        async () => {
          const res = await createMediaBatch(
            this.bookingId,
            payload,
            this.outOfSync
              ? { media_out_of_sync: true, unsynced_media_count: payload.length }
              : undefined,
            // Re-evaluated per chunk, not captured once: the chunk that crosses
            // the threshold is the one that stops asking, and that is what
            // releases every row held back earlier in the run.
            deferEmbedding,
          );
          // Live storage figure, computed by the backend from the very byte
          // counts this payload carries. It rides along on a response the
          // engine already awaits, so it costs no extra round-trip. Absent for
          // count-based plans and when the backend's meter update failed —
          // treated as "no new information", never as zero.
          storage = res?.storage;
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
        // The row is in the gallery; nothing will read this file again. Handles
        // are cheap, but a run is not a reason to hold every one of 7,000 of
        // them for its whole duration.
        this.sourceFiles.delete(r.id);
        // Its multipart upload completed long before create-media ran, so
        // there is nothing left for a later cancel to abort.
        this.activeMultiparts.delete(r.id);
      }
      // Track what the backend has now counted, so the projection can subtract
      // exactly the uploaded-but-unrecorded bytes and nothing else.
      for (const r of recs) {
        this.savedBytes += (this.compressedSizes.get(r.id) ?? 0) + (this.thumbSizes.get(r.id) ?? 0);
      }
      if (storage?.remaining != null) {
        this.storageRemainingGB = storage.remaining;
        this.storageMarkBytes = this.savedBytes;
      }
      this.scheduleEmit({ isSavingMetadata: false, metadataSaveError: null });
      this.maybePauseForStorage();
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
   * (a partial final batch). Serialized via `metadataSaveChain`.
   */
  private async drainAllMetadata(): Promise<void> {
    this.finalMetadataDrain = true;
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
   * stores, so an input the backend already has is recorded as `saved` —
   * counted as done in the progress bar and skipped by the pipeline, never
   * re-compressed or re-uploaded.
   *
   * `resolveDedup` decides "already has it" two ways: the byte-for-byte
   * fingerprint match (`alreadyUploaded` hit), and a conservative
   * filename+filesize fallback for the case that defeats it — the same photos
   * re-copied or cloud-synced into a new folder, which resets
   * `File.lastModified` and re-uploads an entire event. The fallback is
   * recorded as `dedupeMatch: "fuzzy"` rather than folded into the same
   * silence as an exact hit: it surfaces as a count on the progress card and a
   * distinct `[upload:dedup]` warning, because nothing else in this flow would
   * ever tell a studio a photo was skipped.
   */
  private async upsertPendingRecords(
    inputs: UploadInput[],
    alreadyUploaded: Set<string>,
  ): Promise<void> {
    const decisions = resolveDedup(
      this.bookingId,
      inputs.map((inp) => inp.file),
      alreadyUploaded,
    );
    const toWrite: UploadRecord[] = [];
    const fuzzySkipped: string[] = [];
    const ambiguous: string[] = [];
    for (let i = 0; i < inputs.length; i++) {
      const inp = inputs[i];
      const { id, fingerprint, match } = decisions[i];
      const existing = this.records.get(id);
      // Already done locally (resume): leave the record — and any `dedupeMatch`
      // an earlier selection wrote — exactly as it stands.
      if (existing && (existing.status === "uploaded" || existing.status === "saved")) continue;
      if (decisions[i].ambiguous) ambiguous.push(inp.file.name);
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
        status: match ? "saved" : "pending",
        // Always written, never inherited: a record re-queued for upload must
        // not keep a `dedupeMatch` left over from an earlier selection.
        dedupeMatch: match ?? undefined,
        attempts: 0,
        lastError: undefined,
        updatedAt: Date.now(),
      };
      if (match === "fuzzy") fuzzySkipped.push(inp.file.name);
      toWrite.push(next);
      this.records.set(id, next);
    }
    await putRecords(toWrite);

    // Distinct from the exact-match path, which stays silent by design. These
    // two lines are the audit trail for a skip decision nobody confirmed.
    if (fuzzySkipped.length > 0) {
      console.warn(
        `[upload:dedup] skipped ${fuzzySkipped.length} file(s) as probable duplicates — same filename and size as a photo already in this gallery, but a different file timestamp`,
        logSample(fuzzySkipped),
      );
    }
    if (ambiguous.length > 0) {
      console.warn(
        `[upload:dedup] ${ambiguous.length} file(s) looked like duplicates but the match was ambiguous — uploading them rather than risk dropping a photo`,
        logSample(ambiguous),
      );
    }
  }

  /**
   * Fetch the set of media_ids already saved for this booking — the input to
   * both dedup paths in `upsertPendingRecords` (the fuzzy one decodes
   * filename/filesize back out of these ids client-side, so no extra call).
   * Best-effort: a failure just disables backend-side skipping for this run
   * (files re-upload rather than blocking the whole upload on a transient
   * error).
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
    // Counted off the records (not off this run's decisions) so the number
    // survives a resume: re-selecting the same folder re-shows the same skips.
    const probableDuplicatesSkipped = all.filter((r) => r.dedupeMatch === "fuzzy").length;
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
      probableDuplicatesSkipped,
      speedLabel,
      etaLabel,
      folders,
      metadataSaveError: this.state.metadataSaveError,
      watermarkWarning: this.state.watermarkWarning,
      storageFullWarning: this.state.storageFullWarning,
      storageRemainingGB: this.state.storageRemainingGB,
      isUploading: this.state.isUploading,
      needsMetadataSave,
      isSavingMetadata: this.state.isSavingMetadata,
      paused: this.paused,
      finishingInFlight: this.stopping ? this.runningUploaders : 0,
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
  /** When these URLs were signed, for the staleness check in uploadOne. */
  signedAt: number;
  /** How many times this item has been re-signed and requeued after its URLs
   *  lapsed mid-upload. Bounded so a persistently-throttled tab cannot spin. */
  expiryRequeues?: number;
  recordId: string;
  blob: Blob;
  presignedUrl: string;
  publicUrl: string;
  contentType: string;
  customFolderId: string;
  /** The 480px gallery-grid derivative and its own signed PUT. All three are
   *  present together or not at all — absent for a file whose thumbnail step
   *  failed, or one the backend didn't sign a second URL for. */
  thumbBlob?: Blob;
  thumbPresignedUrl?: string;
  thumbPublicUrl?: string;
  /** The 4096 archive copy and its single signed PUT to B2. All four are
   *  present together or not at all. `archiveHeaders` must be echoed verbatim
   *  — the backend signed a Content-Disposition this client cannot rebuild. */
  archiveBlob?: Blob;
  archivePresignedUrl?: string;
  archivePublicUrl?: string;
  archiveHeaders?: Record<string, string>;
  /** The delivery object's key. An "original" run derives its archive key from
   *  this server-side, so the pair provably shares a nonce. */
  deliveryKey: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Filenames for a console warning, capped so a 7k-photo event stays readable. */
function logSample(names: string[], limit = 25): { files: string[]; andMore: number } {
  return { files: names.slice(0, limit), andMore: Math.max(0, names.length - limit) };
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
    probableDuplicatesSkipped: 0,
    speedLabel: "",
    etaLabel: "",
    folders: [],
    metadataSaveError: null,
    watermarkWarning: null,
    storageFullWarning: null,
    storageRemainingGB: null,
    isUploading: false,
    needsMetadataSave: false,
    isSavingMetadata: false,
    paused: false,
    finishingInFlight: 0,
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
