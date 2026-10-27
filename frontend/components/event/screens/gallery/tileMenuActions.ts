/**
 * What a photo tile's 3-dot menu offers, in order. Pure, so the rules are
 * tested rather than spread across the tile's JSX.
 *
 * No aliased imports: unit-tested under `node --test`.
 */

export type TileMenuAction = "like" | "download" | "collect" | "share";

export function tileMenuActions({
  canLike = false,
  canDownload,
  canCollect,
  canShare,
}: {
  /**
   * The phone's tiles have no heart of their own (the line under the photo
   * only shows the count), so liking moves into the menu, first.
   */
  canLike?: boolean;
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
  if (canLike) out.push("like");
  if (canDownload) out.push("download");
  if (canCollect) out.push("collect");
  if (canShare) out.push("share");
  return out;
}
