/**
 * Client-side watermark compositing for the upload pipeline.
 *
 * A `WatermarkRenderer` decodes the studio's default watermark image ONCE (into
 * an ImageBitmap) and then stamps it onto each compressed photo on a canvas,
 * before the JPEG is uploaded to R2. Geometry mirrors the dashboard preview
 * (`watermarkBoxStyle` in WatermarkEditorModal) exactly, so what the studio
 * configured is what gets baked in:
 *   - width  = `size`%  of the photo's width (height keeps the mark's aspect)
 *   - margin = 5% (of width for left/right, of height for top/bottom)
 *   - opacity applied via `globalAlpha`
 *
 * The watermark bytes are fetched through the same-origin `/api/download` proxy
 * because R2's public host has no browser CORS (see `lib/media-actions.ts`).
 * Routing through the proxy keeps the fetched blob same-origin, so the decoded
 * bitmap never taints the output canvas. A direct fetch is tried as a fallback
 * for hosts the proxy refuses (it only streams the configured R2 host).
 */

import type { WatermarkPosition } from "@/lib/types";

/**
 * Edge inset in pixels, applied uniformly on both axes so the mark sits a fixed,
 * even distance from the edge regardless of photo resolution or orientation (a
 * percentage produced lopsided corner gaps — 0.5% of width ≠ 0.5% of height).
 * The editor preview (WatermarkEditorModal.tsx) is calibrated to the same 7px
 * against a 2560px-wide reference — the long edge the compressor caps photos to.
 */
const EDGE_MARGIN_PX = 0;
/**
 * JPEG quality for the watermarked re-encode. The image was already downscaled
 * + encoded by the compressor at 0.80; we re-encode a touch higher so the
 * second pass doesn't compound visible artifacts while keeping size reasonable.
 */
const REENCODE_QUALITY = 0.85;

export type WatermarkSpec = {
  position: WatermarkPosition;
  /** Opacity percentage (0–100). */
  opacity: number;
  /** Width as a percentage of the photo's width (1–100). */
  size: number;
};

type RenderCanvas = OffscreenCanvas | HTMLCanvasElement;

export class WatermarkRenderer {
  private constructor(
    private readonly mark: ImageBitmap,
    private readonly spec: WatermarkSpec,
  ) {}

  /**
   * Build a renderer: fetch + decode the watermark image once. The returned
   * instance can stamp any number of photos. Throws if the mark can't be
   * loaded/decoded (caller decides whether to proceed without a watermark).
   */
  static async create(spec: WatermarkSpec, imageUrl: string): Promise<WatermarkRenderer> {
    const mark = await loadBitmap(imageUrl);
    return new WatermarkRenderer(mark, spec);
  }

  /**
   * Composite the watermark onto a compressed JPEG blob and return a new JPEG
   * blob. The source is expected to be already downscaled with orientation
   * baked into the pixels, so canvas coordinates map 1:1 to the final image.
   */
  async apply(jpeg: Blob): Promise<Blob> {
    const photo = await createImageBitmap(jpeg);
    try {
      const W = photo.width;
      const H = photo.height;
      const wmW = (this.spec.size / 100) * W;
      const wmH = wmW * (this.mark.height / this.mark.width);
      const { x, y } = placement(this.spec.position, W, H, wmW, wmH);

      const { canvas, ctx } = makeContext(W, H);
      ctx.drawImage(photo, 0, 0);
      ctx.globalAlpha = clamp01(this.spec.opacity / 100);
      ctx.drawImage(this.mark, x, y, wmW, wmH);
      ctx.globalAlpha = 1;
      return await canvasToJpeg(canvas);
    } finally {
      photo.close();
    }
  }

  /** Release the decoded watermark bitmap. */
  dispose(): void {
    this.mark.close();
  }
}

/* ── geometry (mirrors watermarkBoxStyle) ──────────────────────────── */

function placement(
  position: WatermarkPosition,
  W: number,
  H: number,
  wmW: number,
  wmH: number,
): { x: number; y: number } {
  const [v, h] = position === "center" ? ["middle", "center"] : position.split("-");
  // Uniform pixel inset on both axes for an even gap in every corner.
  const m = EDGE_MARGIN_PX;

  let x: number;
  if (h === "left") x = m;
  else if (h === "right") x = W - wmW - m;
  else x = (W - wmW) / 2;

  let y: number;
  if (v === "top") y = m;
  else if (v === "bottom") y = H - wmH - m;
  else y = (H - wmH) / 2;

  return { x, y };
}

/* ── canvas helpers (OffscreenCanvas when available) ────────────────── */

function makeContext(
  w: number,
  h: number,
): { canvas: RenderCanvas; ctx: CanvasRenderingContext2D } {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable for watermarking");
    // OffscreenCanvas's 2D context shares drawImage/globalAlpha with the DOM one.
    return { canvas, ctx: ctx as unknown as CanvasRenderingContext2D };
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable for watermarking");
  return { canvas, ctx };
}

async function canvasToJpeg(canvas: RenderCanvas): Promise<Blob> {
  if (typeof OffscreenCanvas !== "undefined" && canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type: "image/jpeg", quality: REENCODE_QUALITY });
  }
  const el = canvas as HTMLCanvasElement;
  return new Promise<Blob>((resolve, reject) => {
    el.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("canvas.toBlob returned null"))),
      "image/jpeg",
      REENCODE_QUALITY,
    );
  });
}

/* ── watermark image loading ────────────────────────────────────────── */

function proxyUrl(url: string): string {
  return `/api/download?url=${encodeURIComponent(url)}&name=watermark`;
}

async function loadBitmap(imageUrl: string): Promise<ImageBitmap> {
  // Prefer the same-origin proxy (R2's public host has no browser CORS). Fall
  // back to a direct fetch for any host the proxy refuses to stream.
  const blob = await fetchBlob(proxyUrl(imageUrl)).catch(() => fetchBlob(imageUrl));
  return createImageBitmap(blob);
}

async function fetchBlob(url: string): Promise<Blob> {
  const res = await fetch(url, { cache: "force-cache" });
  if (!res.ok) throw new Error(`watermark image fetch failed: ${res.status}`);
  return res.blob();
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 1;
  return Math.min(1, Math.max(0, n));
}
