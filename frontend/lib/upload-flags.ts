/**
 * Whether the dashboard offers uploading on phones.
 *
 * Production keeps it desktop-only: phone browsers can't hand over a folder
 * with its subfolders intact, and a shoot is far too big for a mobile
 * connection. Dev turns it on so the flow can be exercised on a real device,
 * through the plain multi-photo picker.
 *
 * Inlined at build time. `next dev` enables it on its own; the dev deploy sets
 * NEXT_PUBLIC_ALLOW_MOBILE_UPLOAD=true in .env.production.dev. Never set it in
 * .env.local — Next loads that file for production builds too, so it would
 * ship with `deploy:prod`.
 */
export const MOBILE_UPLOAD_ENABLED =
  process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_ALLOW_MOBILE_UPLOAD === "true";
