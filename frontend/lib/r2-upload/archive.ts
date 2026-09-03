/**
 * Archive-tier helpers — the pure decisions behind the "4096" and "original"
 * quality tiers, plus the streaming checksum.
 *
 * Split out of engine.ts for the same reason dedup.ts is: engine.ts imports
 * `@/lib/api`, which the `node --test` runner cannot resolve, so anything that
 * needs a unit test has to live in a module with no aliased imports. The type
 * import below is erased at runtime and pulls in nothing.
 */

import type { UploadVariant } from "./compressor";

/**
 * Slice size for the archive checksum. FIXED at 8 MiB regardless of the
 * multipart part size, so the digest of a given file is always reproducible
 * from the file alone. See computeArchiveChecksum.
 */
const CHECKSUM_SLICE = 8 * 1024 * 1024;

/**
 * Pure. No I/O. Which parts of an original still need uploading, and how many
 * there are in total.
 *
 * This is what makes a resumed run pick up MID-FILE. A record carrying an
 * `uploadId` and a stored parts list comes back with only the gaps — so an
 * interrupted 75 MB upload that got three parts of seven in resumes at part
 * four rather than starting the file again. Under the previous per-file
 * granularity, every interrupted file restarted from byte zero, which on a
 * multi-hour run over a connection that drops is the difference between
 * finishing and never finishing.
 *
 * Completed parts are matched by NUMBER, not by position: parts are uploaded
 * several in flight and therefore land out of order, so a stored list of
 * [1, 4, 5] is entirely normal and must resume at 2, not at 6.
 */
export function planArchivePartQueue({
  fileSize,
  partSize,
  completedParts,
}: {
  fileSize: number;
  partSize: number;
  completedParts: number[];
}): { partCount: number; pending: number[] } {
  const partCount = Math.max(1, Math.ceil(fileSize / partSize));
  const done = new Set(completedParts);
  const pending: number[] = [];
  for (let n = 1; n <= partCount; n++) {
    if (!done.has(n)) pending.push(n);
  }
  return { partCount, pending };
}

/**
 * Pure. No I/O. The archive fields one create-media row carries.
 *
 * Returns an EMPTY object unless the archive object verifiably exists — no
 * URL, or a "2560" run, means the row is written exactly as it was before
 * archives existed. That is the contract the whole failure path relies on: when
 * an archive upload fails, uploadOne clears `archiveUrl` and the cached
 * size/checksum, and this then omits the fields wholesale. Recording a URL for
 * an object that isn't on B2 would be strictly worse than recording nothing,
 * because nothing would ever re-check it.
 */
export function archiveMetadataFor({
  variant,
  archiveUrl,
  archiveSize,
  archiveChecksum,
}: {
  /** The record's OWN archive_variant, persisted when the archive landed.
   *  Optional because a record with no archive has none. Never pass the
   *  engine's live run variant — see UploadRecord.archiveVariant. */
  variant?: UploadVariant;
  archiveUrl?: string;
  archiveSize?: number;
  archiveChecksum?: string;
}): {
  archive_url?: string;
  archive_variant?: "4096" | "original";
  archive_size?: number;
  archive_checksum?: string;
} {
  if (!archiveUrl || !variant || variant === "2560") return {};
  return {
    archive_url: archiveUrl,
    archive_variant: variant,
    ...(archiveSize != null ? { archive_size: archiveSize } : {}),
    ...(archiveChecksum ? { archive_checksum: archiveChecksum } : {}),
  };
}

/**
 * Integrity digest for an archived original, computed WITHOUT ever holding the
 * file in memory.
 *
 * `crypto.subtle.digest` has no incremental API — it hashes one buffer — so a
 * plain whole-file SHA-256 would mean reading a 75 MB (or 5 GB) file into a
 * single ArrayBuffer, which this upload path will not do. Instead each 8 MiB
 * slice is digested on its own and the concatenated slice digests are digested
 * once more: a two-level tree hash, the same construction S3 uses for its own
 * composite checksums.
 *
 * The value is therefore NOT `sha256(file)`, and it is prefixed so that can
 * never be misread. A bare hex string that silently wasn't the file's SHA-256
 * would mislead whoever eventually writes the verification path. The slice size
 * is fixed at 8 MiB (not the multipart part size, which varies with file size),
 * so the same file always produces the same digest.
 *
 * This is client-asserted: nothing verifies it end to end, because that would
 * mean reading the bytes back through our own server. The backend's HeadObject
 * size check on completion is the byte-free half of the guarantee.
 */
export async function computeArchiveChecksum(file: File): Promise<string> {
  const digests: Uint8Array[] = [];
  for (let offset = 0; offset < file.size; offset += CHECKSUM_SLICE) {
    // One slice at a time; each buffer is released before the next is read.
    const slice = file.slice(offset, Math.min(offset + CHECKSUM_SLICE, file.size));
    const buf = await slice.arrayBuffer();
    digests.push(new Uint8Array(await crypto.subtle.digest("SHA-256", buf)));
  }
  const joined = new Uint8Array(digests.length * 32);
  digests.forEach((d, i) => joined.set(d, i * 32));
  const root = new Uint8Array(await crypto.subtle.digest("SHA-256", joined));
  const hex = Array.from(root)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `sha256-tree-8MiB-v1:${hex}`;
}
