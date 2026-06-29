/**
 * Client-side photo actions — download + share. Downloads (and the share blob)
 * go through the same-origin `/api/download` proxy so they work regardless of
 * the R2 bucket's CORS config: the proxy streams the object with
 * `Content-Disposition: attachment`, which forces a real download.
 */

function nameFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    const last = path.split("/").pop() || "photo.jpg";
    return /\.[a-z0-9]+$/i.test(last) ? last : `${last}.jpg`;
  } catch {
    return "photo.jpg";
  }
}

function proxyUrl(url: string, name: string): string {
  return `/api/download?url=${encodeURIComponent(url)}&name=${encodeURIComponent(name)}`;
}

/** Public R2 host the download proxy is allowed to stream (see /api/download). */
const R2_PUBLIC = process.env.NEXT_PUBLIC_CF_R2_PUBLIC_URL ?? "";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Download one photo via the same-origin proxy (forces a real download). */
export function downloadImage(url: string, filename?: string): void {
  const name = filename ?? nameFromUrl(url);
  const a = document.createElement("a");
  a.href = proxyUrl(url, name);
  a.download = name; // same-origin → respected
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Download the full-gallery ZIP. R2-hosted objects go through the same-origin
 * proxy so the download is forced (matches `downloadImage`); any other host
 * (e.g. a presigned URL the proxy would reject as off-origin) falls back to a
 * direct attachment link.
 */
export function downloadZip(url: string, filename = "gallery.zip"): void {
  const base = filename.replace(/\.zip$/i, "").replace(/[\\/:*?"<>|\r\n]+/g, " ").trim() || "gallery";
  const name = `${base}.zip`;
  const a = document.createElement("a");
  a.href = R2_PUBLIC && url.startsWith(R2_PUBLIC) ? proxyUrl(url, name) : url;
  a.download = name; // same-origin (proxy) → respected; cross-origin → best effort
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Download several photos sequentially (no ZIP — per the build spec). */
export async function downloadMany(
  urls: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  for (let i = 0; i < urls.length; i++) {
    downloadImage(urls[i]);
    onProgress?.(i + 1, urls.length);
    if (i < urls.length - 1) await delay(600);
  }
}

export type ShareResult = "shared" | "copied" | "cancelled" | "failed";

/**
 * Share a photo via the Web Share API — prefers sharing the file (native sheet
 * with the image, fetched through the proxy so CORS never blocks it), then the
 * URL, finally copying the link to the clipboard.
 */
export async function shareImage(url: string, title?: string): Promise<ShareResult> {
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  const name = nameFromUrl(url);
  try {
    if (nav?.canShare) {
      const res = await fetch(proxyUrl(url, name));
      if (res.ok) {
        const blob = await res.blob();
        const file = new File([blob], name, { type: blob.type || "image/jpeg" });
        if (nav.canShare({ files: [file] })) {
          await nav.share({ files: [file], title });
          return "shared";
        }
      }
    }
    if (nav?.share) {
      await nav.share({ url, title });
      return "shared";
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
    // fall through to clipboard
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}
