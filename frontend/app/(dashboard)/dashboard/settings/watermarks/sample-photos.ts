/**
 * The stock photos Settings > Watermark Presets judges a watermark on: a light
 * pair (a pale mark can vanish) and a dark pair (a dark mark can vanish), each
 * one landscape and one portrait. Bundled in public/samples/watermark (free
 * Unsplash licence, credits in the README there), so the preview never reads a
 * studio's own photos and never waits on a request.
 */
export type SampleTone = "light" | "dark";

export const SAMPLE_TONES: ReadonlyArray<{ tone: SampleTone; label: string; landscape: string; portrait: string }> = [
  {
    tone: "light",
    label: "Light",
    landscape: "/samples/watermark/light-landscape.jpg",
    portrait: "/samples/watermark/light-portrait.jpg",
  },
  {
    tone: "dark",
    label: "Dark",
    landscape: "/samples/watermark/dark-landscape.jpg",
    portrait: "/samples/watermark/dark-portrait.jpg",
  },
];

export function samplePairOf(tone: SampleTone) {
  return SAMPLE_TONES.find((t) => t.tone === tone) ?? SAMPLE_TONES[0];
}
