/** The Gallery Design preview route renders bare (no dashboard sidebar, topbar or providers): it lives inside an iframe. */
export function isGalleryPreviewPath(pathname: string): boolean {
  return /^\/dashboard\/events\/[^/]+\/preview\/?$/.test(pathname);
}
