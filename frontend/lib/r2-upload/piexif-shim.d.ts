/**
 * Minimal type shim for piexifjs (no official @types/piexifjs).
 * Only the bits we use.
 */
declare module "piexifjs" {
  /** Tag dictionaries keyed by integer tag id; values are number | string | number[] | [number,number] etc. */
  export type ExifSegment = Record<number, unknown>;
  export type ExifDict = {
    "0th"?: ExifSegment;
    "Exif"?: ExifSegment;
    "GPS"?: ExifSegment;
    "Interop"?: ExifSegment;
    "1st"?: ExifSegment;
    thumbnail?: string | null;
  };

  /** Read EXIF from a JPEG data URL ("data:image/jpeg;base64,..."). */
  export function load(jpegDataUrl: string): ExifDict;
  /** Serialise an EXIF dict to a binary string (for `insert`). */
  export function dump(exif: ExifDict): string;
  /** Re-inject an EXIF binary string into a JPEG data URL. Returns the modified data URL. */
  export function insert(exifBytes: string, jpegDataUrl: string): string;
  /** Strip all EXIF from a JPEG data URL. */
  export function remove(jpegDataUrl: string): string;

  export const ImageIFD: {
    Orientation: number;
    // Other tags exist but we don't reference them.
    [key: string]: number;
  };
  export const ExifIFD: Record<string, number>;
  export const GPSIFD: Record<string, number>;

  const piexif: {
    load: typeof load;
    dump: typeof dump;
    insert: typeof insert;
    remove: typeof remove;
    ImageIFD: typeof ImageIFD;
    ExifIFD: typeof ExifIFD;
    GPSIFD: typeof GPSIFD;
  };
  export default piexif;
}
