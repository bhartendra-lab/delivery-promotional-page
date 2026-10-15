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
import {
  NATIVE_PHOTO_DOWNLOAD,
  PhotoHttpError,
  downloadImage,
  triggerBlobDownload,
  triggerNativeDownload,
} from "../media-actions.ts";
import { detectInAppBrowser } from "../in-app-browser.ts";
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

/**
 * After this many refused downloads in a row, stop trying the in-page download
 * for the rest of the visit and go straight to the fallback. Some browsers
 * (OPPO's HeyTap among them) refuse every photo however it is asked for — each
 * attempt costs the Guest two full downloads before the fallback appears, and
 * the team a mail about something already known.
 */
const REFUSALS_BEFORE_GIVING_UP = 2;
let refusedInARow = 0;

/** How a refused download was rescued. */
export type RecoveredVia = "native" | "hold";

/** Whether the browser's own download manager can take this photo. An
 *  in-app web view hands downloads to its host app, which may drop them. */
function canDownloadNatively(): boolean {
  if (!NATIVE_PHOTO_DOWNLOAD || typeof navigator === "undefined") return false;
  return detectInAppBrowser(navigator.userAgent ?? "") === null;
}

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
   * Fired when the page could not read the photo and the save was rescued
   * another way: handed to the browser's own download manager (`native`), or
   * the photo shown for a press-and-hold save (`hold`). Not `onError`: the
   * viewer still gets the photo. Carries what went wrong, for reporting.
   */
  onRecovered?: (err: unknown, mode: SingleSaveMode, via: RecoveredVia) => void;
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
      // The in-page download first — it is what works for nearly everyone,
      // and the only path that can tell whether it worked. When the page
      // cannot read the photo (a few Android browsers refuse every one; a weak
      // network or a hidden tab kills the transfer), the save is rescued:
      // handed to the browser's own download manager where that is switched
      // on, otherwise the photo is shown for its long-press "Download image".
      let outcome:
        | { kind: "saved" }
        | { kind: "shown" }
        | { kind: "recovered"; via: RecoveredVia; err: unknown } = { kind: "saved" };
      const rescue = (url: string): RecoveredVia => {
        if (canDownloadNatively()) {
          triggerNativeDownload(url);
          return "native";
        }
        setHoldUrl(url);
        return "hold";
      };
      const viaDownload: SinglePhotoSaver = async (url, filename) => {
        // This browser has refused every recent download: skip straight to
        // the rescue, without another doomed attempt or report. Still inside
        // the tap here, which is what a download manager hand-off wants.
        if (refusedInARow >= REFUSALS_BEFORE_GIVING_UP) {
          if (rescue(url) === "hold") outcome = { kind: "shown" };
          return;
        }
        try {
          await downloadImage(url, filename);
          refusedInARow = 0;
        } catch (err) {
          // Storage said the photo isn't there: a real failure, not one the
          // download manager or a long-press could get round.
          if (err instanceof PhotoHttpError) throw err;
          refusedInARow += 1;
          outcome = { kind: "recovered", via: rescue(url), err };
        }
      };
      const saver = mode === "share" ? viaShare : mode === "hold" ? viaHold : viaDownload;

      onStart?.(mode);
      void downloadSinglePhoto(photo, tier, resolveArchiveUrl, saver)
        .then((delivered) => {
          if (outcome.kind === "recovered") onRecovered?.(outcome.err, mode, outcome.via);
          // The press-and-hold view is up and says what to do: nothing to add.
          else if (outcome.kind === "shown") return;
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
