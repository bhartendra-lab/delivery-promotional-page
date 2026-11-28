/**
 * The browser half of "Download standee designs": fetch the pictures the
 * designs need, build the file (pptxgenjs, loaded only now) and save it.
 * The pure parts are in lib/standee.ts and lib/standee-pptx.ts.
 */
import { fetchPhotoBlob, triggerBlobDownload } from "./media-actions";
import { formatStandeeDate, standeeFileName, type StandeeContent, type StandeeImage } from "./standee";

/** A picture as a data URI plus its own size, or null when it cannot be read (the design then does without it). */
export async function loadStandeeImage(url: string | undefined | null): Promise<StandeeImage | null> {
  if (!url) return null;
  try {
    const blob = await fetchPhotoBlob(url);
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error("image failed to decode"));
      img.src = dataUrl;
    });
    // pptxgenjs reads "image/png;base64,..." (no "data:" scheme).
    return { data: dataUrl.replace(/^data:/, ""), ...size };
  } catch {
    return null;
  }
}

export type StandeeDownloadInput = {
  studioName: string;
  eventName: string;
  eventDate: number | null | undefined;
  logoUrl?: string;
  logoLightUrl?: string;
  qrImageUrl: string;
  coverUrl?: string;
};

/** Builds and saves the .pptx. Throws a sentence when the QR itself cannot be loaded: without it there is nothing to print. */
export async function downloadStandeeDesigns(input: StandeeDownloadInput): Promise<void> {
  const [qr, logo, logoOnDark, cover] = await Promise.all([
    loadStandeeImage(input.qrImageUrl),
    loadStandeeImage(input.logoUrl),
    input.logoLightUrl && input.logoLightUrl !== input.logoUrl ? loadStandeeImage(input.logoLightUrl) : Promise.resolve(null),
    loadStandeeImage(input.coverUrl),
  ]);
  if (!qr) throw new Error("We couldn't load your QR code. Check your connection and try again.");
  const content: StandeeContent = {
    studioName: input.studioName,
    eventName: input.eventName,
    eventDate: formatStandeeDate(input.eventDate),
    logo,
    logoOnDark,
    qr,
    cover,
  };
  // The file builder, and pptxgenjs inside it, are fetched only here, on the click.
  const { buildStandeePptx } = await import("./standee-pptx");
  const blob = (await buildStandeePptx(content, "blob")) as Blob;
  triggerBlobDownload(blob, standeeFileName(input.eventName));
}

