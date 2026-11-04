// lib/photo-cap.ts — PURE. The arithmetic behind the photo-limit panel, kept
// out of the component so every rule is unit-tested.

import type { PhotoCap } from "./billing-types.ts";
import { FALLBACK_PHOTO_CAP_4K_WEIGHT } from "./plans.ts";

/** The most capacity blocks one purchase can add. Mirrors MAX_PHOTO_CAP_BLOCKS_PER_ORDER in the API, which enforces it. */
export const MAX_PHOTO_CAP_BLOCKS = 20;

/**
 * Upload units `newFileCount` new photos will use at `variant`: a 4K photo
 * uses `weight4k`, any other one 1. Original never reaches a capped event (the
 * dialog does not offer it there and the API refuses it).
 */
export function uploadUnitsForSelection(newFileCount: number, variant: string, weight4k: number): number {
  return variant === "4096" ? newFileCount * weight4k : newFileCount;
}

/** The event's 4K weight, as its cap status says, else the fallback. */
export function photoCapWeight4k(cap: PhotoCap | null | undefined): number {
  const weight = cap?.weight_4k;
  return typeof weight === "number" && weight >= 1 ? weight : FALLBACK_PHOTO_CAP_4K_WEIGHT;
}

/** How many of `incoming` new upload units do NOT fit. 0 or less means they all fit. */
export function photoCapOverBy(cap: PhotoCap, incoming: number): number {
  return cap.used + incoming - cap.cap;
}

/**
 * The fewest blocks that make `incoming` new upload units fit, never less than 1 (the
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

/** Compares the uploads USED, deleted photos included, never the photos in
 *  the event: deleting does not give an upload back. */
export function photoCapNearlyFull(cap: PhotoCap | null | undefined): boolean {
  if (!cap || cap.cap <= 0) return false;
  return cap.used / cap.cap >= PHOTO_CAP_NEARLY_FULL;
}

/* ── What a purchase costs ──────────────────────────────────────────────────
 * The Event-based plan lists a block either with GST in its price or before
 * GST (`gst_inclusive`). The API sends a block both ways: `addon_price` as
 * listed and `addon_price_with_gst` as charged. Nothing here works out tax.
 */

const toPaise = (rupees: number) => Math.round(rupees * 100) / 100;

/** Whether a block's listed price includes GST. No answer means it does. */
export function photoCapGstInclusive(cap: PhotoCap): boolean {
  return cap.gst_inclusive !== false;
}

/** `blocks` blocks at the listed price: what the panel shows beside the count. */
export function photoCapListedTotal(cap: PhotoCap, blocks: number): number {
  return toPaise(blocks * cap.addon_price);
}

/**
 * `blocks` blocks as charged, GST included: what the Pay button says. The API
 * charges exactly blocks x its per-block figure, so this is the amount that
 * opens in Razorpay. An API from before the GST switch sends no with-GST
 * figure, and its listed price already included GST.
 */
export function photoCapChargedTotal(cap: PhotoCap, blocks: number): number {
  return toPaise(blocks * (cap.addon_price_with_gst ?? cap.addon_price));
}
