/**
 * The upload engine's progress types: what the engine reports, with no DOM
 * types, so the Vyavasth Studio app can sync this file unchanged (its native
 * engine reports the same `EngineProgress`). types.ts re-exports all three, so
 * no import elsewhere changes.
 */

/** Per-folder aggregate progress for the UI. */
export type FolderProgress = {
  name: string;
  count: number;
  done: number;
  failed: number;
};

/** Mirrors `PhotoCap` in lib/billing-types.ts (kept structural so this module stays import-free). */
export type PhotoCapStatus = {
  cap: number;
  /** Upload units consumed, deleted photos included. */
  used: number;
  remaining: number;
  in_event?: number;
  deleted_units?: number;
  weight_4k?: number;
  addon_size: number;
  addon_price: number;
  addon_price_with_gst?: number;
  gst_inclusive?: boolean;
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
  /**
   * Set when the event reached its photo cap mid-run (another device filled
   * it, or this tab was stale): the server refused a presign or create-media
   * with PHOTO_CAP_EXCEEDED. The run is PAUSED, not failed, exactly as a full
   * storage plan pauses it. `waiting` is how many photos are not in the
   * gallery yet; `photoCap` is the cap the server reported, when it sent one.
   *
   * Cleared by resume. After capacity is bought the run picks up where it
   * stopped (`resumeAfterPhotoCap`); if the event is still full it simply
   * pauses again on the next refusal.
   */
  photoCapPause: {
    /** Photos not yet in the gallery. */
    waiting: number;
    /** What they will use against the upload limit at this run's tier (a 4K photo uses `weight_4k`). */
    waitingUnits: number;
    photoCap: PhotoCapStatus | null;
  } | null;
  /**
   * Last photo-cap status reported by create-media, so the count on screen
   * stays live through a run. Null on an uncapped (storage-plan) event and
   * before the first chunk lands.
   */
  photoCap: PhotoCapStatus | null;
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
  /**
   * How many photos cancel() is still waiting on before it stops.
   *
   * Cancelling does not cut records off mid-upload: a photo's view, thumbnail
   * and archive go up in parallel, and stopping between them would leave a
   * gallery photo at the Original tier with no original. Those already in
   * flight are finished first, so cancel is not instant on an archive-tier run
   * — this is what lets the UI say so instead of appearing to hang.
   *
   * 0 whenever a cancel is not in its grace phase.
   */
  finishingInFlight: number;
};
