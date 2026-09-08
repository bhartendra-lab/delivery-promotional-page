/**
 * `planDownload` — the whole download feature's brain, and the only place any
 * policy lives.
 *
 * PURE. No I/O, no globals, no `navigator`. Everything that varies by device
 * arrives as an argument (see `DownloadEnvironment`), which is what lets a unit
 * test hold a table against every rule instead of spinning up four browsers.
 * The four engines downstream are dumb executors: not one of them contains a
 * conditional about platform, tier or capability.
 *
 * THE DECISION ORDER, and the one thing to understand about it: **no rule tests
 * the tier.** The gate is size, and it applies identically to a web-quality and
 * an archive-quality download.
 *
 * An earlier draft gated archive downloads on having the directory picker, on
 * the reasoning that a host pulling 3,000 originals is 75 GB and no phone can
 * ZIP that. That reasoning was calibrated on the wrong workload. A *guest*
 * downloading their matched set is ~40 photos — roughly 1 GB at original
 * quality — which is four batched parts on a phone and works on iOS Safari,
 * Samsung Internet and every in-app browser. A tier gate would have blocked the
 * common case to protect against the rare one. The size rule blocks exactly the
 * pathological case and nothing else, and it protects the web tier too: a host
 * pulling 3,000 web copies on a phone is 2.4 GB and was previously unbounded.
 *
 * This matters more than it looks because a large share of guests arrive through
 * WhatsApp, and Android WebView does not reliably expose the File System Access
 * API even on Chrome 132+. Anything gated on the picker is unavailable to a big
 * slice of the real audience.
 *
 * No aliased imports — this module and its test run under `node --test`.
 */

import type { SaveCapability } from "./capability.ts";
import type { ArchiveTier, TierAudience } from "../quality-tiers.ts";

export type { ArchiveTier };

/* ── Types ───────────────────────────────────────────────────────────────── */

/**
 * What a BULK download targets.
 *
 * Note there is no per-tier archive option, and that is deliberate. The quality
 * tier is chosen per UPLOAD RUN, not per booking, so one event routinely holds
 * originals from one run, 4K from another and HD-only photos from a
 * third. An earlier model asked the guest to pick ONE archive tier and matched
 * items against it exactly, which meant asking for originals silently handed
 * back 2560px copies of every 4K photo — a real quality loss, reported
 * by an alert that claimed those photos were "only available in web size" when
 * a 4096px copy existed all along.
 *
 * "archive" therefore means BEST AVAILABLE PER PHOTO: the original where there
 * is one, the 4K copy where there is one, the delivery copy otherwise.
 * There is no case where a guest wants the worse of two files they are entitled
 * to, so there is nothing to choose between.
 */
export type DownloadTier = "2560" | "archive";

export type DownloadMethod =
  /** Write each file into a chosen folder, streamed, no ZIP. */
  | "directory"
  /** One ZIP streamed to disk. */
  | "streamZip"
  /** One ZIP built in RAM. */
  | "memoryZip"
  /** N ZIPs in RAM, each under the cap, one click each. */
  | "batchedZip"
  /** Cannot proceed on this device. */
  | "blocked";

/** One photo as the caller knows it, before a tier is chosen. */
export type PlanSource = {
  mediaId: string;
  /** The 2560px delivery URL. Always present — it is the fallback for every
   *  item the archive tier cannot serve. */
  url: string;
  /** Filename to save as, unsanitised. */
  name: string;
  /** Custom folder this photo lives in, "" for none. Mirrored as a
   *  subdirectory by the `directory` engine. */
  folderName?: string;
  /** Bytes of the 2560px object. 0 when unknown (media predating `size`). */
  bytes?: number;
  /** The archive tier THIS photo has, if any. */
  archiveVariant?: ArchiveTier | null;
  /** Bytes of the archive object. */
  archiveBytes?: number | null;
};

export type PlanItem = {
  mediaId: string;
  /**
   * The URL for the CHOSEN tier, where it is known at plan time — which is
   * always, for the web tier. For an archive item this holds the web copy and
   * `needsArchiveUrl` is true: `archive_url` is deliberately absent from every
   * list response (a URL in a list response is readable from the network tab by
   * any guest, and these objects are protected by nothing but an unguessable
   * key), so the engine mints archive URLs through the archive-download-urls
   * endpoint after the picker opens. An item the endpoint declines or omits
   * falls back to this URL — the same outcome as a plan-time `degraded`.
   */
  url: string;
  /** True when this item's real URL still has to be minted. */
  needsArchiveUrl: boolean;
  /** Sanitised filename. */
  name: string;
  /** Sanitised folder name, "" for the root of the target. */
  folderName: string;
  bytes: number;
  /** True when `bytes` is an assumption, not a recorded byte count — see
   *  ASSUMED_BYTES. The engines don't care; the modal stops saying "exactly". */
  bytesEstimated: boolean;
  /** Archive requested, but this item only has the web copy. */
  degraded: boolean;
};

export type AlertId =
  | "TOO_LARGE_FOR_DEVICE"
  | "SPLIT_INTO_PARTS"
  | "FOLDER_PERMISSION"
  | "LARGE_DOWNLOAD"
  | "DEGRADED_ITEMS"
  | "MIXED_ARCHIVE_TIERS"
  | "SKIPPING_EXISTING";

export type AlertSeverity = "blocking" | "warning" | "info";

export type DownloadAlert = {
  id: AlertId;
  severity: AlertSeverity;
  /** Interpolated into the copy's `{n}`. Carried on the alert rather than read
   *  back off the plan because SKIPPING_EXISTING is appended by the engine and
   *  its count exists nowhere in the plan. */
  count?: number;
};

export type DownloadPlan = {
  tier: DownloadTier;
  method: DownloadMethod;
  items: PlanItem[];
  totalBytes: number;
  /** Length 1 unless `method === "batchedZip"`. */
  batches: PlanItem[][];
  /**
   * Which archive tiers this download actually includes, distinct and ordered
   * best-first. Empty at the delivery tier, and empty when nothing selected has
   * an archive copy. Two entries means the selection spans upload runs — the
   * modal names the option honestly instead of picking one arbitrarily.
   */
  archiveTiers: ArchiveTier[];
  /** How many items had no recorded size and were assumed. 0 means the total
   *  is exact, summed from real byte counts. */
  estimatedCount: number;
  degradedCount: number;
  alerts: DownloadAlert[];
  canProceed: boolean;
};

export type PlanInput = {
  items: PlanSource[];
  tier: DownloadTier;
  capability: SaveCapability;
  /** MEMORY_ZIP_CAP for this device (see capability.ts). */
  memoryCap: number;
};

/* ── Constants ───────────────────────────────────────────────────────────── */

/**
 * Above this many parts the click-per-part flow stops being a download and
 * becomes a chore. 8 parts is ~2.4 GB on mobile and ~8 GB on desktop:
 * comfortably above any guest's matched set, comfortably below a whole gallery.
 */
export const MAX_BATCHES = 8;

/** Threshold for the "this will take a while, stay on wi-fi" warning. */
export const LARGE_DOWNLOAD_BYTES = 500 * 1024 * 1024;

/**
 * What to assume a photo weighs when its byte count was never recorded.
 *
 * `Media.size` is absent on everything uploaded before byte counts existed, and
 * a gallery whose backfill has not been run is entirely made of such documents.
 * Treating those as 0 — the obvious reading of a missing number — disables the
 * size rule completely: a 3,000-photo legacy gallery sums to "0 MB", plans a
 * single in-memory ZIP, and kills the tab on the phone it was planned for. An
 * absent size is not a small photo, it is an unknown one.
 *
 * These are the uploader's own output shape (2560px long edge at quality 0.80,
 * and the archive tiers alongside it), rounded UP. Erring high is deliberate:
 * over-estimating pushes a borderline selection towards batching or a clean
 * "too large for this device", where under-estimating pushes it towards a
 * crash. A plan that used any of them reports its total as approximate rather
 * than claiming an exactness it does not have.
 */
export const ASSUMED_BYTES: Record<"2560" | ArchiveTier, number> = {
  "2560": 1.2 * 1024 * 1024,
  "4096": 3 * 1024 * 1024,
  original: 8 * 1024 * 1024,
};

/**
 * How many photos to fetch in parallel while building a ZIP.
 *
 * Tier-aware, and computed HERE rather than inside the engine, which knows
 * nothing about tiers. The ZIP path buffers each whole image before it enters
 * the archive — deliberately, so a network hiccup retries one photo instead of
 * killing the archive — but 8 × 50 MB in flight is 400 MB of transient pressure
 * for no gain, so archive downloads run three at a time.
 */
export function concurrencyForTier(tier: DownloadTier): number {
  return tier === "2560" ? 8 : 3;
}

/** Best-first, so `archiveTiers[0]` is the highest quality in the selection. */
const ARCHIVE_TIER_RANK: Record<ArchiveTier, number> = { original: 0, "4096": 1 };

/* ── Filenames ───────────────────────────────────────────────────────────── */

/** Characters no mainstream filesystem accepts in a name, control chars included. */
const ILLEGAL_FILENAME_CHARS = /[/\\:*?"<>|\x00-\x1f]/g;

/**
 * The single filename sanitiser. Every path that names a file on disk or inside
 * a ZIP goes through this, so a photo cannot save correctly in one method and
 * fail in another.
 *
 * Trailing dots and spaces are trimmed because Windows silently rejects them,
 * and a name that survives nothing falls back to the media id rather than to
 * an empty string — an unnamed entry is a corrupt ZIP, not a cosmetic problem.
 */
export function sanitiseFilename(raw: string, fallback = "photo"): string {
  const cleaned = String(raw ?? "")
    .replace(ILLEGAL_FILENAME_CHARS, "_")
    // Trailing dots/spaces only: a leading dot is a legitimate, if unusual, name.
    .replace(/[. ]+$/, "")
    .trim()
    .slice(0, 180);
  return cleaned || sanitiseFallback(fallback);
}

function sanitiseFallback(fallback: string): string {
  const cleaned = String(fallback ?? "")
    .replace(ILLEGAL_FILENAME_CHARS, "_")
    .replace(/[. ]+$/, "")
    .trim()
    .slice(0, 180);
  return cleaned || "photo";
}

/**
 * A name not already in `taken`, appending " (2)", " (3)", … before the
 * extension. Mutates `taken` so a caller can walk a list. Used both for ZIP
 * entry names (two folders can hold the same filename) and for the `directory`
 * engine's collision handling.
 */
export function dedupeName(taken: Set<string>, name: string): string {
  const key = name.toLowerCase();
  if (!taken.has(key)) {
    taken.add(key);
    return name;
  }
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let n = 2; ; n++) {
    const candidate = `${base} (${n})${ext}`;
    if (!taken.has(candidate.toLowerCase())) {
      taken.add(candidate.toLowerCase());
      return candidate;
    }
  }
}

/* ── Batch packing ───────────────────────────────────────────────────────── */

/**
 * Greedy by BYTES, never by count — a batch of 50 thumbnails and a batch of 50
 * originals are two orders of magnitude apart, and it is bytes the tab has to
 * hold.
 *
 * The `batch.length > 0` guard is load-bearing: without it an item larger than
 * the cap closes an empty batch, starts another empty one, and loops forever.
 * Such an item gets a batch to itself instead — there is nothing else to do
 * with it, and the caller is better off attempting one oversized part than
 * being told nothing can be downloaded.
 */
export function packBatches(items: PlanItem[], cap: number): PlanItem[][] {
  const batches: PlanItem[][] = [];
  let batch: PlanItem[] = [];
  let bytes = 0;
  for (const item of items) {
    if (batch.length > 0 && bytes + item.bytes > cap) {
      batches.push(batch);
      batch = [];
      bytes = 0;
    }
    batch.push(item);
    bytes += item.bytes;
  }
  if (batch.length > 0) batches.push(batch);
  return batches;
}

/* ── The planner ─────────────────────────────────────────────────────────── */

const SEVERITY_ORDER: Record<AlertSeverity, number> = { blocking: 0, warning: 1, info: 2 };

export function planDownload({ items, tier, capability, memoryCap }: PlanInput): DownloadPlan {
  const wantsArchive = tier !== "2560";
  const takenNames = new Map<string, Set<string>>();

  const planned: PlanItem[] = items.map((source) => {
    const folderName = source.folderName ? sanitiseFilename(source.folderName, "") : "";
    // Any archive copy counts, whichever tier it is — see DownloadTier. An item
    // is degraded only when it has NO archive object at all: uploaded at HD,
    // uploaded before the tiers existed, or its archive step failed. Never
    // dropped, never fatal: it downloads at web quality and is counted so the
    // guest is told, and that count is now truthful rather than sweeping in
    // photos whose only crime was coming from a different upload run.
    const hasArchive = wantsArchive && source.archiveVariant != null;
    const degraded = wantsArchive && !hasArchive;
    // Per-folder namespacing: two photos called DSC_4821.jpg from different
    // folders must not collide, and within one folder the second one becomes
    // "DSC_4821 (2).jpg".
    let taken = takenNames.get(folderName);
    if (!taken) {
      taken = new Set<string>();
      takenNames.set(folderName, taken);
    }
    // The recorded byte count for the copy this item will actually fetch, or
    // an assumption when there isn't one. Never 0 — see ASSUMED_BYTES.
    const recorded = hasArchive ? source.archiveBytes : source.bytes;
    const bytesEstimated = recorded == null || recorded <= 0;
    const assumedTier: "2560" | ArchiveTier = hasArchive
      ? (source.archiveVariant as ArchiveTier)
      : "2560";
    return {
      mediaId: source.mediaId,
      url: source.url,
      needsArchiveUrl: hasArchive,
      name: dedupeName(taken, sanitiseFilename(source.name, source.mediaId)),
      folderName,
      bytes: bytesEstimated ? ASSUMED_BYTES[assumedTier] : recorded,
      bytesEstimated,
      degraded,
    };
  });

  const totalBytes = planned.reduce((sum, item) => sum + item.bytes, 0);
  const degradedCount = planned.reduce((n, item) => n + (item.degraded ? 1 : 0), 0);
  const estimatedCount = planned.reduce((n, item) => n + (item.bytesEstimated ? 1 : 0), 0);
  const archiveTiers = wantsArchive
    ? [
        ...new Set(
          items
            .map((source) => source.archiveVariant)
            .filter((v): v is ArchiveTier => v === "4096" || v === "original"),
        ),
      ].sort((a, b) => ARCHIVE_TIER_RANK[a] - ARCHIVE_TIER_RANK[b])
    : [];
  // How many photos will arrive as a 4K re-encode rather than a camera
  // original. Only meaningful — and only reported — when the selection spans
  // both, because that is the one case where "full quality" means two different
  // things and a studio must not assume it has the studio's original files.
  const lesserTierCount =
    archiveTiers.length > 1
      ? items.reduce((n, source) => n + (source.archiveVariant === "4096" ? 1 : 0), 0)
      : 0;

  // Pack once, up front. The method decision below reads `packed.length` rather
  // than `Math.ceil(totalBytes / cap)` because greedy packing can need MORE
  // parts than that ratio implies (three 200 MB items under a 300 MB cap are
  // three parts, not two), and the number the guest will actually click through
  // is the one MAX_BATCHES has to bound.
  const packed = capability === "memoryZip" ? packBatches(planned, memoryCap) : [planned];

  let method: DownloadMethod;
  if (capability === "directory") {
    // No size limit: files stream one at a time and peak memory is one file
    // regardless of selection size.
    method = "directory";
  } else if (capability === "streamZip") {
    // No size limit either: the archive streams to disk as it is built.
    method = "streamZip";
  } else if (totalBytes <= memoryCap) {
    method = "memoryZip";
  } else if (packed.length <= MAX_BATCHES) {
    method = "batchedZip";
  } else {
    method = "blocked";
  }

  const batches = method === "batchedZip" ? packed : [planned];

  const alerts: DownloadAlert[] = [];
  if (method === "blocked") alerts.push({ id: "TOO_LARGE_FOR_DEVICE", severity: "blocking" });
  if (method === "batchedZip")
    alerts.push({ id: "SPLIT_INTO_PARTS", severity: "warning", count: batches.length });
  if (method === "directory") alerts.push({ id: "FOLDER_PERMISSION", severity: "info" });
  if (totalBytes > LARGE_DOWNLOAD_BYTES) alerts.push({ id: "LARGE_DOWNLOAD", severity: "warning" });
  // Only worth saying when the selection HAS a better tier for some photos.
  // With no archive copy anywhere, "these will download at 2560px" describes
  // the whole download rather than an exception — noise for a studio, and for
  // a guest a hint that something they cannot have exists.
  if (degradedCount > 0 && archiveTiers.length > 0)
    alerts.push({ id: "DEGRADED_ITEMS", severity: "info", count: degradedCount });
  if (lesserTierCount > 0)
    alerts.push({ id: "MIXED_ARCHIVE_TIERS", severity: "info", count: lesserTierCount });
  alerts.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  return {
    tier,
    method,
    items: planned,
    totalBytes,
    batches,
    archiveTiers,
    estimatedCount,
    degradedCount,
    alerts,
    // An empty selection is not "proceedable" either — there is nothing to
    // save, and offering the button would open a picker for no reason.
    canProceed: method !== "blocked" && planned.length > 0,
  };
}

/* ── Alert copy ──────────────────────────────────────────────────────────── */

/**
 * Copy lives here, next to the alert definitions, never inline in JSX — so the
 * table in the spec and the table in the code are the same table.
 *
 * `TOO_LARGE_FOR_DEVICE` is ONE alert id with two copy variants, selected by
 * `ios`. That is the "platform decides only the wording" rule made concrete:
 * the condition and the severity are identical, only the sentence differs,
 * because telling an iPhone user to open Chrome is useless (every iOS browser
 * is WebKit) while telling a desktop Firefox user the same thing is actionable.
 */
export function alertCopy(
  alert: DownloadAlert,
  { ios, audience = "studio" }: { ios: boolean; audience?: TierAudience },
): string | null {
  const count = alert.count ?? 0;
  const n = count.toLocaleString("en-IN");
  /** "1 photo is" / "4 photos are" — a count of exactly one is common enough
   *  here (one legacy upload, one failed archive) to be worth getting right. */
  const photos = count === 1 ? "1 photo" : `${n} photos`;
  const are = count === 1 ? "is" : "are";
  const were = count === 1 ? "was" : "were";
  switch (alert.id) {
    case "TOO_LARGE_FOR_DEVICE":
      return ios
        ? "This is too large to download on an iPhone or iPad. Open the gallery on a computer, or select fewer photos."
        : "This is too large for this browser. Open the gallery in Chrome or Edge, or select fewer photos.";
    case "SPLIT_INTO_PARTS":
      return `This is too large to download as one file on this device. We'll split it into ${n} parts.`;
    case "FOLDER_PERMISSION":
      return "Your browser will ask permission to save into the folder you choose.";
    case "LARGE_DOWNLOAD":
      return "Large download. Stay on wi-fi and keep this tab open until it finishes.";
    case "DEGRADED_ITEMS":
      return `${photos} ${are} only available in web size and will download at 2560px.`;
    case "MIXED_ARCHIVE_TIERS":
      // STUDIO ONLY. These photos came from a 4K upload run: a 4096px
      // re-encode, not the file the studio picked, and "Full resolution"
      // covering both would otherwise imply files they never uploaded.
      //
      // A guest is told nothing: they were offered "High Resolution", which
      // already means "the best copy of each photo", and naming tiers they
      // cannot choose between would only hint at something they are not
      // getting.
      if (audience === "guest") return null;
      return `${photos} ${were} uploaded at 4K, so ${count === 1 ? "it'll" : "they'll"} download as a 4096px file rather than the original.`;
    case "SKIPPING_EXISTING":
      return `${photos} ${are} already in this folder and will be skipped.`;
  }
}

/** How the method is described to a guest — in their language, not ours. */
export function methodCopy(method: DownloadMethod, partCount: number): string | null {
  switch (method) {
    case "directory":
      return "Choose a folder. Photos save straight into it.";
    case "streamZip":
      return "You'll choose where to save a ZIP file.";
    case "memoryZip":
      return "Downloads as a ZIP file.";
    case "batchedZip":
      return `Downloads as ${partCount.toLocaleString("en-IN")} ZIP files, one at a time.`;
    case "blocked":
      // No method line: the blocking alert carries the whole explanation.
      return null;
  }
}

/** "1.4 GB" / "820 MB" / "12 KB". Exact input, human output. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(gb >= 10 ? 0 : 1)} GB`;
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString("en-IN")} KB`;
}
