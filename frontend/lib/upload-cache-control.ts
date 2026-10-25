/**
 * The Cache-Control header a presigned PUT sends. The stored object then
 * carries it, so it is what Cloudflare and browsers cache the object by.
 *
 * Every upload uses the immutable header: delivery photos and thumbnails are
 * content-addressed and never change. The one exception is a guest's selfie.
 * The backend deletes it right after matching, and a year-long cache would
 * keep serving a deleted selfie. When the selfie presign asks for `no_store`,
 * the backend answers with the header to send as `cache_control`.
 *
 * The backend's IMMUTABLE_CACHE_CONTROL must stay identical to this value.
 */
export const UPLOAD_CACHE_CONTROL = "public, max-age=31536000, immutable";

/**
 * The header to PUT with: the one the presign answer names, else the default.
 * An older backend that does not know `no_store` names none, so the upload
 * goes out exactly as it always has.
 */
export function uploadCacheControlFor(upload: { cache_control?: unknown } | null | undefined): string {
  const value = upload?.cache_control;
  return typeof value === "string" && value.trim().length > 0 ? value : UPLOAD_CACHE_CONTROL;
}
