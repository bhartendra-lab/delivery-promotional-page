/**
 * Pure helper for previewing a watermark on sample photos (Settings > Watermark
 * Presets): where the mark lands. No browser globals, so it is tested.
 */
import { watermarkAlpha, watermarkPlacement, watermarkSize, type WatermarkAnchor } from "./r2-upload/geometry.ts";

/**
 * Where the watermark sits on a photo shown `W` x `H` pixels, in those same
 * pixels. This is the upload engine's own math (WatermarkRenderer.draw uses
 * watermarkSize, watermarkPlacement and watermarkAlpha), applied to the size on
 * screen instead of the 2560px delivery frame. Every rule in it is a ratio of
 * the photo (size as a share of the shorter edge, edge inset as a share of the shorter edge), so
 * scaling the frame scales the answer and the preview matches the output.
 */
export function watermarkPixelBox(args: {
  position: WatermarkAnchor;
  /** The `size` percentage of the preset. */
  size: number;
  /** The preset's opacity percentage. */
  opacity: number;
  W: number;
  H: number;
  markW: number;
  markH: number;
}): { left: number; top: number; width: number; height: number; opacity: number } {
  const { width, height } = watermarkSize(args.W, args.H, args.size, args.markW, args.markH);
  const { x, y } = watermarkPlacement(args.position, args.W, args.H, width, height);
  return { left: x, top: y, width, height, opacity: watermarkAlpha(args.opacity) };
}
