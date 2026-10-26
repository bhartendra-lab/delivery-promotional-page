/**
 * What a photo tile's 3-dot menu offers, in order. Pure, so the rules are
 * tested rather than spread across the tile's JSX.
 *
 * No aliased imports: unit-tested under `node --test`.
 */

export type TileMenuAction = "download" | "collect" | "share";

export function tileMenuActions({
  canDownload,
  canCollect,
  canShare,
}: {
  /** The studio allows downloads on this event. */
  canDownload: boolean;
  /** The viewer is a curator (Phase 4). False until then. */
  canCollect: boolean;
  /**
   * The device is a touch device. Share is the native share sheet, which is a
   * phone and tablet affordance; on a laptop it either does nothing useful or
   * falls back to copying the raw photo URL, which the gallery would rather
   * not hand out. Matches the viewer, which hides Share on desktop too.
   */
  canShare: boolean;
}): TileMenuAction[] {
  const out: TileMenuAction[] = [];
  if (canDownload) out.push("download");
  if (canCollect) out.push("collect");
  if (canShare) out.push("share");
  return out;
}
