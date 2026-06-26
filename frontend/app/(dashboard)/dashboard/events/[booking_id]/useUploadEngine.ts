"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ensureFolders, listResumableRecords } from "@/lib/r2-upload/engine";
import { getUploadEngine } from "@/lib/r2-upload/registry";
import type { EngineProgress, UploadInput, UploadRecord } from "@/lib/r2-upload/types";

export type UploadEngineHook = {
  progress: EngineProgress;
  /** Files that hit max retries — surface for manual retry in the UI. */
  failed: UploadRecord[];
  /** Records that uploaded successfully but whose metadata save errored. */
  resumableRecords: UploadRecord[];
  /**
   * Start a fresh run. Three modes:
   *  - `groups`: pre-resolved `{ name, files }[]` — folders auto-created by name.
   *  - `targetFolderId`: single-folder mode — every file goes to one existing
   *    folder, no subfolder parsing.
   *  - `files` only (legacy): subfolder structure is parsed from
   *    `webkitRelativePath`.
   */
  startUpload: (args: {
    files?: File[];
    groups?: Array<{ name: string; files: File[] }>;
    existingFolders?: Array<{ name: string; id: string }>;
    targetFolderId?: string;
    targetFolderName?: string;
  }) => Promise<void>;
  /** Cancel the in-flight run; flushes create-media for completed uploads first. */
  cancelUpload: () => Promise<void>;
  /** Pause the active run — new work stops, in-flight chunks settle, state persists. */
  pause: () => void;
  /** Resume a paused run from exactly where it left off (no re-upload). */
  resume: () => void;
  /** Upload a cover image via the same pipeline; returns its R2 public URL. */
  uploadCover: (file: File, keyFolderId: string) => Promise<string>;
  /** Tag subsequent metadata saves as out-of-sync with a published gallery. */
  setOutOfSync: (value: boolean) => void;
  /** Resume create-media for uploaded rows left after an interrupt (also on mount). */
  resumePendingMetadata: () => Promise<void>;
  /** Re-run the batch create-media call after a transient backend error. */
  retryMetadataSave: () => Promise<void>;
  /** Re-compress + re-upload one previously-failed file (user picks again). */
  retryFailed: (recordId: string, file: File) => Promise<void>;
  /** Wipe persisted state for this booking. */
  resetPersisted: () => Promise<void>;
  /** Subscribe to "image uploaded" events (live grid prepend). */
  onMediaUploaded: (fn: ((publicUrl: string, customFolderId: string) => void) | null) => void;
  /** Subscribe to create-media chunk successes (canonical DB refresh). */
  onMetadataSaved: (fn: ((count: number) => void) | null) => void;
};

export function useUploadEngine(bookingId: string): UploadEngineHook {
  // The engine lives in a module-level registry keyed by bookingId, so it
  // survives route changes: navigating away from booking A and back re-attaches
  // to the same instance (and its live/paused run). `getUploadEngine` returns a
  // stable reference for a given bookingId, so it's safe in effect deps.
  const engine = getUploadEngine(bookingId);

  const [progress, setProgress] = useState<EngineProgress>(engine.getState());
  const [failed, setFailed] = useState<UploadRecord[]>([]);
  const [resumableRecords, setResumableRecords] = useState<UploadRecord[]>([]);
  const externalListenerRef = useRef<((url: string, cf: string) => void) | null>(null);
  const metadataSavedListenerRef = useRef<((count: number) => void) | null>(null);

  // Subscribe to engine state changes
  useEffect(() => {
    const unsub = engine.subscribe((s) => setProgress(s));
    return () => {
      unsub();
    };
  }, [engine]);

  // Wire engine's "uploaded" events to an external listener (used to update the live grid).
  useEffect(() => {
    const unsub = engine.onUploaded((url, cf) => {
      externalListenerRef.current?.(url, cf);
    });
    return () => unsub();
  }, [engine]);

  useEffect(() => {
    const unsub = engine.onMetadataSaved((count) => {
      metadataSavedListenerRef.current?.(count);
    });
    return () => unsub();
  }, [engine]);

  // On mount: if a prior run left uploaded-but-unsaved rows in IDB (tab close,
  // crash, cancel), flush them to create-media without re-uploading.
  const autoResumeStartedRef = useRef(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      if (autoResumeStartedRef.current) return;
      try {
        const list = await listResumableRecords(bookingId);
        if (!alive) return;
        const uploaded = list.filter((r) => r.status === "uploaded");
        setResumableRecords(uploaded);
        setFailed(list.filter((r) => r.status === "failed"));
        const state = engine.getState();
        if (uploaded.length > 0 && !state.isUploading && !state.isSavingMetadata) {
          autoResumeStartedRef.current = true;
          await engine.resumePendingMetadata();
        }
      } catch {
        if (!alive) return;
        setResumableRecords([]);
        setFailed([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [bookingId, engine]);

  // Refresh persisted lists when a run finishes — not on every progress tick.
  const wasEngineActiveRef = useRef(false);
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      listResumableRecords(bookingId)
        .then((list) => {
          if (!alive) return;
          setResumableRecords(list.filter((r) => r.status === "uploaded"));
          setFailed(list.filter((r) => r.status === "failed"));
        })
        .catch(() => {
          if (!alive) return;
          setResumableRecords([]);
          setFailed([]);
        });
    };

    const isActive = progress.isUploading || progress.isSavingMetadata;
    if (wasEngineActiveRef.current && !isActive) refresh();
    wasEngineActiveRef.current = isActive;

    return () => {
      alive = false;
    };
  }, [bookingId, progress.isUploading, progress.isSavingMetadata]);

  // beforeunload guard while uploading
  useEffect(() => {
    if (!progress.isUploading && !progress.isSavingMetadata) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "Upload in progress. Leaving will pause the upload.";
      return e.returnValue;
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [progress.isUploading, progress.isSavingMetadata]);

  const startUpload = useCallback(
    async ({
      files,
      groups,
      existingFolders = [],
      targetFolderId,
      targetFolderName,
    }: {
      files?: File[];
      groups?: Array<{ name: string; files: File[] }>;
      existingFolders?: Array<{ name: string; id: string }>;
      targetFolderId?: string;
      targetFolderName?: string;
    }) => {
      console.log("[upload:start] plan", {
        mode: targetFolderId ? "single-folder" : "grouped",
        rawFileCount: files?.length ?? 0,
        groups: groups?.map((g) => ({ name: g.name, count: g.files.length })),
        targetFolderId,
        targetFolderName,
      });

      // Single-folder mode: every image goes to one already-created folder,
      // no subfolder parsing.
      if (targetFolderId) {
        const source = files ?? (groups ?? []).flatMap((g) => g.files);
        const cleanFiles = filterImages(source);
        if (cleanFiles.length === 0) return;
        const inputs: UploadInput[] = cleanFiles.map((file) => ({
          file,
          customFolderId: targetFolderId,
          folderName: targetFolderName ?? "Folder",
        }));
        await engine.run(inputs);
        return;
      }

      // Grouped mode: caller pre-resolved `{ name, files }[]` (folder picker,
      // mixed-folder resolution, or direct-image naming). Fall back to parsing
      // subfolder structure from `files` if no groups were supplied.
      const resolvedGroups = (groups ?? groupByFirstSubfolder(filterImages(files ?? [])))
        .map((g) => ({ name: g.name, files: filterImages(g.files) }))
        .filter((g) => g.files.length > 0);
      if (resolvedGroups.length === 0) return;

      // Pre-seed the name→id map with folders that already exist on the server
      // so we don't create duplicates on re-uploads.
      const seed = new Map<string, string>();
      for (const f of existingFolders) seed.set(f.name, f.id);
      // Ensure folder records exist for each detected folder name.
      const folderIdByName = await ensureFolders(
        bookingId,
        resolvedGroups.map((g) => g.name),
        seed,
      );
      const inputs: UploadInput[] = [];
      for (const g of resolvedGroups) {
        const cfId = folderIdByName.get(g.name);
        if (!cfId) continue;
        for (const file of g.files) {
          inputs.push({ file, customFolderId: cfId, folderName: g.name });
        }
      }
      await engine.run(inputs);
    },
    [engine, bookingId],
  );

  const cancelUpload = useCallback(async () => {
    await engine.cancel();
  }, [engine]);

  const pause = useCallback(() => {
    engine.pause();
  }, [engine]);

  const resume = useCallback(() => {
    engine.resume();
  }, [engine]);

  const uploadCover = useCallback(
    (file: File, keyFolderId: string) => engine.uploadCover(file, keyFolderId),
    [engine],
  );

  const setOutOfSync = useCallback(
    (value: boolean) => engine.setOutOfSync(value),
    [engine],
  );

  const resumePendingMetadata = useCallback(async () => {
    await engine.resumePendingMetadata();
  }, [engine]);

  const retryMetadataSave = useCallback(async () => {
    await engine.retryMetadataSave();
  }, [engine]);

  const retryFailed = useCallback(
    async (recordId: string, file: File) => {
      await engine.retryFailed(recordId, file);
    },
    [engine],
  );

  const resetPersisted = useCallback(async () => {
    await engine.resetPersisted();
  }, [engine]);

  const onMediaUploaded = useCallback((fn: ((url: string, cf: string) => void) | null) => {
    externalListenerRef.current = fn;
  }, []);

  const onMetadataSaved = useCallback((fn: ((count: number) => void) | null) => {
    metadataSavedListenerRef.current = fn;
  }, []);

  return useMemo(
    () => ({
      progress,
      failed,
      resumableRecords,
      startUpload,
      cancelUpload,
      pause,
      resume,
      uploadCover,
      setOutOfSync,
      resumePendingMetadata,
      retryMetadataSave,
      retryFailed,
      resetPersisted,
      onMediaUploaded,
      onMetadataSaved,
    }),
    [progress, failed, resumableRecords, startUpload, cancelUpload, pause, resume, uploadCover, setOutOfSync, resumePendingMetadata, retryMetadataSave, retryFailed, resetPersisted, onMediaUploaded, onMetadataSaved],
  );
}

/* ── helpers ────────────────────────────────────────────────────── */

// Camera RAW formats can't be displayed in the browser and are huge — block
// them at the engine boundary too (the modal also filters, this is defence in
// depth for any caller that bypasses the modal).
const RAW_EXTENSIONS =
  /\.(raw|cr2|cr3|nef|nrw|arw|srf|sr2|orf|rw2|dng|raf|3fr|kdc|mef|mrw|pef|ptx|r3d|rwl|srw|x3f|erf|fff|iiq)$/i;

/** macOS AppleDouble sidecar files (`._foo.jpg`) and other dotfiles aren't real
 *  images — they carry an image extension but no decodable pixel data. */
function isJunkFile(name: string): boolean {
  const base = name.split("/").pop() ?? name;
  return base.startsWith("._") || base === ".DS_Store" || base.startsWith(".");
}

function filterImages(files: File[]): File[] {
  return files.filter((f) => {
    if (isJunkFile(f.name)) {
      console.warn("[upload:filter] skipping macOS sidecar/dotfile", { name: f.name, type: f.type || "(no type)", sizeMB: (f.size / 1024 / 1024).toFixed(2) });
      return false;
    }
    if (RAW_EXTENSIONS.test(f.name)) {
      console.warn("[upload:filter] skipping RAW file", { name: f.name, type: f.type, sizeMB: (f.size / 1024 / 1024).toFixed(2) });
      return false;
    }
    const keep = f.type.startsWith("image/") || /\.(heic|heif|jpe?g|png|gif|webp)$/i.test(f.name);
    if (!keep) {
      console.warn("[upload:filter] skipping non-image file", { name: f.name, type: f.type || "(no type)", sizeMB: (f.size / 1024 / 1024).toFixed(2) });
    }
    return keep;
  });
}

type Group = { name: string; files: File[] };

function groupByFirstSubfolder(files: File[]): Group[] {
  const map = new Map<string, File[]>();
  for (const f of files) {
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath ?? "";
    const parts = rel.split("/").filter(Boolean);
    // parts[0] = parent folder; parts[1] (if present) = subfolder.
    const sub =
      parts.length >= 3
        ? parts[1] // has subfolder → use subfolder name
        : parts.length >= 2
          ? parts[0] // flat folder selected → use the folder's own name
          : "Uncategorised"; // bare filename, no path (shouldn't happen with webkitdirectory)
    const bucket = map.get(sub) ?? [];
    bucket.push(f);
    map.set(sub, bucket);
  }
  return Array.from(map.entries()).map(([name, files]) => ({ name, files }));
}
