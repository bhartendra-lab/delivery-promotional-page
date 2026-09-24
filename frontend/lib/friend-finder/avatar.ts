/**
 * The face-picture crop, mirrored from the backend.
 *
 * The Change photo picker has to show the guest the crop they would GET, not
 * the photo it comes from — a candidate shown as a whole wedding photo tells
 * them nothing about which face was found or how it will look as a circle. So
 * the same geometry is computed here and applied with CSS.
 *
 * Kept in step with `avatarCropRect` in the backend's
 * `src/utils/friend-finder.utils.js`. If the padding or the centring changes
 * there, it changes here in the same commit, or the picker starts lying.
 */

/** The crop is this much larger than the detector's face box — 20% of it on
 *  each side. A box cropped tight to the face is all forehead and chin. */
export const AVATAR_CROP_PADDING = 1.4;

export type CropRect = {
  left: number;
  top: number;
  /** Square, because the picture is rendered as a circle. */
  side: number;
};

/**
 * The square region to show for one candidate.
 *
 * `bbox` is `[x1, y1, x2, y2]` — CORNERS, not x/y/width/height — in the pixel
 * space of the 2560px delivery copy, which is the image the worker measured
 * and the same one this picker renders. Callers pass that image's intrinsic
 * size (`naturalWidth`/`naturalHeight`), so nothing here has to guess at a
 * scale factor.
 *
 * Returns null when the box or the dimensions are unusable, which the caller
 * treats as "show the photo uncropped" rather than as an error.
 */
export function avatarCropRect(
  bbox: number[] | undefined,
  image: { width: number; height: number },
): CropRect | null {
  if (!Array.isArray(bbox) || bbox.length !== 4) return null;
  const [x1, y1, x2, y2] = bbox.map(Number);
  if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
  const boxW = x2 - x1;
  const boxH = y2 - y1;
  const { width, height } = image;
  if (!(boxW > 0) || !(boxH > 0) || !(width > 0) || !(height > 0)) return null;

  // Never larger than the image, and at least one pixel — the detector does
  // legitimately return boxes that run off the edge.
  const side = Math.max(1, Math.floor(Math.min(Math.max(boxW, boxH) * AVATAR_CROP_PADDING, width, height)));
  const clamp = (value: number, max: number) => Math.max(0, Math.min(Math.round(value), max));
  return {
    left: clamp((x1 + x2) / 2 - side / 2, width - side),
    top: clamp((y1 + y2) / 2 - side / 2, height - side),
    side,
  };
}

/**
 * The CSS that turns a whole photo into that crop inside a circle of `size`.
 *
 * The image is laid out at its full scaled size and pushed so the crop's
 * top-left corner sits at the container's origin; the container clips the rest.
 * Done this way rather than with `object-position` because the crop needs
 * scaling as well as offsetting, and `background-size: cover` cannot express
 * "this exact square of the source".
 */
export function cropStyle(rect: CropRect, image: { width: number; height: number }, size: number) {
  const scale = size / rect.side;
  return {
    width: image.width * scale,
    height: image.height * scale,
    marginLeft: -rect.left * scale,
    marginTop: -rect.top * scale,
    maxWidth: "none" as const,
  };
}
