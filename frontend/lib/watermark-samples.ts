/**
 * Pure helpers for previewing a watermark on real photos (Settings > Watermark
 * Presets): where the mark lands, and which three of a studio's photos make the
 * most useful test set. No browser globals, so both are tested.
 */
import { watermarkAlpha, watermarkPlacement, watermarkSize, type WatermarkAnchor } from "./r2-upload/geometry.ts";

/**
 * Where the watermark sits on a photo shown `W` x `H` pixels, in those same
 * pixels. This is the upload engine's own math (WatermarkRenderer.draw uses
 * watermarkSize, watermarkPlacement and watermarkAlpha), applied to the size on
 * screen instead of the 2560px delivery frame. Every rule in it is a ratio of
 * the photo (width percentage, edge inset as a share of the shorter edge), so
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
  const { width, height } = watermarkSize(args.W, args.size, args.markW, args.markH);
  const { x, y } = watermarkPlacement(args.position, args.W, args.H, width, height);
  return { left: x, top: y, width, height, opacity: watermarkAlpha(args.opacity) };
}

export type SampleStat = {
  /** Mean luminance, 0 (black) to 255 (white). */
  luma: number;
  /** How much fine detail the photo has: mean difference between neighbours, 0 and up. */
  busy: number;
};

export type SampleLabel = "Light" | "Dark" | "Busy";

/**
 * Up to three photos that stress a watermark differently: the lightest (a pale
 * mark vanishes), the darkest (a dark mark vanishes) and the busiest (a mark
 * gets lost in detail). Returns indexes into `stats`, each at most once; where
 * there are fewer than three distinct picks the rest are filled in the order
 * given, unlabeled-as-such (label null), so a studio with two photos still gets two.
 */
export function pickSampleSet(stats: SampleStat[]): Array<{ index: number; label: SampleLabel | null }> {
  if (stats.length === 0) return [];
  const best = (score: (s: SampleStat) => number, taken: Set<number>) => {
    let at = -1;
    stats.forEach((s, i) => {
      if (taken.has(i)) return;
      if (at === -1 || score(s) > score(stats[at])) at = i;
    });
    return at;
  };
  const taken = new Set<number>();
  const out: Array<{ index: number; label: SampleLabel | null }> = [];
  const take = (index: number, label: SampleLabel | null) => {
    if (index === -1 || taken.has(index)) return;
    taken.add(index);
    out.push({ index, label });
  };
  take(best((s) => s.luma, taken), "Light");
  take(best((s) => -s.luma, taken), "Dark");
  take(best((s) => s.busy, taken), "Busy");
  for (let i = 0; i < stats.length && out.length < 3; i++) take(i, null);
  return out;
}
