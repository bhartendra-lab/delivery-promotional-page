/**
 * Which camera body took a photo, read from its EXIF. Pure, no piexifjs
 * import (like capture-time.ts), so it unit-tests without a JPEG or a DOM and
 * syncs to the Vyavasth Studio app unchanged.
 *
 * SES-01: every photo records the camera that took it, so a studio can filter
 * and delete an event's photos by camera. The device is decided by the backend
 * from the `camera` field of each create-media row. EVERY client reads the
 * same three tags with the same cleaning, so one camera body is one device
 * whether its photos came by USB cable, a phone folder or this browser.
 *
 * TWIN RULES: backend/src/utils/upload-origins.utils.js `normalizeCamera` cleans
 * the same way and also refuses a camera without make AND model. Change both
 * together.
 */

/** piexifjs 1.0.6 tag ids, spelled as numbers (see the header). */
const TAG_MAKE = 271; // 0th IFD
const TAG_MODEL = 272; // 0th IFD
const TAG_BODY_SERIAL_NUMBER = 42033; // Exif IFD (EXIF 2.3)

/** Longest value kept per field. Real values are far shorter. */
const MAX_FIELD = 64;

/** The shape read out of a piexif dict, structurally. A real dict is assignable. */
export type CameraExifLike =
  | { "0th"?: Record<number, unknown>; Exif?: Record<number, unknown> }
  | null
  | undefined;

export type CameraIdentity = { make: string; model: string; serial?: string };

/** EXIF ASCII is NUL-padded and often space-padded; inner runs collapse. */
function clean(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\0/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_FIELD);
}

/**
 * The camera that took the photo, or undefined when its EXIF names none.
 * Make AND model are both required: a phone screenshot, a PNG, or an export
 * that strips EXIF has no device. The serial is optional (not every body
 * writes BodySerialNumber; without it, two bodies of one model are one device).
 */
export function cameraFromExif(exif: CameraExifLike): CameraIdentity | undefined {
  if (!exif) return undefined;
  const make = clean(exif["0th"]?.[TAG_MAKE]);
  const model = clean(exif["0th"]?.[TAG_MODEL]);
  if (!make || !model) return undefined;
  const serial = clean(exif.Exif?.[TAG_BODY_SERIAL_NUMBER]);
  return serial ? { make, model, serial } : { make, model };
}

/** The record fields a camera is persisted as (UploadRecord). */
export type RecordCameraFields = { cameraMake?: string; cameraModel?: string; cameraSerial?: string };

/** Camera -> the record's persisted fields (nothing when there is no camera). */
export function cameraFieldsForRecord(camera: CameraIdentity | undefined): RecordCameraFields {
  if (!camera) return {};
  return {
    cameraMake: camera.make,
    cameraModel: camera.model,
    ...(camera.serial ? { cameraSerial: camera.serial } : {}),
  };
}

/** A record's persisted fields -> the create-media row's `camera`, or nothing. */
export function cameraForMetadata(record: RecordCameraFields): { camera?: CameraIdentity } {
  if (!record.cameraMake || !record.cameraModel) return {};
  return {
    camera: {
      make: record.cameraMake,
      model: record.cameraModel,
      ...(record.cameraSerial ? { serial: record.cameraSerial } : {}),
    },
  };
}
