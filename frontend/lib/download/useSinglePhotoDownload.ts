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
 */

import { useCallback, useState } from "react";
import {
  downloadSinglePhoto,
  offeredTierForPhoto,
  type ArchiveTier,
  type SingleArchiveUrlResolver,
  type SinglePhotoSource,
  type SinglePhotoTier,
} from "./single.ts";

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
};

export function useSinglePhotoDownload({
  archiveAccess,
  resolveArchiveUrl,
  onStart,
  onDone,
  onError,
}: {
  /** Server-derived: may this viewer have the unwatermarked copy at all? */
  archiveAccess: boolean;
  resolveArchiveUrl?: SingleArchiveUrlResolver;
  /** Fired the moment a save begins (drives the host's "Downloading…" toast). */
  onStart?: () => void;
  /** Fired after a successful save — drives the post-download review nudge. */
  onDone?: () => void;
  onError?: () => void;
}): SinglePhotoDownload {
  // The photo awaiting a quality choice, plus the tier it can offer. Held
  // together so the sheet can never render against a stale pairing.
  const [pending, setPending] = useState<{
    photo: SinglePhotoSource;
    archiveTier: ArchiveTier;
  } | null>(null);

  const save = useCallback(
    (photo: SinglePhotoSource, tier: SinglePhotoTier) => {
      onStart?.();
      void downloadSinglePhoto(photo, tier, resolveArchiveUrl)
        .then(() => onDone?.())
        .catch(() => onError?.());
    },
    [resolveArchiveUrl, onStart, onDone, onError],
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
  };
}
