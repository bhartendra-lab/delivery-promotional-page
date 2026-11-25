/**
 * The empty border the server crops off a watermark image (backend
 * upload.middleware.js `optimizeImage` with `trimBorder`: sharp's trim,
 * threshold 10, against the top-left pixel), found in the browser so the
 * editor previews the image the studio will actually get — not its padding.
 *
 * Pure core (`borderBox`) + a thin canvas wrapper (`trimmedPreviewUrl`).
 */

export type Box = { left: number; top: number; width: number; height: number };

const THRESHOLD = 10;

/**
 * Bounding box of every pixel that differs from the top-left pixel by more
 * than the threshold on any channel (alpha included), in an RGBA buffer.
 * Null when the whole image is border — the server then keeps it untrimmed.
 */
export function borderBox(data: Uint8ClampedArray | Uint8Array, width: number, height: number): Box | null {
  const r0 = data[0], g0 = data[1], b0 = data[2], a0 = data[3];
  // A transparent background: only alpha decides (colour under alpha 0 is noise).
  const alphaOnly = a0 <= THRESHOLD;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const differs = alphaOnly
        ? data[i + 3] - a0 > THRESHOLD
        : Math.abs(data[i] - r0) > THRESHOLD ||
          Math.abs(data[i + 1] - g0) > THRESHOLD ||
          Math.abs(data[i + 2] - b0) > THRESHOLD ||
          Math.abs(data[i + 3] - a0) > THRESHOLD;
      if (!differs) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * An object URL of `file` with its border cropped off, for the editor's
 * preview. Falls back to the untouched file on anything unexpected — a
 * preview must never block picking an image. Caller revokes the URL.
 */
export async function trimmedPreviewUrl(file: File): Promise<string> {
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const box = borderBox(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
    if (!box || (box.width === canvas.width && box.height === canvas.height)) return URL.createObjectURL(file);
    const out = document.createElement("canvas");
    out.width = box.width;
    out.height = box.height;
    out.getContext("2d")!.drawImage(canvas, box.left, box.top, box.width, box.height, 0, 0, box.width, box.height);
    const blob = await new Promise<Blob | null>((r) => out.toBlob(r, "image/png"));
    return blob ? URL.createObjectURL(blob) : URL.createObjectURL(file);
  } catch {
    return URL.createObjectURL(file);
  }
}
