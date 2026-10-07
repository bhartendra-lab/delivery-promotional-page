// lib/photo-cap.ts — PURE. The arithmetic behind the photo-limit panel, kept
// out of the component so every rule is unit-tested.

import type { PhotoCap } from "./billing-types.ts";

/** The most capacity blocks one purchase can add. Mirrors MAX_PHOTO_CAP_BLOCKS_PER_ORDER in the API, which enforces it. */
export const MAX_PHOTO_CAP_BLOCKS = 20;

/** How many of `incoming` new items do NOT fit. 0 or less means they all fit. */
export function photoCapOverBy(cap: PhotoCap, incoming: number): number {
  return cap.used + incoming - cap.cap;
}

/**
 * The fewest blocks that make `incoming` new items fit, never less than 1 (the
 * panel is only shown to add capacity). May exceed MAX_PHOTO_CAP_BLOCKS: the
 * caller then knows one purchase is not enough.
 */
export function minPhotoCapBlocks(cap: PhotoCap, incoming: number): number {
  const over = photoCapOverBy(cap, incoming);
  if (over <= 0 || cap.addon_size <= 0) return 1;
  return Math.ceil(over / cap.addon_size);
}

/** Clamp a block count the studio picked into what can actually be bought. */
export function clampPhotoCapBlocks(blocks: number, min: number): number {
  const floor = Math.min(Math.max(1, min), MAX_PHOTO_CAP_BLOCKS);
  return Math.min(MAX_PHOTO_CAP_BLOCKS, Math.max(floor, Math.round(blocks) || floor));
}

/** True once the event's cap has grown by at least what was bought. */
export function photoCapHasGrown(before: PhotoCap, fresh: PhotoCap | null | undefined, photosAdded: number): boolean {
  return !!fresh && fresh.cap >= before.cap + photosAdded;
}

/** At or above this share of the cap, the event page offers "Add capacity". */
export const PHOTO_CAP_NEARLY_FULL = 0.9;

export function photoCapNearlyFull(cap: PhotoCap | null | undefined, used: number): boolean {
  if (!cap || cap.cap <= 0) return false;
  return used / cap.cap >= PHOTO_CAP_NEARLY_FULL;
}
