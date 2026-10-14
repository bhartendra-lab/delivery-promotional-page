"use client";

/**
 * Wires a single-photo download affordance to the quality chooser.
 *
 * Every surface that can save one photo — a grid tile, a lightbox, a one-item
 * selection — calls `request(photo)`. Where a quality choice exists for this
 * viewer and this photo, the chooser opens; where it does not, the photo saves
 * immediately, exactly as it did before tiers existed. A caller never decides
 * which of those happens, which is what keeps the behaviour identical across
 * surfaces and between the guest gallery and the studio dashboard.
 *
 * HOW the photo is saved depends on the device (`singleSaveMode`), and is also
 * decided here rather than by a caller: the browser's download everywhere but
 * iOS, and on iOS the share sheet — or, without one, a press-and-hold view.
 * See `share.ts` for why an iPhone cannot simply download.
 */

import { useCallback, useRef, useState } from "react";
import { singleSaveMode, type SingleSaveMode } from "./capability.ts";
import { fetchImageFile, canShareThese, shareFiles, type ShareOutcome } from "./share.ts";
import { downloadImage, triggerBlobDownload } from "../media-actions.ts";
import {
  downloadSinglePhoto,
  offeredTierForPhoto,
  type ArchiveTier,
  type SingleArchiveUrlResolver,
  type SinglePhotoSaver,
  type SinglePhotoSource,
  type SinglePhotoTier,
} from "./single.ts";

/** Thrown to unwind a save the viewer backed out of. Not a failure. */
const DISMISSED = new DOMException("Save dismissed", "AbortError");

export type SinglePhotoDownload = {
  /** Save this photo, asking for a quality first when there is a choice. */
  request: (photo: SinglePhotoSource) => void;
  /** Spread onto `<QualityChoiceSheet />`. */
  sheet: {
    open: boolean;
    archiveTier: ArchiveTier | null;
    onPick: (tier: SinglePhotoTier) => void;
    onClose: () => void;
  };
  /** Spread onto `<SavePhotoSheet />` — the two iOS-only save surfaces. */
  saveSheet: {
    /** A fetched photo waiting for the tap that opens the share sheet. */
    ready: boolean;
    onSave: () => void;
    /** A photo to show for press-and-hold saving, or null. */
    holdUrl: string | null;
    onClose: () => void;
  };
};

export function useSinglePhotoDownload({
  archiveAccess,
  resolveArchiveUrl,
  onStart,
  onDone,
  onFellBack,
  onDismissed,
  onRecovered,
  onError,
}: {
  /** Server-derived: may this viewer have the unwatermarked copy at all? */
  archiveAccess: boolean;
  resolveArchiveUrl?: SingleArchiveUrlResolver;
  /** Fired the moment a save begins (drives the host's "Downloading…" toast). */
  onStart?: (mode: SingleSaveMode) => void;
  /** Fired after a successful save — drives the post-download review nudge. */
  onDone?: (mode: SingleSaveMode) => void;
  /**
   * Fired when an archive tier was asked for but only the delivery copy could
   * be saved. Separate from `onError` because the file DID download — the
   * viewer just didn't get the tier they picked, and must be told rather than
   * left believing a 2560px file is their original.
   */
  onFellBack?: (mode: SingleSaveMode) => void;
  /** Fired when the viewer closed the save sheet without saving. */
  onDismissed?: () => void;
  /**
   * Fired when the browser could not save the file and the photo was shown
   * for press-and-hold saving instead. Not `onError`: the viewer still has a
   * way to keep the photo. Carries what went wrong, for reporting.
   */
  onRecovered?: (err: unknown, mode: SingleSaveMode) => void;
  /** Fired when nothing could be saved, with whatever was thrown. */
  onError?: (err: unknown, mode: SingleSaveMode) => void;
}): SinglePhotoDownload {
  // The photo awaiting a quality choice, plus the tier it can offer. Held
  // together so the sheet can never render against a stale pairing.
  const [pending, setPending] = useState<{
    photo: SinglePhotoSource;
    archiveTier: ArchiveTier;
  } | null>(null);
  // iOS, share sheet: a photo that was fetched but whose share the browser
  // refused because the tap had gone stale. Held until the viewer taps again.
  const [ready, setReady] = useState<{
    files: File[];
    settle: (outcome: ShareOutcome) => void;
  } | null>(null);
  // iOS, no share sheet: the photo to show for press-and-hold saving.
  const [holdUrl, setHoldUrl] = useState<string | null>(null);

  // A share-sheet save from its tap until the sheet closes. A second tap in
  // that window would start a second share while the first is still opening,
  // which iOS rejects — and which used to surface as "Download failed".
  const sharing = useRef(false);

  const save = useCallback(
    (photo: SinglePhotoSource, tier: SinglePhotoTier) => {
      const mode = singleSaveMode();
      if (mode === "share") {
        if (sharing.current) return;
        sharing.current = true;
      }

      const viaShare: SinglePhotoSaver = async (url, filename) => {
        const file = await fetchImageFile(url, filename);
        // A file this sheet won't take (an unusual original) still has to end
        // up somewhere: fall back to the browser's own download.
        if (!canShareThese([file])) {
          triggerBlobDownload(file, file.name);
          return;
        }
        let outcome = await shareFiles([file]);
        if (outcome === "blocked") {
          outcome = await new Promise<ShareOutcome>((settle) => setReady({ files: [file], settle }));
        }
        if (outcome === "dismissed") throw DISMISSED;
        if (outcome === "blocked") throw new Error("Share sheet refused the tap");
      };
      // Nothing to fetch: the browser loads the image itself, and the viewer
      // saves it with the system's own press-and-hold menu.
      const viaHold: SinglePhotoSaver = async (url) => setHoldUrl(url);
      // The browser's own download, with the press-and-hold view behind it. A
      // handful of Android browsers refuse every photo this way however often
      // it is retried, while still displaying the photo perfectly well — so
      // the photo is shown and its long-press "Download image" does the save.
      let recoveredFrom: unknown = null;
      const viaDownload: SinglePhotoSaver = async (url, filename) => {
        try {
          await downloadImage(url, filename);
        } catch (err) {
          recoveredFrom = err;
          setHoldUrl(url);
        }
      };
      const saver = mode === "share" ? viaShare : mode === "hold" ? viaHold : viaDownload;

      onStart?.(mode);
      void downloadSinglePhoto(photo, tier, resolveArchiveUrl, saver)
        .then((delivered) => {
          if (recoveredFrom !== null) onRecovered?.(recoveredFrom, mode);
          else if (delivered !== tier) onFellBack?.(mode);
          else onDone?.(mode);
        })
        .catch((err: unknown) => {
          if (err === DISMISSED) onDismissed?.();
          else onError?.(err, mode);
        })
        .finally(() => {
          if (mode === "share") sharing.current = false;
        });
    },
    [resolveArchiveUrl, onStart, onDone, onFellBack, onDismissed, onRecovered, onError],
  );

  const request = useCallback(
    (photo: SinglePhotoSource) => {
      const archiveTier = offeredTierForPhoto(photo, {
        archiveAccess,
        canResolve: Boolean(resolveArchiveUrl),
      });
      // No choice to make: don't make the viewer make one.
      if (!archiveTier) {
        save(photo, "2560");
        return;
      }
      setPending({ photo, archiveTier });
    },
    [archiveAccess, resolveArchiveUrl, save],
  );

  return {
    request,
    sheet: {
      open: pending !== null,
      archiveTier: pending?.archiveTier ?? null,
      onPick: (tier) => {
        if (!pending) return;
        setPending(null);
        save(pending.photo, tier);
      },
      onClose: () => setPending(null),
    },
    saveSheet: {
      ready: ready !== null,
      // No `await` before `shareFiles`: this runs inside the tap, which is the
      // entire point of having asked for it.
      onSave: () => {
        if (!ready) return;
        const { files, settle } = ready;
        setReady(null);
        shareFiles(files).then(settle, () => settle("blocked"));
      },
      holdUrl,
      onClose: () => {
        ready?.settle("dismissed");
        setReady(null);
        setHoldUrl(null);
      },
    },
  };
}
