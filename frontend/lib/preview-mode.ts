/**
 * Preview mode: the real guest screens, shown inside the studio dashboard
 * (Gallery Design > preview) with nothing recorded.
 *
 * While it is on, every call the guest screens make through `guestFetch` is
 * answered here instead of going to the guest API: reads come from the studio's
 * own authenticated data (lib/preview-guest-api.ts), and every write (likes,
 * visits, consents, intake, downloads, selfie search, notifications, reports)
 * is a local no-op. No guest token is needed and none is created.
 *
 * It is a per-page flag. The preview route sets it in its own iframe, so the
 * studio's other tabs, and every real guest, are untouched.
 */

export type PreviewContext = {
  /** The event being previewed. Reads go to the studio's own endpoints for it. */
  bookingId: string;
};

let current: PreviewContext | null = null;

export function enterPreviewMode(context: PreviewContext): void {
  current = context;
}

export function leavePreviewMode(): void {
  current = null;
}

export function previewContext(): PreviewContext | null {
  return current;
}

export function isPreviewMode(): boolean {
  return current !== null;
}
