/**
 * The upload spec: every number and rule the upload engine runs on, in one
 * place, so the web uploader and the Vyavasth Studio app's engine cannot drift.
 *
 * The web engine (engine.ts, compressor.ts, watermark.ts, retry.ts,
 * concurrency.ts, archive.ts) reads these instead of declaring its own
 * constants. The studio app generates its Kotlin constants and golden test
 * vectors from this file (`npm run spec:sync` in vyavasth-dashboard-app), and
 * its `spec:check` fails when they disagree. So:
 *
 *  - change a value here and BOTH uploaders change with it;
 *  - bump UPLOAD_SPEC_VERSION whenever a value or a rule changes, so the app can
 *    tell which spec a build was made from;
 *  - keep this module pure: no imports, no browser globals, no `process.env`.
 *    Env overrides (NEXT_PUBLIC_EMBED_DEFER_PCT_*) stay in engine.ts; this file
 *    holds their defaults.
 *
 * The comments are why each number exists. Move them with the number.
 */

export const UPLOAD_SPEC_VERSION = 1;

export const UPLOAD_SPEC = {
  image: {
    /** Long edge of the delivery view (the photo guests see). Downscale only
     *  when the source is larger, so 24 MP camera shots are scaled and
     *  already-web-sized images keep their size. */
    viewMaxDim: 2560,
    /** JPEG quality of the delivery view, and of the 4K archive. Visually
     *  identical to the source for typical wedding photos. No size cap: visible
     *  quality wins over a size target. */
    viewQuality: 0.8,
    /** Long edge of the 4K archive copy. Lossy, and deliberately never called
     *  an "archive of the original" anywhere a studio can read it: a 4096px
     *  JPEG is not an original file. */
    archiveMaxDim: 4096,
    archiveQuality: 0.8,
    /** Long edge of the gallery-grid derivative. The grid never renders larger
     *  than this, so the 2560px delivery copy is reserved for the lightbox,
     *  downloads and the ZIP. Must stay in sync with the backend's
     *  backfill-media-thumbnails.js, which generates the same derivative for
     *  media that predates this. */
    thumbMaxDim: 480,
    thumbQuality: 0.72,
    /** JPEG quality for the watermarked re-encode. The image was already
     *  downscaled and encoded by the compressor at 0.80; it is re-encoded a
     *  touch higher so the second pass doesn't compound visible artifacts while
     *  keeping size reasonable. */
    watermarkReencodeQuality: 0.85,
    /**
     * Watermark edge inset, as a fraction of the photo's SHORTER edge.
     *
     * Resolved to pixels once per photo and then applied as that same pixel
     * amount on both axes, which is what keeps the gap even in every corner —
     * the reason this isn't a straight percentage per axis (0.5% of width ≠
     * 0.5% of height, so corners came out lopsided). Taking it off the shorter
     * edge is what a fixed pixel constant got wrong in the other direction: 7px
     * against a 2560px export is a quarter of one percent, indistinguishable
     * from flush against the border.
     *
     * The editor preview derives its own insets from this exact constant
     * (WatermarkEditorModal.tsx imports it via watermark.ts), so what the studio
     * positions is what gets baked in.
     */
    watermarkEdgeMarginRatio: 0.025,
    /** EXIF/APP1 sits at the very front of a JPEG; read only this much of the
     *  source to extract it rather than base64-ing the whole (often 15–20 MB)
     *  file per photo on the main thread. 256 KB comfortably covers APP0 + a
     *  max-size (64 KB) APP1 (+ any XMP) with margin. */
    exifHeadBytes: 262144,
    /** Every object the uploader writes is a JPEG, whatever the source was. */
    outputType: "image/jpeg",
    /**
     * browser-image-compression 2.0.2's size guard (`compress` in
     * lib/image-compression.js): when the encoded JPEG is LARGER than the source
     * file, the library multiplies the quality by this factor and re-encodes
     * the same pixels, at most `sizeGuardMaxIterations` times, until it is no
     * larger. Dimensions never change because `maxSizeMB` is unset.
     *
     * These are the library's own defaults. The web passes them to nothing; they
     * are written down here so the studio app's engine reproduces the library.
     * `sizeGuardQualities` in geometry.ts gives the exact float sequence.
     */
    sizeGuardQualityFactor: 0.95,
    sizeGuardMaxIterations: 10,
    /**
     * How each output's pixel dimensions are rounded.
     *  - "library-trunc": browser-image-compression's `handleMaxWidthOrHeight`
     *    (only when an edge exceeds the max; `(h / w) * max` in doubles, then the
     *    canvas size setter truncates). See `viewDims` in geometry.ts.
     *  - "round-min-1": `Math.max(1, Math.round(dim * min(1, max / longEdge)))`,
     *    what `downscaleToView` and `drawThumbnail` in compressor.ts compute.
     */
    rounding: {
      view: "library-trunc",
      archive: "library-trunc",
      viewFromArchive: "round-min-1",
      thumb: "round-min-1",
    },
  },

  presign: {
    /** How many compressed items to gather before asking the backend for a
     *  batch of presigned URLs. Bigger batch = fewer backend round-trips. */
    batchSize: 50,
    /** Concurrent presign HTTP requests (each batch is independent). */
    concurrency: 3,
    /** The backend's own cap on files per presign request. */
    serverMaxPerRequest: 100,
    /**
     * Server-side presign lifetime for the delivery pair (900 s), and the
     * margin below it at which a queued item is re-signed before its PUT.
     *
     * The batcher signs "just behind upload", which holds while a tab is in the
     * foreground. It does NOT hold when the tab is backgrounded: browsers
     * throttle background timers to roughly one tick a minute, the dispatch
     * loops crawl, and items already sitting in `presignedQueue` age past
     * 900 s. Every one of them then answers 403 `ExpiredRequest`, which
     * `classifyHttp` calls terminal — so before this existed, a run left in a
     * background tab failed every queued photo and could not recover, which is
     * exactly what "nothing has moved for a while" was reporting.
     */
    ttlMs: 900000,
    refreshMarginMs: 240000,
    /** How many times one record may be re-signed and requeued after its PUT
     *  answered 403 `ExpiredRequest`. */
    maxExpiryRequeues: 2,
  },

  pipeline: {
    /**
     * End-to-end backpressure cap. `compressedBlobs` holds every compressed
     * blob not yet uploaded (queued to presign, presigned, or in-flight);
     * gating new compressions on this (plus the ones currently compressing)
     * bounds peak memory to roughly this many blobs and — critically — keeps
     * presigned URLs from being minted far ahead of upload (they expire in
     * 15 min). Compression is throttled to roughly the upload rate, which is
     * what makes 7k-image events safe.
     */
    maxOutstandingBlobs: 128,
    /** Poll interval while the compressor is held back by the cap above. */
    backpressurePollMs: 60,
    /** The presign batcher's idle waits: while it waits for more compressed
     *  items (`presignIdlePollMs`), and the cap on how long it waits for an
     *  in-flight batch before re-checking (`presignRacePollMs`). Scheduling
     *  only; they change no request. */
    presignIdlePollMs: 60,
    presignRacePollMs: 50,
    /** How often the create-media flush loop re-checks its batch size/age. */
    metadataFlushPollMs: 250,
    /** Coalesce per-file IDB writes during the hot path. */
    idbFlushMs: 500,
    /** Throttle progress UI updates (in-memory state stays live). */
    progressEmitMs: 200,
    /** How often the dispatch loops re-check the pause flag. */
    pausePollMs: 120,
    /**
     * How long cancel() lets in-flight records finish before it stops waiting
     * and aborts them.
     *
     * Long enough for an archive object on a slow link (a 16 MB original is
     * two 8 MiB parts, tens of seconds each), short enough that Stop still
     * feels like a button. It used to be far longer, on the reasoning that
     * timing out would reintroduce the very inconsistency the grace phase
     * prevents — that is no longer true: a record whose archive does not
     * complete is now marked `failed` rather than delivered (see uploadOne), so
     * an expired grace period costs the photo, not the gallery's integrity.
     */
    cancelGraceMs: 180000,
  },

  /**
   * AIMD (Additive Increase / Multiplicative Decrease) upload concurrency —
   * tuned for "talking to R2 from a residential connection":
   *   start = 2 (don't blast on the first packet)
   *   max   = 8 (R2 serves PUTs cheaply but the network is usually the bottleneck)
   *   min   = 1
   *   stepUpAfter = 8 consecutive successes → +1 to limit
   *   stepDown    = floor(limit / 2) on error/timeout, never below min
   */
  aimd: {
    start: 2,
    max: 8,
    min: 1,
    stepUpAfter: 8,
  },

  /**
   * Retry policy for individual file uploads and the final metadata save.
   *
   * Backoff: baseDelayMs * 2^attempt, capped at maxDelayMs, with ±jitter.
   * Max attempts: 5 (i.e. up to 4 retries).
   *
   * Retryable:    network errors (no response), 408, 425, 429, and any 5xx
   * Non-retryable: any other 4xx — likely a signing/CORS/bucket policy issue
   *                and retrying with the same presigned URL won't help.
   */
  retry: {
    maxAttempts: 5,
    baseDelayMs: 500,
    maxDelayMs: 15000,
    /** ±30%: the delay is `base + base * (random * 2 * jitter - jitter)`. */
    jitter: 0.3,
    retryableStatuses: [408, 425, 429],
    retryAll5xx: true,
  },

  metadata: {
    /** Hard cap on rows per create-media request, independent of tier. */
    chunkSize: 200,
    /** Attempts per create-media chunk before it is left for the user to retry. */
    saveAttempts: 5,
    /**
     * When create-media is flushed, per quality tier: a batch SIZE and a
     * maximum AGE, whichever comes first.
     *
     * Two costs pull against each other, and the tier decides the balance
     * because the tier decides how fast photos complete.
     *
     * Batching too little is a load problem. Every call is an insertMany plus a
     * booking update, a pump nudge and a storage $inc; a server carrying several
     * studios at once wants those amortised over as many photos as possible.
     *
     * Batching too much is a data-loss problem. An object is on R2/B2 the
     * instant its PUT returns, but nothing in the product knows it exists until
     * create-media records it. A tab closed before the next flush strands
     * everything since the last one: the objects are orphaned (recoverable only
     * by reclaim-orphaned-media.js) and the studio has to re-upload those
     * photos.
     *
     * So the SIZE falls as the tier gets heavier — losing 25 originals means
     * re-sending ~500 MB over a link that manages a photo every half-minute,
     * while losing 200 web-tier photos is a couple of minutes of re-work. The
     * AGE rises for the same reason: slow tiers need a longer window to fill a
     * batch at all, and without that the timer fires on every single photo,
     * which is exactly the one-call-per-photo behaviour a purely time-based
     * flush produced.
     */
    flushPolicy: {
      // Two small objects per photo; a batch fills in seconds.
      "2560": { size: 200, maxAgeMs: 60000 },
      // Adds an ~8 MB archive, so roughly an order of magnitude slower.
      "4096": { size: 100, maxAgeMs: 120000 },
      // Adds the whole camera file. On a slow link this is a photo every
      // ~30 s, so the age bound is what actually fires — 3 minutes gathers
      // several photos per call instead of one.
      original: { size: 25, maxAgeMs: 180000 },
    },
    /**
     * Fraction of a run that must be uploaded before its rows are allowed to
     * boot the GPU embedding pump. Per tier, because the tier decides how far
     * apart create-media chunks land.
     *
     * On a "2560" run chunks arrive seconds apart, so the pump stays warm on
     * its own and there is nothing to gain by waiting — hence 0, no deferral.
     *
     * On an archive-tier run the archive is 10-20x the delivery copy, so chunks
     * arrive minutes apart: further apart than the pump's idle-exit. Left alone
     * the pump boots (~4 min), embeds a handful of photos (~9 s), idles out,
     * and boots again for the next chunk — an instance that spends nearly all
     * its life starting up. Waiting lets ONE pump drain the whole backlog
     * continuously.
     *
     * The thresholds are chosen so the pump finishes at about the same moment
     * the upload does: embedding runs at roughly 0.45 s/photo, so the remaining
     * upload time at the threshold has to cover it. At these values that holds
     * for any uplink below ~4.7 MB/s (original) and ~6.3 MB/s (4096) —
     * comfortably above what a venue connection delivers. The web can override
     * them without a rebuild (NEXT_PUBLIC_EMBED_DEFER_PCT_4096 / _ORIGINAL, in
     * percent, read in engine.ts), because the right number depends on a
     * studio's link. These are the defaults.
     */
    embedDeferDefaults: {
      "2560": 0,
      "4096": 0.6,
      original: 0.7,
    },
  },

  archive: {
    /**
     * Parts of ONE original in flight at once. Measured, not guessed: B2 is
     * single-region (eu-central-003, Amsterdam) and a serial part stream gets
     * nowhere near the link's capacity from India, while several parts in
     * flight roughly quadruples it. This multiplies with the AIMD uploader
     * concurrency, so it is deliberately modest.
     */
    partConcurrency: 4,
    /**
     * How many part URLs to sign at a time. Signatures last `urlTtlMs` and an
     * archive-tier run lasts hours, so parts are signed just ahead of where the
     * upload actually is — never the whole file up front, which would hand a
     * 10,000-part file a set of URLs that expired before part 100.
     */
    signWindow: 16,
    /** Server-side presign lifetime (900 s). Kept in sync with the backend default. */
    urlTtlMs: 900000,
    /**
     * Re-sign a part whose URL is within this of expiring. A part can wait
     * behind three others on a slow link, so the margin has to cover a whole
     * part upload.
     */
    urlRefreshMs: 180000,
    /**
     * Slice size for the archive checksum. FIXED at 8 MiB regardless of the
     * multipart part size, so the digest of a given file is always reproducible
     * from the file alone. See computeArchiveChecksum in archive.ts.
     */
    checksumSliceBytes: 8388608,
    /** The digest is a two-level tree hash, NOT sha256(file); the prefix makes
     *  that impossible to misread. */
    checksumPrefix: "sha256-tree-8MiB-v1:",
  },

  http: {
    /**
     * The Cache-Control header a presigned PUT sends when the presign answer
     * names none. The stored object then carries it, so it is what Cloudflare
     * and browsers cache the object by. Delivery photos and thumbnails are
     * content-addressed and never change. The backend's IMMUTABLE_CACHE_CONTROL
     * must stay identical to this value. Exported as UPLOAD_CACHE_CONTROL from
     * lib/upload-cache-control.ts.
     */
    uploadCacheControl: "public, max-age=31536000, immutable",
  },

  files: {
    /** Camera RAW formats can't be displayed in the browser and are huge —
     *  blocked. `new RegExp(rawExtensionPattern, "i")`, tested on the file name. */
    rawExtensionPattern:
      "\\.(raw|cr2|cr3|nef|nrw|arw|srf|sr2|orf|rw2|dng|raf|3fr|kdc|mef|mrw|pef|ptx|r3d|rwl|srw|x3f|erf|fff|iiq)$",
    /** macOS AppleDouble sidecar files (`._foo.jpg`) and other dotfiles aren't
     *  real images — they carry an image extension but no decodable pixel data.
     *  Applied to the last path segment of the name: junk when it starts with
     *  any of `basePrefixes` or equals any of `baseNames`. (The "." prefix
     *  already covers the other two; they are listed because the web checks
     *  them by name.) */
    junk: {
      basePrefixes: ["._", "."],
      baseNames: [".DS_Store"],
    },
    /** A file is kept when its MIME type starts with this... */
    acceptedMimePrefix: "image/",
    /** ...or its name matches this (`new RegExp(acceptedExtensionPattern, "i")`). */
    acceptedExtensionPattern: "\\.(heic|heif|jpe?g|png|gif|webp)$",
  },

  /** The quality tiers, in the order the upload dialog offers them. */
  variants: ["2560", "4096", "original"],
} as const;

export type UploadSpec = typeof UPLOAD_SPEC;
export type SpecVariant = (typeof UPLOAD_SPEC.variants)[number];
